import fs from 'node:fs';
import assert from 'node:assert/strict';
const {instance:{exports:e}}=await WebAssembly.instantiate(fs.readFileSync('dist/nebula.wasm'),{});
const colors=['060e21','122b4f','2c588e','628fc5','abd7f5','edf9ff'];
colors.forEach((s,i)=>e.nebula_palette(i,parseInt(s.slice(0,2),16),parseInt(s.slice(2,4),16),parseInt(s.slice(4,6),16)));
for(const [i,v] of [[0,6],[4,1.7],[6,.58],[8,.15],[9,.30],[12,1.35],[13,.88]])e.nebula_set(i,v);
e.nebula_space_set(6,1);e.nebula_space_set(1,.12);e.nebula_space_set(3,.8);
e.nebula_space_build(42871);
const w=256,h=256;
function render(t){const ptr=e.nebula_space_render(w,h,t,.45,.2,1.25);return Buffer.from(new Uint8Array(e.memory.buffer,ptr,w*h*4))}
function gasSum(){return new Uint8Array(e.memory.buffer,e.nebula_space_density(),w*h).reduce((a,b)=>a+b,0)}
const point=render(0),center=(h/2*w+w/2)*4;
assert(point[center]>point[center+2]*5,'Progenitor must be red');
assert.equal(gasSum(),0,'No nebula before the flare');
assert.equal(e.nebula_space_star_count(),1,'Exactly one Nova star');
assert.equal(e.nebula_space_jet_count(),0,'No jets before eruption');
const flare=render(5.5);
const lit=b=>{let n=0;for(let i=3;i<b.length;i+=4)if(b[i]>0)n++;return n};
assert(lit(flare)>lit(point)*50,'Glare must grow well beyond the initial point');
assert.equal(gasSum(),0,'Glare must precede gas release');
let prev=.15;
for(const t of [0,5.99,6,9,14,22,50]){
 const cutoff=e.nebula_nova_value(t,1);assert(cutoff>=prev-1e-6);prev=cutoff;
}
assert(Math.abs(e.nebula_nova_value(0,1)-.15)<1e-6);
assert(Math.abs(e.nebula_nova_value(22,1)-.47)<1e-6);
for(const t of [0,6,8,14,22,50]) {
 const cutoff=e.nebula_nova_value(t,1),clearing=e.nebula_nova_value(t,6);
 assert(Math.abs(clearing-(.12+.5*(cutoff-.15)))<1e-6,'Clearing must grow at half the cutoff rate');
 render(t);
 const star=new Float32Array(e.memory.buffer,e.nebula_space_stars(),11);
 assert(Math.abs(star[3]-clearing)<1e-6,'Star record must track the live clearing');
 assert.equal(e.nebula_space_sample(clearing*.6,0,0),0,'Gas must be cleared inside the growing cavity');
}
assert(e.nebula_nova_value(14,2)>e.nebula_nova_value(8,2),'Shell radius must expand');
const expanding=render(14);assert(gasSum()>0,'The ejecta must become visible');
const remnant=render(22);assert(remnant[center+2]>remnant[center],'Remnant must be blue-white');
assert.equal(e.nebula_space_jet_count(),e.nebula_nova_jet_seed(42871));
const paused=render(22);assert.deepEqual(remnant,paused,'Paused Nova is deterministic');
const flicker=render(22.1);assert.notDeepEqual(remnant.subarray(center,center+4),flicker.subarray(center,center+4),'Remnant must flicker');
assert.deepEqual(point,render(0),'Replaying the same seed must restore the initial point');
let jets=0;for(let seed=0;seed<1024;seed++)jets+=e.nebula_nova_jet_seed(seed);
assert(jets>450&&jets<574,'Seed lottery must approximate 50%, not always round up');
if(process.argv[2]){
 fs.mkdirSync(process.argv[2],{recursive:true});
 for(const t of [0,3,5.5,8,14,22])fs.writeFileSync(`${process.argv[2]}/nova-${t}.rgba`,render(t));
}
console.log(`Nova passed: ordered phases, red point, glare, gas release, cutoff 0.15→0.47, expansion, blue-white flicker, pause/replay, jets ${jets}/1024 seeds.`);
