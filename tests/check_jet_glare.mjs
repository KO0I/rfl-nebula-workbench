import fs from 'node:fs';
import assert from 'node:assert/strict';
const {instance:{exports:e}}=await WebAssembly.instantiate(fs.readFileSync('dist/nebula.wasm'),{});
const w=256,h=256,seed=42871;
const normalize=v=>{const length=Math.hypot(...v);return v.map(x=>x/length)};
let axis,perpendicular;
function build(nova,jets=1){
 e.nebula_space_set(6,nova);e.nebula_space_set(0,1);e.nebula_space_set(2,jets);
 e.nebula_space_build(seed);
 const star=new Float32Array(e.memory.buffer,e.nebula_space_stars(),11);
 axis=normalize(Array.from(star.slice(4,7)));
 perpendicular=normalize([axis[2],0,-axis[0]]);
}
function render(degrees,side=1,time=22){
 const angle=degrees*Math.PI/180;
 const forward=axis.map((v,i)=>v*Math.cos(angle)*side+perpendicular[i]*Math.sin(angle));
 const yaw=Math.atan2(forward[0],forward[2]),pitch=-Math.asin(forward[1]);
 const ptr=e.nebula_space_render(w,h,time,yaw,pitch,1.25);
 return Buffer.from(new Uint8Array(e.memory.buffer,ptr,w*h*4));
}
function outerLight(frame){
 let sum=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  if(Math.hypot(x-w/2,y-h/2)<32)continue;
  const i=(y*w+x)*4;
  sum+=(frame[i]+frame[i+1]+frame[i+2])*frame[i+3]/255;
 }
 return sum;
}
e.nebula_set(13,0); // Isolate the source from view-dependent gas extinction.
build(1);
assert.equal(e.nebula_nova_jet_seed(seed),1,'Fixture must produce a Nova jet');
const head=render(0),reverse=render(0,-1);
assert(outerLight(head)>1000,'Looking along the jet must produce extended diffraction glare');
assert.deepEqual(head,reverse,'Both Nova lobes must produce the same blue-white glare');
assert.deepEqual(head,render(8),'No projected cone may remain inside the head-on region');
assert.deepEqual(reverse,render(8,-1),'The reverse cone must also disappear');
assert.deepEqual(head,render(0),'The paused glare must be deterministic');
const lights=[12,15,18,21,24].map(degrees=>outerLight(render(degrees)));
assert(lights[0]>lights[1]&&lights[1]>lights[2]&&lights[2]>lights[3]&&lights[3]>lights[4],
 'Diffraction glare must fade progressively as the camera rotates away');
assert.equal(lights[4],0,'No extended glare outside the alignment window');
assert(outerLight(render(90))>1000,'Side-on views must retain extended jet emission');
assert.deepEqual(render(0,1,0),render(90,1,0),'Jet glare must not appear before the Nova eruption');
assert.deepEqual(render(0,1,5.5),render(90,1,5.5),'The original Nova outburst glare must remain view-independent');
// Black gas isolates extinction from nebula emission and illuminated cavity rims.
for(let i=0;i<6;i++)e.nebula_palette(i,0,0,0);
build(1);
// Nova now owns its growing cavity; blacken its rim separately from jet tint.
new Float32Array(e.memory.buffer,e.nebula_space_stars(),11).fill(0,7,10);
e.nebula_set(13,.9);
assert(outerLight(render(0))<outerLight(head)*.9,'Foreground gas must attenuate the glare');
e.nebula_set(13,0);
e.nebula_space_set(3,0);
const dark=render(0);
assert.equal(outerLight(dark),0,'Zero stellar glow must suppress jet glare');
assert(!dark.some((value,i)=>i%4===3&&i!==(h/2*w+w/2)*4+3&&value>0),
 'A disabled glare must not leave opaque pixels in the PNG');
e.nebula_space_set(3,1);
build(0,1);
const ordinaryHead=render(0),ordinaryReverse=render(0,-1),ordinarySide=render(90);
build(0,0);
assert.notDeepEqual(ordinaryHead,render(0),'Ordinary stars must also receive forward jet glare');
assert.notDeepEqual(ordinaryReverse,render(0,-1),'Ordinary stars must also receive reverse jet glare');
assert.notDeepEqual(ordinarySide,render(90),'Ordinary side-on jets must remain visible');
if(process.argv[2]){
 fs.mkdirSync(process.argv[2],{recursive:true});build(1);
 const colors=['060e21','122b4f','2c588e','628fc5','abd7f5','edf9ff'];
 colors.forEach((s,i)=>e.nebula_palette(i,...[0,2,4].map(j=>parseInt(s.slice(j,j+2),16))));
 for(const [i,v] of [[0,6],[4,1.7],[6,.58],[9,.30],[12,1.35],[13,.88]])e.nebula_set(i,v);
 e.nebula_space_set(1,.12);e.nebula_space_set(3,.8);build(1);
 for(const degrees of [90,18,0])fs.writeFileSync(`${process.argv[2]}/jet-${degrees}.rgba`,render(degrees));
}
console.log('Jet glare passed: both axes, full cone replacement, smooth angular fade, side-on jets, pause, Nova phase gating, extinction, zero-glow transparency, ordinary stars.');
