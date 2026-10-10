#include "image_texture.h"
static uint8_t source[NEBULA_MAX*NEBULA_MAX*4];
static uint8_t output[NEBULA_MAX*NEBULA_MAX*4],density[NEBULA_MAX*NEBULA_MAX];
static int iw,ih;
static float clamp(float x,float lo,float hi){return x<lo?lo:x>hi?hi:x;}
static float maxf(float a,float b){return a>b?a:b;}
uint8_t *nebula_image_buffer(void){return source;}
void nebula_image_set(int w,int h){
 iw=w>0&&w<=NEBULA_MAX&&h>0&&h<=NEBULA_MAX?w:0;ih=iw?h:0;
}
int nebula_image_active(void){return iw>0;}
void nebula_image_sample(float u,float v,float out[4]){
 for(int j=0;j<4;j++)out[j]=0;
 if(!iw||u<0||v<0||u>=1||v>=1)return;
 int i=((int)(u*iw)+iw*(int)(v*ih))*4;
 for(int j=0;j<4;j++)out[j]=source[i+j]/255.0f;
}
uint8_t *nebula_image_density(void){return density;}
uint8_t *nebula_image_render(int width,int height){
 width=(int)clamp(width,1,NEBULA_MAX);height=(int)clamp(height,1,NEBULA_MAX);
 float exposure=nebula_get(EXPOSURE),opacity=nebula_get(OPACITY);
 for(int y=0;y<height;y++)for(int x=0;x<width;x++){
  float c[4];int i=x+y*width;
  nebula_image_sample((x+.5f)/width,(y+.5f)/height,c);
  for(int j=0;j<3;j++)output[i*4+j]=(uint8_t)(clamp(c[j]*exposure,0,1)*255+.5f);
  output[i*4+3]=(uint8_t)(c[3]*opacity*255+.5f);
  density[i]=(uint8_t)(__builtin_sqrtf(maxf(c[0],maxf(c[1],c[2])))*c[3]*255+.5f);
 }
 return output;
}
