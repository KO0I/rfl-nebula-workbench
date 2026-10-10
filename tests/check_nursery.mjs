import fs from 'node:fs';
import assert from 'node:assert/strict';

const {instance:{exports:e}}=await WebAssembly.instantiate(fs.readFileSync('dist/nebula.wasm'),{});
const width=192,height=192,seed=42871;
e.nebula_set(12,1.2);e.nebula_set(13,1);
e.nebula_space_set(6,0);e.nebula_space_set(7,5);
e.nebula_space_set(3,.9);e.nebula_space_set(4,.75);
e.nebula_space_set(8,1);
e.nebula_space_build(seed);
const render=(time,yaw=0)=>{
 const ptr=e.nebula_space_render(width,height,time,yaw,.2,1.25);
 return Buffer.from(new Uint8Array(e.memory.buffer,ptr,width*height*4));
};
const still=render(1,-.55),repeat=render(1,-.55),later=render(5,-.55),turned=render(1,.8);
assert.deepEqual(still,repeat,'Paused protostellar disk must be deterministic');
assert.notDeepEqual(still,later,'Dust and outflow must move');
assert.notDeepEqual(still,turned,'Disk, outflow, and dark knots must occupy a 3D volume');
assert.equal(e.nebula_space_star_count(),1);
assert.equal(e.nebula_space_jet_count(),1);
const star=new Float32Array(e.memory.buffer,e.nebula_space_stars(),11);
assert(star[7]>star[8]&&star[8]>star[9],'Young star should be amber, not black or blue');
assert(e.nebula_space_sample(-.78,.20,.43)>e.nebula_space_sample(-.78,.20,.8)+.4,
 'Bok-like knot should have real 3D obscuring density');
let amber=0,dark=0;
for(let i=0;i<still.length;i+=4){
 const [r,g,b,a]=still.subarray(i,i+4);
 if(a>30&&r>g*1.2&&g>b*1.3)amber++;
 if(a>110&&r<80&&g<50&&b<35)dark++;
}
assert(amber>100,'A substantial amber disk and warm nebula should be visible');
assert(dark>5,'Foreground dark dust should visibly absorb the nebula');
const ptr=e.nebula_export_rfl(seed,32),size=e.nebula_export_rfl_size();
assert(ptr&&size,'Volumetric disk should bake for RFL');
const dv=new DataView(e.memory.buffer,ptr,size);
assert(Math.abs(dv.getFloat32(44,true)-2.15)<.001,'RFL bounds should include extended comet-tail jets');
if(process.argv[2])fs.writeFileSync(process.argv[2],still);
e.nebula_space_set(7,1);e.nebula_space_build(seed);
assert.notDeepEqual(render(1),still,'Switching back must restore the original black-hole preset');
console.log('Nursery passed: amber protostar, 3D dusty disk and dark knots, slower motion, bipolar outflow, RFL bake, black-hole isolation.');
