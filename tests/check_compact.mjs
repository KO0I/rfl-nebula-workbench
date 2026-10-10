import fs from 'node:fs';
import assert from 'node:assert/strict';
const {instance:{exports:e}}=await WebAssembly.instantiate(fs.readFileSync('dist/nebula.wasm'),{});
const w=192,h=192;
e.nebula_set(12,1.2);e.nebula_set(13,1);e.nebula_space_set(3,1.25);e.nebula_space_set(4,1);
function build(kind=1){e.nebula_space_set(6,0);e.nebula_space_set(7,kind);e.nebula_space_build(42871);}
function render(time=2,yaw=0,pitch=.2,zoom=1.25){
 const ptr=e.nebula_space_render(w,h,time,yaw,pitch,zoom);
 return Buffer.from(new Uint8Array(e.memory.buffer,ptr,w*h*4));
}
build();const wide=render();
assert.equal(e.nebula_space_star_count(),1);assert.equal(e.nebula_space_jet_count(),1);
assert.deepEqual(wide,render(),'Paused compact scene must be deterministic');
assert.notDeepEqual(wide,render(6),'Gas and knots must animate');
assert.notDeepEqual(wide,render(2,1),'Rotation must change the 3D scene');
const counts={topOrange:0,bottomOrange:0,purple:0};
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
 const i=(y*w+x)*4;const [r,g,b,a]=wide.subarray(i,i+4);
 if(a>30&&r>g*1.4&&g>b*1.4&&g>40)counts[y<h/2?'topOrange':'bottomOrange']++;
 if(a>5&&b>g*2&&b>r*1.15)counts.purple++;
}
assert(counts.topOrange>80&&counts.bottomOrange>80,'Both beams must end in orange lobes');
assert(counts.purple>80,'Purple backscatter must surround the lobes');
const close=render(2,0,.2,15.65),center=((h/2)*w+w/2)*4;
let blackCore=0;
for(let y=92;y<101;y++)for(let x=92;x<101;x++){const i=(y*w+x)*4;if(close[i+3]>245&&close[i]+close[i+1]+close[i+2]<45)blackCore++;}
assert(blackCore>8,'Black hole must retain an opaque black core underneath the foreground polar beam');
let opaque=0;for(let i=0;i<close.length;i+=4)if(close[i+3]>245)opaque++;
assert(opaque>2000,'Torus must contain a substantial opaque surface');
const density=new Uint8Array(e.memory.buffer,e.nebula_space_density(),w*h);
assert(density.some(v=>v>240),'Density view must include the torus');
for(const kind of [2,3,4]){build(kind);const frame=render(2,0,.2,15.65);assert(frame[center]+frame[center+1]+frame[center+2]>100,'Stellar compact objects must emit light');}
build();
const axis=new Float32Array(e.memory.buffer,e.nebula_space_stars(),11).slice(4,7);
const yaw=Math.atan2(axis[0],axis[2]),pitch=-Math.asin(axis[1]);
const head=render(2,yaw,pitch),again=render(2,yaw,pitch);
assert.deepEqual(head,again,'Paused axial dither must be stable');
assert.notDeepEqual(head,render(2.1,yaw,pitch),'Axial glare must flicker');
for(let y=94;y<=98;y++)for(let x=94;x<=98;x++) {
 const i=(y*w+x)*4;
 assert(head[i]>245&&head[i+1]>245&&head[i+2]>245&&head[i+3]>245,'Head-on jet must have a solid white circular center');
}
build();e.nebula_space_set(4,3);e.nebula_space_build(42871);
const long=render();assert.notDeepEqual(long,wide,'Length adjustment must change beam-to-torus proportions');
// The baked bounds must include distal lobes, and the black hole must not
// become a bright point source in an older RFL reader.
const p=e.nebula_export_rfl(42871,32),size=e.nebula_export_rfl_size();assert(p&&size);
const bytes=new Uint8Array(e.memory.buffer,p,size),dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
assert(Math.abs(dv.getFloat32(44,true)-24.0)<.001,'Baked volume must include full 3 ly beams plus lobes');
assert.equal(dv.getFloat32(160+7*4,true),0);assert.equal(dv.getFloat32(160+8*4,true),0);assert.equal(dv.getFloat32(160+9*4,true),0);
e.nebula_space_set(7,0);e.nebula_space_set(0,7);e.nebula_space_set(2,0);e.nebula_space_build(42871);render();
assert.equal(e.nebula_space_star_count(),7);assert.equal(e.nebula_space_jet_count(),0);
console.log('Compact scenes passed: deterministic animation, rotation, bilateral orange lobes, purple backscatter, opaque black core and torus, bright compact stars, 3 ly bounds, RFL bake, return to ordinary presets.');
