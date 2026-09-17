#include "volume.h"
#include "nova.h"
#include "noctis_glare.h"

#define NS 64
#define NN (NS*NS*NS)
#define VS VOLUME_SIDE
#define VN (VS*VS*VS)
#define HALF 1.25f

typedef struct { float x,y,z; } Vec;
typedef struct { Vec pos; float radius; Vec axis; float color[3],phase; } Star;
static float noise_grid[NN], gas[VN], envelope[VN], rim[VN][3];
static float image_rgb[NEBULA_MAX*NEBULA_MAX][3], image_alpha[NEBULA_MAX*NEBULA_MAX];
static uint8_t rgba[NEBULA_MAX*NEBULA_MAX*4], projected_density[NEBULA_MAX*NEBULA_MAX];
static Star stars[STAR_LIMIT];
static float settings[SPACE_PARAM_COUNT]={18,.19f,.28f,1,.48f,1,0};
static int star_count,jet_count,built;
static unsigned last_seed;
static NovaState nova;
static float noise_key[7],last_time=-9999;

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
static uint32_t hash(uint32_t n) { n^=n>>16;n*=0x7feb352du;n^=n>>15;n*=0x846ca68bu;return n^(n>>16); }
static float randomf(uint32_t *s) { *s=hash(*s+0x9e3779b9u);return (*s&0xffffff)/16777215.0f; }
/* Explicit sequencing makes exported recipes identical across C compilers. */
static Vec random_vec(uint32_t *s) { float x=randomf(s)*2-1;float y=randomf(s)*2-1;float z=randomf(s)*2-1;return vec(x,y,z); }

void nebula_space_set(int i,float value) {
 static const float lo[SPACE_PARAM_COUNT]={0,0,0,0,.1f,.5f,0};
 static const float hi[SPACE_PARAM_COUNT]={STAR_LIMIT,.4f,1,2.5f,.9f,1.7f,1};
 if(i>=0&&i<SPACE_PARAM_COUNT)settings[i]=clamp(value,lo[i],hi[i]);
}
float nebula_space_get(int i) { return i>=0&&i<SPACE_PARAM_COUNT?settings[i]:0; }
int nebula_space_star_count(void) { return star_count; }
int nebula_space_jet_count(void) { return settings[NOVA_MODE]>.5f && nova.remnant<=.01f?0:jet_count; }
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
float nebula_space_sample(float x,float y,float z) {
 x=(x+HALF)*((VS-1)/(2*HALF));y=(y+HALF)*((VS-1)/(2*HALF));z=(z+HALF)*((VS-1)/(2*HALF));
 if(x<0||y<0||z<0||x>=VS-1||y>=VS-1||z>=VS-1)return 0;
 int ix=(int)x,iy=(int)y,iz=(int)z,i=ix+VS*(iy+VS*iz);float a=x-ix,b=y-iy,c=z-iz;
 float l=mix(mix(gas[i],gas[i+1],a),mix(gas[i+VS],gas[i+VS+1],a),b);
 i+=VS*VS;float h=mix(mix(gas[i],gas[i+1],a),mix(gas[i+VS],gas[i+VS+1],a),b);
 return mix(l,h,c);
}
static int voxel(Vec q) {
 int x=(int)clamp((q.x+HALF)*((VS-1)/(2*HALF)),0,VS-1),y=(int)clamp((q.y+HALF)*((VS-1)/(2*HALF)),0,VS-1),z=(int)clamp((q.z+HALF)*((VS-1)/(2*HALF)),0,VS-1);
 return x+VS*(y+VS*z);
}
static float shape(Vec q) {
 float stretch=nebula_get(STRETCH),soft=nebula_get(SOFTNESS);
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
 static const float colors[6][3]={{.48f,.75f,1},{1,.68f,.42f},{1,.42f,.63f},{.68f,.48f,1},{.48f,1,.85f},{1,.93f,.70f}};
 if(settings[NOVA_MODE]>.5f) {
  uint32_t rng=seed+97987u;Star *s=&stars[0];
  star_count=1;jet_count=nebula_nova_jet_seed(seed);
  s->pos=vec(0,0,0);s->radius=settings[CAVITY_RADIUS];
  s->axis=normal(random_vec(&rng));
  s->color[0]=.64f;s->color[1]=.85f;s->color[2]=1;s->phase=randomf(&rng)*6.2831853f;
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
 }
}
void nebula_space_build(unsigned seed) {
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
  float cut=1;rim[i][0]=rim[i][1]=rim[i][2]=0;
  for(int s=0;s<star_count;s++) {
   Vec diff=add(q,mul(stars[s].pos,-1));float d2=dot(diff,diff),r2=stars[s].radius*stars[s].radius;
   if(r2<.000001f)continue;
   cut=minf(cut,smooth(r2*.72f,r2*1.22f,d2));
   float shell=smooth(r2*.7f,r2*1.22f,d2)*(1-smooth(r2*1.22f,r2*2.7f,d2));
   for(int j=0;j<3;j++)rim[i][j]+=stars[s].color[j]*shell*.55f;
  }
  envelope[i]=shape(q)*cut;
 }
 built=1;last_seed=seed;last_time=-9999;
}
static void animate_gas(float time) {
 if(absf(time-last_time)<.00001f)return;
 int is_nova=settings[NOVA_MODE]>.5f;
 if(is_nova)stars[0].radius=nova.clearing;
 float threshold=is_nova?nova.cutoff:nebula_get(THRESHOLD),soft=nebula_get(SOFTNESS);
 if(is_nova && nova.radius<=0) {
  for(int i=0;i<VN;i++)gas[i]=0;
  last_time=time;return;
 }
 for(int z=0;z<VS;z++)for(int y=0;y<VS;y++)for(int x=0;x<VS;x++) {
  int i=x+VS*(y+VS*z);
  if(!is_nova && envelope[i]<.0001f){gas[i]=0;continue;}
  float u=(float)x/(VS-1),v=(float)y/(VS-1),w=(float)z/(VS-1);
  float mask=envelope[i];
  if(is_nova) {
   float xw=(u-.5f)*2*HALF,yw=(v-.5f)*2*HALF,zw=(w-.5f)*2*HALF;
   float d2=xw*xw+yw*yw+zw*zw;
   float r2=d2/(nova.radius*nova.radius),clear2=nova.clearing*nova.clearing;
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
  /* Keep early, low-cutoff ejecta textured instead of clipping to a white disc. */
  if(is_nova)d*=mix(.12f+.88f*a*a,1,nova.expansion);
  gas[i]=d*mask;
 }
 last_time=time;
}
void nebula_space_bake(float time) {
 nova=nebula_nova_at(time);
 animate_gas(time);
}
void nebula_space_cell(float x,float y,float z,float out[4]) {
 float d=nebula_space_sample(x,y,z);
 int c=(int)clamp(d*4.8f+.9f,0,5),v=voxel(vec(x,y,z));
 const uint8_t *palette=nebula_colors();
 for(int j=0;j<3;j++)
  out[j]=(palette[c*3+j]/255.0f+rim[v][j]*settings[STAR_GLOW]*1.35f)*nebula_get(EXPOSURE)*1.7f;
 out[3]=d;
}
/* Small splats are placed in 3D, then attenuated by gas between them and camera. */
static float transmission(Vec at,Vec forward,float opacity) {
 float t=1;const int steps=24;float ds=maxf(0,dot(at,forward)+2.25f)/steps;
 for(int k=1;k<=steps;k++) {Vec q=add(at,mul(forward,-k*ds));float d=nebula_space_sample(q.x,q.y,q.z);t/=1+d*ds*opacity*2.7f;}
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
 if(!built)nebula_space_build(42871);
 width=(int)clamp(width,1,NEBULA_MAX);height=(int)clamp(height,1,NEBULA_MAX);
 int is_nova=settings[NOVA_MODE]>.5f;
 nova=nebula_nova_at(time);
 zoom=clamp(zoom,.55f,2.2f);animate_gas(time);
 Vec right=vec(cosine(yaw),0,-sine(yaw));
 Vec up=vec(sine(yaw)*sine(pitch),cosine(pitch),cosine(yaw)*sine(pitch));
 Vec forward=vec(sine(yaw)*cosine(pitch),-sine(pitch),cosine(yaw)*cosine(pitch));
 float span=3.5f/zoom,ds=3.5f/96,opacity=nebula_get(OPACITY),exposure=nebula_get(EXPOSURE);
 const uint8_t *palette=nebula_colors();
 for(int y=0;y<height;y++)for(int x=0;x<width;x++) {
  int i=y*width+x;float tx=(x+.5f-width*.5f)/height*span,ty=(height*.5f-y-.5f)/height*span;
  Vec q=add(add(mul(right,tx),mul(up,ty)),mul(forward,-1.75f));
  q=add(q,mul(forward,ds*((hash((unsigned)(x+y*width))&255)/255.0f-.5f)));
  float trans=1,integral=0;image_rgb[i][0]=image_rgb[i][1]=image_rgb[i][2]=0;
  for(int k=0;k<96 && (!is_nova || nova.radius>0);k++) {
   q=add(q,mul(forward,ds));float d=nebula_space_sample(q.x,q.y,q.z);
   if(d<.002f)continue;
   integral+=d*ds;float a=1-1/(1+d*ds*opacity*2.7f);
   int c=(int)clamp(d*4.8f+.9f,0,5),v=voxel(q);
   for(int j=0;j<3;j++) {
    float light=palette[c*3+j]/255.0f+rim[v][j]*settings[STAR_GLOW]*1.35f;
    image_rgb[i][j]+=trans*a*light*exposure*1.7f;
   }
   trans*=1-a;
  }
  image_alpha[i]=1-trans;projected_density[i]=(uint8_t)(clamp(integral/1.3f,0,1)*255+.5f);
 }
 for(int s=0;s<star_count;s++) {
  Star *star=&stars[s];float scale=height/256.0f;
  if(s<jet_count && (!is_nova || nova.remnant>.01f)) {
   /* Either approaching lobe becomes an optical glare when viewed end-on.
    * Crossfade from 24 to 12 degrees; inside 12 degrees draw no cone splats. */
   float facing=dot(star->axis,forward);
   float glare=smooth(.91354546f,.97814760f,absf(facing));
   float cone=1-glare;
   if(glare>0 && settings[STAR_GLOW]>0) {
    float tint[3]={facing<0?.40f:1,facing<0?.82f:.44f,facing<0?1:.66f};
    if(is_nova){tint[0]=.55f;tint[1]=.82f;tint[2]=1;}
    float strength=3*glare*settings[STAR_GLOW]*(is_nova?nova.remnant:1);
    strength*=transmission(star->pos,forward,opacity)*(.88f+.12f*sine(time*3.5f+star->phase));
    int cx=(int)(dot(star->pos,right)/span*height+width*.5f);
    int cy=(int)(height*.5f-dot(star->pos,up)/span*height);
    nebula_noctis_glare_scaled(image_rgb,image_alpha,width,height,cx,cy,.82f,strength,tint);
   }
   if(cone>0)for(int side=-1;side<=1;side+=2) {
    float color[3]={side>0?.40f:1,side>0?.82f:.44f,side>0?1:.66f};
    if(is_nova){color[0]=.55f;color[1]=.82f;color[2]=1;}
    for(int k=1;k<=22;k++) {
     float t=(float)k/22,dist=t*settings[JET_LENGTH]*(is_nova?nova.remnant:1);
     Vec at=add(star->pos,mul(star->axis,dist*side));
     float knot=.5f+.5f*sine(t*28-time*3.5f+star->phase);
     knot=knot*knot*knot;
     float power=(.09f+.36f*knot)*(1-t*.7f)*settings[STAR_GLOW];
     power*=cone*(is_nova?nova.remnant:1);
     splat(at,right,up,forward,width,height,span,maxf(.7f,(1.1f+t*(is_nova?6.0f:2.3f))*scale),power,color);
    }
   }
  }
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
   rgba[i*4+j]=(uint8_t)(clamp(c,0,1)*255+.5f);
  }
  rgba[i*4+3]=(uint8_t)(clamp(a,0,1)*255+.5f);
 }
 return rgba;
}
