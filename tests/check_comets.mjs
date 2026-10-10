import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const {instance:{exports:e}}=await WebAssembly.instantiate(fs.readFileSync('dist/nebula.wasm'),{});
const p=[5,5,.52,2,1.2,1,.35,0,.38,.55,1,0,1.3,.9,1];
p.forEach((v,i)=>e.nebula_set(i,v));
const c=[1,2.2,.15,.8,180,0,.3,1];
function configure(overrides={},seed=42871){
 const values=[...c];for(const [i,v] of Object.entries(overrides))values[i]=v;
 [0,.23,0,.8,1,1,0,0,1,...values].forEach((v,i)=>e.nebula_space_set(i,v));
 e.nebula_space_build(seed);
}
function frame(time=0,yaw=0,pitch=.2){
 const start=performance.now(),ptr=e.nebula_space_render(256,256,time,yaw,pitch,1.25);
 return {bytes:Buffer.from(new Uint8Array(e.memory.buffer,ptr,256*256*4)),ms:performance.now()-start};
}
function geometry(){return Array.from(new Float32Array(e.memory.buffer,e.nebula_comet_geometry(),9));}
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const plus=(a,b,k=1)=>a.map((v,i)=>v+b[i]*k);
configure();const still=frame();
assert.deepEqual(still.bytes,frame().bytes,'Pause must freeze all noise and ray jitter');
const moving=frame(4),turned=frame(4,.9,.5),axial=frame(4,Math.PI/2,0);
assert.notDeepEqual(still.bytes,moving.bytes,'Knots must advect and filaments ripple');
assert.notDeepEqual(moving.bytes,turned.bytes,'3D camera rotation must reveal depth');
assert.notDeepEqual(moving.bytes,axial.bytes,'End-on view must foreshorten the tail');
assert.equal(e.nebula_space_star_count(),0);assert.equal(e.nebula_space_jet_count(),0);
for(const bearing of [-180,-90,-17,0,90,180])for(const elevation of [-75,0,75]){
 configure({4:bearing,5:elevation});frame(2);
 const g=geometry(),head=g.slice(0,3),star=g.slice(3,6),axis=g.slice(6);
 const toward=plus(star,head,-1);
 assert(Math.abs(dot(axis,axis)-1)<1e-4,'Tail axis must be normalized');
 assert(Math.abs(dot(axis,toward)/Math.hypot(...toward)+1)<1e-4,'Tail must point away from source star in all 3D directions');
 assert.equal(e.nebula_space_sample(...plus(head,axis,-.3)),0,'No sunward counter-tail beyond the coma');
 let tail=0;
 for(let t=.1;t<1.4;t+=.05)tail+=e.nebula_space_sample(...plus(head,axis,t));
 assert(tail>.05,'Downstream volume must contain gas');
}
configure();frame(0);const g=geometry(),sample=plus(g.slice(0,3),g.slice(6),.8);
const before=e.nebula_space_sample(...sample);frame(0,1.1,.9);
assert.equal(e.nebula_space_sample(...sample),before,'Camera must not rotate the physical density field');
configure({},17);assert.notDeepEqual(frame().bytes,still.bytes,'Seed must change filament details');
configure({0:2,2:.11});const cyan=frame(4);
configure({0:3,1:1.8,2:.08,3:.35});const yellow=frame(4),yellowMoving=frame(8),yellowTurned=frame(8,.7,.4);
assert.notDeepEqual(yellow.bytes,yellowMoving.bytes,'Sodium density must keep flowing along the straight plume');
assert.deepEqual(yellowMoving.bytes,frame(8).bytes,'Paused sodium density must be deterministic');
// Check the physical density field, independent of the projection: opposing
// cross-section samples must balance about the star/body axis at all times.
for(const seed of [17,42871])for(const bearing of [-180,-90,-17,0,90,180])for(const elevation of [-75,0,75])for(const variation of [0,1.5]){
 configure({0:3,1:1.8,2:.08,3:variation,4:bearing,5:elevation},seed);
 for(const time of [0,4,17]){
  e.nebula_space_render(16,16,time,.7,.3,1.25);
  const g=geometry(),head=g.slice(0,3),star=g.slice(3,6),axis=g.slice(6);
  const toward=plus(star,head,-1);
  assert(Math.abs(dot(axis,toward)/Math.hypot(...toward)+1)<1e-4,'Sodium must point directly away from the star');
  const az=bearing*Math.PI/180,el=elevation*Math.PI/180;
  const side=[-Math.sin(az),0,Math.cos(az)],up=[-Math.cos(az)*Math.sin(el),Math.cos(el),-Math.sin(az)*Math.sin(el)];
  for(const t of [.15,.3,.5,.7,.9]){
   const center=plus(head,axis,t*1.8);
   assert(e.nebula_space_sample(...center)>0,'The straight sodium centerline must remain continuous');
   for(const direction of [side,up])for(const offset of [.008,.025,.05]){
    const a=e.nebula_space_sample(...plus(center,direction,offset));
    const b=e.nebula_space_sample(...plus(center,direction,-offset));
    assert(Math.abs(a-b)<.002,'Sodium density must stay centered without transverse wobble');
   }
  }
  assert.equal(e.nebula_space_sample(...plus(head,axis,-.3)),0,'Sodium must not form a sunward counter-tail');
 }
}
configure({0:3,6:.387});frame();const gy=geometry();
assert(e.nebula_space_sample(...plus(gy.slice(0,3),gy.slice(6),.6))>0,'Scorched trail is active at Mercury cutoff');
configure({0:3,6:.388});frame();const go=geometry();
assert.equal(e.nebula_space_sample(...plus(go.slice(0,3),go.slice(6),.6)),0,'Scorched trail is off outside Mercury cutoff');
assert(e.nebula_space_sample(...go.slice(0,3))>0,'Inactive scorched body remains visible');
configure();const ptr=e.nebula_export_rfl(42871,64),size=e.nebula_export_rfl_size();
assert(ptr&&size,'Comet export must succeed');
const bytes=Buffer.from(new Uint8Array(e.memory.buffer,ptr,size)),dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.length);
assert.equal(bytes.toString('ascii',0,7),'RFLNEB1');assert.equal(dv.getUint32(28,true),0,'Do not bake a comet as a star or bipolar jet');
assert.equal(dv.getUint32(24,true),8);assert(dv.getFloat32(48,true)>30,'Density normalization must preserve emission in RFL');
const extent=dv.getFloat32(44,true);assert(extent>1.5,'Bounds must include the tail');
let checksum=2166136261;for(let i=0;i<bytes.length;i++)checksum=Math.imul(checksum^(i>=68&&i<72?0:bytes[i]),16777619)>>>0;
assert.equal(checksum,dv.getUint32(68,true));
const start=160+8*4,side=64;
let occupied=0,boundary=0;
for(let z=0;z<side;z++)for(let y=0;y<side;y++)for(let x=0;x<side;x++){
 const a=bytes[start+4*(x+side*(y+side*z))+3];if(a)occupied++;
 if((x===0||x===63||y===0||y===63||z===0||z===63)&&a)boundary++;
}
assert(occupied>100,'Bake must retain a substantial volume');assert.equal(boundary,0,'Tail must not be clipped at the export bounds');
// Exercise real worker dispatch and switching back to a pre-comet procedural scene.
const messages=[];
const ctx=vm.createContext({WebAssembly,Uint8Array,Uint8ClampedArray,Float32Array,DataView,TextEncoder,performance,
 fetch:async path=>{const b=fs.readFileSync('dist/'+path);return {ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};},
 self:{postMessage:m=>messages.push(m)}});
ctx.importScripts=(...paths)=>paths.forEach(path=>vm.runInContext(fs.readFileSync('dist/'+path,'utf8'),ctx));
vm.runInContext(fs.readFileSync('dist/engine.js','utf8'),ctx);
const base={mode:'volume',texture:'',nova:0,compact:0,params:p,space:[7,.23,0,.8,1,1],width:128,height:128,seed:17,colors:['#09091b','#221a44','#522e79','#914aa9','#e188d0','#f8dcf4'],time:2,yaw:0,pitch:.2,zoom:1.25};
for(const [id,comet] of [[1,[0,...c.slice(1)]],[2,c],[3,[3,...c.slice(1)]],[4,[0,...c.slice(1)]]])ctx.self.onmessage({data:{...base,id,revision:id,comet,params:[...p]}});
await vm.runInContext('requests',ctx);
assert.equal(messages.length,4);for(const m of messages)assert(!m.error,m.error);
assert(messages[1].cometGeometry.length===9);assert.equal(messages[1].stars,0);
assert.deepEqual(Buffer.from(messages[0].rgba),Buffer.from(messages[3].rgba),'Returning to a nebula must restore its seed and field');
if(process.argv[2]){
 fs.mkdirSync(process.argv[2],{recursive:true});
 for(const [name,f] of [['filaments',still],['flow',moving],['turned',turned],['axial',axial],['cyan',cyan],['yellow',yellow],['yellow-flow',yellowMoving],['yellow-turned',yellowTurned]])fs.writeFileSync(`${process.argv[2]}/${name}.rgba`,f.bytes);
}
console.log(`Comets passed: 18 star orientations, straight sodium density across 216 animated states, animation, pause, camera independence, cutoff, 64³ bake and checksum, worker switching. 256² frame: ${still.ms.toFixed(0)} ms; populated voxels: ${occupied}.`);
