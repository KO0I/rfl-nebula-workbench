#include "noctis_glare.h"
#include <stdint.h>
/* Adapted from flare_hash2 / draw_noctis_dither_disc and the tuned Noctis
 * flare in the user's rfl_PLAYTEST/raycaster_planet.c. No image assets. */
static unsigned flare_hash2(int x,int y,unsigned seed) {
 unsigned h=(unsigned)x*1973u+(unsigned)y*9277u+seed*26699u+0x68bc21ebu;
 h^=h>>13;h*=1274126177u;return h^(h>>16);
}
static void put(float (*rgb)[3],float *alpha,int width,int height,int x,int y,const float color[3],float a) {
 if(x<0||y<0||x>=width||y>=height)return;
 int i=y*width+x;
 for(int j=0;j<3;j++)rgb[i][j]+=color[j]*a;
 if(a>alpha[i])alpha[i]=a>1?1:a;
}
static void glow(float (*rgb)[3],float *alpha,int width,int height,int cx,int cy,const float color[3],float a,int radius) {
 for(int y=-radius;y<=radius;y++)for(int x=-radius;x<=radius;x++) {
  float d=__builtin_sqrtf((float)(x*x+y*y));
  if(d>radius+.25f)continue;
  put(rgb,alpha,width,height,cx+x,cy+y,color,a*(1-d/(radius+.5f)));
 }
}
static void disc(float (*rgb)[3],float *alpha,int width,int height,int cx,int cy,float radius,const float color[3],float a,unsigned seed,float strength) {
 int rr=(int)radius+1;
 if(radius<1)radius=1;
 for(int y=-rr;y<=rr;y++)for(int x=-rr;x<=rr;x++) {
  float q2=(x*x+y*y)/(radius*radius);if(q2>1)continue;
  float coverage=a*(1-q2);
  if((flare_hash2(cx+x,cy+y,seed)&255u)/255.0f<=coverage)
   put(rgb,alpha,width,height,cx+x,cy+y,color,coverage*strength);
 }
}
static int rounded(float x) { return (int)(x+(x<0?-.5f:.5f)); }
void nebula_noctis_glare(float (*rgb)[3],float *alpha,int width,int height,int cx,int cy,float growth,const float tint[3]) {
 nebula_noctis_glare_scaled(rgb,alpha,width,height,cx,cy,growth,1,tint);
}
void nebula_noctis_glare_scaled(float (*rgb)[3],float *alpha,int width,int height,int cx,int cy,float growth,float strength,const float tint[3]) {
 if(growth<=.001f || strength<=0)return;
 float vis=growth*.80f,size=(height/256.0f)*.62f*(.28f+.72f*growth),shape=1.8f;
 float hot[3],cool[3];
 const float white[3]={1,.988f,.965f},blue[3]={.706f,.824f,1};
 for(int j=0;j<3;j++){hot[j]=tint[j]*.2f+white[j]*.8f;cool[j]=tint[j]*.58f+blue[j]*.42f;}
 float core=(6+vis*21)*size*(1.12f-shape*.07f);
 float halo=core*(2.55f+vis*2.1f+shape*.92f);
 disc(rgb,alpha,width,height,cx,cy,halo,cool,.035f+vis*.105f,0x91u,strength);
 disc(rgb,alpha,width,height,cx,cy,core*1.28f,hot,.16f+vis*.34f,0x43u,strength);
 glow(rgb,alpha,width,height,cx,cy,hot,(.32f+vis*.58f)*growth*strength,1+(growth>.45f));
 static const float direction[4][2]={{1,0},{.70710678f,.70710678f},{0,1},{-.70710678f,.70710678f}};
 for(int i=0;i<4;i++) {
  float len=(14+vis*(i&1?58:82))*size*shape;
  for(int n=1;n<=(int)len;n++) {
   float fade=(1-n/(len+1))*(.07f+vis*.13f)*growth*strength;
   int px=cx+rounded(direction[i][0]*n),py=cy+rounded(direction[i][1]*n);
   int qx=cx-rounded(direction[i][0]*n*.72f),qy=cy-rounded(direction[i][1]*n*.72f);
   if((flare_hash2(px,py,0x22u+i)&3u)!=0)glow(rgb,alpha,width,height,px,py,hot,fade,1);
   if((flare_hash2(qx,qy,0x53u+i)&3u)!=1)glow(rgb,alpha,width,height,qx,qy,cool,fade*.82f,1);
  }
 }
}
