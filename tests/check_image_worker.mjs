import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const messages=[];
const ctx=vm.createContext({WebAssembly,Uint8Array,Uint8ClampedArray,Float32Array,DataView,TextEncoder,performance,
 fetch:async path=>{
  if(path.includes('turquoise'))await new Promise(resolve=>setTimeout(resolve,25));
  const bytes=fs.readFileSync('dist/'+path);
  return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
 },
 self:{postMessage:m=>messages.push(m)}
});
ctx.importScripts=(...paths)=>paths.forEach(path=>vm.runInContext(fs.readFileSync('dist/'+path,'utf8'),ctx));
vm.runInContext(fs.readFileSync('dist/engine.js','utf8'),ctx);
const params=[5,5,.52,2,1.2,1,.35,3,.1,.45,1,0,1,1,0];
const colors=['#09091b','#221a44','#522e79','#914aa9','#e188d0','#f8dcf4'];
function send(texture,id){ctx.self.onmessage({data:{id,revision:id,texture,mode:'texture',nova:false,seed:42871,width:347,height:347,time:0,yaw:0,pitch:0,zoom:1.25,params:[...params],space:[0,.23,.28,.8,.48,1],colors}});}
// Queue a second preset while the first asset is still loading.
send('turquoise-basin',1);send('violet-filaments',2);send('missing-image',3);send('ghost-cloud',4);send('',5);
await vm.runInContext('requests',ctx);
assert.equal(messages.length,5);
assert.deepEqual(messages.map(m=>m.id),[1,2,3,4,5]);
for(const [index,key] of [[0,'turquoise-basin'],[1,'violet-filaments'],[3,'ghost-cloud']]){
 assert.deepEqual(Buffer.from(messages[index].rgba),fs.readFileSync(`dist/textures/${key}.rgba`));
}
assert.match(messages[2].error,/Unknown image/);
assert.equal(messages[2].revision,3);
assert(!messages[4].error&&messages[4].rgba.length===347*347*4);
console.log('Passed: queued texture switching, correct source pixels, recoverable missing image, and return to procedural texture.');
