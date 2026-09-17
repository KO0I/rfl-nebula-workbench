let engine,volumeKey='',textureKey='';
const ready=fetch('nebula.wasm').then(r=>{if(!r.ok)throw Error('Could not load the C engine');return r.arrayBuffer()}).then(bytes=>WebAssembly.instantiate(bytes,{})).then(r=>engine=r.instance.exports);
self.onmessage=async({data:m})=>{
 try{
  await ready;const start=performance.now();
  // Nova owns its cutoff schedule; keep the build key stable as the UI tracks it.
  if(m.nova)m.params[8]=.15;
  m.params.forEach((v,i)=>engine.nebula_set(i,v));
  m.colors.forEach((hex,i)=>engine.nebula_palette(i,parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)));
  let ptr,dp,stars=0,jets=0,nova=null;
  if(m.mode==='volume'){
   m.space.forEach((v,i)=>engine.nebula_space_set(i,v));
   engine.nebula_space_set(6,m.nova?1:0);
   const key=JSON.stringify([m.seed,m.params.slice(0,12),m.space,!!m.nova]);
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
   if(m.nova)nova={phase:engine.nebula_nova_value(m.time,0),cutoff:engine.nebula_nova_value(m.time,1),radius:engine.nebula_nova_value(m.time,2),clearing:engine.nebula_nova_value(m.time,6),hasJets:!!engine.nebula_nova_jet_seed(m.seed)};
  }else{
   const key=JSON.stringify([m.seed,m.params.slice(0,12),m.width,m.height]);
   if(key!==textureKey){engine.nebula_generate(m.width,m.height,m.seed);textureKey=key}
   ptr=engine.nebula_render(0);dp=engine.nebula_density();
  }
  const rgba=new Uint8ClampedArray(engine.memory.buffer,ptr,m.width*m.height*4).slice();
  const density=new Uint8Array(engine.memory.buffer,dp,m.width*m.height).slice();
  self.postMessage({id:m.id,revision:m.revision,nova,width:m.width,height:m.height,rgba,density,stars,jets,seed:m.seed,mode:m.mode,time:m.time,ms:performance.now()-start},[rgba.buffer,density.buffer]);
 }catch(e){self.postMessage({error:e.message,id:m.id,action:m.action})}
};
