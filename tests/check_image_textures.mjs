import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
vm.runInThisContext(fs.readFileSync('dist/texture-presets.js','utf8'));
const {instance:{exports:e}}=await WebAssembly.instantiate(fs.readFileSync('dist/nebula.wasm'),{});
const assets=Object.entries(globalThis.NEBULA_TEXTURE_PRESETS);
assert.equal(assets.length,6);
function read(ptr,size){return Buffer.from(new Uint8Array(e.memory.buffer,ptr,size));}
function render(time=0,yaw=0){return read(e.nebula_space_render(128,128,time,yaw,0,1.45),128*128*4);}
e.nebula_set(8,.1);e.nebula_set(9,.45);e.nebula_set(10,1);
e.nebula_set(12,1);e.nebula_set(13,1);e.nebula_set(14,0);
e.nebula_space_set(0,0);
const exports=[];
for(const [key,asset] of assets){
 const bytes=fs.readFileSync('dist/'+asset.pixels);
 new Uint8Array(e.memory.buffer,e.nebula_image_buffer(),bytes.length).set(bytes);
 e.nebula_image_set(asset.width,asset.height);
 const flat=read(e.nebula_image_render(asset.width,asset.height),bytes.length);
 assert.deepEqual(flat,bytes,`${key}: exact original pixels at native size`);
 const rectangular=read(e.nebula_image_render(128,256),128*256*4);
 assert(rectangular.some((v,i)=>i%4===3&&v>0),`${key}: rectangular output`);
 e.nebula_space_build(42871);
 const front=render(),repeat=render(),turned=render(0,1.1),moving=render(4);
 assert.deepEqual(front,repeat,`${key}: deterministic paused view`);
 assert.notDeepEqual(front,turned,`${key}: spatial rotation`);
 assert.notDeepEqual(front,moving,`${key}: animated depth`);
 assert(front.some((v,i)=>i%4===3&&v>0),`${key}: visible volume`);
 const bake=read(e.nebula_export_rfl(42871,16),e.nebula_export_rfl_size());
 assert.equal(bake.subarray(0,7).toString(),'RFLNEB1');
 assert(bake.subarray(192).some((v,i)=>i%4===3&&v>0),`${key}: baked gas`);
 exports.push(bake);
 if(process.argv[2]){
  fs.mkdirSync(process.argv[2],{recursive:true});
  fs.writeFileSync(`${process.argv[2]}/${key}-front.rgba`,front);
  fs.writeFileSync(`${process.argv[2]}/${key}-turned.rgba`,turned);
 }
}
for(let i=1;i<exports.length;i++)assert.notDeepEqual(exports[0],exports[i],'Distinct textures must bake distinct systems');
e.nebula_image_set(0,0);
e.nebula_generate(192,192,42871);assert(e.nebula_render(0)>0);
e.nebula_space_set(6,1);e.nebula_space_build(42871);render(14);
console.log('Passed: six pixel-exact textures, rectangular output, deterministic pause, rotation, animation, image-driven RFL export, and return to procedural/Nova modes.');
