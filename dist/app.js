const $ = id => document.getElementById(id);
const palettes = [
 ['#09091b','#221a44','#522e79','#914aa9','#e188d0','#f8dcf4'],
 ['#05131e','#0c3347','#176276','#429ea0','#9ad9c5','#e1f5da'],
 ['#170e15','#48202c','#864238','#c97749','#eabf7b','#fff0cf'],
 ['#180d1b','#472039','#943151','#d75b76','#f3a7ac','#ffe5d6'],
 ['#0b0f18','#2c3549','#59677b','#8b9bac','#bfcfda','#eff7ff'],
 null, ['#060e21','#122b4f','#2c588e','#628fc5','#abd7f5','#edf9ff']
];
// id, label, min, max, step, default, C parameter, container
const specs = [
 ['scale','Scale',1,14,.1,5,0,'noise-controls'],
 ['octaves','Octaves',1,8,1,5,1,'noise-controls'],
 ['persistence','Persistence',.1,.85,.01,.52,2,'noise-controls'],
 ['lacunarity','Lacunarity',1.2,3,.05,2,3,'noise-controls'],
 ['warp','Domain warp',0,3,.05,1.2,4,'noise-controls'],
 ['mix','Layer blend',0,1,.01,.35,6,'layer-controls'],
 ['threshold','Density cutoff',0,.8,.01,.38,8,'shape-controls'],
 ['softness','Edge softness',.05,1,.01,.55,9,'shape-controls'],
 ['stretch','Stretch',.4,2.5,.05,1,10,'shape-controls'],
 ['exposure','Brightness',.2,2.5,.05,.95,12,'color-controls'],
 ['opacity','Opacity',0,1,.01,.78,13,'color-controls']
];
const starSpecs = [
 ['star-count','Colored stars',0,64,1,18,0,'star-controls'],
 ['cavity-radius','Clearing radius',0,.4,.01,.23,1,'star-controls'],
 ['jet-fraction','Herbig–Haro fraction',0,1,.01,.28,2,'star-controls'],
 ['star-glow','Stellar glow',0,2.5,.05,.8,3,'star-controls'],
 ['jet-length','Jet length',.1,.9,.01,.48,4,'star-controls'],
 ['star-spread','Star spread',.5,1.7,.05,1,5,'star-controls']
];
function createRanges(list) {
 for (const [id,label,min,max,step,val,,target] of list) {
  const l = document.createElement('label');
  l.innerHTML = `<span class="range-title"><span id="${id}-label">${label}</span><output id="${id}-val">${val}</output></span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}">`;
  $(target).append(l);
 }
}
createRanges(specs); createRanges(starSpecs);
let colors = [...palettes[0]], worker, last = null, mode = 'volume', view = 'art';
let exportingRfl = false;
let busy = false, dirty = true, failed = false, seq = 0, paused = false;
let time = 0, yaw = 0, pitch = .20, lastTick = performance.now(), lastSend = 0;
let pointer = null, novaMode = false, novaPrevious = null, sceneRevision = 0;
function setColors(c) {
 colors = [...c]; $('swatches').replaceChildren();
 colors.forEach((hex,i) => {
  const el = document.createElement('input');
  el.type = 'color'; el.value = hex; el.title = `Palette color ${i+1}`;
  el.setAttribute('aria-label',el.title);
  el.addEventListener('input',() => {colors[i]=el.value; $('palette').value='5'; dirty=true});
  $('swatches').append(el);
 });
}
function params() {
 const p = Array(15).fill(0);
 for (const [id,,,,,,i] of specs) p[i] = Number($(id).value);
 p[5] = +$('layer2').checked; p[7] = +$('mask').value;
 p[11] = +$('tile').checked; p[14] = +$('dither').checked;
 return p;
}
function spaceParams() { return starSpecs.map(([id]) => novaMode&&id==='cavity-radius'?.12:Number($(id).value)); }
function updateOutputs() {
 for (const [id] of [...specs,...starSpecs]) $(id+'-val').textContent = id==='jet-fraction' ? `${Math.round($(id).value*100)}%` : $(id).value;
 $('mix').disabled = !$('layer2').checked;
 $('speed-val').textContent = `${Number($('speed').value).toFixed(2).replace(/0+$/,'').replace(/\.$/,'')}×`;
 $('zoom-val').textContent = `${Number($('zoom').value).toFixed(2)}×`;
 const count = +$('star-count').value, jets = Math.round(count*$('jet-fraction').value);
 if(!novaMode) $('star-summary').textContent = `${count} stars · ${jets} jet sources (${jets*2} lobes)`;
 $('threshold').disabled=novaMode;
 $('mask').disabled=$('stretch').disabled=novaMode;
 $('art-view').disabled=novaMode;
 $('jet-fraction-label').textContent=novaMode?'Jet cone chance':'Herbig–Haro fraction';
 for(const [id] of starSpecs) $(id).disabled=mode==='texture'||(novaMode&&['star-count','cavity-radius','jet-fraction','star-spread'].includes(id));
}
function resetCamera() { yaw=0; pitch=.20; $('zoom').value=1.25; updateOutputs(); dirty=true; }
function setMode(next) {
 mode=next; view='art'; dirty=true;
 $('volume-view').setAttribute('aria-pressed',mode==='volume');
 $('art-view').setAttribute('aria-pressed',mode==='texture');
 $('density-view').setAttribute('aria-pressed','false');
 $('motion-controls').hidden=$('view-controls').hidden=mode!=='volume';
 $('mode-label').textContent = mode==='volume'?'LIVE VOLUME · 3D NOISE':'LIVE TEXTURE · 2D NOISE';
 $('gesture-hint').textContent = mode==='volume'?'Drag / arrow keys to rotate':'Nearest-neighbor pixels · RGBA';
 $('viewport').classList.toggle('volume',mode==='volume');
 $('tile').disabled=mode==='volume';
 updateOutputs();
}
function show() {
 if(!last) return;
 const canvas=$('canvas');
 if(canvas.width!==last.width || canvas.height!==last.height) {canvas.width=last.width; canvas.height=last.height}
 let data=last.rgba;
 if(view==='density') {
  data=new Uint8ClampedArray(last.width*last.height*4);
  last.density.forEach((d,i)=>{data[i*4]=data[i*4+1]=data[i*4+2]=d;data[i*4+3]=255});
 }
 canvas.getContext('2d').putImageData(new ImageData(data,last.width,last.height),0,0);
}
function sendFrame(now) {
 if(busy || exportingRfl || failed || !worker) return;
 busy=true; dirty=false; lastSend=now;
 let seed=Number($('seed').value);
 if(!Number.isFinite(seed)) seed=42871;
 seed=Math.min(2147483647,Math.max(0,Math.trunc(seed))); $('seed').value=seed;
 worker.postMessage({id:++seq,mode,nova:novaMode,revision:sceneRevision,params:params(),space:spaceParams(),width:+$('width').value,height:+$('height').value,seed,colors,time,yaw,pitch,zoom:+$('zoom').value});
}
function frame(now) {
 const dt=Math.min(.1,(now-lastTick)/1000); lastTick=now;
 const moving = mode==='volume' && !paused && !document.hidden && +$('speed').value>0;
 if(moving) {
  time+=dt*$('speed').value;
  if($('orbit').checked) yaw=(yaw+dt*.13*$('speed').value)%(Math.PI*2);
 }
 if(!document.hidden && (dirty||moving) && now-lastSend>33) sendFrame(now);
 requestAnimationFrame(frame);
}
function background() {
 const selected=$('background').value;
 $('viewport').classList.toggle('checker',selected==='checker'); $('backdrop').hidden=selected!=='space';
 const c=$('backdrop'); c.width=1100;c.height=850;
 const ctx=c.getContext('2d');ctx.fillStyle='#05060b';ctx.fillRect(0,0,c.width,c.height);
 let seed=871;
 const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 for(let i=0;i<340;i++){const x=rng()*c.width,y=rng()*c.height,a=.15+rng()*.45,s=rng()>.98?2:1;ctx.fillStyle=`rgba(190,194,225,${a})`;ctx.fillRect(x,y,s,s)}
}
const presets = {
 veil:{palette:0,scale:5,warp:1.2,threshold:.38,mask:0,mix:.35,stretch:1,exposure:.95},
 pillars:{palette:2,scale:7,warp:1.6,threshold:.32,mask:1,mix:.35,stretch:1.15,exposure:1.15},
 lagoon:{palette:1,scale:4,warp:2.1,threshold:.36,mask:2,mix:.55,stretch:1.15,exposure:1.1},
 rift:{palette:3,scale:8,warp:2.6,threshold:.43,mask:0,mix:.25,stretch:1.6,exposure:1.2},
 nova:{palette:6,scale:6,warp:1.7,threshold:.15,mask:0,mix:.58,stretch:1,softness:.30,exposure:1.35,opacity:.88}
};
function restartNova() {
 time=0;paused=false;sceneRevision++;dirty=true;
 $('pause').textContent='Pause motion';$('pause').setAttribute('aria-pressed','false');
 if(+$('speed').value===0)$('speed').value=1;
 $('nova-phase').textContent='Red progenitor';$('nova-cutoff').textContent='Cutoff 0.15';
 $('star-summary').textContent='1 centered star · 50% jet chance per seed';
 $('threshold').value=.15;$('cavity-radius').value=.12;updateOutputs();
}
function preset(name) {
 const enteringNova=name==='nova';
 if(enteringNova&&!novaMode) novaPrevious={stars:starSpecs.map(([id])=>$(id).value),background:$('background').value,orbit:$('orbit').checked};
 if(!enteringNova&&novaMode&&novaPrevious) {
  starSpecs.forEach(([id],i)=>$(id).value=novaPrevious.stars[i]);
  $('background').value=novaPrevious.background;$('orbit').checked=novaPrevious.orbit;background();novaPrevious=null;
 }
 novaMode=enteringNova;sceneRevision++;
 $('nova-controls').hidden=!novaMode;
 if(novaMode) {
  $('star-count').value=1;$('jet-fraction').value=.5;$('star-spread').value=1;$('cavity-radius').value=.12;
  $('background').value='black';$('orbit').checked=false;background();resetCamera();setMode('volume');restartNova();
 }
 specs.forEach(([id,,,,,val])=>$(id).value=val);
 for(const [k,v] of Object.entries(presets[name])) $(k).value=v;
 $('tile').checked=false; $('layer2').checked=true; $('dither').checked=true;
 setColors(palettes[+$('palette').value]); $('output-title').textContent=$('preset').selectedOptions[0].textContent;
 updateOutputs(); dirty=true;
}
for(const [id] of [...specs,...starSpecs]) $(id).addEventListener('input',()=>{updateOutputs();dirty=true});
for(const id of ['seed','width','height','mask','tile','layer2','dither']) $(id).addEventListener('change',()=>{updateOutputs();dirty=true});
$('palette').addEventListener('change',()=>{if(+$('palette').value!==5)setColors(palettes[+$('palette').value]);dirty=true});
$('background').addEventListener('change',background);
$('random').addEventListener('click',()=>{$('seed').value=crypto.getRandomValues(new Uint32Array(1))[0]%2147483647;if(novaMode)restartNova();dirty=true});
$('preset').addEventListener('change',()=>preset($('preset').value));
$('nova-replay').addEventListener('click',restartNova);
$('seed').addEventListener('change',()=>{if(novaMode)restartNova()});
$('reset').addEventListener('click',()=>{
 novaMode=false;novaPrevious=null;$('nova-controls').hidden=true;
 $('preset').value='veil';$('seed').value=42871;$('width').value=$('height').value='192';$('background').value='space';
 starSpecs.forEach(([id,,,,,val])=>$(id).value=val);
 time=0;paused=false;$('pause').textContent='Pause motion';$('pause').setAttribute('aria-pressed','false');$('orbit').checked=true;$('speed').value=1;
 resetCamera();setMode('volume');background();preset('veil');
});
$('pause').addEventListener('click',()=>{paused=!paused;$('pause').textContent=paused?'Resume motion':'Pause motion';$('pause').setAttribute('aria-pressed',paused);dirty=true});
$('reset-view').addEventListener('click',resetCamera);
$('speed').addEventListener('input',()=>{updateOutputs();dirty=true});
$('zoom').addEventListener('input',()=>{updateOutputs();dirty=true});
$('orbit').addEventListener('change',()=>dirty=true);
$('volume-view').addEventListener('click',()=>setMode('volume'));
$('art-view').addEventListener('click',()=>setMode('texture'));
$('density-view').addEventListener('click',()=>{view=view==='density'?'art':'density';$('density-view').setAttribute('aria-pressed',view==='density');show()});
// Rotation changes the camera basis. All gas, cavities, and sources stay in world space.
$('viewport').addEventListener('pointerdown',e=>{
 if(mode!=='volume'||e.button!==0)return;
 pointer={id:e.pointerId,x:e.clientX,y:e.clientY};$('viewport').setPointerCapture(e.pointerId);$('viewport').focus({preventScroll:true});$('orbit').checked=false;
});
$('viewport').addEventListener('pointermove',e=>{
 if(!pointer||e.pointerId!==pointer.id)return;
 yaw-=(e.clientX-pointer.x)*.009;pitch=Math.max(-1.5,Math.min(1.5,pitch+(e.clientY-pointer.y)*.009));
 pointer.x=e.clientX;pointer.y=e.clientY;dirty=true;
});
for(const type of ['pointerup','pointercancel','lostpointercapture']) $('viewport').addEventListener(type,()=>pointer=null);
$('viewport').addEventListener('keydown',e=>{
 if(mode!=='volume'||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key))return;
 e.preventDefault();$('orbit').checked=false;
 if(e.key==='Home'){resetCamera();return}
 yaw+=(e.key==='ArrowLeft'?.12:e.key==='ArrowRight'?-.12:0);
 pitch=Math.max(-1.5,Math.min(1.5,pitch+(e.key==='ArrowUp'?.12:e.key==='ArrowDown'?-.12:0)));dirty=true;
});
const tabs=[...document.querySelectorAll('[data-tab]')];
tabs.forEach((b,i)=>{
 b.tabIndex=i===0?0:-1;b.setAttribute('aria-controls',b.dataset.tab);
 b.addEventListener('click',()=>tabs.forEach(other=>{const active=other===b;other.tabIndex=active?0:-1;other.setAttribute('aria-selected',active);$(other.dataset.tab).hidden=!active}));
 b.addEventListener('keydown',e=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();
  const n=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length;
  tabs[n].focus();tabs[n].click();
 });
});
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
$('export').addEventListener('click',()=>{
 if(!last)return;const snapshot=last,c=document.createElement('canvas');c.width=snapshot.width;c.height=snapshot.height;
 c.getContext('2d').putImageData(new ImageData(snapshot.rgba,snapshot.width,snapshot.height),0,0);
 c.toBlob(blob=>{if(blob)download(blob,`nebula-${snapshot.mode}-${snapshot.seed}-${snapshot.time.toFixed(2)}.png`);else $('status').textContent='PNG export failed. Try again.'});
});
$('export-density').addEventListener('click',()=>{
 if(last)download(new Blob([`P5\n${last.width} ${last.height}\n255\n`,last.density],{type:'image/x-portable-graymap'}),`nebula-density-${last.mode}-${last.seed}-${last.time.toFixed(2)}.pgm`);
});
function recipe() {
 const clean=$('output-title').textContent.replace(/[^ -~]/g,' ').slice(0,63);
 return ['RFL_NEBULA_RECIPE 1',`name=${clean}`,`seed=${Math.max(0,Number($('seed').value))>>>0}`,`side=${$('rfl-side').value}`,
  ...params().map((v,i)=>`p${i}=${v}`),...spaceParams().concat(+novaMode).map((v,i)=>`s${i}=${v}`),
  ...colors.map((v,i)=>`c${i}=${v.slice(1)}`)].join('\n')+'\n';
}
$('export-recipe').addEventListener('click',()=>download(new Blob([recipe()],{type:'text/plain'}),`nebula-${$('preset').value}-${$('seed').value}.nebula`));
$('export-rfl').addEventListener('click',()=>{
 if(failed||exportingRfl||!worker)return;
 exportingRfl=true;$('export-rfl').disabled=true;
 $('rfl-status').textContent='Baking animation and distance levels…';
 worker.postMessage({action:'export-rfl',mode:'volume',nova:novaMode,seed:Math.max(0,Number($('seed').value))>>>0,
  params:params(),space:spaceParams(),colors:[...colors],side:+$('rfl-side').value,name:$('output-title').textContent});
});
function fail(message){failed=true;busy=false;$('loading').hidden=false;$('loading').textContent='The generator could not start. Reload to try again.';$('status').textContent=message;$('export').disabled=$('export-density').disabled=true}
setColors(colors);background();updateOutputs();setMode('volume');
try{
 worker=new Worker('engine.js');
 worker.onmessage=({data:m})=>{
  if(m.action==='export-rfl') {
   exportingRfl=false;$('export-rfl').disabled=false;dirty=true;
   if(m.error){$('rfl-status').textContent=`Export failed: ${m.error}`;return}
   const slug=m.name.toLowerCase().replace(/[^a-z0-9]+/g,'-');
   download(new Blob([m.bytes],{type:'application/octet-stream'}),`${slug}-${m.seed}.rnb`);
   $('rfl-status').textContent=`${(m.bytes.length/1048576).toFixed(2)} MiB · ready for RFL’s assets/nebulae folder. Restart RFL to discover it.`;
   return;
  }
  busy=false;if(m.error){fail(m.error);return}
  if(m.mode!==mode||m.revision!==sceneRevision){dirty=true;return}
  last=m;$('loading').hidden=true;show();
  $('status').textContent=`${m.width} × ${m.height} · ${m.ms.toFixed(0)} ms${mode==='volume'?` · ${m.stars} stars / ${m.jets} jet sources`:''}`;
  $('motion-time').textContent=`${m.time.toFixed(1)} s`;
  if(m.nova) {
   const phases=['Red progenitor','Dither glare','Expanding nebula','Blue-white remnant'];
   $('nova-phase').textContent=phases[m.nova.phase];
   $('nova-cutoff').textContent=`Cutoff ${m.nova.cutoff.toFixed(2)}`;
   $('cavity-radius').value=m.nova.clearing.toFixed(3);$('cavity-radius-val').textContent=m.nova.clearing.toFixed(2);
   $('threshold').value=m.nova.cutoff.toFixed(3);$('threshold-val').textContent=m.nova.cutoff.toFixed(2);
   $('star-summary').textContent=m.nova.phase<2?'1 centered star · 50% jet chance per seed':`1 stellar remnant · ${m.nova.hasJets?'jet cones present':'no jet cone this seed'}`;
  }
  $('export').disabled=$('export-density').disabled=false;
  $('export-rfl').disabled=exportingRfl;
 };
 worker.onerror=()=>fail('Generator worker failed.');requestAnimationFrame(frame);
}catch(e){fail(e.message)}
