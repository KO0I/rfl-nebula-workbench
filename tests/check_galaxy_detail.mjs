import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
vm.runInThisContext(fs.readFileSync('dist/galaxy.js','utf8'));
const m={seed:42871,width:96,height:96,time:0,yaw:.25,pitch:.85,zoom:1.15,cloudRotation:1,
 params:[5,5,.52,2,1.2,1,.35,2,.38,.55,1,0,1.2,.85,1],space:[18,.23,.28,1,1,1],side:16,name:'Detail regression'};
const overview=NebulaGalaxy.render(m);
assert.equal(overview.detailStars,0,'Overview retains the base population');
const edge=NebulaGalaxy.render({...m,pitch:0});
const coreLuminance=frame=>{
 let sum=0;for(let y=42;y<54;y++)for(let x=42;x<54;x++){
  const i=4*(x+y*m.width),p=frame.rgba;sum+=(p[i]*.2126+p[i+1]*.7152+p[i+2]*.0722)*p[i+3]/255;
 }return sum/144;
};
assert(coreLuminance(edge)<coreLuminance(overview)*.84,'Edge-on bulge has restrained light');
const close=NebulaGalaxy.render({...m,zoom:12});
assert(close.detailStars>1000,'Zoom resolves additional stellar groups');
const deep=NebulaGalaxy.render({...m,zoom:512});
assert(deep.detailLevels>5&&deep.detailLevels<=6,'Fine structure remains available at maximum zoom');
assert(deep.detailStars>1000&&deep.detailStars<250000,'Deep view visits a bounded local stellar hierarchy');
let clipped=0;for(let i=0;i<deep.rgba.length;i+=4)if(deep.rgba[i]>249&&deep.rgba[i+1]>249&&deep.rgba[i+2]>249)clipped++;
assert(clipped/(m.width*m.height)<.01,'Deep zoom does not become an overexposed white sheet');
assert.deepEqual(NebulaGalaxy.render({...m,zoom:12}).rgba,close.rgba,'Zooming back returns to identical features');
assert.deepEqual(NebulaGalaxy.render(m).rgba,overview.rgba,'Detail generation does not mutate the base galaxy');
const threshold=5.1,lo=NebulaGalaxy.render({...m,zoom:threshold-.00001}),hi=NebulaGalaxy.render({...m,zoom:threshold+.00001});
let delta=0;for(let i=0;i<lo.rgba.length;i++)delta+=Math.abs(lo.rgba[i]-hi.rgba[i]);
assert(delta/lo.rgba.length<.3,'An octave transition does not pop the scene');
const r=.58,a=4.35*Math.log(1+r/.18),target={x:r*Math.cos(a),y:0,z:r*Math.sin(a)};
const arm=NebulaGalaxy.render({...m,zoom:12,galaxyTarget:target});
assert.deepEqual(arm.camera.center,target,'Recentered camera uses galactic coordinates');
assert.notDeepEqual(arm.rgba,close.rgba,'Arm inspection reaches a distinct part of the galaxy');
assert(arm.detailStars>100,'Arms also resolve nested stars');
const cluster=NebulaGalaxy.render({...m,galaxyFocus:true,zoom:256,galaxyTarget:target});
assert.equal(cluster.detailStars,0);assert.equal(cluster.detailLevels,0);
assert.equal(cluster.clusterProjection.x,m.width/2);assert(cluster.density.every(v=>v===0));
assert.deepEqual(NebulaGalaxy.bake(m),NebulaGalaxy.bake({...m,zoom:512,galaxyTarget:target,pitch:0}),'RFL bake remains camera-independent and keeps the base export contract');
console.log('Galaxy detail passed: nested zoom, smooth transitions, repeatable positions, core exposure, arm focus, companions and export stability.');
