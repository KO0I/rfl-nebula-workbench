#include "nebula.h"
static uint8_t pixels[NEBULA_MAX*NEBULA_MAX*4], density[NEBULA_MAX*NEBULA_MAX];
static float field[NEBULA_MAX*NEBULA_MAX];
static float p[PARAM_COUNT]={5,5,.52f,2,1.2f,1,.35f,0,.32f,.55f,1,0,1.15f,.9f,1};
static uint8_t palette[6][3]={{9,9,27},{34,26,68},{82,46,121},{145,74,169},{225,136,208},{248,220,244}};
static int w=256,h=256;
static float clamp(float x,float a,float b) { return x<a?a:x>b?b:x; }
static float absf(float x) { return x<0?-x:x; }
static float smooth(float a,float b,float x) { x=clamp((x-a)/(b-a),0,1); return x*x*(3-2*x); }
static float maxf(float x,float y) { return x>y?x:y; }
static float minf(float x,float y) { return x<y?x:y; }
float nebula_get(int i) { return i>=0&&i<PARAM_COUNT?p[i]:0; }
const uint8_t *nebula_colors(void) { return &palette[0][0]; }
void nebula_set(int i,float v) {
 static const float lo[PARAM_COUNT]={1,1,.1f,1.2f,0,0,0,0,0,.05f,.4f,0,.2f,0,0};
 static const float hi[PARAM_COUNT]={14,8,.85f,3,3,1,1,3,.8f,1,2.5f,1,2.5f,1,1};
 if(i>=0&&i<PARAM_COUNT)p[i]=clamp(v,lo[i],hi[i]);
}
void nebula_palette(int i,int r,int g,int b) { if(i>=0&&i<6) {palette[i][0]=(uint8_t)clamp(r,0,255);palette[i][1]=(uint8_t)clamp(g,0,255);palette[i][2]=(uint8_t)clamp(b,0,255);} }
static float fbm(float x,float y,unsigned s,float scale) {return nebula_fbm(x,y,s,scale,(int)p[OCTAVES],p[PERSISTENCE],p[LACUNARITY]);}
void nebula_generate(int width,int height,unsigned seed) {
 w=(int)clamp(width,1,NEBULA_MAX);h=(int)clamp(height,1,NEBULA_MAX);
 for(int y=0;y<h;y++)for(int x=0;x<w;x++) {
  float u=(float)x/w,v=(float)y/h;
  float qx=fbm(u,v,seed+31,p[SCALE])-.5f,qy=fbm(u,v,seed+713,p[SCALE])-.5f;
  float ax=u+qx*p[WARP]*.4f,ay=v+qy*p[WARP]*.4f;
  float n=fbm(ax,ay,seed+117,p[SCALE]);
  if(p[LAYER2]>.5f) {float b=fbm(ax+qy*.19f,ay+qx*.19f,seed+331,p[SCALE]*2);float ridge=1-absf(b*2-1); n=n*(1-p[MIX])+(ridge*.74f)*p[MIX];}
  float xx=(u-.5f)*2,yy=(v-.5f)*2, mask=1;
  if(p[TILE]<.5f) {
   float bx=xx+qx*.45f,by=yy+qy*.45f;
   float r2=bx*bx/(p[STRETCH]*p[STRETCH])+by*by*p[STRETCH];
   if((int)p[MASK]==0)mask=1-smooth(.08f,1.0f+p[SOFTNESS]*.5f,r2);
   if((int)p[MASK]==2) {float ring=absf(r2-.38f);mask=1-smooth(.03f,.08f+p[SOFTNESS]*.6f,ring);}
   if((int)p[MASK]==1) {
    mask=0;
    for(int k=0;k<3;k++) {float top=-.63f+k*.18f;float center=-.47f+k*.45f+(yy+1)*.12f+qx*.18f;float radius=(.095f+(yy-top)*.11f)*p[STRETCH];float side=1-smooth(radius*.25f,radius+p[SOFTNESS]*.12f,absf(xx-center));float cap=smooth(top-.10f,top+.13f,yy);mask=maxf(mask,side*cap);}
    mask*=1-smooth(.68f,1.04f,yy);
   }
  }
  float d=smooth(p[THRESHOLD],minf(.99f,p[THRESHOLD]+.24f+p[SOFTNESS]*.32f),n)*mask;
  field[y*w+x]=d;density[y*w+x]=(uint8_t)(clamp(d,0,1)*255+.5f);
 }
}
uint8_t *nebula_density(void) {return density;}
uint8_t *nebula_render(int density_view) {
 static const int bayer[16]={0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5};
 for(int y=0;y<h;y++)for(int x=0;x<w;x++) {
  int i=y*w+x;float d=field[i];
  if(density_view) {pixels[i*4]=pixels[i*4+1]=pixels[i*4+2]=density[i];pixels[i*4+3]=255;continue;}
  float tone=clamp(d*p[EXPOSURE],0,1)*5;
  if(p[DITHER]>.5f)tone+=(bayer[(y%4)*4+x%4]/15.0f-.5f)*.8f;
  int c=(int)clamp(tone+.5f,0,5);
  for(int j=0;j<3;j++)pixels[i*4+j]=palette[c][j];
  pixels[i*4+3]=(uint8_t)(smooth(.005f,.48f,d)*p[OPACITY]*255+.5f);
 }
 return pixels;
}
