#include "comet.h"
#include "volume.h"

typedef struct { float x,y,z; } V;
static V axis, side, up, head;
static float length,width,turb,age,activity,geometry[9],phase;
static unsigned seed;
static int profile;
static int tail_only;
#define SLICES 256
#define PLANET_RADIUS .065f
typedef struct {float a,b,radius,power;} Strand;
typedef struct {float a,b,spread,fade;Strand strand[7];} Slice;
static Slice slices[SLICES];
static float maxf(float a,float b){return a>b?a:b;}
static float minf(float a,float b){return a<b?a:b;}
static float clamp(float a,float l,float h){return maxf(l,minf(a,h));}
static float smooth(float a,float b,float x){x=clamp((x-a)/(b-a),0,1);return x*x*(3-2*x);}
static V v(float x,float y,float z){V q={x,y,z};return q;}
static V add(V a,V b){return v(a.x+b.x,a.y+b.y,a.z+b.z);}
static V mul(V a,float t){return v(a.x*t,a.y*t,a.z*t);}
static float dot(V a,V b){return a.x*b.x+a.y*b.y+a.z*b.z;}
static float sine(float x){
 x-=(int)(x/6.283185307f)*6.283185307f;
 if(x>3.141592654f)x-=6.283185307f;
 if(x< -3.141592654f)x+=6.283185307f;
 if(x>1.570796327f)x=3.141592654f-x;
 if(x< -1.570796327f)x=-3.141592654f-x;
 float q=x*x;return x*(1+q*(-1.0f/6+q*(1.0f/120+q*(-1.0f/5040+q/362880))));
}
static float cosine(float x){return sine(x+1.570796327f);}
static float noise(float x,float y,float z){return nebula_noise3(x,y,z,seed,64);}

void nebula_comet_prepare(unsigned s,float time){
 seed=s;profile=(int)nebula_space_get(COMET_MODE);
 length=nebula_space_get(COMET_LENGTH);width=nebula_space_get(COMET_WIDTH);
 turb=nebula_space_get(COMET_TURBULENCE);age=time*nebula_space_get(COMET_FLOW);
 tail_only=nebula_space_get(COMPACT_MODE)>4.5f && profile==0;
 if(tail_only){profile=1;length=1; width=.19f;turb=.8f;age=time*.35f;}
 phase=(s%997)*.006302f;
 float az=nebula_space_get(COMET_STAR_BEARING)*.01745329252f;
 float el=nebula_space_get(COMET_STAR_ELEVATION)*.01745329252f;
 /* The star bearing describes the vector FROM the body TO the star. */
 V toward=v(cosine(az)*cosine(el),sine(el),sine(az)*cosine(el));
 head=mul(toward,length*.43f);
 float distance=nebula_space_get(COMET_DISTANCE);
 V star=add(head,mul(toward,distance));
 V away=add(head,mul(star,-1));
 axis=mul(away,1/__builtin_sqrtf(dot(away,away)));
 side=v(-sine(az),0,cosine(az));
 up=v(-cosine(az)*sine(el),cosine(el),-sine(az)*sine(el));
 geometry[0]=head.x;geometry[1]=head.y;geometry[2]=head.z;
 geometry[3]=star.x;geometry[4]=star.y;geometry[5]=star.z;
 geometry[6]=axis.x;geometry[7]=axis.y;geometry[8]=axis.z;
 /* Requested visual rule, not a physical atmospheric escape model. */
 activity=profile==3?(distance<=.387f?.70f:0):1;
 /* Precompute the moving filament skeleton once per frame, not per ray step.
  * Cross-sections remain volumetric; the broad haze samples full 3D noise. */
 for(int i=0;i<SLICES;i++){
  float t=(float)i/(SLICES-1),growth=smooth(0,.22f,t),u=t*9-age*.48f;
  Slice *s=&slices[i];s->spread=width*(.10f+.9f*t);
  if(profile==3){
   /* Sodium streams along fixed, straight anti-stellar rays. Animate density
    * downstream, never the centerline, fan angles, or filament widths. */
   s->a=s->b=0;
   /* Launch across the whole planetary disk; width controls downstream spread. */
   s->spread=PLANET_RADIUS/__builtin_sqrtf(2.8f)+width*.9f*t;
   s->fade=(1-.55f*t)*(1-smooth(.65f,1,t))*smooth(0,.018f,t);
   for(int k=0;k<7;k++){
    int band=k==0?0:1+(k-1)%3;
    float angle=(k-1)*1.047197551f+phase,fan=k==0?0:PLANET_RADIUS*.6f+width*.65f*t;
    float n=noise(u+band*3.7f,band*.91f,phase);
    s->strand[k].a=cosine(angle)*fan;
    s->strand[k].b=sine(angle)*fan;
    s->strand[k].radius=PLANET_RADIUS*.4f+width*.20f*t;
    s->strand[k].power=maxf(.08f,.55f+minf(turb,1.5f)*.55f*(2*n-1))*(k==0?1.9f:1.1f);
   }
   continue;
  }
  float warp=turb*s->spread*growth;
  s->a=warp*(.50f*sine(t*16-age*.8f+phase)+.22f*sine(t*33-age*1.6f));
  s->b=warp*.4f*cosine(t*13-age*.65f+phase);
  s->fade=(1-.55f*t)*(1-smooth(.65f,1,t))*smooth(0,.018f,t);
  for(int k=0;k<7;k++){
   float angle=k*2.399963f+phase,fan=k==0?0:(.40f+.11f*k)*s->spread;
   float n=noise(u+k*3.7f,k*.91f,phase);
   float flutter=warp*(.3f*sine(t*27-age*1.1f+k*1.7f)+.7f*(n-.5f));
   s->strand[k].a=cosine(angle)*fan+flutter;
   s->strand[k].b=sine(angle)*fan+flutter*.6f;
   s->strand[k].radius=width*(.14f+.20f*t)*(profile==2?1.25f:1)*(.7f+n*.65f);
   s->strand[k].power=(.04f+.96f*smooth(.32f,.75f,n))*(k==0?1.9f:1.1f);
  }
 }
}
const float *nebula_comet_geometry(void){return geometry;}
float nebula_comet_extent(void){return maxf(.75f,nebula_space_get(COMET_LENGTH)*.65f+.18f);}

static void comet_local_cell(float axial,float a,float b,float r2,float out[4]){
 for(int j=0;j<4;j++)out[j]=0;
 float core=profile==3?PLANET_RADIUS:.015f;
 if(!tail_only && r2<core*core){
  float heat=clamp(.5f-axial/(core*2),0,1);
  out[0]=profile==3?.25f+.9f*heat:1.4f;
  out[1]=profile==3?.12f+.5f*heat:1.5f;
  out[2]=profile==3?.04f+.14f*heat:1.45f;
  out[3]=160;return;
 }
 if(activity==0)return;
 float comaRadius=profile==3?.11f:.19f;
 float coma=1-smooth(core*.6f,comaRadius,__builtin_sqrtf(r2));
 coma=tail_only?0:coma*coma*(profile==3?2.4f:8.0f);
 float t=axial/length,tail=0,haze=0;
 if(t>0 && t<1){
  float fi=t*(SLICES-1);int index=(int)fi;float f=fi-index;
  const Slice *lo=&slices[index],*hi=&slices[index+1];
  float aa=a-(lo->a+(hi->a-lo->a)*f),bb=b-(lo->b+(hi->b-lo->b)*f);
  float spread=lo->spread+(hi->spread-lo->spread)*f;
  if(aa*aa+bb*bb<spread*spread*7+.002f){
   int strands=profile==2?3:7;
   for(int k=0;k<strands;k++){
    const Strand *l=&lo->strand[k],*h=&hi->strand[k];
    float ca=l->a+(h->a-l->a)*f,cb=l->b+(h->b-l->b)*f;
    float tube=l->radius+(h->radius-l->radius)*f;
    float rr=((aa-ca)*(aa-ca)+(bb-cb)*(bb-cb))/(tube*tube);
    if(rr<1)tail+=(1-rr)*(1-rr)*(l->power+(h->power-l->power)*f);
   }
   float rad=(aa*aa+bb*bb)/(spread*spread*2.8f);
   if(rad<1){
    /* Radial noise keeps sodium haze centered while its density advects. */
    float n=profile==3?noise(t*6.3f-age*.336f,rad*2+phase,phase):noise(t*6.3f-age*.336f,aa*18+phase,bb*18);
    haze=(1-rad)*(1-rad)*(.10f+.8f*n*n);
   }
   float fade=lo->fade+(hi->fade-lo->fade)*f;
   tail*=fade*9;haze*=fade*6;
  }
 }
 float d=(coma+tail+haze)*activity;
 if(d<.00001f)return;
 float c=coma/maxf(.00001f,coma+tail+haze);
 float white=tail_only?0:1-smooth(core*1.1f,.08f,__builtin_sqrtf(r2));
 float tailColor[3]={profile==2?.20f:.34f,profile==2?.78f:.64f,1.05f};
 float headColor[3]={.24f,.98f,.70f};
 if(profile==3){tailColor[0]=1;tailColor[1]=.72f;tailColor[2]=.20f;headColor[0]=1;headColor[1]=.8f;headColor[2]=.30f;}
 for(int j=0;j<3;j++)out[j]=(tailColor[j]*(1-c)+headColor[j]*c)*(1-white)+white*1.35f;
 out[3]=d;
}

/* Shared tail-only sampler in local axial coordinates; no nucleus or coma. */
void nebula_comet_tail_cell(float axial,float a,float b,float out[4]){
 comet_local_cell(axial,a,b,axial*axial+a*a+b*b,out);
}
void nebula_comet_cell(float x,float y,float z,float out[4]){
 V q=add(v(x,y,z),mul(head,-1));
 comet_local_cell(dot(q,axis),dot(q,side),dot(q,up),dot(q,q),out);
}

void nebula_comet_render(const float rv[3],const float uv[3],const float fv[3],
 int w,int h,float span,float (*rgb)[3],float *alpha,unsigned char *density){
 V right=v(rv[0],rv[1],rv[2]),vertical=v(uv[0],uv[1],uv[2]),forward=v(fv[0],fv[1],fv[2]);
 float exposure=nebula_get(EXPOSURE),opacity=nebula_get(OPACITY);
 /* Intersect one conservative ellipsoid, avoiding empty space. */
 V center=add(head,mul(axis,length*.45f));
 float along=length*.65f+.15f,across=width*3.5f+.16f;
 float ia=1/(along*along),ib=1/(across*across),df=dot(forward,axis);
 float qa=df*df*ia+(1-df*df)*ib;
 for(int y=0;y<h;y++)for(int x=0;x<w;x++){
  int i=x+y*w;rgb[i][0]=rgb[i][1]=rgb[i][2]=0;alpha[i]=0;density[i]=0;
  V origin=add(mul(right,(x+.5f-w*.5f)/h*span),mul(vertical,(h*.5f-y-.5f)/h*span));
  V oc=add(origin,mul(center,-1));float oa=dot(oc,axis),of=dot(oc,forward);
  float qb=2*(oa*df*ia+(of-oa*df)*ib);
  float qc=oa*oa*ia+(dot(oc,oc)-oa*oa)*ib-1,det=qb*qb-4*qa*qc;
  if(det<=0)continue;
  float root=__builtin_sqrtf(det),near=(-qb-root)/(2*qa),far=(-qb+root)/(2*qa);
  float ds=maxf(.004f,minf(.016f,width*.12f)),trans=1,column=0;
  /* Fixed per-ray jitter, so pausing gives bit-identical images. */
  float jitter=((x*1973+y*9277+89173)&255)/255.0f;
  for(float depth=near+ds*jitter;depth<far && trans>.003f;depth+=ds){
   V q=add(origin,mul(forward,depth));float c[4];nebula_comet_cell(q.x,q.y,q.z,c);
   if(c[3]<=0)continue;
   float a=1-1/(1+c[3]*ds*opacity*2.7f);
   for(int j=0;j<3;j++)rgb[i][j]+=trans*a*c[j]*exposure;
   trans*=1-a;column+=c[3]*ds;
  }
  alpha[i]=1-trans;density[i]=(unsigned char)(clamp(column,0,1)*255+.5f);
 }
}
