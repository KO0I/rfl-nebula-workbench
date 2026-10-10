import './texture-presets.js';
import './reference-presets.js';
const texturePresets={...globalThis.NEBULA_TEXTURE_PRESETS,...globalThis.NEBULA_REFERENCE_PRESETS};
const $ = id => document.getElementById(id);
const palettes = [
 ['#09091b','#221a44','#522e79','#914aa9','#e188d0','#f8dcf4'],
 ['#05131e','#0c3347','#176276','#429ea0','#9ad9c5','#e1f5da'],
 ['#170e15','#48202c','#864238','#c97749','#eabf7b','#fff0cf'],
 ['#180d1b','#472039','#943151','#d75b76','#f3a7ac','#ffe5d6'],
 ['#0b0f18','#2c3549','#59677b','#8b9bac','#bfcfda','#eff7ff'],
 null, ['#060e21','#122b4f','#2c588e','#628fc5','#abd7f5','#edf9ff'],
 ['#080b19','#161a3d','#292b70','#3b4fad','#5188d0','#a3c5e9']
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
 ['jet-length','Beam length · ly / side',.1,3,.05,1,4,'star-controls'],
 ['star-spread','Star spread',.5,1.7,.05,1,5,'star-controls']
];
const cometSpecs = [
 ['comet-length','Tail length',.7,2.8,.05,2.2,10,'comet-ranges'],
 ['comet-width','Tail spread',.04,.3,.01,.15,11,'comet-ranges'],
 ['comet-turbulence','Filament turbulence',0,1.5,.05,.8,12,'comet-ranges'],
 ['comet-bearing','Star bearing · degrees',-180,180,1,180,13,'comet-ranges'],
 ['comet-elevation','Star elevation · degrees',-75,75,1,0,14,'comet-ranges'],
 ['comet-distance','Distance to star · AU',.05,2,.001,.3,15,'comet-ranges'],
 ['comet-flow','Outward flow',.1,3,.05,1,16,'comet-ranges']
];
const cometPresets={'comet-filaments':1,'comet-cyan':2,'scorched-trail':3};
let galaxyMode=false,galaxyPrevious=null,galaxyFocus=false,galaxyTarget=null;
let cometMode=0,cometPrevious=null;
function cometParams(){return [cometMode,...cometSpecs.map(([id])=>Number($(id).value))];}
function updateCometCompass(){
 if(!cometMode||!last?.cometGeometry)return;
 const [x,y,z]=last.cometGeometry.slice(6);
 const yaw=last.yaw,pitch=last.pitch;
 const horizontal=x*Math.cos(yaw)-z*Math.sin(yaw);
 const vertical=x*Math.sin(yaw)*Math.sin(pitch)+y*Math.cos(pitch)+z*Math.cos(yaw)*Math.sin(pitch);
 const sx=55-horizontal*40,sy=32+vertical*25;
 $('star-line').setAttribute('x2',sx);$('star-line').setAttribute('y2',sy);
 $('star-dot').setAttribute('cx',sx);$('star-dot').setAttribute('cy',sy);
 $('tail-line').setAttribute('x2',55+horizontal*40);$('tail-line').setAttribute('y2',32-vertical*25);
}
function createRanges(list) {
 for (const [id,label,min,max,step,val,,target] of list) {
  const l = document.createElement('label');
  l.innerHTML = `<span class="range-title"><span id="${id}-label">${label}</span><output id="${id}-val">${val}</output></span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}">`;
  $(target).append(l);
 }
}
createRanges(specs); createRanges(starSpecs); createRanges(cometSpecs);
const nurseryOption=document.createElement('option');
nurseryOption.value='protostellar-disk';nurseryOption.textContent='Protostellar disk · Herbig–Haro';
document.querySelector('#preset option[value="active-black-hole"]').after(nurseryOption);
let colors = [...palettes[0]], worker, last = null, mode = 'volume', view = 'art';
let reflectionColors=['#02081e','#05164b','#0c308c','#1952dc','#2d73ff','#5596ff'];
let exportingRfl = false;
let busy = false, dirty = true, failed = false, seq = 0, paused = false;
let time = 0, yaw = 0, pitch = .20, lastTick = performance.now(), lastSend = 0;
let pointer = null, novaMode = false, novaPrevious = null, sceneRevision = 0;
let imagePreset='',imagePrevious=null;
let blueReflectionPrevious=null;
let compactMode=0,compactPrevious=null;
const compactPresets={'active-black-hole':1,'protostellar-disk':5};
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
function setReflectionColors() {
 $('reflection-swatches').replaceChildren();
 reflectionColors.forEach((hex,i)=>{
  const el=document.createElement('input');el.type='color';el.value=hex;
  el.title=`Reflection color ${i+1}`;el.setAttribute('aria-label',el.title);
  el.addEventListener('input',()=>{reflectionColors[i]=el.value;dirty=true});
  $('reflection-swatches').append(el);
 });
}
setReflectionColors();
function params() {
 const p = Array(15).fill(0);
 for (const [id,,,,,,i] of specs) p[i] = Number($(id).value);
 p[5] = +$('layer2').checked; p[7] = +$('mask').value;
 p[11] = +$('tile').checked; p[14] = +$('dither').checked;
 return p;
}
function spaceParams() { return starSpecs.map(([id]) => novaMode&&id==='cavity-radius'?.12:Number($(id).value)); }
function updateOutputs() {
 for (const [id] of [...specs,...starSpecs,...cometSpecs]) $(id+'-val').textContent = id==='jet-fraction' ? `${Math.round($(id).value*100)}%` : $(id).value;
 $('mix').disabled = !$('layer2').checked;
 $('speed-val').textContent = `${Number($('speed').value).toFixed(2).replace(/0+$/,'').replace(/\.$/,'')}×`;
 $('zoom-val').textContent = `${Number($('zoom').value).toFixed(2)}×`;
 const count = +$('star-count').value, jets = Math.round(count*$('jet-fraction').value);
 if(texturePresets[imagePreset]?.reference) $('star-summary').textContent=`${texturePresets[imagePreset].stars.length} stars · shifting 3D clouds`;
 else if(compactMode===5) $('star-summary').textContent='1 young star · slow volumetric disk · 2 gentle Herbig–Haro jets';
 else if(compactMode) $('star-summary').textContent=`1 compact object · 2 jets · ${Number($('jet-length').value).toFixed(2)} ly per beam`;
 else if(!novaMode) $('star-summary').textContent = `${count} stars · ${jets} jet sources (${jets*2} lobes)`;
 $('threshold').disabled=novaMode;
 $('mask').disabled=$('stretch').disabled=novaMode;
 $('art-view').disabled=novaMode||!!compactMode;
 $('jet-fraction-label').textContent=novaMode?'Jet cone chance':'Herbig–Haro fraction';
 for(const [id] of starSpecs) $(id).disabled=mode==='texture'||((novaMode||compactMode)&&['star-count','cavity-radius','jet-fraction','star-spread'].includes(id));
 // Image RGB is authoritative. Noise affects volume depth, not flat artwork.
 const flatImage=!!imagePreset&&mode==='texture';
 for(const [id] of specs) $(id).disabled=(novaMode&&['threshold','stretch'].includes(id)) || (flatImage&&!['exposure','opacity'].includes(id)) || (id==='mix'&&!$('layer2').checked);
 $('mask').disabled=novaMode||!!imagePreset||!!compactMode;
 $('threshold').disabled=$('stretch').disabled=!!compactMode||novaMode;
 $('compact-note').hidden=!compactMode;
 $('compact-note').textContent=compactMode===5
  ?'An amber protostar illuminates a thick, slowly rotating dust disk. Its outer edge is dark dust; gentle bipolar jets dissolve into enlarged, streaming comet filaments, with scattered dark Bok-like globules. Drag to see the volume in depth.'
  :'Beams reach 1 light-year per side by default, then fade through orange lobes and purple backscatter out to about 7.7 light-years. Adjust Beam length in Stars. Zoom in to inspect the rough gas torus and central object; their sizes are enlarged for visibility.';
 $('cloud-rotation-control').hidden=!compactMode;
 $('cloud-rotation-val').textContent=Number($('cloud-rotation').value)+'×';
 $('layer2').disabled=flatImage;
 $('tile').disabled=!!imagePreset||mode==='volume';
 $('palette').disabled=!!imagePreset||!!compactMode;
 $('dither').disabled=!!imagePreset;
 $('softness').disabled=!!compactMode||flatImage;
 for(const swatch of $('swatches').children)swatch.disabled=!!imagePreset||!!compactMode;
 if(texturePresets[imagePreset]?.reference){
  for(const [id] of starSpecs) $(id).disabled=id!=='star-glow'||flatImage;
  $('mix').disabled=true;
  $('layer2').disabled=true;
  $('softness').disabled=flatImage;$('stretch').disabled=flatImage;
 }
 $('seed').disabled=$('random').disabled=flatImage;
 $('comet-controls').hidden=$('comet-compass').hidden=!cometMode;
 $('comet-turbulence-label').textContent=cometMode===3?'Density variation':'Filament turbulence';
 if(cometMode){
  for(const [id] of [...starSpecs,...specs])$(id).disabled=!['exposure','opacity'].includes(id);
  for(const id of ['art-view','layer2','mask','palette'])$(id).disabled=true;
  for(const swatch of $('swatches').children)swatch.disabled=true;
  const active=cometMode!==3||Number($('comet-distance').value)<=.387;
  $('comet-activity').textContent=cometMode===3?(active?'Straight sodium tail · density streams away from the star. Active at 0.387 AU or closer.':'Sodium tail inactive · move to 0.387 AU or closer.'):'Tail points away from the star; motion streams outward along its length.';
  $('star-summary').textContent='External illuminating star · no bipolar jets';
 }
 for(const id of ['galaxy-cluster-focus','galaxy-system-focus','galaxy-arm-focus','galaxy-location-note'])$(id).hidden=!galaxyMode;
 $('zoom').max=galaxyMode?512:24;
 if(!galaxyMode)$('galaxy-cluster-marker').hidden=true;
 $('galaxy-location-note').textContent=galaxyFocus===true?'Caldwell 80 · Omega Centauri · 900 stellar samples. Isolated close-up of the dense core and sparse halo; modeled outer diameter 450 light-years. Return to galaxy to see its position.':'Caldwell 80 · Omega Centauri lies just above the galactic disk. At galaxy scale it is about one pixel: tap its labeled ring or Find Caldwell 80 for a close-up.';
 if(galaxyMode){
  for(const [id] of [...specs,...starSpecs])$(id).disabled=!['exposure','opacity','star-glow'].includes(id);
  for(const id of ['art-view','layer2','mask','palette'])$(id).disabled=true;
  for(const swatch of $('swatches').children)swatch.disabled=true;
  $('star-summary').textContent='5,200 Milky Way stars + nested stellar groups as you zoom · 900 cluster + 220 sparse Magellanic samples · main-sequence colors · 11 rare glare stars';
  $('compact-note').hidden=false;
  $('compact-note').textContent='The centered Milky Way view has three tighter, longer spiral arms, a modest bar, and a warm bulge that dims toward edge-on. Zooming reveals nested dust filaments, dark knots and smaller stellar groups that stay in place. Explore an arm jumps into the spiral; double-click another region to center it, then use the zoom slider or scroll. Reset view returns to the center. Andromeda-inspired muted disk light, broken brown dust lanes and scattered blue-white star groups add texture; small rose gas knots mark active regions. This is a stylized three-arm galaxy, not a reconstruction of the Milky Way or Andromeda. Dust has real depth and obscures stars behind it. Omega Centauri and the sparse Large Magellanic Cloud use measured Galactic bearings in one shared frame (Sun at 8.2 kpc). The Magellanic Cloud is context only, not an inspectable target. A few Milky Way stars carry faint paired ordered-dither glare rays (about one per 500 stars). LMC: longitude 280.47°, latitude −32.89°, 161,744 light-years from the Sun, below the disk. Gas shapes are illustrative. Use Galaxy + companions for true separation, or Find Caldwell 80 for its close-up. The labeled ring marks its position without enlarging the physical cluster. Positions and sizes assume a 100,000-light-year galactic disk. RFL exports span the full system: use 64³ for better gas detail. Drag to tilt; scroll to zoom. Stellar colors stay on a main-sequence palette. RFL exports the base static volume and 6,320 base stars; the finer zoom-dependent layers are preview-only. This galaxy is browser-generated and is not included in native C recipes.';
  $('cloud-rotation-control').hidden=false;
 }
 $('export-recipe').disabled=!!imagePreset||galaxyMode;
 $('export-recipe').title=galaxyMode?'This browser-generated galaxy supports PNG, density and RFL bake exports; native C recipes are unavailable.':imagePreset?'Image textures must be baked with Export RFL system.':'Save parameters for the native C baker';
}
function resetCamera() { galaxyFocus=false;galaxyTarget=null;$('galaxy-cluster-focus').textContent='Find Caldwell 80'; const ref=texturePresets[imagePreset]?.reference; yaw=0; pitch=galaxyMode?.85:ref?0:.20; $('zoom').value=ref?1.65:1.25; updateOutputs(); dirty=true; }
function setMode(next) {
 mode=(cometMode||galaxyMode)?'volume':next; view='art'; dirty=true;
 if(texturePresets[imagePreset]?.reference){
  const asset=texturePresets[imagePreset];
  $('width').value=mode==='volume'?256:asset.previewWidth;
  $('height').value=mode==='volume'?256:asset.previewHeight;
 }
 $('volume-view').setAttribute('aria-pressed',mode==='volume');
 $('art-view').setAttribute('aria-pressed',mode==='texture');
 $('density-view').setAttribute('aria-pressed','false');
 $('motion-controls').hidden=$('view-controls').hidden=mode!=='volume';
 $('mode-label').textContent = galaxyMode?'GALAXY · VOLUMETRIC DUST & PIXEL STARS':cometMode?'COMETS · DIRECTIONAL 3D VOLUME':texturePresets[imagePreset]?.reference?(mode==='volume'?'REFERENCE NEBULA · 3D VOLUME':'REFERENCE TEXTURE') : imagePreset?(mode==='volume'?'IMAGE VOLUME · ANIMATED DEPTH':'IMAGE TEXTURE · ORIGINAL PIXELS'):(mode==='volume'?'LIVE VOLUME · 3D NOISE':'LIVE TEXTURE · 2D NOISE');
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
 updateClusterLocator();
}
function updateClusterLocator() {
 const marker=$('galaxy-cluster-marker'),p=last?.clusterProjection;
 marker.hidden=!galaxyMode||!p||p.focused||view==='density'||p.x<0||p.y<0||p.x>=last.width||p.y>=last.height;
 if(marker.hidden)return;
 // Canvas uses object-fit: contain; account for letterboxing on wide screens.
 const canvas=$('canvas'),scale=Math.min(canvas.clientWidth/last.width,canvas.clientHeight/last.height);
 marker.style.left=`${canvas.offsetLeft+(canvas.clientWidth-last.width*scale)/2+p.x*scale}px`;
 marker.style.top=`${canvas.offsetTop+(canvas.clientHeight-last.height*scale)/2+p.y*scale}px`;
 marker.classList.toggle('label-left',p.x>last.width*.65);
}
new ResizeObserver(updateClusterLocator).observe($('viewport'));
function sendFrame(now) {
 if(busy || exportingRfl || failed || !worker) return;
 busy=true; dirty=false; lastSend=now;
 let seed=Number($('seed').value);
 if(!Number.isFinite(seed)) seed=42871;
 seed=Math.min(2147483647,Math.max(0,Math.trunc(seed))); $('seed').value=seed;
 worker.postMessage({id:++seq,mode,texture:imagePreset,galaxy:galaxyMode,galaxyFocus,galaxyTarget,nova:novaMode,compact:compactMode,comet:cometParams(),cloudRotation:Number($('cloud-rotation').value),revision:sceneRevision,params:params(),space:spaceParams(),width:+$('width').value,height:+$('height').value,seed,colors,reflectionColors,time,yaw,pitch,zoom:+$('zoom').value});
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
 'barred-galaxy':{palette:0,exposure:1.2,opacity:.85},
 'blue-reflection':{palette:7,scale:4.8,octaves:6,persistence:.58,lacunarity:2.1,warp:2.4,threshold:.48,mask:0,mix:.45,stretch:1.15,softness:.28,exposure:1.25,opacity:.92},
 veil:{palette:0,scale:5,warp:1.2,threshold:.38,mask:0,mix:.35,stretch:1,exposure:.95},
 pillars:{palette:2,scale:7,warp:1.6,threshold:.32,mask:1,mix:.35,stretch:1.15,exposure:1.15},
 lagoon:{palette:1,scale:4,warp:2.1,threshold:.36,mask:2,mix:.55,stretch:1.15,exposure:1.1},
 rift:{palette:3,scale:8,warp:2.6,threshold:.43,mask:0,mix:.25,stretch:1.6,exposure:1.2},
 'nova-b':{palette:3,scale:5,warp:1.7,threshold:.15,mask:0,mix:.58,stretch:1,softness:.30,exposure:1.35,opacity:.88},
 nova:{palette:3,scale:6,warp:1.7,threshold:.15,mask:0,mix:.58,stretch:1,softness:.30,exposure:1.35,opacity:.88}
};
function restartNova() {
 time=0;paused=false;sceneRevision++;dirty=true;
 $('pause').textContent='Pause motion';$('pause').setAttribute('aria-pressed','false');
 if(+$('speed').value===0)$('speed').value=1;
 $('nova-phase').textContent='Red progenitor';$('nova-cutoff').textContent='Cutoff 0.15';
 $('star-summary').textContent=novaMode===2?'1 nova · 2 jets · detached reflection clouds':'1 centered star · 50% jet chance per seed';
 $('threshold').value=.15;$('cavity-radius').value=.12;updateOutputs();
}
function preset(name) {
 if(galaxyMode&&name!=='barred-galaxy'&&galaxyPrevious){
  for(const id of ['width','height','background','zoom','speed','star-glow'])$(id).value=galaxyPrevious[id];
  $('orbit').checked=galaxyPrevious.orbit;background();galaxyPrevious=null;
 }
 galaxyMode=name==='barred-galaxy';galaxyFocus=false;galaxyTarget=null;$('galaxy-cluster-focus').textContent='Find Caldwell 80';
 const nextComet=cometPresets[name]||0;
 if(!nextComet&&cometMode&&cometPrevious){
  starSpecs.forEach(([id],i)=>$(id).value=cometPrevious.stars[i]);
  for(const id of ['width','height','background','zoom','rfl-side'])$(id).value=cometPrevious[id];
  $('orbit').checked=cometPrevious.orbit;background();cometPrevious=null;
 }
 cometMode=nextComet;
 if(blueReflectionPrevious && name!=='blue-reflection') {
  starSpecs.forEach(([id],i)=>$(id).value=blueReflectionPrevious.stars[i]);
  $('zoom').value=blueReflectionPrevious.zoom;
  blueReflectionPrevious=null;
 }

 const nextCompact=compactPresets[name]||0;
 if(!nextCompact&&compactMode&&compactPrevious){
  starSpecs.forEach(([id],i)=>$(id).value=compactPrevious.stars[i]);
  $('background').value=compactPrevious.background;$('orbit').checked=compactPrevious.orbit;
  $('zoom').value=compactPrevious.zoom;background();compactPrevious=null;
 }
 const enteringNova=name==='nova'?1:name==='nova-b'?2:0;
 if(!enteringNova&&novaMode&&novaPrevious) {
  starSpecs.forEach(([id],i)=>$(id).value=novaPrevious.stars[i]);
  $('background').value=novaPrevious.background;$('orbit').checked=novaPrevious.orbit;background();novaPrevious=null;
 }
 const enteringImage=!!texturePresets[name];
 if(enteringImage&&!imagePreset)imagePrevious={stars:starSpecs.map(([id])=>$(id).value),width:$('width').value,height:$('height').value,background:$('background').value,orbit:$('orbit').checked,zoom:$('zoom').value};
 if(!enteringImage&&imagePreset&&imagePrevious){
  starSpecs.forEach(([id],i)=>$(id).value=imagePrevious.stars[i]);
  $('width').value=imagePrevious.width;$('height').value=imagePrevious.height;$('background').value=imagePrevious.background;$('orbit').checked=imagePrevious.orbit;$('zoom').value=imagePrevious.zoom;background();imagePrevious=null;
 }
 if(name==='blue-reflection'&&!blueReflectionPrevious)blueReflectionPrevious={stars:starSpecs.map(([id])=>$(id).value),zoom:$('zoom').value};
 if(enteringNova&&!novaMode) novaPrevious={stars:starSpecs.map(([id])=>$(id).value),background:$('background').value,orbit:$('orbit').checked};
 if(nextCompact&&!compactMode)compactPrevious={stars:starSpecs.map(([id])=>$(id).value),background:$('background').value,orbit:$('orbit').checked,zoom:$('zoom').value};
 if(nextComet&&!cometPrevious)cometPrevious={stars:starSpecs.map(([id])=>$(id).value),width:$('width').value,height:$('height').value,background:$('background').value,orbit:$('orbit').checked,zoom:$('zoom').value,'rfl-side':$('rfl-side').value};
 compactMode=nextCompact;
 imagePreset=enteringImage?name:'';failed=false;
 $('texture-note').hidden=!imagePreset;
 $('texture-note').textContent=texturePresets[name]?.reference
  ?'Shifting 3D clouds inspired by the reference’s colors and shape. Drag to explore every side; Randomize changes the turbulence. Texture shows the original reference.'
  :'Texture view preserves the uploaded image. Volume adds animated depth using its colors and brightness. Use PNG, density, or RFL system export; editable C recipes support procedural presets only.';
 last=null;$('export').disabled=$('export-density').disabled=true;
 $('loading').hidden=false;$('loading').textContent=imagePreset?'Loading image texture…':'Preparing nebula…';
 novaMode=enteringNova;sceneRevision++;
 $('nova-controls').hidden=!novaMode;
 $('reflection-palette').hidden=novaMode!==2;
 $('palette-label').textContent=novaMode?'Hydrogen palette':'Palette';
 if(novaMode) {
  $('star-count').value=1;$('jet-fraction').value=.5;$('star-spread').value=1;$('cavity-radius').value=.12;
  $('background').value='black';$('orbit').checked=false;background();resetCamera();setMode('volume');restartNova();
 }
 specs.forEach(([id,,,,,val])=>$(id).value=val);
 for(const [k,v] of Object.entries(enteringImage?{palette:0,scale:5,warp:1.2,threshold:.10,mask:3,mix:.35,stretch:1,softness:.45,exposure:1,opacity:1}:cometMode?{palette:1,exposure:1.3,opacity:.9}:compactMode?{palette:1,scale:5,warp:1.2,threshold:.38,mask:2,mix:.35,stretch:1,softness:.30,exposure:1.2,opacity:1}:presets[name])) $(k).value=v;
 $('tile').checked=false; $('layer2').checked=true; $('dither').checked=true;
 setColors(palettes[+$('palette').value]); $('output-title').textContent=$('preset').selectedOptions[0].textContent;
 if(galaxyMode){
  if(!galaxyPrevious)galaxyPrevious=Object.fromEntries(['width','height','background','zoom','speed','star-glow'].map(id=>[id,$(id).value]).concat([['orbit',$('orbit').checked]]));
  $('width').value=$('height').value='256';$('background').value='black';$('orbit').checked=false;
  $('star-glow').value=1;$('speed').value=1;$('zoom').value=1.15;
  galaxyFocus=false;$('zoom').value=1.15;time=0;yaw=.25;pitch=.85;paused=false;$('pause').textContent='Pause motion';$('pause').setAttribute('aria-pressed','false');background();setMode('volume');
 }else if(cometMode){
  cometSpecs.forEach(([id,,,,,value])=>$(id).value=value);
  $('comet-width').value=cometMode===3?.08:cometMode===2?.11:.15;
  $('comet-turbulence').value=cometMode===3?.35:cometMode===2?.5:.8;
  $('comet-length').value=cometMode===3?1.8:2.2;$('rfl-side').value='64';
  $('width').value=$('height').value='256';$('background').value='space';
  $('orbit').checked=false;time=0;paused=false;$('pause').textContent='Pause motion';$('pause').setAttribute('aria-pressed','false');
  if(+$('speed').value===0)$('speed').value=1;
  background();resetCamera();setMode('volume');
 }else if(name==='blue-reflection'){
  $('star-count').value=36;$('cavity-radius').value=.07;$('jet-fraction').value=0;
  $('star-glow').value=.85;$('jet-length').value=.6;$('star-spread').value=1.1;
  $('zoom').value=1.65;time=0;yaw=0;pitch=.2;setMode('volume');
 }else if(compactMode){
  $('star-count').value=1;$('jet-fraction').value=1;$('star-spread').value=1;$('cavity-radius').value=0;
  $('jet-length').value=compactMode===5?.75:1;$('star-glow').value=compactMode===5?.9:1.25;
  $('background').value='black';$('orbit').checked=false;background();time=0;resetCamera();setMode('volume');
  if(compactMode===5){yaw=-.55;$('orbit').checked=true;$('width').value=$('height').value='192';$('speed').value=.65;}
 }else if(enteringImage){
  $('width').value=$('height').value='347';$('star-count').value=0;$('dither').checked=false;
  $('background').value='black';background();time=0;yaw=0;pitch=0;
  if(texturePresets[name].reference){
   const asset=texturePresets[name];
   for(const [id,size,native] of [['width',asset.previewWidth,asset.width],['height',asset.previewHeight,asset.height]]){
    const select=$(id);
    for(const n of [size,native])if(!Array.from(select.options).some(option=>Number(option.value)===n)){
     const option=document.createElement('option');option.value=n;option.textContent=String(n);select.append(option);
    }
    select.value=size;
   }
   $('orbit').checked=true;$('zoom').value=1.65;$('width').value=$('height').value='256';paused=false;$('pause').textContent='Pause motion';$('pause').setAttribute('aria-pressed','false');if(+$('speed').value===0)$('speed').value=1;$('jet-length').value=1;$('jet-fraction').value=0;$('star-glow').value=1;
   setMode('volume');
  }else setMode('texture');
 }else setMode(mode);
 updateOutputs(); dirty=true;
}
for(const [id] of [...specs,...starSpecs,...cometSpecs]) $(id).addEventListener('input',()=>{updateOutputs();dirty=true});
for(const id of ['seed','width','height','mask','tile','layer2','dither']) $(id).addEventListener('change',()=>{updateOutputs();dirty=true});
$('comet-flip').addEventListener('click',()=>{const a=Number($('comet-bearing').value);$('comet-bearing').value=a>=0?a-180:a+180;$('comet-elevation').value=-Number($('comet-elevation').value);updateOutputs();dirty=true});
$('palette').addEventListener('change',()=>{if(+$('palette').value!==5)setColors(palettes[+$('palette').value]);dirty=true});
$('background').addEventListener('change',background);
$('random').addEventListener('click',()=>{$('seed').value=crypto.getRandomValues(new Uint32Array(1))[0]%2147483647;if(novaMode)restartNova();dirty=true});
$('preset').addEventListener('change',()=>preset($('preset').value));
$('nova-replay').addEventListener('click',restartNova);
$('seed').addEventListener('change',()=>{if(novaMode)restartNova()});
$('reset').addEventListener('click',()=>{
 galaxyMode=false;galaxyPrevious=null;cometMode=0;cometPrevious=null;imagePreset='';imagePrevious=null;blueReflectionPrevious=null;compactMode=0;compactPrevious=null;failed=false;
 novaMode=false;novaPrevious=null;$('nova-controls').hidden=true;
 $('preset').value='veil';$('seed').value=42871;$('width').value=$('height').value='192';$('background').value='space';
 starSpecs.forEach(([id,,,,,val])=>$(id).value=val);
 time=0;paused=false;$('pause').textContent='Pause motion';$('pause').setAttribute('aria-pressed','false');$('orbit').checked=true;$('speed').value=1;$('cloud-rotation').value=1;
 resetCamera();setMode('volume');background();preset('veil');
});
$('pause').addEventListener('click',()=>{paused=!paused;$('pause').textContent=paused?'Resume motion':'Pause motion';$('pause').setAttribute('aria-pressed',paused);dirty=true});
$('reset-view').addEventListener('click',resetCamera);
function toggleClusterFocus(){
 galaxyFocus=galaxyFocus===true?false:true;galaxyTarget=null;$('zoom').value=galaxyFocus?256:1.15;
 $('galaxy-cluster-focus').textContent=galaxyFocus?'Return to galaxy':'Find Caldwell 80';
 $('galaxy-cluster-marker').hidden=true;updateOutputs();dirty=true;
}
$('galaxy-cluster-focus').addEventListener('click',toggleClusterFocus);
$('galaxy-cluster-marker').addEventListener('pointerdown',e=>e.stopPropagation());
$('galaxy-cluster-marker').addEventListener('click',toggleClusterFocus);
$('cloud-rotation').addEventListener('input',()=>{updateOutputs();dirty=true});
$('speed').addEventListener('input',()=>{updateOutputs();dirty=true});
$('galaxy-system-focus').addEventListener('click',()=>{galaxyFocus='system';$('zoom').value=.4;$('galaxy-cluster-focus').textContent='Find Caldwell 80';updateOutputs();dirty=true;});
$('galaxy-arm-focus').addEventListener('click',()=>{
 const r=.58,a=4.35*Math.log(1+r/.18);
 galaxyTarget={x:r*Math.cos(a),y:0,z:r*Math.sin(a)};galaxyFocus=false;
 $('galaxy-cluster-focus').textContent='Find Caldwell 80';$('zoom').value=12;$('orbit').checked=false;
 updateOutputs();dirty=true;
});
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
// Recenter on the disk plane using the basis of the last completed frame.
// Near edge-on, the view plane is a better target than an unstable plane hit.
$('viewport').addEventListener('dblclick',e=>{
 if(!galaxyMode||galaxyFocus||!last?.camera)return;
 const c=$('canvas'),rect=c.getBoundingClientRect(),scale=Math.min(rect.width/last.width,rect.height/last.height);
 const px=(e.clientX-rect.left-(rect.width-last.width*scale)/2)/scale,py=(e.clientY-rect.top-(rect.height-last.height*scale)/2)/scale;
 if(px<0||py<0||px>=last.width||py>=last.height)return;
 const {right,up,forward,center,span}=last.camera,tx=(px-last.width/2)/last.height*span,ty=(last.height/2-py)/last.height*span;
 let point=right.map((v,j)=>[center.x,center.y,center.z][j]+v*tx+up[j]*ty);
 if(Math.abs(forward[1])>.15){const distance=-point[1]/forward[1];point=point.map((v,j)=>v+forward[j]*distance);}
 if(Math.hypot(point[0],point[2])>1.27)return;
 galaxyTarget={x:point[0],y:Math.max(-.15,Math.min(.15,point[1])),z:point[2]};
 $('orbit').checked=false;dirty=true;
});
$('viewport').addEventListener('wheel',e=>{
 if(!galaxyMode)return;e.preventDefault();
 const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?300:1);
 $('zoom').value=Math.max(.35,Math.min(512,Number($('zoom').value)*Math.exp(-Math.max(-300,Math.min(300,delta))*.0025)));
 updateOutputs();dirty=true;
},{passive:false});
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
  ...params().map((v,i)=>`p${i}=${v}`),...spaceParams().concat(+novaMode,compactMode,Number($('cloud-rotation').value),...cometParams()).map((v,i)=>`s${i}=${v}`),
  ...colors.concat(novaMode===2?reflectionColors:[]).map((v,i)=>`c${i}=${v.slice(1)}`)].join('\n')+'\n';
}
$('export-recipe').addEventListener('click',()=>download(new Blob([recipe()],{type:'text/plain'}),`nebula-${$('preset').value}-${$('seed').value}.nebula`));
$('export-rfl').addEventListener('click',()=>{
 if(failed||exportingRfl||!worker)return;
 exportingRfl=true;$('export-rfl').disabled=true;
 $('rfl-status').textContent='Baking animation and distance levels…';
 worker.postMessage({action:'export-rfl',mode:'volume',texture:imagePreset,galaxy:galaxyMode,galaxyFocus,nova:novaMode,compact:compactMode,comet:cometParams(),cloudRotation:Number($('cloud-rotation').value),seed:Math.max(0,Number($('seed').value))>>>0,
  params:params(),space:spaceParams(),colors:[...colors],reflectionColors:[...reflectionColors],side:+$('rfl-side').value,name:$('output-title').textContent});
});
function fail(message){failed=true;busy=false;$('loading').hidden=false;$('loading').textContent='The generator could not start. Reload to try again.';$('status').textContent=message;$('export').disabled=$('export-density').disabled=true}
setColors(colors);background();updateOutputs();setMode('volume');
$('preset').value='veil';preset('veil');
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
  busy=false;if(m.revision!==sceneRevision){dirty=true;return}
  if(m.error){fail(m.error);return}
  if(m.mode!==mode){dirty=true;return}
  last=m;$('loading').hidden=true;show();updateCometCompass();
  $('status').textContent=`${m.width} × ${m.height} · ${m.ms.toFixed(0)} ms${galaxyMode?` · ${m.baseStars} base + ${m.detailStars} local stars · ${m.detailLevels.toFixed(1)} detail levels`:cometMode?' · anti-stellar volume':mode==='volume'?` · ${m.stars} stars / ${m.jets} jet sources`:''}`;
  $('motion-time').textContent=`${m.time.toFixed(1)} s`;
  if(m.nova) {
   const phases=['Red progenitor','Dither glare','Expanding nebula','Blue-white remnant'];
   $('nova-phase').textContent=phases[m.nova.phase];
   $('nova-cutoff').textContent=novaMode===2?'Light echo · time compressed':`Cutoff ${m.nova.cutoff.toFixed(2)}`;
   if(novaMode===2)$('nova-phase').textContent=time>=16?'Blue remnant · fading to half':time>=10?'Returning blue echo':time>=6?'Green ionization front':time>=3?'Blue reflection echo':'Flash · jets emerging';
   $('cavity-radius').value=m.nova.clearing.toFixed(3);$('cavity-radius-val').textContent=m.nova.clearing.toFixed(2);
   $('threshold').value=m.nova.cutoff.toFixed(3);$('threshold-val').textContent=m.nova.cutoff.toFixed(2);
   $('star-summary').textContent=novaMode===2?'1 nova · 2 jets · detached reflection clouds':m.nova.phase<2?'1 centered star · 50% jet chance per seed':`1 stellar remnant · ${m.nova.hasJets?'jet cones present':'no jet cone this seed'}`;
  }
  $('export').disabled=$('export-density').disabled=false;
  $('export-rfl').disabled=exportingRfl;
 };
 worker.onerror=()=>fail('Generator worker failed.');requestAnimationFrame(frame);
}catch(e){fail(e.message)}
