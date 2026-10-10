/* Procedural barred galaxy. Worker-owned 3D emission/absorption volume and
 * point stars; deliberately independent of the legacy 64-star C ABI. */
(()=>{
const TAU=Math.PI*2,EXT=1.35,N=88,NY=32,YEXT=.32,DISK_COUNT=5200,CLUSTER_COUNT=900,LMC_COUNT=220,GLARE_PERIOD=500,COUNT=DISK_COUNT+CLUSTER_COUNT+LMC_COUNT;
// Galactic frame: x toward Sun, y north, z toward longitude 90 degrees.
// Scale: disk radius 1.2 = 50,000 ly; Sun at 8.2 kpc, midplane approximation.
const LY=50000/1.2,KPC=3261.56/LY,BAKE_EXT=4.2;
function galactic(l,b,d){l*=Math.PI/180;b*=Math.PI/180;return {x:(8.2-d*Math.cos(b)*Math.cos(l))*KPC,y:d*Math.sin(b)*KPC,z:d*Math.cos(b)*Math.sin(l)*KPC};}
const CLUSTER=galactic(309.10202,14.96833,5.24),CLUSTER_RADIUS=225/LY;
const LMC=galactic(280.4652,-32.8884,49.59),OVERVIEW={x:LMC.x/2,y:LMC.y/2,z:LMC.z/2};
// Stylized irregular dwarf morphology, not a reconstructed observed gas map.
function cloudField(x,y,z){
 x-=LMC.x;y-=LMC.y;z-=LMC.z;
 if(Math.abs(x)>.38||Math.abs(y)>.25||Math.abs(z)>.38)return [0,0,0,0];
 const u=x*.87+z*.5,v=z*.87-x*.5,w=y+v*.32;
 const n=noise(u*38+2,w*36,v*38,seedKey+812),patch=.4+n;
 const disk=Math.exp(-u*u/.032-v*v/.018-w*w/.0024);
 const bar=Math.exp(-((u+.04)**2)/.027-v*v/.0018-w*w/.0018);
 const knot=Math.exp(-((u-.12)**2)/.0012-(v+.045)**2/.001-w*w/.002);
 const d=(disk*.8+bar*.7+knot*1.2)*patch;
 return [.40+bar*.1+knot*.2,.47-knot*.15,.60-knot*.12,d];
}
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{x=clamp((x-a)/(b-a));return x*x*(3-2*x);};
// Lower pitch and a longer winding path, shared by gas, dust and stars.
const ARM_COUNT=3,armAngle=r=>4.35*Math.log(1+r/.18);
const spectral=[[1,.48,.26],[1,.66,.40],[1,.84,.62],[1,.96,.88],[.91,.95,1],[.72,.83,1]];
// Each octave is fixed in galactic coordinates. Zoom changes only its weight;
// it never rescales/reseeds a feature that has already come into view.
const DETAIL_LEVELS=6,DETAIL_START=1.7,DETAIL_RATIO=3;
function detailWeights(zoom){return Array.from({length:DETAIL_LEVELS},(_,i)=>smooth(DETAIL_START*DETAIL_RATIO**i,DETAIL_START*DETAIL_RATIO**i*2.2,zoom));}
const coreMask=(x,y,z)=>Math.exp(-(x*x+z*z)/.075-y*y/.030);
const bulgeGain=pitch=>.34+.66*smooth(.08,.70,Math.abs(Math.sin(pitch)));
let seedKey=-1,grid,stars;
function hash(x){x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);return (x^(x>>>16))>>>0;}
function noise(x,y,z,seed){
 const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);let a=x-ix,b=y-iy,c=z-iz;
 a=a*a*(3-2*a);b=b*b*(3-2*b);c=c*c*(3-2*c);let sum=0;
 for(let k=0;k<2;k++)for(let j=0;j<2;j++)for(let i=0;i<2;i++)sum+=hash(Math.imul(ix+i,374761393)^Math.imul(iy+j,668265263)^Math.imul(iz+k,2246822519)^seed)/4294967295*(i?a:1-a)*(j?b:1-b)*(k?c:1-c);
 return sum;
}
function field(x,y,z,seed){
 const r=Math.hypot(x,z),edge=1-smooth(1.04,1.27,r);if(!edge)return [0,0,0,0];
 const theta=Math.atan2(z,x),phase=ARM_COUNT*(theta-armAngle(r));
 const n=noise(x*8+7,y*13,z*8,seed),fine=noise(x*25,y*27+3,z*25,seed+317);
 const arm=Math.exp(-Math.pow(Math.sin((phase+(n-.5)*.9)/2),2)*18);
 const lane=Math.exp(-Math.pow(Math.sin((phase+.42+(n-.5)*.7)/2),2)*48);
 const disk=Math.exp(-Math.pow(y/(.034+.032*r),2)),rim=smooth(.18,.38,r);
 const bar=Math.exp(-Math.pow(x/.32,4)-Math.pow(z/.095,2)-Math.pow(y/.065,2));
 // A thick stellar bulge, with a thinner nuclear gas disk and feeding lanes.
 const bulge=Math.exp(-Math.sqrt((x*x+z*z)/.030+y*y/.008))*Math.exp(-r*r/.15);
 const nuclear=Math.exp(-r*r/.043-Math.pow(y/.047,2))*(.55+.65*n+.35*fine);
 const feed=Math.exp(-Math.pow(x/.35,4)-Math.pow((Math.abs(z)-.055)/.025,2)-Math.pow(y/.028,2));
 const radial=Math.exp(-r/.78);
 const haze=edge*disk*(.10+.95*arm)*(.3+n*.55+fine*.4)*rim*radial;
 // Andromeda-inspired old stellar disk beneath broken, clumpy dust lanes.
 const oldDisk=edge*Math.exp(-Math.pow(y/(.045+.026*r),2))*Math.exp(-r/.48)*rim*.40;
 const splitLane=Math.exp(-Math.pow(Math.sin((phase+.76+(n-.5)*.45)/2),2)*115);
 const dust=edge*disk*(lane+splitLane*.32)*rim*(.6+2.3*n)*(.24+1.15*fine)+feed*.85;
 // Broadband-style colors: pale blue arm light, localized rose emission,
 // dark brown absorbing lanes, and warm unresolved central starlight.
 const knot=smooth(.64,.83,fine)*arm;
 const cold=[.47+knot*.14,.51-knot*.10,.59-knot*.12];
 const core=bar*.95+bulge*2.8;
 const total=haze*1.4+dust*2.8+nuclear*1.5+core+oldDisk;
 if(total<.00001)return [0,0,0,0];
 const c=cold.map((v,j)=>(v*haze*1.4+[.075,.050,.034][j]*dust*2.8+[.42,.35,.29][j]*nuclear*1.5+[.76,.69,.58][j]*core+[.64,.59,.51][j]*oldDisk)/total);
 return [...c,total*edge];
}
function prepare(seed){
 if(seed===seedKey)return;seedKey=seed;grid=new Float32Array(N*NY*N*4);
 for(let z=0;z<N;z++)for(let y=0;y<NY;y++)for(let x=0;x<N;x++)grid.set(field((x/(N-1)*2-1)*EXT,(y/(NY-1)*2-1)*YEXT,(z/(N-1)*2-1)*EXT,seed),4*(x+N*(y+NY*z)));
 let rng=seed;const random=()=>{rng=hash(rng+0x9e3779b9);return rng/4294967296;};
 const normal=()=>Math.sqrt(-2*Math.log(Math.max(1e-9,random())))*Math.cos(TAU*random());
 stars=[];
 for(let i=0;i<DISK_COUNT;i++){
  let x,y,z;const branch=random(),central=branch<.46;
  if(branch<.34){
   // Spheroidal, centrally peaked bulge rather than a flat bar alone.
   const scale=.035+Math.pow(random(),1.6)*.16;
   x=normal()*scale;z=normal()*scale;y=normal()*scale*.58;
  }else if(central){x=(random()+random()-1)*.38;z=normal()*.045;y=normal()*.035;}
  else {
   // Truncated exponential disk: radius follows r exp(-r/h), not area-uniform.
   let r;do{r=-.32*Math.log(Math.max(1e-9,random()*random()));}while(r>1.2);
   let theta=random()*TAU;
   if(branch<.82)theta=armAngle(r)+Math.floor(random()*ARM_COUNT)*TAU/ARM_COUNT+normal()*.095;
   x=Math.cos(theta)*r;z=Math.sin(theta)*r;y=normal()*(.018+.025*r);
  }
  const s=random(),armStar=!central&&branch<.82;
  const type=central?(s<.16?0:s<.43?1:s<.82?2:3):armStar?(s<.14?0:s<.32?1:s<.55?2:s<.80?3:s<.95?4:5):(s<.30?0:s<.56?1:s<.79?2:s<.93?3:s<.98?4:5);
  const color=spectral[type];
  // A few bright Milky Way members carry a faint paired diffraction trace.
  // This belongs solely to the main galaxy, not the companion population.
  const glareAxis=i%GLARE_PERIOD===0?(()=>{
   const h=hash(seed^Math.imul(i+1,0x9e3779b9))/4294967296,a=h*TAU,tilt=.22+(hash(seed^Math.imul(i+17,0x85ebca6b))/4294967296)*.56;
   return [Math.cos(a)*Math.sqrt(1-tilt*tilt),tilt,Math.sin(a)*Math.sqrt(1-tilt*tilt)];
  })():null;
  stars.push({x,y,z,color,power:(.18+Math.pow(random(),3)*.65)*(type>=4?1.2:central?.8:1),glareAxis});
 }
 // Truncated Plummer-like sphere: dense core, sparse outskirts, no gas envelope.
 for(let i=0;i<CLUSTER_COUNT;i++){
  let radius;do{const u=Math.max(1e-9,random());radius=.00065/Math.sqrt(Math.pow(u,-2/3)-1);}while(radius>CLUSTER_RADIUS);
  const az=random()*TAU,cos=2*random()-1,sin=Math.sqrt(1-cos*cos),s=random();
  stars.push({x:CLUSTER.x+radius*sin*Math.cos(az),y:CLUSTER.y+radius*cos,z:CLUSTER.z+radius*sin*Math.sin(az),color:spectral[s<.15?1:s<.65?2:s<.97?3:4],power:.08+random()*.22,cluster:true});
 }

 // The Magellanic companion remains gas-bearing but deliberately sparse.
 for(let i=0;i<LMC_COUNT;i++){
  const bar=random()<.4;let u,v,w;
  do{u=normal()*(bar?.12:.16)-(bar?.035:0);v=normal()*(bar?.025:.105);w=normal()*.025;}while(Math.hypot(u,v)>.32);
  const c=random();stars.push({x:LMC.x+u*.87-v*.5,y:LMC.y+w-v*.32,z:LMC.z+u*.5+v*.87,color:spectral[c<.15?1:c<.4?2:c<.66?3:c<.88?4:5],power:.15+random()*.48,lmc:true});
 }

}
function sample(x,y,z,out){
 if(Math.abs(x-LMC.x)<.38&&Math.abs(y-LMC.y)<.25&&Math.abs(z-LMC.z)<.38){out.set(cloudField(x,y,z));return;}
 const fx=(x/EXT+1)*(N-1)/2,fy=(y/YEXT+1)*(NY-1)/2,fz=(z/EXT+1)*(N-1)/2;
 const ix=Math.floor(fx),iy=Math.floor(fy),iz=Math.floor(fz);
 out.fill(0);if(ix<0||iy<0||iz<0||ix>=N-1||iy>=NY-1||iz>=N-1)return;
 const a=fx-ix,b=fy-iy,c=fz-iz;
 for(let k=0;k<2;k++)for(let j=0;j<2;j++)for(let i=0;i<2;i++){
  const w=(i?a:1-a)*(j?b:1-b)*(k?c:1-c),p=4*(ix+i+N*(iy+j+NY*(iz+k)));
  for(let ch=0;ch<4;ch++)out[ch]+=grid[p+ch]*w;
 }
}
function sampleDetail(x,y,z,out,weights){
 sample(x,y,z,out);
 if(out[3]<.003||Math.abs(x)>EXT||Math.abs(z)>EXT||Math.abs(y)>YEXT)return;
 let structure=0,frequency=44,amplitude=1;
 for(let level=0;level<weights.length&&weights[level]>0;level++){
  // Anisotropic, nested turbulence: broad clouds break into filaments, then
  // smaller dark knots. High octaves arrive gradually before they resolve.
  structure+=(noise(x*frequency+17,y*frequency*.72+9,z*frequency,seedKey+991+level*137)*2-1)*amplitude*weights[level];
  frequency*=DETAIL_RATIO;amplitude*=.72;
 }
 const disk=Math.exp(-((y/(.042+.026*Math.hypot(x,z)))**2));
 const shadow=Math.exp(-Math.max(0,structure+.06*weights[0])*1.8*disk);
 out[3]*=Math.exp(structure*.85*disk);
 for(let j=0;j<3;j++)out[j]*=shadow;
}
// A bounded recursive stellar hierarchy. Each parent contains five smaller
// associations at 0.29 of its scale. Only branches intersecting the view are
// visited; every child's position, spectrum and brightness depend on its seed.
function detailStars(weights,center,right,up,span,aspect){
 const result=[],halfX=span*aspect/2,halfY=span/2;
 const visit=(s,key,level,radius)=>{
  if(level>=DETAIL_LEVELS||weights[level]===0)return;
  const dx=(s.x-center.x)*right[0]+(s.z-center.z)*right[2];
  const dy=(s.x-center.x)*up[0]+(s.y-center.y)*up[1]+(s.z-center.z)*up[2];
  const reach=radius*Math.sqrt(3)/(1-.29);
  if(Math.abs(dx)>halfX+reach||Math.abs(dy)>halfY+reach)return;
  for(let child=0;child<5;child++){
   const id=hash(key^Math.imul(child+1,0x9e3779b9)),rand=n=>hash(id^Math.imul(n,0x85ebca6b))/4294967296;
   const x=s.x+(rand(1)*2-1)*radius,y=s.y+(rand(2)*2-1)*radius*.55,z=s.z+(rand(3)*2-1)*radius;
   if(Math.hypot(x,z)>1.27||Math.abs(y)>.27)continue;
   const central=coreMask(x,y,z),q=rand(4),type=central>.4?(q<.22?0:q<.54?1:q<.89?2:3):(q<.22?0:q<.47?1:q<.72?2:q<.91?3:q<.98?4:5);
   const star={x,y,z,color:spectral[type],power:(.065+.24*rand(5)**3)*weights[level],detail:true};
   if(Math.abs((x-center.x)*right[0]+(z-center.z)*right[2])<=halfX&&Math.abs((x-center.x)*up[0]+(y-center.y)*up[1]+(z-center.z)*up[2])<=halfY)result.push(star);
   visit(star,id,level+1,radius*.29);
  }
 };
 for(let i=0;i<DISK_COUNT;i++)visit(stars[i],hash(seedKey^Math.imul(i+1,0x27d4eb2d)),0,.048);
 return result;
}
function rayInterval(origin,f,body){
 let near=-Infinity,far=Infinity;
 for(let j=0;j<3;j++){
  const min=body.bounds[0][j],max=body.bounds[1][j];
  if(Math.abs(f[j])<1e-9){if(origin[j]<min||origin[j]>max)return null;continue;}
  const a=(min-origin[j])/f[j],b=(max-origin[j])/f[j];near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));
 }
 return far>near?[near,far]:null;
}
function render(m){
 prepare(m.seed);const {width:w,height:h}=m,span=3.35/m.zoom;
 const angle=m.yaw+m.time*.025*(m.cloudRotation||1),cy=Math.cos(angle),sy=Math.sin(angle),cp=Math.cos(m.pitch),sp=Math.sin(m.pitch);
 const target=m.galaxyTarget;
 const center=m.galaxyFocus==='lmc'?LMC:m.galaxyFocus==='system'?OVERVIEW:m.galaxyFocus?CLUSTER:target&&[target.x,target.y,target.z].every(Number.isFinite)?target:{x:0,y:0,z:0};
 const right=[cy,0,-sy],up=[sy*sp,cp,cy*sp],f=[sy*cp,-sp,cy*cp],dot=(s,v)=>(s.x-center.x)*v[0]+(s.y-center.y)*v[1]+(s.z-center.z)*v[2];
 const rgb=new Float32Array(w*h*3),alpha=new Float32Array(w*h),density=new Uint8Array(w*h),rgba=new Uint8ClampedArray(w*h*4),cell=new Float32Array(4);
 const opacity=m.params[13],exposure=m.params[12];
 // Resolve the central glow into structure at close range instead of letting
 // unresolved starlight overexpose every pixel of the zoomed-in viewport.
 const weights=detailWeights(m.zoom),detail=weights.reduce((a,b)=>a+b,0),gain=bulgeGain(m.pitch)*(1-.68*smooth(1.7,12,m.zoom));
 // March separate bounding spheres, preserving detail across the empty gap.
 // Cluster inspection isolates its gas-free stars from the projected galaxy.
 const bodies=(m.galaxyFocus===true?[]:[{c:{x:0,y:0,z:0},r:1.4,n:112,main:true,bounds:[[-EXT,-YEXT,-EXT],[EXT,YEXT,EXT]]},{c:LMC,r:.58,n:48,bounds:[[LMC.x-.38,LMC.y-.25,LMC.z-.38],[LMC.x+.38,LMC.y+.25,LMC.z+.38]]}]).map(b=>({...b,tx:dot(b.c,right),ty:dot(b.c,up),depth:dot(b.c,f)})).sort((a,b)=>a.depth-b.depth);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=x+y*w,tx=(x+.5-w/2)/h*span,ty=(h/2-y-.5)/h*span;
  const origin=right.map((v,j)=>v*tx+up[j]*ty+[center.x,center.y,center.z][j]);let trans=1,integral=0;
  for(const body of bodies){
   if((tx-body.tx)**2+(ty-body.ty)**2>body.r**2)continue;
   const interval=rayInterval(origin,f,body);if(!interval)continue;
   const ds=(interval[1]-interval[0])/body.n;
   for(let k=0;k<body.n;k++){
   const d=interval[0]+(k+.5)*ds,qx=origin[0]+f[0]*d,qy=origin[1]+f[1]*d,qz=origin[2]+f[2]*d;
   if(body.main&&detail>0)sampleDetail(qx,qy,qz,cell,weights);else sample(qx,qy,qz,cell);
   const emission=body.main?1-(1-gain)*coreMask(qx,qy,qz):1;
   const a=1-Math.exp(-cell[3]*ds*opacity*9);integral+=cell[3]*ds;
   for(let j=0;j<3;j++)rgb[i*3+j]+=trans*a*cell[j]*exposure*1.65*emission;
   trans*=1-a;
  }
  }
  alpha[i]=1-trans;density[i]=clamp(integral*3)*255;
 }
 const starlight=new Float32Array(w*h*3),glareSources=[];
 const nested=m.galaxyFocus===true||m.galaxyFocus==='lmc'?[]:detailStars(weights,center,right,up,span,w/h);
 // Point sources use only the fixed main-sequence palette. Extinction is
 // achromatic so foreground dust cannot turn a star green or purple.
 for(const s of stars.concat(nested)){
  if(m.galaxyFocus===true&&!s.cluster)continue;
  const x=Math.floor(dot(s,right)/span*h+w/2),y=Math.floor(h/2-dot(s,up)/span*h);if(x<0||y<0||x>=w||y>=h)continue;
  let tau=0;
  for(const body of bodies){
   const along=(s.x-body.c.x)*f[0]+(s.y-body.c.y)*f[1]+(s.z-body.c.z)*f[2];
   const distance2=(s.x-body.c.x)**2+(s.y-body.c.y)**2+(s.z-body.c.z)**2-along*along;
   if(distance2>body.r**2)continue;
   const half=Math.sqrt(body.r**2-distance2),start=Math.max(0,along-half),end=along+half;
   if(end<=start)continue;const step=(end-start)/24;
   for(let k=0;k<24;k++){const d=start+(k+.5)*step;const qx=s.x-f[0]*d,qy=s.y-f[1]*d,qz=s.z-f[2]*d;if(body.main&&detail>0)sampleDetail(qx,qy,qz,cell,weights);else sample(qx,qy,qz,cell);tau+=cell[3]*step;}
  }
  const centralGain=s.cluster||s.lmc?1:1-(1-gain)*coreMask(s.x,s.y,s.z);
  const power=s.power*(m.space[3]||0)*Math.exp(-tau*opacity*9)*exposure*centralGain,i=x+y*w;
  if(power<.0005)continue;
  for(let j=0;j<3;j++)starlight[i*3+j]+=s.color[j]*power;
  if(s.glareAxis){
   const gx=s.glareAxis[0]*right[0]+s.glareAxis[1]*right[1]+s.glareAxis[2]*right[2],gy=s.glareAxis[0]*up[0]+s.glareAxis[1]*up[1]+s.glareAxis[2]*up[2],length=Math.hypot(gx,gy);
   if(length>.10)glareSources.push({x,y,dx:gx/length,dy:-gy/length,power,color:s.color});
  }
 }
 // Sparse paired rays use an ordered gap pattern and inherit their physical
 // axes from the galaxy, so they rotate with the view instead of the screen.
 for(const g of glareSources){
  const reach=Math.max(3,Math.min(12,Math.round(3+g.power*8)));
  for(let step=-reach;step<=reach;step++){
   if(!step||((Math.abs(step)+Math.floor(g.x)+2*Math.floor(g.y))%3===1))continue;
   const px=Math.round(g.x+g.dx*step),py=Math.round(g.y+g.dy*step);if(px<0||py<0||px>=w||py>=h)continue;
   const fall=1-Math.abs(step)/(reach+1),i=px+py*w,boost=g.power*fall*.24;
   for(let j=0;j<3;j++)starlight[i*3+j]+=g.color[j]*boost;
  }
 }
 for(let i=0;i<w*h;i++){
  const peak=Math.max(starlight[i*3],starlight[i*3+1],starlight[i*3+2]);
  const power=1-Math.exp(-peak);
  // Resolved stars still show against diffuse glow; comparing with its peak
  // used to erase every faint point in a bright arm or the central bulge.
  if(peak>0){
   for(let j=0;j<3;j++)rgb[i*3+j]+=starlight[i*3+j]/peak*power*(1-clamp(rgb[i*3+j]));
   alpha[i]=Math.max(alpha[i],power);
  }
 }
 const bayer=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
 for(let i=0;i<w*h;i++){
  const a=Math.max(alpha[i],clamp(Math.max(rgb[i*3],rgb[i*3+1],rgb[i*3+2])));
  for(let j=0;j<3;j++){let c=a?rgb[i*3+j]/a:0;if(m.params[14])c=Math.floor(clamp(c*63+bayer[(Math.floor(i/w)%4)*4+i%w%4]/16-.5,0,63))/63;rgba[i*4+j]=clamp(c)*255;}
  rgba[i*4+3]=a*255;
 }
 const clusterProjection={x:dot(CLUSTER,right)/span*h+w/2,y:h/2-dot(CLUSTER,up)/span*h,focused:m.galaxyFocus===true};
 return {rgba,density,stars:COUNT+nested.length,baseStars:COUNT,detailStars:nested.length,detailLevels:m.galaxyFocus===true||m.galaxyFocus==='lmc'?0:detail,jets:Math.ceil(DISK_COUNT/GLARE_PERIOD),clusterProjection,camera:{right,up,forward:f,center,span}};
}
function bake(m){
 prepare(m.seed);const side=m.side;if(![16,32,64].includes(side))throw Error('Unsupported volume size');
 const levels=[];for(let n=side;n>=8;n/=2)levels.push(n);
 const size=160+COUNT*48+4+levels.reduce((v,n)=>v+n*n*n*4,0),bytes=new Uint8Array(size),dv=new DataView(bytes.buffer);
 bytes.set(new TextEncoder().encode('RFLNEB1\0'));const u=(a,v)=>dv.setUint32(a,v,true),f=(a,v)=>dv.setFloat32(a,v,true);
 [[8,160],[12,1],[16,side],[20,levels.length],[24,1],[28,COUNT],[32,1],[36,m.seed],[64,size]].forEach(([a,v])=>u(a,v));
 [[40,12],[44,BAKE_EXT],[48,m.params[13]*9*8],[52,m.space[3]],[56,0],[60,4],[72,0]].forEach(([a,v])=>f(a,v));
 bytes.set(new TextEncoder().encode(m.name.replace(/[^ -~]/g,' ').slice(0,63)),96);let at=160;
 for(const s of stars){const axis=s.glareAxis||[0,0,1];[s.x,s.y,s.z,0,...axis,...s.color.map(c=>c*s.power),0].forEach((v,j)=>f(at+j*4,v));u(at+44,s.glareAxis?1:0);at+=48;}
 f(at,0);at+=4;const cell=new Float32Array(4);
 for(const n of levels)for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  sample(((x+.5)/n*2-1)*BAKE_EXT,((y+.5)/n*2-1)*BAKE_EXT,((z+.5)/n*2-1)*BAKE_EXT,cell);
  for(let j=0;j<3;j++)bytes[at++]=clamp(cell[j]*m.params[12]*1.65/4)*255;
  bytes[at++]=clamp(cell[3]/8)*255;
 }
 let hashValue=2166136261;for(let i=0;i<size;i++)hashValue=Math.imul(hashValue^(i>=68&&i<72?0:bytes[i]),16777619)>>>0;u(68,hashValue);return bytes;
}
globalThis.NebulaGalaxy={render,bake,prepare,sample,getStars:()=>stars,getPositions:()=>({cluster:CLUSTER,lmc:LMC,lyPerUnit:LY,sun:{x:8.2*KPC,y:0,z:0}})};
})();
