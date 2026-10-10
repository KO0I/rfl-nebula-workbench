import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const messages=[];
const ctx=vm.createContext({WebAssembly,Uint8Array,Uint8ClampedArray,Float32Array,DataView,TextEncoder,performance,
 fetch:async path=>{const b=fs.readFileSync('dist/'+path);return {ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};},
 self:{postMessage:m=>messages.push(m)}});
ctx.importScripts=(...paths)=>paths.forEach(p=>vm.runInContext(fs.readFileSync('dist/'+p,'utf8'),ctx));
vm.runInContext(fs.readFileSync('dist/engine.js','utf8'),ctx);
const m={mode:'volume',texture:'',seed:42871,width:64,height:64,time:0,yaw:0,pitch:.85,zoom:1.15,params:[5,5,.52,2,1.2,1,.35,2,.38,.55,1,0,1.2,.85,1],space:[18,.23,.28,1,1,1],colors:['#09091b','#221a44','#522e79','#914aa9','#e188d0','#f8dcf4']};
for(const [id,galaxy,comet] of [[1,false,[3,1.8,.08,.35,180,0,.3,1]],[2,true,undefined],[3,false,undefined]])ctx.self.onmessage({data:{...m,id,revision:id,galaxy,comet}});
ctx.self.onmessage({data:{...m,galaxy:true,action:'export-rfl',side:32,name:'Barred spiral galaxy'}});
await vm.runInContext('requests',ctx);
assert.equal(messages.length,4);for(const r of messages)assert(!r.error,r.error);
assert.equal(messages[1].stars,6320);assert(messages[1].clusterProjection);assert.equal(messages[1].clusterProjection.focused,false);assert.equal(messages[2].stars,18);assert(messages[0].cometGeometry);assert.equal(messages[2].cometGeometry,null);
assert.equal(messages[3].action,'export-rfl');assert(messages[3].bytes.length>6320*48);
console.log('Worker passed: comet → galaxy → nebula, revisions, and galaxy RFL export.');
