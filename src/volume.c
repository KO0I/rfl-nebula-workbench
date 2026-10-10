#include "volume.h"
#include "comet.h"
#include "nova.h"
#include "noctis_glare.h"
#include "image_texture.h"
#include "reference_nebula.h"

#define NS 64
#define NN (NS*NS*NS)
#define VS VOLUME_SIDE
#define VN (VS*VS*VS)
#define HALF 1.25f

typedef struct { float x,y,z; } Vec;
typedef struct { Vec pos; float radius; Vec axis; float color[3],phase; } Star;
static float noise_grid[NN], gas[VN], dust[VN], dust_light[VN], envelope[VN], rim[VN][3];
static float image_rgb[NEBULA_MAX*NEBULA_MAX][3], image_alpha[NEBULA_MAX*NEBULA_MAX];
static uint8_t rgba[NEBULA_MAX*NEBULA_MAX*4], projected_density[NEBULA_MAX*NEBULA_MAX];
static Star stars[STAR_LIMIT];
static float settings[SPACE_PARAM_COUNT]={18,.19f,.28f,1,1,1,0,0,1,0,2.2f,.15f,.8f,180,0,.3f,1};
static int star_count,jet_count,built;
static unsigned last_seed;
static NovaState nova;
static float noise_key[7],last_time=-9999;
static void compact_cell(Vec q,float time,float out[4]);
static float jet_growth(float time);

static float clamp(float x,float a,float b) { return x<a?a:x>b?b:x; }
static float mix(float a,float b,float t) { return a+(b-a)*t; }
static float absf(float x) { return x<0?-x:x; }
static float minf(float a,float b) { return a<b?a:b; }
static float maxf(float a,float b) { return a>b?a:b; }
static float smooth(float a,float b,float x) { x=clamp((x-a)/(b-a),0,1);return x*x*(3-2*x); }
static Vec vec(float x,float y,float z) { Vec v={x,y,z};return v; }
static Vec add(Vec a,Vec b) { return vec(a.x+b.x,a.y+b.y,a.z+b.z); }
static Vec mul(Vec a,float f) { return vec(a.x*f,a.y*f,a.z*f); }
static float dot(Vec a,Vec b) { return a.x*b.x+a.y*b.y+a.z*b.z; }
static Vec normal(Vec a) { return mul(a,1/__builtin_sqrtf(maxf(dot(a,a),.00001f))); }
/* Camera and knot trigonometry, without a libc dependency in WebAssembly. */
static float sine(float x) {
 x-=(int)(x/6.283185307f)*6.283185307f;
 if(x>3.141592654f)x-=6.283185307f;
 if(x< -3.141592654f)x+=6.283185307f;
 if(x>1.570796327f)x=3.141592654f-x;
 if(x< -1.570796327f)x=-3.141592654f-x;
 float q=x*x;return x*(1+q*(-1.0f/6+q*(1.0f/120+q*(-1.0f/5040+q/362880))));
}
static float cosine(float x) { return sine(x+1.570796327f); }
/* Inverse rotation samples material orbiting the jet axis, independently of camera. */
static Vec orbit_sample(Vec q,Vec axis,float angle) {
 float c=cosine(angle),s=sine(angle),d=dot(q,axis);
 Vec cross=vec(axis.y*q.z-axis.z*q.y,axis.z*q.x-axis.x*q.z,axis.x*q.y-axis.y*q.x);
 return add(add(mul(q,c),mul(cross,-s)),mul(axis,d*(1-c)));
}
static uint32_t hash(uint32_t n) { n^=n>>16;n*=0x7feb352du;n^=n>>15;n*=0x846ca68bu;return n^(n>>16); }
static float randomf(uint32_t *s) { *s=hash(*s+0x9e3779b9u);return (*s&0xffffff)/16777215.0f; }
/* Explicit sequencing makes exported recipes identical across C compilers. */
static Vec random_vec(uint32_t *s) { float x=randomf(s)*2-1;float y=randomf(s)*2-1;float z=randomf(s)*2-1;return vec(x,y,z); }

void nebula_space_set(int i,float value) {
 static const float lo[SPACE_PARAM_COUNT]={0,0,0,0,.1f,.5f,0,0,.05f,0,.7f,.04f,0,-180,-75,.05f,.1f};
 static const float hi[SPACE_PARAM_COUNT]={STAR_LIMIT,.4f,1,2.5f,3,1.7f,2,5,5,3,2.8f,.3f,1.5f,180,75,2,3};
 if(i>=0&&i<SPACE_PARAM_COUNT)settings[i]=clamp(value,lo[i],hi[i]);
}
float nebula_space_get(int i) { return i>=0&&i<SPACE_PARAM_COUNT?settings[i]:0; }
int nebula_space_star_count(void) { return star_count; }
int nebula_space_jet_count(void) { return settings[NOVA_MODE]>.5f && jet_growth(last_time)<=.01f?0:jet_count; }
const float *nebula_space_stars(void) { return (const float *)stars; }
uint8_t *nebula_space_density(void) { return projected_density; }

static float fbm(Vec q,unsigned seed,float scale) {
 return nebula_fbm3(q.x,q.y,q.z,seed,scale,(int)nebula_get(OCTAVES),nebula_get(PERSISTENCE),nebula_get(LACUNARITY));
}
static float sample_noise(float x,float y,float z) {
 x*=NS;y*=NS;z*=NS;
 int ix=(int)x-(x<(int)x),iy=(int)y-(y<(int)y),iz=(int)z-(z<(int)z);
 float fx=x-ix,fy=y-iy,fz=z-iz;
 int a=ix&(NS-1),b=iy&(NS-1),c=iz&(NS-1),a1=(ix+1)&(NS-1),b1=(iy+1)&(NS-1),c1=(iz+1)&(NS-1);
 float l=mix(mix(noise_grid[a+NS*(b+NS*c)],noise_grid[a1+NS*(b+NS*c)],fx),mix(noise_grid[a+NS*(b1+NS*c)],noise_grid[a1+NS*(b1+NS*c)],fx),fy);
 float h=mix(mix(noise_grid[a+NS*(b+NS*c1)],noise_grid[a1+NS*(b+NS*c1)],fx),mix(noise_grid[a+NS*(b1+NS*c1)],noise_grid[a1+NS*(b1+NS*c1)],fx),fy);
 return mix(l,h,fz);
}
/* Bounded trilinear density sampling. World coordinates are view-independent. */
static float echo_scale(void) { return settings[NOVA_MODE]>1.5f?settings[JET_LENGTH]*1.36f:1; }
/* Nova B begins at the flash; Nova retains its six-second prelude. */
static float jet_growth(float time) { return smooth(0,5,time-(settings[NOVA_MODE]>1.5f?0:6)); }
static float reflection_color(Vec q,float time,int c,int channel) {
 float radius=__builtin_sqrtf(dot(q,q));
 float aim=absf(dot(q,stars[0].axis))/maxf(radius,.001f);
 float beam=smooth(.82f,.98f,aim);
 /* The first polar cloud surface lights at 3 s; green starts there at 6 s.
  * Distance from those surfaces delays both fronts, independent of camera. */
 float delay=maxf(0,radius/echo_scale()-.78f)*5+(1-beam)*3;
 float echo=smooth(0,.8f,time-3-delay);
 float ionAge=time-6-delay;
 float ion=smooth(0,1.2f,ionAge)*(1-smooth(3,4,ionAge));
 float blue=nebula_colors()[(6+c)*3+channel]/255.0f;
 float green=(channel==0?.08f:channel==1?1.0f:.18f)*(.30f+.14f*c);
 return mix(blue,green*1.8f,ion)*echo*(.30f+3.8f*beam*beam)*settings[STAR_GLOW];
}
/* Fade the entire nova after the returning blue front, settling at half. */
static float nova_brightness(float time) {
 if(settings[NOVA_MODE]<.5f)return 1;
 float age=time-(settings[NOVA_MODE]>1.5f?0:6);
 return 1-.5f*smooth(16,46,age);
}
static int reflection_region(Vec q) { return settings[NOVA_MODE]>1.5f && dot(q,q)>.60f*echo_scale()*echo_scale(); }
static float sample_field(const float *field,float x,float y,float z) {
 float scale=echo_scale();x/=scale;y/=scale;z/=scale;
 x=(x+HALF)*((VS-1)/(2*HALF));y=(y+HALF)*((VS-1)/(2*HALF));z=(z+HALF)*((VS-1)/(2*HALF));
 if(x<0||y<0||z<0||x>=VS-1||y>=VS-1||z>=VS-1)return 0;
 int ix=(int)x,iy=(int)y,iz=(int)z,i=ix+VS*(iy+VS*iz);float a=x-ix,b=y-iy,c=z-iz;
 float l=mix(mix(field[i],field[i+1],a),mix(field[i+VS],field[i+VS+1],a),b);
 i+=VS*VS;float h=mix(mix(field[i],field[i+1],a),mix(field[i+VS],field[i+VS+1],a),b);
 return mix(l,h,c);
}
float nebula_space_sample(float x,float y,float z) {
 if(settings[COMET_MODE]>.5f){float c[4];nebula_comet_cell(x,y,z,c);return c[3];}
 if(nebula_reference_active()){float c[4];nebula_reference_cell(x,y,z,last_time,c);return c[3];}
 if(settings[COMPACT_MODE]>.5f){float c[4];compact_cell(vec(x,y,z),last_time,c);return c[3]/(settings[COMPACT_MODE]>4.5f?4:24);}
 return sample_field(gas,x,y,z);
}
static float sample_dust(Vec q) { return nebula_reference_active()?0:sample_field(dust,q.x,q.y,q.z); }
static int strong_hh(const Star *s) { return s->phase>5.026548f; }
static int voxel(Vec q) {
 q=mul(q,1/echo_scale());
 int x=(int)clamp((q.x+HALF)*((VS-1)/(2*HALF)),0,VS-1),y=(int)clamp((q.y+HALF)*((VS-1)/(2*HALF)),0,VS-1),z=(int)clamp((q.z+HALF)*((VS-1)/(2*HALF)),0,VS-1);
 return x+VS*(y+VS*z);
}
static float shape(Vec q) {
 float stretch=nebula_get(STRETCH),soft=nebula_get(SOFTNESS);
 if(nebula_image_active()) {
  float c[4];nebula_image_sample(.5f+q.x/(2.2f*stretch),.5f-q.y*__builtin_sqrtf(stretch)/2.2f,c);
  float brightness=__builtin_sqrtf(maxf(c[0],maxf(c[1],c[2])));
  float depth=.20f+.55f*brightness;
  return c[3]*(1-smooth(depth*.35f,depth,absf(q.z)));
 }
 int mask=(int)nebula_get(MASK);
 float x=q.x/stretch,y=q.y*__builtin_sqrtf(stretch),z=q.z;
 float r2=x*x+y*y+z*z;
 if(mask==3)return 1-smooth(.8f,1.2f,maxf(absf(q.x),maxf(absf(q.y),absf(q.z))));
 if(mask==2) {float r=__builtin_sqrtf(x*x+z*z);float d=(r-.6f)*(r-.6f)+y*y;return 1-smooth(.012f,.12f+soft*.10f,d);}
 if(mask==1) {
  float result=0;
  for(int k=0;k<3;k++) {
   float top=.76f-k*.15f,center=-.48f+k*.46f-(y+1)*.10f;
   float width=.10f+(top-y)*.08f;
   float dx=x-center,dz=z-(k-1)*.15f;
   float side=1-smooth(width*width*.2f,(width+soft*.13f)*(width+soft*.13f),dx*dx+dz*dz);
   result=maxf(result,side*(1-smooth(top-.1f,top+.1f,y))*smooth(-1.1f,-.8f,y));
  }
  return result;
 }
 return 1-smooth(.24f,1.02f+soft*.18f,r2);
}
static void seed_stars(unsigned seed) {
 if(nebula_reference_active()){
  star_count=nebula_reference_star_count();jet_count=0;
  const float *source=nebula_reference_stars_buffer();
  for(int i=0;i<star_count*11;i++)((float *)stars)[i]=source[i];
  return;
 }
 static const float colors[6][3]={{.48f,.75f,1},{1,.68f,.42f},{1,.42f,.63f},{.68f,.48f,1},{.48f,1,.85f},{1,.93f,.70f}};
 if(settings[NOVA_MODE]>.5f || settings[COMPACT_MODE]>.5f) {
  uint32_t rng=seed+97987u;Star *s=&stars[0];
  star_count=1;jet_count=(settings[COMPACT_MODE]>.5f||settings[NOVA_MODE]>1.5f)?1:nebula_nova_jet_seed(seed);
  s->pos=vec(0,0,0);s->radius=settings[CAVITY_RADIUS];
  s->axis=settings[COMPACT_MODE]>.5f?normal(vec(.48f,.66f,.58f)):normal(random_vec(&rng));
  s->color[0]=settings[COMPACT_MODE]>4.5f?1:.64f;
  s->color[1]=settings[COMPACT_MODE]>4.5f?.52f:.85f;
  s->color[2]=settings[COMPACT_MODE]>4.5f?.19f:1;
  s->phase=randomf(&rng)*6.2831853f;
  return;
 }
 star_count=(int)settings[STAR_COUNT];jet_count=(int)(star_count*settings[JET_FRACTION]+.5f);
 uint32_t rng=seed+97987u;
 for(int i=0;i<star_count;i++) {
  Star *s=&stars[i];Vec p=vec(0,0,0);
  /* Three out of four stars are embedded; the remainder surround the gas. */
  for(int attempt=0;attempt<160;attempt++) {
   p=random_vec(&rng);
   if(dot(p,p)>1)continue;
   if(i%4!=3 && shape(mul(p,.95f))<.3f)continue;
   break;
  }
  s->pos=mul(p,settings[STAR_SPREAD]*(i%4==3?1.13f:.92f));
  s->radius=settings[CAVITY_RADIUS]*(.82f+randomf(&rng)*.36f);
  s->axis=normal(random_vec(&rng));
  int color=(int)(randomf(&rng)*5.99f);for(int j=0;j<3;j++)s->color[j]=colors[color][j];
  s->phase=randomf(&rng)*6.2831853f;
  if(i<jet_count){s->color[0]=1;s->color[1]=.57f+.20f*(s->phase/6.2831853f);s->color[2]=.16f;}
 }
}
void nebula_space_build(unsigned seed) {
 if(settings[COMET_MODE]>.5f){star_count=jet_count=0;last_seed=seed;last_time=0;built=0;nebula_comet_prepare(seed,0);return;}
 if(nebula_reference_active()){nebula_reference_seed(seed);seed_stars(seed);built=1;last_time=0;return;}
 const int keys[7]={SCALE,OCTAVES,PERSISTENCE,LACUNARITY,WARP,LAYER2,MIX};
 int rebuild=!built||seed!=last_seed;
 for(int k=0;k<7;k++)if(noise_key[k]!=nebula_get(keys[k]))rebuild=1;
 if(rebuild) {
  float scale=nebula_get(SCALE),warp=nebula_get(WARP)*.33f;
  for(int z=0;z<NS;z++)for(int y=0;y<NS;y++)for(int x=0;x<NS;x++) {
   Vec q=vec((float)x/NS,(float)y/NS,(float)z/NS);
   Vec shift=vec(fbm(q,seed+31,scale)-.5f,fbm(q,seed+713,scale)-.5f,fbm(q,seed+1327,scale)-.5f);
   q=add(q,mul(shift,warp));float n=fbm(q,seed+117,scale);
   if(nebula_get(LAYER2)>.5f) {float b=fbm(add(q,vec(.19f,.33f,.47f)),seed+331,scale*1.8f);n=mix(n,(1-absf(2*b-1))*.73f,nebula_get(MIX));}
   noise_grid[x+NS*(y+NS*z)]=n;
  }
  for(int k=0;k<7;k++)noise_key[k]=nebula_get(keys[k]);
 }
 seed_stars(seed);
 for(int z=0;z<VS;z++)for(int y=0;y<VS;y++)for(int x=0;x<VS;x++) {
  int i=x+VS*(y+VS*z);Vec q=vec((float)x/(VS-1)*2*HALF-HALF,(float)y/(VS-1)*2*HALF-HALF,(float)z/(VS-1)*2*HALF-HALF);
  dust[i]=dust_light[i]=0;
  float cut=1;rim[i][0]=rim[i][1]=rim[i][2]=0;
  for(int s=0;s<star_count;s++) {
   Vec diff=add(q,mul(stars[s].pos,-1));float d2=dot(diff,diff),r2=stars[s].radius*stars[s].radius;
   if(settings[NOVA_MODE]<.5f && settings[COMPACT_MODE]<.5f && s<jet_count && strong_hh(&stars[s])) {
    float axial=absf(dot(diff,stars[s].axis)),u=axial/settings[JET_LENGTH];
    float radial=__builtin_sqrtf(maxf(0,d2-axial*axial));
    float n=sample_noise(q.x*1.3f,q.y*1.3f,q.z*1.3f);
    float width=settings[JET_LENGTH]*(.05f+.19f*u)*(.7f+n);
    float cloud=(1-smooth(width*.3f,width,radial))*smooth(.10f,.24f,u)*(1-smooth(.72f,1.25f,u));
    float den=cloud*(.35f+2.5f*n*n);
    dust[i]+=den;
    dust_light[i]+=den*(.015f+.16f*smooth(.40f,.68f,n));
   }
   if(r2<.000001f)continue;
   cut=minf(cut,smooth(r2*.72f,r2*1.22f,d2));
   float shell=smooth(r2*.7f,r2*1.22f,d2)*(1-smooth(r2*1.22f,r2*2.7f,d2));
   for(int j=0;j<3;j++)rim[i][j]+=stars[s].color[j]*shell*.55f;
  }
  if(settings[NOVA_MODE]>1.5f) {
   uint32_t rng=seed+67391u;
   float solid=0;
   for(int b=0;b<11;b++) {
    Vec head=random_vec(&rng);head=mul(normal(head),.88f+randomf(&rng)*.15f);
    Vec axis=normal(head),diff=add(q,mul(head,-1));
    float t=dot(diff,axis),rad2=maxf(0,dot(diff,diff)-t*t);
    float size=.075f+randomf(&rng)*.05f;
    float len=b<7?.32f:.68f;
    float width=size*(1-.72f*clamp(t/len,0,1));
    float n=sample_noise(q.x*3,q.y*3,q.z*3);
    width*=.75f+.6f*n;
    float headshape=1-smooth(size*.55f,size,__builtin_sqrtf(dot(diff,diff)));
    float tail=(1-smooth(width*.45f,width,__builtin_sqrtf(rad2)))*smooth(-size,0,t)*(1-smooth(len*.7f,len,t));
    solid=maxf(solid,maxf(headshape,tail));
    if(b>=7) {
     Vec branch=add(diff,mul(vec(.22f,-.12f,.10f),clamp(t/len,0,1)));
     float bt=dot(branch,axis),br=maxf(0,dot(branch,branch)-bt*bt);
     solid=maxf(solid,(1-smooth(width*.4f,width,__builtin_sqrtf(br)))*smooth(.05f,.2f,bt)*(1-smooth(len*.6f,len,bt)));
    }
   }
   float shell=smooth(.78f,.84f,__builtin_sqrtf(dot(q,q)))*(1-smooth(1.12f,1.23f,__builtin_sqrtf(dot(q,q))));
   solid*=shell;
   dust[i]=solid*9;
   dust_light[i]=solid*(1-solid)*.20f;
  }
  envelope[i]=shape(q)*cut;
 }
 built=1;last_seed=seed;last_time=-9999;
}
static void animate_gas(float time) {
 if(settings[COMET_MODE]>.5f){last_time=time;nebula_comet_prepare(last_seed,time);return;}
 if(nebula_reference_active()){last_time=time;return;}
 if(settings[COMPACT_MODE]>.5f){last_time=time;if(settings[COMPACT_MODE]>4.5f)nebula_comet_prepare(last_seed,time);return;}
 if(absf(time-last_time)<.00001f)return;
 int is_nova=settings[NOVA_MODE]>.5f;
 int is_image=nebula_image_active();
 float image_xscale=2*HALF/(2.2f*nebula_get(STRETCH)),image_yscale=2*HALF*__builtin_sqrtf(nebula_get(STRETCH))/2.2f;
 if(is_nova)stars[0].radius=nova.clearing;
 float threshold=is_nova?nova.cutoff:nebula_get(THRESHOLD),soft=nebula_get(SOFTNESS);
 if(is_nova && settings[NOVA_MODE]<1.5f && nova.radius<=0) {
  for(int i=0;i<VN;i++)gas[i]=0;
  last_time=time;return;
 }
 for(int z=0;z<VS;z++)for(int y=0;y<VS;y++)for(int x=0;x<VS;x++) {
  int i=x+VS*(y+VS*z);
  if(!is_nova && envelope[i]<.0001f){gas[i]=0;continue;}
  float u=(float)x/(VS-1),v=(float)y/(VS-1),w=(float)z/(VS-1);
  float mask=envelope[i];
  if(settings[NOVA_MODE]>1.5f) {
   float radius=__builtin_sqrtf((u-.5f)*(u-.5f)+(v-.5f)*(v-.5f)+(w-.5f)*(w-.5f))*2*HALF;
   if(radius>.77f) {
   gas[i]=smooth(.48f,.67f,sample_noise(u,v,w))*smooth(.78f,.84f,radius)*(1-smooth(1.12f,1.23f,radius))*(1-clamp(dust[i]/9,0,1));
   rim[i][0]=rim[i][1]=rim[i][2]=0;
   continue;
   }
  }
  if(is_nova) {
   float xw=(u-.5f)*2*HALF,yw=(v-.5f)*2*HALF,zw=(w-.5f)*2*HALF;
   float d2=xw*xw+yw*yw+zw*zw;
   float nr=maxf(.001f,settings[NOVA_MODE]>1.5f?(.10f+.55f*clamp((nova.radius-.10f)/1.02f,0,1)):nova.radius);
   float r2=d2/(nr*nr),clear2=nova.clearing*nova.clearing;
   float cut=smooth(clear2*.72f,clear2*1.22f,d2);
   mask=cut*(1-smooth(.56f,1.0f,r2));
   float shell=smooth(clear2*.7f,clear2*1.22f,d2)*(1-smooth(clear2*1.22f,clear2*2.7f,d2));
   for(int j=0;j<3;j++)rim[i][j]=stars[0].color[j]*shell*.55f;
   if(mask<.0001f){gas[i]=0;continue;}
   u=.5f+(u-.5f)/nova.radius;v=.5f+(v-.5f)/nova.radius;w=.5f+(w-.5f)/nova.radius;
  }
  float a=sample_noise(u+time*.018f,v+time*.009f,w-time*.013f);
  float b=sample_noise(u-time*.009f+.37f,v+time*.013f+.21f,w+time*.008f+.49f);
  float d=smooth(threshold,minf(.99f,threshold+.25f+soft*.25f),a+(b-.5f)*.30f);
  if(is_image&&!is_nova) {
   float c[4];
   nebula_image_sample(.5f+(u-.5f)*image_xscale,.5f-(v-.5f)*image_yscale,c);
   float brightness=__builtin_sqrtf(maxf(c[0],maxf(c[1],c[2])));
   d=smooth(threshold,minf(.99f,threshold+.25f+soft*.25f),brightness)*(.45f+.55f*a)*(.85f+.15f*b);
  }
  /* Keep early, low-cutoff ejecta textured instead of clipping to a white disc. */
  if(is_nova)d*=mix(.12f+.88f*a*a,1,nova.expansion);
  gas[i]=d*mask;
 }
 last_time=time;
}
void nebula_space_bake(float time) {
 nova=nebula_nova_at(time+(settings[NOVA_MODE]>1.5f?6:0));
 animate_gas(time);
}
float nebula_space_extent(void){return settings[COMET_MODE]>.5f?nebula_comet_extent():settings[COMPACT_MODE]>4.5f?maxf(1.5f,settings[JET_LENGTH]*2.6f+.2f):settings[COMPACT_MODE]>.5f?maxf(.7f,settings[JET_LENGTH]*8.0f):1.25f*echo_scale();}
void nebula_space_cell(float x,float y,float z,float out[4]) {
 if(settings[COMET_MODE]>.5f){nebula_comet_cell(x,y,z,out);for(int j=0;j<3;j++)out[j]*=nebula_get(EXPOSURE);out[3]/=16;return;}
 if(nebula_reference_active()){nebula_reference_cell(x,y,z,last_time,out);out[3]/=2;return;}
 if(settings[COMPACT_MODE]>.5f){compact_cell(vec(x,y,z),last_time,out);out[3]/=settings[COMPACT_MODE]>4.5f?4:24;return;}
 float d=nebula_space_sample(x,y,z),dd=sample_dust(vec(x,y,z));
 int c=(int)clamp(d*4.8f+.9f,0,5),v=voxel(vec(x,y,z));
 const uint8_t *palette=nebula_colors();
 for(int j=0;j<3;j++)
  out[j]=(palette[c*3+j]/255.0f+rim[v][j]*settings[STAR_GLOW]*1.35f)*nebula_get(EXPOSURE)*1.7f;
 out[3]=d+dd;
 if(nebula_image_active()) {
  float source[4],stretch=nebula_get(STRETCH);
  nebula_image_sample(.5f+x/(2.2f*stretch),.5f-y*__builtin_sqrtf(stretch)/2.2f,source);
  for(int j=0;j<3;j++)out[j]=(source[j]+rim[v][j]*settings[STAR_GLOW]*1.35f)*nebula_get(EXPOSURE)*1.7f;
 }
 if(dd>0)for(int j=0;j<3;j++)out[j]=(out[j]*d+palette[c*3+j]/255.0f*dust_light[v]*nebula_get(EXPOSURE))/(d+dd);
 if(reflection_region(vec(x,y,z)))for(int j=0;j<3;j++)out[j]=reflection_color(vec(x,y,z),last_time,c,j)*(d+dust_light[v])/maxf(d+dd,.00001f)*nebula_get(EXPOSURE)*1.7f;
 for(int j=0;j<3;j++)out[j]*=nova_brightness(last_time);
}

/* Young-star disk: a thick, slowly advecting volume, illuminated by an amber
 * protostar. Dark globules occupy the same world space and obscure material
 * behind them; they are not a camera-facing texture. */
static void nursery_cell(Vec q,float time,float out[4]) {
 Vec axis=stars[0].axis;
 float along=dot(q,axis),a=absf(along),r=__builtin_sqrtf(maxf(0,dot(q,q)-along*along));
 float radius=__builtin_sqrtf(dot(q,q)),glow=settings[STAR_GLOW];
 float angle=time*.026f*settings[CLOUD_ROTATION];
 Vec drift=orbit_sample(q,axis,angle),finePos=orbit_sample(q,axis,angle*1.7f);
 float n=sample_noise(drift.x*1.4f+.13f,drift.y*1.4f,drift.z*1.4f);
 float fine=sample_noise(finePos.x*5.1f,finePos.y*5.1f,finePos.z*5.1f);
 out[0]=out[1]=out[2]=out[3]=0;
 /* The outer disk is puffy and ragged, with nested spiral/radial filaments. */
 float thick=.045f+.075f*smooth(.12f,.62f,r)+.035f*(n-.5f);
 float disk=(1-smooth(thick*.35f,thick*1.65f,a))
            *smooth(.055f,.14f,r)*(1-smooth(.58f,.76f,r));
 float breaks=smooth(.29f,.57f,fine),rings=.5f+.5f*cosine(r*95+(n-.5f)*14);
 float den=disk*(2.2f+4.0f*breaks)*(.58f+.42f*rings);
 float inner=1-smooth(.055f,.41f,r);
 float power=(.30f+.58f*fine+.36f*rings)*(1+1.7f*inner)*glow;
 power*=1-.97f*smooth(.36f,.63f,r); /* Absorbing outer edge, not a luminous rim. */
 float total=out[3]+den;
 if(den>0) {
  out[0]=(out[0]*out[3]+power*1.0f*den)/total;
  out[1]=(out[1]*out[3]+power*.44f*den)/total;
  out[2]=(out[2]*out[3]+power*.13f*den)/total;
  out[3]=total;
 }
 /* A young star, not a black hole: no event horizon or white-hot aperture. */
 if(radius<.037f){out[0]=1.8f*glow;out[1]=.92f*glow;out[2]=.38f*glow;out[3]=90;return;}
 /* Narrow, comparatively gentle bipolar HH knots and entrained dust. */
 float length=settings[JET_LENGTH],u=a/maxf(length,.1f);
 if(u<1.25f && r<.16f+u*.10f && a>.05f) {
  float core=(1-smooth(.018f,.064f+u*.035f,r))*(1-smooth(.75f,1.20f,u));
  float sheath=(1-smooth(.065f,.16f+u*.10f,r))*(1-smooth(.85f,1.25f,u));
  float knot=.42f+.58f*sine(a*30-time*.65f+stars[0].phase);
  float jd=(core*1.0f+sheath*.30f)*(.42f+.58f*knot*knot);
  total=out[3]+jd;
  if(jd>0) {
   out[0]=(out[0]*out[3]+jd*.92f*glow)/total;
   out[1]=(out[1]*out[3]+jd*.48f*glow)/total;
   out[2]=(out[2]*out[3]+jd*.20f*glow)/total;
   out[3]=total;
  }
 }
 /* Each jet dissolves into the same animated filaments as the comet tails.
  * Scale both length and width with the jet; overlap the fading core. */
 float tailScale=maxf(.35f,length*1.8f),tailStart=length*.65f;
 if(a>tailStart && a<tailStart+tailScale) {
  Vec side=normal(vec(axis.z,0,-axis.x));
  Vec up=vec(axis.y*side.z-axis.z*side.y,axis.z*side.x-axis.x*side.z,axis.x*side.y-axis.y*side.x);
  float c[4];nebula_comet_tail_cell((a-tailStart)/tailScale,dot(q,side)/tailScale,dot(q,up)/tailScale,c);
  float td=c[3]*.45f*smooth(tailStart,tailStart+tailScale*.09f,a);
  total=out[3]+td;
  if(td>0){
   float warm[3]={.92f,.48f,.20f};
   for(int j=0;j<3;j++)out[j]=(out[j]*out[3]+td*warm[j]*glow)/total;
   out[3]=total;
  }
 }
 /* Foreground Bok-like knots and a broader irregular dark lane. */
 static const float knots[5][4]={{-.78f,.20f,.43f,.16f},{.76f,.31f,.32f,.13f},
   {-.41f,-.67f,-.29f,.12f},{.44f,.72f,-.26f,.14f},{.05f,.89f,.64f,.10f}};
 float shadow=0;
 for(int i=0;i<5;i++) {
  Vec d=add(q,mul(vec(knots[i][0],knots[i][1],knots[i][2]),-1));
  float k=knots[i][3]*(.72f+.65f*sample_noise(q.x*2+i,q.y*2,q.z*2));
  shadow=maxf(shadow,1-smooth(k*.65f,k*1.15f,__builtin_sqrtf(dot(d,d))));
 }
 if(shadow>0) {
  float dark=shadow*8,totalDust=out[3]+dark;
  out[0]=(out[0]*out[3]+.055f*dark)/totalDust;
  out[1]=(out[1]*out[3]+.027f*dark)/totalDust;
  out[2]=(out[2]*out[3]+.025f*dark)/totalDust;
  out[3]=totalDust;
 }
}

/* Stylized one-unit / one-light-year jet scale. The central torus and object
 * are deliberately enlarged for inspection, rather than claiming true scale. */
static void compact_cell(Vec q,float time,float out[4]) {
 out[0]=out[1]=out[2]=out[3]=0;
 if(settings[COMPACT_MODE]>4.5f){nursery_cell(q,time,out);return;}
 Vec axis=stars[0].axis;
 float along=dot(q,axis),a=absf(along),r2=maxf(0,dot(q,q)-along*along);
 float r=__builtin_sqrtf(r2),length=settings[JET_LENGTH],glow=settings[STAR_GLOW];
 float kind=settings[COMPACT_MODE];
 /* Small opaque spherical core. A black hole emits no light of its own. */
 float body=kind==1?.025f:kind==4?.039f:.024f;
 if(dot(q,q)<body*body) {
  out[3]=450;
  if(kind!=1){out[0]=.55f*glow;out[1]=.83f*glow;out[2]=1.3f*glow;}
  return;
 }
 if(a<.23f && r<.57f) {
  float angle=time*.13f*settings[CLOUD_ROTATION];
  Vec cloud=orbit_sample(q,axis,angle),patch=orbit_sample(q,axis,angle*2.5f);
  float n=sample_noise(cloud.x*1.5f,cloud.y*1.5f,cloud.z*1.5f);
  float fine=sample_noise(cloud.x*5.5f,cloud.y*5.5f,cloud.z*5.5f);
  float ridges=absf(sine(r*145+(n-.5f)*18));
  /* Corrugated dusty torus: a dense body with a ragged, filamentary surface. */
  float minor=.105f+(n-.45f)*.16f+(fine-.5f)*.05f;
  float d=__builtin_sqrtf((r-.345f)*(r-.345f)+along*along*1.6f);
  float torus=(1-smooth(minor-.025f,minor+.024f,d))*32;
  if(torus>0) {
   float inner=1-smooth(.23f,.40f,r);
   float fleck=.12f+.50f*fine*fine+.18f*ridges;
   float lit=(.45f+.55f*n)*(.6f+inner*2.2f)*fleck;
   out[0]=lit*.40f;out[1]=lit*.67f;out[2]=lit*.75f;
   out[3]=torus;
  }
  /* Seeded, advected turbulence breaks annuli into irregular arcs. */
  float disk=(1-smooth(.006f,.022f,a))*smooth(body*.95f,body*1.8f,r)*(1-smooth(.24f,.30f,r));
  if(disk>0) {
   float arc=sample_noise(patch.x*9,patch.y*9,patch.z*9);
   float diskFine=sample_noise(patch.x*5.5f,patch.y*5.5f,patch.z*5.5f);
   float gap=smooth(.40f,.58f,arc);
   float rings=.5f+.5f*cosine(r*420+(diskFine-.5f)*5);
   rings=rings*rings;
   float inward=1-smooth(body*1.1f,.24f,r);
   float power=(.025f+.975f*gap)*(.08f+.92f*rings)*(1+5*inward*inward)*glow;
   float den=disk*75*(.08f+.92f*gap),total=out[3]+den;
   for(int j=0;j<3;j++)out[j]=(out[j]*out[3]+power*(j==0?.73f:j==1?.95f:1.18f)*den)/total;
   out[3]=total;
  }
 }
 /* Orange teardrops broaden beyond the beam, ending in a soft rounded cap.
  * Purple material wraps their outside and trails back towards the source. */
 float u=(a/length-.72f)/(1.16f*6);
 if(u>0 && u<1 && r<length*.46f && glow>0) {
  float profile=u*__builtin_sqrtf(maxf(0,1-u))*2.6f;
  float n=sample_noise(q.x/length*2.1f+time*.006f,q.y/length*2.1f-time*.009f,q.z/length*2.1f);
  float fine=sample_noise(q.x/length*6,q.y/length*6+time*.012f,q.z/length*6);
  n=clamp((n-.30f)*2.5f,0,1);fine=clamp((fine-.30f)*2.5f,0,1);
  float width=length*.25f*profile*(.78f+.40f*n);
  float rr=r/maxf(width,.001f);
  float fade=smooth(0,.16f,u)*(1-smooth(.77f,1,u));
  float orange=(1-smooth(.30f,1.05f,rr))*fade*(.32f+.90f*n*n+.28f*fine)*2.5f/length;
  float purple=smooth(.62f,.96f,rr)*(1-smooth(1.0f,1.5f,rr))*fade*(.2f+.8f*n)*.48f/length;
  float den=orange+purple;
  if(den>0) {
   float hot=.55f+.9f*fine*fine;
   out[0]=glow*(orange*1.60f*hot+purple*.40f)/den;
   out[1]=glow*(orange*.67f*hot+purple*.08f)/den;
   out[2]=glow*(orange*.035f+purple*.80f)/den;
   out[3]=den;
  }
 }
}

static void compact_render(Vec right,Vec up,Vec forward,int width,int height,float span,float time) {
 float length=settings[JET_LENGTH],extent=maxf(.70f,length*8.0f);
 int nursery=settings[COMPACT_MODE]>4.5f;
 if(nursery)extent=nebula_space_extent();
 float opacity=nebula_get(OPACITY),exposure=nebula_get(EXPOSURE);
 for(int y=0;y<height;y++)for(int x=0;x<width;x++) {
  int i=y*width+x;
  Vec origin=add(mul(right,(x+.5f-width*.5f)/height*span),mul(up,(height*.5f-y-.5f)/height*span));
  float rgb[3]={0,0,0},trans=1,column=0;
  /* Integrate only intersected bounds, in depth order. Close-ups need not
   * march the entire light-year-scale empty span around the central torus. */
  float near[3],far[3];int count=0;
  float o2=dot(origin,origin),bound=nursery?extent:.58f,disc=bound*bound-o2;
  if(disc>0){float t=__builtin_sqrtf(disc);near[count]=-t;far[count++]=t;}
  float axial=dot(origin,stars[0].axis),df=dot(forward,stars[0].axis);
  float aa=1/(length*length*4.02f*4.02f),bb=1/(length*length*.43f*.43f);
  float qa=df*df*aa+(1-df*df)*bb;
  for(int side=-1;!nursery&&side<=1;side+=2){
   float local=axial-side*length*4.20f;
   float qb=2*(local*df*aa-axial*df*bb);
   float qc=local*local*aa+(o2-axial*axial)*bb-1;
   float det=qb*qb-4*qa*qc;
   if(det>0){float d=__builtin_sqrtf(det);near[count]=(-qb-d)/(2*qa);far[count++]=(-qb+d)/(2*qa);}
  }
  for(int k=1;k<count;k++)for(int j=k;j>0 && near[j]<near[j-1];j--){
   float n=near[j],f=far[j];near[j]=near[j-1];far[j]=far[j-1];near[j-1]=n;far[j-1]=f;
  }
  float previous=-extent;
  for(int section=0;section<count && trans>.004f;section++) {
   float stop=far[section];
   for(float t=maxf(previous,near[section]);t<stop && trans>.004f;) {
    Vec q=add(origin,mul(forward,t));float ds=nursery?.035f:dot(q,q)<.58f*.58f?.009f:.030f*maxf(length,.5f);
    float cell[4];compact_cell(q,time,cell);
    float a=1-1/(1+cell[3]*ds*opacity*2.7f);
    for(int j=0;j<3;j++)rgb[j]+=trans*a*cell[j]*exposure;
    column+=cell[3]*ds;trans*=1-a;t+=ds;
   }
   previous=maxf(previous,stop);
  }
  for(int j=0;j<3;j++)image_rgb[i][j]=rgb[j];
  image_alpha[i]=1-trans;projected_density[i]=(uint8_t)(clamp(column,0,1)*255);
 }
}

/* Small splats are placed in 3D, then attenuated by gas between them and camera. */
static float transmission(Vec at,Vec forward,float opacity) {
 if(settings[COMPACT_MODE]>.5f) {
  /* Resolve foreground torus/core only; distant glowing lobes stay emissive. */
  float front=dot(at,forward),t=1;
  Vec origin=add(at,mul(forward,-front));
  float bound=settings[COMPACT_MODE]>4.5f?maxf(1.5f,settings[JET_LENGTH]*2.6f+.2f):.60f;
  if(dot(origin,origin)>bound*bound)return 1;
  for(float depth=-bound;depth<minf(front,bound);depth+=settings[COMPACT_MODE]>4.5f?.035f:.012f) {
   Vec q=add(origin,mul(forward,depth));float c[4];compact_cell(q,last_time,c);
   t/=1+c[3]*(settings[COMPACT_MODE]>4.5f?.035f:.012f)*opacity*2.7f;
  }
  return t;
 }
 float t=1;const int steps=24;float ds=maxf(0,dot(at,forward)+2.25f)/steps;
 for(int k=1;k<=steps;k++) {Vec q=add(at,mul(forward,-k*ds));float d=nebula_space_sample(q.x,q.y,q.z);t/=1+(d+sample_dust(q))*ds*opacity*2.7f;}
 return t;
}
static void splat(Vec at,Vec right,Vec up,Vec forward,int width,int height,float span,
                  float radius,float strength,const float color[3]) {
 float px=dot(at,right)/span*height+width*.5f,py=height*.5f-dot(at,up)/span*height;
 int r=(int)(radius+1),cx=(int)px,cy=(int)py;
 if(cx+r<0||cy+r<0||cx-r>=width||cy-r>=height)return;
 float trans=transmission(at,forward,nebula_get(OPACITY));
 for(int y=cy-r;y<=cy+r;y++)for(int x=cx-r;x<=cx+r;x++) {
  if(x<0||y<0||x>=width||y>=height)continue;
  float dx=(x+.5f-px)/radius,dy=(y+.5f-py)/radius,d2=dx*dx+dy*dy;
  if(d2>1)continue;
  float a=(1-d2);a=a*a*strength*trans;int i=y*width+x;
  for(int j=0;j<3;j++)image_rgb[i][j]+=color[j]*a;
  image_alpha[i]=maxf(image_alpha[i],clamp(a,0,1));
 }
}
uint8_t *nebula_space_render(int width,int height,float time,float yaw,float pitch,float zoom) {
 if(!built && settings[COMET_MODE]<.5f)nebula_space_build(42871);
 width=(int)clamp(width,1,NEBULA_MAX);height=(int)clamp(height,1,NEBULA_MAX);
 int is_nova=settings[NOVA_MODE]>.5f;
 int is_image=nebula_image_active();
 float image_xscale=1/(2.2f*nebula_get(STRETCH)),image_yscale=__builtin_sqrtf(nebula_get(STRETCH))/2.2f;
 nova=nebula_nova_at(time+(settings[NOVA_MODE]>1.5f?6:0));
 zoom=clamp(zoom,.35f,24.0f);animate_gas(time);
 Vec right=vec(cosine(yaw),0,-sine(yaw));
 Vec up=vec(sine(yaw)*sine(pitch),cosine(pitch),cosine(yaw)*sine(pitch));
 Vec forward=vec(sine(yaw)*cosine(pitch),-sine(pitch),cosine(yaw)*cosine(pitch));
 int compact=settings[COMPACT_MODE]>.5f;
 float span=(settings[COMPACT_MODE]>4.5f?nebula_space_extent()*2.4f:compact?maxf(2.0f,16.0f*settings[JET_LENGTH]):maxf(3.5f*echo_scale(),4.2f*settings[JET_LENGTH]))/zoom,ds=3.5f*echo_scale()/96,opacity=nebula_get(OPACITY),exposure=nebula_get(EXPOSURE);
 const uint8_t *palette=nebula_colors();
 if(settings[COMET_MODE]>.5f){
  span=maxf(2.4f,nebula_space_extent()*2.7f)/zoom;
  float r[3]={right.x,right.y,right.z},u[3]={up.x,up.y,up.z},f[3]={forward.x,forward.y,forward.z};
  nebula_comet_render(r,u,f,width,height,span,image_rgb,image_alpha,projected_density);
 }else if(compact)compact_render(right,up,forward,width,height,span,time);
 else for(int y=0;y<height;y++)for(int x=0;x<width;x++) {
  int i=y*width+x;float tx=(x+.5f-width*.5f)/height*span,ty=(height*.5f-y-.5f)/height*span;
  Vec q=add(add(mul(right,tx),mul(up,ty)),mul(forward,-1.75f*echo_scale()));
  q=add(q,mul(forward,ds*((hash((unsigned)(x+y*width))&255)/255.0f-.5f)));
  float trans=1,integral=0;image_rgb[i][0]=image_rgb[i][1]=image_rgb[i][2]=0;
  for(int k=0;k<96 && (!is_nova || settings[NOVA_MODE]>1.5f || nova.radius>0);k++) {
   q=add(q,mul(forward,ds));
   if(nebula_reference_active()) {
    float cell[4];nebula_reference_cell(q.x,q.y,q.z,time,cell);
    float a=1-1/(1+cell[3]*ds*opacity*2.7f);
    for(int j=0;j<3;j++)image_rgb[i][j]+=trans*a*cell[j];
    integral+=cell[3]*ds;trans*=1-a;continue;
   }
   float gd=nebula_space_sample(q.x,q.y,q.z),dd=sample_dust(q),d=gd+dd;
   if(d<.002f)continue;
   integral+=d*ds;float a=1-1/(1+d*ds*opacity*2.7f);
   int c=(int)clamp(d*4.8f+.9f,0,5),v=voxel(q);
   float texture[4];
   if(is_image) {
    nebula_image_sample(.5f+q.x*image_xscale,.5f-q.y*image_yscale,texture);
   }
   for(int j=0;j<3;j++) {
    float light=(is_image?texture[j]:palette[c*3+j]/255.0f)+rim[v][j]*settings[STAR_GLOW]*1.35f;
    light=(light*gd+(is_image?texture[j]:palette[c*3+j]/255.0f)*dust_light[v]) / d;
    if(reflection_region(q)) {
     light=reflection_color(q,time,c,j)*(gd+dust_light[v])/d;
    }
    image_rgb[i][j]+=trans*a*light*exposure*1.7f;
   }
   trans*=1-a;
  }
  image_alpha[i]=1-trans;projected_density[i]=(uint8_t)(clamp(integral/1.3f,0,1)*255+.5f);
 }
 for(int s=0;s<star_count;s++) {
  Star *star=&stars[s];float scale=height/256.0f;
  int hh=!compact&&!is_nova,strong=hh&&strong_hh(star);
  float jet_scale=hh?(strong?.8f:.32f):1,jet_power=hh?(strong?.65f:.22f):1;
  if(s<jet_count && (!is_nova || jet_growth(time)>.01f)) {
   /* Either approaching lobe becomes an optical glare when viewed end-on.
    * Crossfade from 24 to 12 degrees; inside 12 degrees draw no cone splats. */
   float facing=dot(star->axis,forward);
   float glare=smooth(.91354546f,.97814760f,absf(facing));
   float cone=1-glare;
   if(glare>0 && settings[STAR_GLOW]>0) {
    float tint[3]={facing<0?.40f:1,facing<0?.82f:.44f,facing<0?1:.66f};
    if(settings[COMPACT_MODE]>4.5f){tint[0]=1;tint[1]=.52f;tint[2]=.19f;}
    else if(is_nova||compact){tint[0]=.55f;tint[1]=.82f;tint[2]=1;}
    /* Optical glare retains its original reach even when the physical jet is gentle. */
    float strength=3*glare*settings[STAR_GLOW]*(is_nova?jet_growth(time):1)*(settings[COMPACT_MODE]>4.5f?.16f:1);
    strength*=(settings[COMPACT_MODE]==1?1:transmission(star->pos,forward,opacity))*(.88f+.12f*sine(time*3.5f+star->phase));
    int cx=(int)(dot(star->pos,right)/span*height+width*.5f);
    int cy=(int)(height*.5f-dot(star->pos,up)/span*height);
    if(settings[COMPACT_MODE]==1) {
     /* Dense blue axial glare; the white aperture stays circular and solid. */
     float pulse=.80f+.14f*sine(time*19+star->phase)+.06f*sine(time*47);
     float blue[3]={.28f,.62f,1};
     float power=strength*3*pulse;
     nebula_noctis_glare_scaled(image_rgb,image_alpha,width,height,cx,cy,1.18f,power,blue);
     int radius=(int)maxf(2,5*scale);
     for(int y=-radius;y<=radius;y++)for(int x=-radius;x<=radius;x++) {
      int px=cx+x,py=cy+y;
      if(px<0||py<0||px>=width||py>=height)continue;
      int i=py*width+px;
      int d2=x*x+y*y;
      if(d2<=radius*radius) {
       for(int j=0;j<3;j++)image_rgb[i][j]+=power;
       image_alpha[i]=maxf(image_alpha[i],minf(1,power));
      } else if(d2<radius*radius*36) {
       float coverage=glare*.78f*(1-(float)d2/(radius*radius*36));
       unsigned seed=(unsigned)(time*24);
       if((hash((unsigned)(px+py*width)^seed)&255)<coverage*255) {
        for(int j=0;j<3;j++)image_rgb[i][j]+=blue[j]*power*coverage;
        image_alpha[i]=maxf(image_alpha[i],minf(1,power*coverage));
       }
      }
     }
    } else nebula_noctis_glare_scaled(image_rgb,image_alpha,width,height,cx,cy,.82f,strength,tint);
   }
   if(cone>0)for(int side=-1;side<=1;side+=2) {
    float color[3]={side>0?.40f:1,side>0?.82f:.44f,side>0?1:.66f};
    if(settings[COMPACT_MODE]>4.5f){color[0]=1;color[1]=.53f;color[2]=.18f;}
    else if(is_nova||compact){color[0]=.55f;color[1]=.82f;color[2]=1;}
    int steps=compact?110:72;
    for(int k=1;k<=steps;k++) {
     float t=(float)k/steps,dist=t*settings[JET_LENGTH]*jet_scale*(is_nova?jet_growth(time):1);
     Vec at=add(star->pos,mul(star->axis,dist*side));
     float knot=.5f+.5f*sine(t*28-time*3.5f+star->phase);
     knot=knot*knot*knot;
     float power=(.075f+.28f*knot)*(1-smooth(.78f,1.12f,t))*settings[STAR_GLOW];
     if(settings[COMPACT_MODE]>4.5f)power*=.70f;
     power*=cone*jet_power*(is_nova?jet_growth(time):1);
     splat(at,right,up,forward,width,height,span,maxf(.65f,(compact?1.1f+t*.65f:1.1f+t*2.3f)*scale),power,color);
    }
    if(is_nova && settings[NOVA_MODE]<1.5f)for(int k=0;k<60;k++) {
     float u=(k+.5f)/60,dist=settings[JET_LENGTH]*(.76f+u*.90f)*(is_nova?jet_growth(time):1);
     float lobe_width=settings[JET_LENGTH]*.20f*u*__builtin_sqrtf(1-u)*2.6f;
     Vec at=add(star->pos,mul(star->axis,dist*side));
     float pulse=.65f+.35f*sine(u*31-time*.8f+star->phase);
     float power=.11f*cone*settings[STAR_GLOW]*pulse*smooth(0,.2f,u)*(1-smooth(.75f,1,u))*(is_nova?jet_growth(time):1);
     float orange[3]={1,.32f,.055f},purple[3]={.48f,.10f,.92f};
     float pixels=maxf(.7f,lobe_width/span*height);
     splat(at,right,up,forward,width,height,span,pixels*1.55f,power*.38f,purple);
     splat(at,right,up,forward,width,height,span,pixels,power,orange);
    }
   }
  }
  if(compact)continue;
  float glow=settings[STAR_GLOW];
  if(is_nova) {
   float flicker=.78f+.16f*sine(time*19+star->phase)+.06f*sine(time*47+star->phase*.7f);
   float tint[3]={mix(1,.65f,nova.remnant),mix(.055f,.86f,nova.remnant),mix(.02f,1,nova.remnant)};
   float power=glow*mix(1,flicker,nova.remnant);
   if(nova.remnant>.001f) {
    splat(star->pos,right,up,forward,width,height,span,maxf(1,5*scale),.20f*power*nova.remnant,tint);
    splat(star->pos,right,up,forward,width,height,span,maxf(.8f,1.3f*scale),1.55f*power,tint);
   }
   int cx=width/2,cy=height/2,index=cy*width+cx;
   for(int j=0;j<3;j++)image_rgb[index][j]+=tint[j]*power*mix(1,.6f,nova.remnant);
   image_alpha[index]=1;
   nebula_noctis_glare(image_rgb,image_alpha,width,height,cx,cy,nova.glare,tint);
   continue;
  }
  if(nebula_reference_active()) {
   int cx=(int)(dot(star->pos,right)/span*height+width*.5f);
   int cy=(int)(height*.5f-dot(star->pos,up)/span*height);
   float brightness=maxf(star->color[0],maxf(star->color[1],star->color[2]));
   if(nebula_reference_spikes()&&brightness>.60f) {
    /* Telescope-style six rays in screen space, attached to a 3D point source. */
    float power=glow*transmission(star->pos,forward,opacity);
    int length=(int)(scale*(3+brightness*7));
    for(int t=-length;t<=length;t++)for(int a=0;a<3;a++) {
     float angle=a*1.04719755f;
     int px=cx+(int)(t*cosine(angle)),py=cy+(int)(t*sine(angle));
     if(px<0||px>=width||py<0||py>=height)continue;
     float k=power*.18f*(1-absf((float)t)/(length+1));int index=px+py*width;
     for(int j=0;j<3;j++)image_rgb[index][j]+=star->color[j]*k;
     image_alpha[index]=maxf(image_alpha[index],k);
    }
   }
   splat(star->pos,right,up,forward,width,height,span,maxf(.8f,2.0f*scale),.85f*glow,star->color);
   splat(star->pos,right,up,forward,width,height,span,maxf(.65f,.8f*scale),1.1f*glow,star->color);
   continue;
  }
  splat(star->pos,right,up,forward,width,height,span,maxf(1,8*scale),.23f*glow,star->color);
  splat(star->pos,right,up,forward,width,height,span,maxf(1,2.4f*scale),1.6f*glow,star->color);
  float white[3]={1,.98f,.94f};splat(star->pos,right,up,forward,width,height,span,maxf(.7f,.9f*scale),2*glow,white);
 }
 static const int bayer[16]={0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5};
 for(int y=0;y<height;y++)for(int x=0;x<width;x++) {
  int i=y*width+x;float a=image_alpha[i];
  float maxc=maxf(image_rgb[i][0],maxf(image_rgb[i][1],image_rgb[i][2]));
  a=maxf(a,clamp(maxc,0,1));
  for(int j=0;j<3;j++) {
   float c=a>.00001f?image_rgb[i][j]/a:0;
   if(nebula_get(DITHER)>.5f)c=((int)clamp(c*31+(bayer[(y%4)*4+x%4]/15.0f-.5f),0,31))/31.0f;
   rgba[i*4+j]=(uint8_t)(clamp(c,0,1)*nova_brightness(time)*255+.5f);
  }
  rgba[i*4+3]=(uint8_t)(clamp(a,0,1)*255+.5f);
 }
 return rgba;
}
