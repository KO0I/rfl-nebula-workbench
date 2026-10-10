importScripts('texture-presets.js', 'reference-presets.js', 'galaxy.js');
const texturePresets={...globalThis.NEBULA_TEXTURE_PRESETS,...globalThis.NEBULA_REFERENCE_PRESETS};
let engine,volumeKey='',textureKey='',imageKey='';
const images=new Map();
const ready=fetch('nebula.wasm').then(r=>{if(!r.ok)throw Error('Could not load the C engine');return r.arrayBuffer()}).then(bytes=>WebAssembly.instantiate(bytes,{})).then(r=>engine=r.instance.exports);
async function selectImage(key='') {
 if(key===imageKey)return;
 if(!key){engine.nebula_image_set(0,0);engine.nebula_reference_set(0,0,0,0,0);imageKey='';volumeKey='';return;}
 const asset=texturePresets[key];
 if(!asset)throw Error('Unknown image texture');
 let bytes=images.get(key);
 if(!bytes){
  const response=await fetch(asset.pixels);
  if(!response.ok)throw Error(`Could not load ${asset.label}`);
  bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.length!==asset.width*asset.height*4)throw Error('Incomplete texture data');
  images.set(key,bytes);
 }
 new Uint8Array(engine.memory.buffer,engine.nebula_image_buffer(),bytes.length).set(bytes);
 engine.nebula_reference_set(0,0,0,0,0);
 if(asset.reference){
  for(const [field,pointer] of [['cloud','nebula_reference_cloud_buffer'],['depth','nebula_reference_depth_buffer']]){
   let data=images.get(asset[field]);
   if(!data){
    const response=await fetch(asset[field]);if(!response.ok)throw Error(`Could not load ${asset.label} volume`);
    data=new Uint8Array(await response.arrayBuffer());
    if(data.length!==asset.width*asset.height*4)throw Error('Incomplete volume data');
    images.set(asset[field],data);
   }
   new Uint8Array(engine.memory.buffer,engine[pointer](),data.length).set(data);
  }
  const starBytes=new Uint8Array(new Float32Array(asset.stars.flat()).buffer);
  new Uint8Array(engine.memory.buffer,engine.nebula_reference_stars_buffer(),starBytes.length).set(starBytes);
  engine.nebula_reference_set(asset.width,asset.height,asset.stars.length,+asset.spikes,asset.profile);
 }
 engine.nebula_image_set(asset.width,asset.height);imageKey=key;volumeKey='';
}
// Serialize image loads with render/bake requests so a late fetch cannot
// replace the pixels underneath a newer preset or an in-progress export.
let requests=Promise.resolve();
self.onmessage=({data:m})=>{requests=requests.then(()=>handle(m));};
async function handle(m){
 try{
  const start=performance.now();
  if(m.galaxy){
   if(m.action==='export-rfl'){
    const bytes=NebulaGalaxy.bake(m);self.postMessage({action:'export-rfl',bytes,seed:m.seed,name:m.name,ms:performance.now()-start},[bytes.buffer]);return;
   }
   const result=NebulaGalaxy.render(m);
   self.postMessage({id:m.id,revision:m.revision,nova:null,cometGeometry:null,yaw:m.yaw,pitch:m.pitch,width:m.width,height:m.height,...result,seed:m.seed,mode:'volume',time:m.time,ms:performance.now()-start},[result.rgba.buffer,result.density.buffer]);return;
  }
  await ready;await selectImage(m.texture);
  // Nova owns its cutoff schedule; keep the build key stable as the UI tracks it.
  if(m.nova)m.params[8]=.15;
  m.params.forEach((v,i)=>engine.nebula_set(i,v));
  m.colors.concat(m.reflectionColors||[]).forEach((hex,i)=>engine.nebula_palette(i,parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)));
  let ptr,dp,stars=0,jets=0,nova=null;
  if(m.mode==='volume'){
   m.space.forEach((v,i)=>engine.nebula_space_set(i,v));
   engine.nebula_space_set(6,Number(m.nova)||0);
   engine.nebula_space_set(7,m.compact||0);
   engine.nebula_space_set(8,m.cloudRotation||1);
   (m.comet||[0,2.2,.15,.8,180,0,.3,1]).forEach((v,i)=>engine.nebula_space_set(9+i,v));
   const key=JSON.stringify([m.seed,m.params.slice(0,12),m.space,Number(m.nova)||0,m.compact||0,m.comet||[0]]);
   if(key!==volumeKey){engine.nebula_space_build(m.seed);volumeKey=key}
   if(m.action==='export-rfl') {
    const ptr=engine.nebula_export_rfl(m.seed,m.side),size=engine.nebula_export_rfl_size();
    if(!ptr||!size)throw Error('Could not bake the system');
    const bytes=new Uint8Array(engine.memory.buffer,ptr,size).slice();
    bytes.fill(0,96,160);
    bytes.set(new TextEncoder().encode(m.name.replace(/[^ -~]/g,' ').slice(0,63)),96);
    let hash=2166136261;
    for(let i=0;i<bytes.length;i++)hash=Math.imul(hash^(i>=68&&i<72?0:bytes[i]),16777619)>>>0;
    new DataView(bytes.buffer).setUint32(68,hash,true);
    self.postMessage({action:'export-rfl',bytes,seed:m.seed,name:m.name,ms:performance.now()-start},[bytes.buffer]);
    return;
   }
   ptr=engine.nebula_space_render(m.width,m.height,m.time,m.yaw,m.pitch,m.zoom);
   dp=engine.nebula_space_density();stars=engine.nebula_space_star_count();jets=engine.nebula_space_jet_count();
   if(m.nova)nova={phase:engine.nebula_nova_value(m.time+(m.nova===2?6:0),0),cutoff:engine.nebula_nova_value(m.time+(m.nova===2?6:0),1),radius:engine.nebula_nova_value(m.time+(m.nova===2?6:0),2),clearing:engine.nebula_nova_value(m.time+(m.nova===2?6:0),6),hasJets:m.nova===2||!!engine.nebula_nova_jet_seed(m.seed)};
  }else if(imageKey){
   ptr=engine.nebula_image_render(m.width,m.height);dp=engine.nebula_image_density();
  }else{
   const key=JSON.stringify([m.seed,m.params.slice(0,12),m.width,m.height]);
   if(key!==textureKey){engine.nebula_generate(m.width,m.height,m.seed);textureKey=key}
   ptr=engine.nebula_render(0);dp=engine.nebula_density();
  }
  const rgba=new Uint8ClampedArray(engine.memory.buffer,ptr,m.width*m.height*4).slice();
  const cometGeometry=m.comet?.[0]?Array.from(new Float32Array(engine.memory.buffer,engine.nebula_comet_geometry(),9)):null;
  const density=new Uint8Array(engine.memory.buffer,dp,m.width*m.height).slice();
  self.postMessage({id:m.id,revision:m.revision,nova,cometGeometry,yaw:m.yaw,pitch:m.pitch,width:m.width,height:m.height,rgba,density,stars,jets,seed:m.seed,mode:m.mode,time:m.time,ms:performance.now()-start},[rgba.buffer,density.buffer]);
 }catch(e){self.postMessage({error:e.message,id:m.id,revision:m.revision,action:m.action})}
};
