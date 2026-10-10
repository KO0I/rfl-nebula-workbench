import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const messages=[];
const ctx=vm.createContext({WebAssembly,Uint8Array,Uint8ClampedArray,Float32Array,DataView,TextEncoder,performance,
 fetch:async path=>{const b=fs.readFileSync('dist/'+path);return {ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};},
 self:{postMessage:m=>messages.push(m)}});
ctx.importScripts=(...paths)=>paths.forEach(path=>vm.runInContext(fs.readFileSync('dist/'+path,'utf8'),ctx));
vm.runInContext(fs.readFileSync('dist/engine.js','utf8'),ctx);
const assets=Object.entries(ctx.NEBULA_REFERENCE_PRESETS);
assert.equal(assets.length,4);
const params=[5,5,.52,2,1.2,1,.35,3,.1,.45,1,0,1,1,0];
const base={mode:'volume',nova:0,compact:0,seed:42871,time:0,yaw:0,pitch:0,
 space:[0,0,0,1,1,1],colors:['#09091b','#221a44','#522e79','#914aa9','#e188d0','#f8dcf4']};
let id=0;
async function send(m){ctx.self.onmessage({data:{...base,...m,params:[...params],id:++id,revision:id}});await vm.runInContext('requests',ctx);const result=messages.at(-1);assert(!result.error,result.error);return result;}
const snapshots=[];
for(const [key,asset] of assets){
 const m={texture:key,width:256,height:256,zoom:1.65};
 const front=await send(m),repeat=await send(m),turned=await send({...m,yaw:.65,pitch:.15}),motion=await send({...m,time:4}),side=await send({...m,yaw:Math.PI/2});
 assert.deepEqual(front.rgba,repeat.rgba,`${key}: paused frame`);
 assert.notDeepEqual(front.rgba,turned.rgba,`${key}: spatial rotation`);
 assert.notDeepEqual(front.rgba,motion.rgba,`${key}: cloud motion`);
 assert(side.density.filter(v=>v>10).length>1000,`${key}: substantial gas in edge-on view`);
 assert(front.density.some(v=>v>30),`${key}: real cloud density`);
 assert.equal(front.stars,64);assert.equal(front.jets,0);
 const flat=await send({...m,mode:'texture',width:asset.width,height:asset.height});
 assert.deepEqual(Buffer.from(flat.rgba),fs.readFileSync('dist/'+asset.pixels),`${key}: exact reference pixels`);
 const bake=await send({...m,action:'export-rfl',side:16,name:asset.label});
 const bytes=Buffer.from(bake.bytes);
 assert.equal(bytes.subarray(0,7).toString(),'RFLNEB1');assert.equal(bytes.readUInt32LE(28),64);
 assert(bytes.subarray(3264).some((v,i)=>i%4===3&&v>0),`${key}: exported volume`);
 if(process.argv[2]){
  fs.mkdirSync(process.argv[2],{recursive:true});
  for(const [view,result] of [['front',front],['turned',turned],['side',side],['motion',motion]])fs.writeFileSync(`${process.argv[2]}/${key}-${view}.rgba`,result.rgba);
  fs.writeFileSync(`${process.argv[2]}/${key}.json`,JSON.stringify({width:m.width,height:m.height}));
 }
 snapshots.push(front.rgba);console.log(key,`${m.width}x${m.height}`,Math.round(front.ms)+' ms', 'render, rotation, pause, motion, texture, RFL passed');
}
for(let i=1;i<snapshots.length;i++)assert.notDeepEqual(snapshots[0],snapshots[i]);
const legacy=await send({texture:'ghost-cloud',mode:'texture',width:347,height:347,zoom:1.25});
assert.deepEqual(Buffer.from(legacy.rgba),fs.readFileSync('dist/textures/ghost-cloud.rgba'));
const procedural=await send({texture:'',width:128,height:128,zoom:1.25});
assert(procedural.rgba.some(v=>v>0));
console.log('Reference to legacy texture to procedural switching passed.');
