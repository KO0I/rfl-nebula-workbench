import fs from 'node:fs';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
const { instance: { exports: e } } = await WebAssembly.instantiate(fs.readFileSync('dist/nebula.wasm'),{});
const width=192,height=192;
e.nebula_set(8,.38);e.nebula_set(12,.95);e.nebula_set(13,.78);
e.nebula_space_set(1,.23);e.nebula_space_set(3,.8);
let t=performance.now();e.nebula_space_build(42871);console.log('Build ms:',Math.round(performance.now()-t));
function render(time=0,yaw=0,pitch=.2) {
 const start=performance.now(),ptr=e.nebula_space_render(width,height,time,yaw,pitch,1.25);
 return { bytes:Buffer.from(new Uint8Array(e.memory.buffer,ptr,width*height*4)),ms:performance.now()-start };
}
const a=render(),repeat=render();assert.deepEqual(a.bytes,repeat.bytes,'Paused frames must be identical');
const turn=render(0,1.2,.5),motion=render(4);
assert.notDeepEqual(a.bytes,turn.bytes,'Rotation must change projected volume');
assert.notDeepEqual(a.bytes,motion.bytes,'Time must animate the gas and jets');
assert.equal(e.nebula_space_star_count(),18);assert.equal(e.nebula_space_jet_count(),5);
const records=new Float32Array(e.memory.buffer,e.nebula_space_stars(),18*11).slice();
const positions=Array.from({length:18},(_,i)=>Array.from(records.slice(i*11,i*11+3)));
render(0);
const cleared=positions.map(([x,y,z])=>e.nebula_space_sample(x,y,z));
assert(cleared.every(x=>x<.004),'Star centers must be cleared in 3D');
e.nebula_space_set(1,0);e.nebula_space_build(42871);render(0);
const uncleared=positions.map(([x,y,z])=>e.nebula_space_sample(x,y,z));
assert(uncleared.some((x,i)=>x>cleared[i]+.05),'Disabling clearings must restore gas near an embedded star');
for(const [count,fraction,expected] of [[0,1,0],[7,0,0],[7,1,7],[64,.5,32]]){
 e.nebula_space_set(0,count);e.nebula_space_set(2,fraction);e.nebula_space_build(42871);
 assert.equal(e.nebula_space_star_count(),count);assert.equal(e.nebula_space_jet_count(),expected);
 const result=render(2,.3);assert.equal(result.bytes.length,width*height*4);
}
e.nebula_space_render(512,128,2,.2,-.7,.8);
e.nebula_generate(128,256,42871);assert(e.nebula_render(0)>0,'Legacy texture API must remain available');
if(process.argv[2]) {
 fs.mkdirSync(process.argv[2],{recursive:true});
 for(const [name,r] of [['still',a],['rotation',turn],['motion',motion]])fs.writeFileSync(`${process.argv[2]}/${name}.rgba`,r.bytes);
}
console.log('Frame ms:',Math.round(a.ms),Math.round(turn.ms),Math.round(motion.ms));
console.log('Passed: deterministic pause, 3D rotation, animation, cavities, counts/fractions, dimensions, texture compatibility.');
