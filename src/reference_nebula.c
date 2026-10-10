#include "reference_nebula.h"
#include "volume.h"
/* Reference photographs guide color; gas is a full, turbulent 3D field. */
#define SIDE 64
#define CELLS (SIDE*SIDE*SIDE)
static uint8_t cloud[NEBULA_MAX*NEBULA_MAX*4],depth[NEBULA_MAX*NEBULA_MAX*4];
static float field[CELLS][4],stars[64*11],original_stars[64*11];
static int iw,ih,count,spikes,profile;
static float clamp(float x,float a,float b){return x<a?a:x>b?b:x;}
static float maxf(float a,float b){return a>b?a:b;}
static float mix(float a,float b,float t){return a+(b-a)*t;}
static float smooth(float a,float b,float x){x=clamp((x-a)/(b-a),0,1);return x*x*(3-2*x);}
static float sine(float x){
 x-=(int)(x/6.2831853f)*6.2831853f;
 if(x>3.1415927f)x-=6.2831853f;
 if(x< -3.1415927f)x+=6.2831853f;
 if(x>1.5707963f)x=3.1415927f-x;
 if(x< -1.5707963f)x=-3.1415927f-x;
 float q=x*x;return x*(1+q*(-1.0f/6+q*(1.0f/120+q*(-1.0f/5040+q/362880))));
}
static uint32_t hash(uint32_t n){n^=n>>16;n*=0x7feb352du;n^=n>>15;n*=0x846ca68bu;return n^(n>>16);}
uint8_t *nebula_reference_cloud_buffer(void){return cloud;}
uint8_t *nebula_reference_depth_buffer(void){return depth;}
float *nebula_reference_stars_buffer(void){return stars;}
void nebula_reference_set(int w,int h,int n,int s,int p){
 iw=w>0&&w<=NEBULA_MAX&&h>0&&h<=NEBULA_MAX?w:0;ih=iw?h:0;
 count=iw?(int)clamp(n,0,64):0;spikes=s;profile=(int)clamp(p,0,3);
 for(int i=0;i<count*11;i++)original_stars[i]=stars[i];
}
int nebula_reference_active(void){return iw>0;}
int nebula_reference_star_count(void){return count;}
int nebula_reference_spikes(void){return spikes;}
static void photograph(float u,float v,float out[3]){
 /* Broad color only: average across neighboring regions, not sharp filaments. */
 for(int j=0;j<3;j++)out[j]=0;
 for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++){
  int x=(int)clamp((u+dx*.045f)*iw,0,iw-1),y=(int)clamp((v+dy*.045f)*ih,0,ih-1);
  for(int j=0;j<3;j++)out[j]+=cloud[(x+y*iw)*4+j]/(255.0f*9);
 }
}
static float blob(float x,float y,float z,float cx,float cy,float cz,float rx,float ry,float rz){
 x=(x-cx)/rx;y=(y-cy)/ry;z=(z-cz)/rz;
 float f=maxf(0,1-x*x-y*y-z*z);return f*f;
}
static float structure(float x,float y,float z,float color[3]){
 float a,b,c,d,envelope,t;
 if(profile==0){
  a=blob(x,y,z,0,0,0,1.10f,.95f,.94f);
  b=blob(x,y,z,.14f,-.13f,-.12f,.60f,.63f,.59f);
  c=blob(x,y,z,-.24f,.19f,.05f,.34f,.37f,.50f);
  envelope=(a*.72f+b*.9f)*(1-c*.88f);
  t=clamp(b*2,0,1);
  color[0]=mix(.65f,.52f,t);color[1]=mix(.15f,.76f,t);color[2]=mix(.22f,.73f,t);
 }else if(profile==1){
  a=blob(x,y,z,-.19f,-.37f,.02f,.42f,.80f,.53f);
  b=blob(x,y,z,-.10f,.26f,0,.52f,.39f,.56f);
  c=blob(x,y,z,.40f,.05f,.14f,.49f,.20f,.27f)+blob(x,y,z,.66f,.29f,.07f,.19f,.38f,.29f);
  d=blob(x,y,z,-.49f,-.70f,-.22f,.20f,.46f,.25f)+blob(x,y,z,.08f,-.69f,.24f,.21f,.45f,.26f);
  envelope=maxf(maxf(a,b),maxf(c*.85f,d));
  t=smooth(-.25f,.55f,y);
  color[0]=mix(.68f,1,t);color[1]=mix(.26f,.80f,t);color[2]=mix(.055f,.34f,t);
 }else if(profile==2){
  float cx=-.18f+.27f*sine(y*4.4f+z*1.9f);
  a=blob(x,y,z,cx,0,0,.57f,1.13f,.73f);
  b=blob(x,y,z,-.40f,-.50f,.31f,.55f,.59f,.52f);
  c=blob(x,y,z,.61f,.56f,.12f,.48f,.59f,.56f);
  d=blob(x,y,z,-.06f,-.21f,-.12f,.24f,.31f,.39f);
  envelope=(maxf(a,b)*1.1f+c*.40f)*(1-d*.90f);
  t=clamp(c*3,0,1);
  color[0]=mix(.73f,.12f,t);color[1]=mix(.51f,.38f,t);color[2]=mix(.21f,.85f,t);
 }else{
  a=blob(x,y,z,-.43f,-.12f,-.10f,.71f,.84f,.74f);
  b=blob(x,y,z,.55f,.04f,.12f,.58f,.55f,.60f);
  c=blob(x,y,z,-.51f,.72f,.17f,.39f,.41f,.47f);
  d=blob(x,y,z,.56f,.09f,.07f,.32f,.29f,.36f);
  envelope=a*.95f+b*(1-d*.94f)+c*.35f;
  t=smooth(-.05f,.42f,x);
  color[0]=mix(.95f,.91f,t);color[1]=mix(.69f,.10f,t);color[2]=mix(.35f,.26f,t);
  float blue=clamp(c*3,0,.8f);color[0]=mix(color[0],.15f,blue);color[1]=mix(color[1],.39f,blue);color[2]=mix(color[2],.8f,blue);
 }
 return envelope;
}
void nebula_reference_seed(unsigned seed){
 float scale=nebula_get(SCALE),warp=nebula_get(WARP),cutoff=nebula_get(THRESHOLD);
 int octaves=(int)nebula_get(OCTAVES);
 for(int iz=0;iz<SIDE;iz++)for(int iy=0;iy<SIDE;iy++)for(int ix=0;ix<SIDE;ix++){
  int i=ix+SIDE*(iy+SIDE*iz);
  float x=(float)ix/(SIDE-1)*2.5f-1.25f,y=(float)iy/(SIDE-1)*2.5f-1.25f,z=(float)iz/(SIDE-1)*2.5f-1.25f;
  float wx=nebula_noise3(x*2+5,y*2+5,z*2+5,seed+31,16)-.5f;
  float wy=nebula_noise3(x*2+5,y*2+5,z*2+5,seed+711,16)-.5f;
  float wz=nebula_noise3(x*2+5,y*2+5,z*2+5,seed+1301,16)-.5f;
  float px=x+wx*warp*.26f,py=y+wy*warp*.26f,pz=z+wz*warp*.26f;
  float color[3],envelope=structure(px,py,pz,color);
  float n=nebula_fbm3(px*.5f+.5f,py*.5f+.5f,pz*.5f+.5f,seed,scale,octaves,nebula_get(PERSISTENCE),nebula_get(LACUNARITY));
  float fine=nebula_noise3(px*13+20,py*13+20,pz*13+20,seed+91,64);
  float filaments=1-__builtin_fabsf(2*fine-1);
  float turbulence=smooth(.28f+cutoff*.3f,.76f,n);
  float density=envelope*(.16f+2.1f*turbulence)*(.18f+.82f*filaments*filaments);
  float photo[3];photograph(.5f+x/2.3f+z*.13f,.5f-y/2.3f+z*.08f,photo);
  float peak=maxf(.08f,maxf(photo[0],maxf(photo[1],photo[2])));
  float brightness=.60f+.90f*turbulence;
  for(int j=0;j<3;j++)field[i][j]=mix(color[j],photo[j]/peak*.80f,.23f)*brightness;
  field[i][3]=density;
 }
 for(int i=0;i<count;i++){
  for(int j=0;j<11;j++)stars[i*11+j]=original_stars[i*11+j];
  stars[i*11+2]=((hash(seed+i*991u)&65535)/65535.0f-.5f)*2.15f;
 }
}
void nebula_reference_cell(float x,float y,float z,float time,float out[4]){
 for(int j=0;j<4;j++)out[j]=0;
 if(!iw)return;
 float stretch=nebula_get(STRETCH);x/=stretch;y*=__builtin_sqrtf(stretch);
 /* Diverging flows deform the field throughout its depth, including side views. */
 float flow=.045f+.06f*nebula_get(WARP);
 float xx=x+flow*sine(y*3.4f+z*2+time*.30f);
 float yy=y+flow*sine(z*3.1f-x*2+time*.23f+2);
 float zz=z+flow*sine(x*3.3f+y*2-time*.27f+4);
 x=(xx+1.25f)*(SIDE-1)/2.5f;y=(yy+1.25f)*(SIDE-1)/2.5f;z=(zz+1.25f)*(SIDE-1)/2.5f;
 if(x<0||y<0||z<0||x>=SIDE-1||y>=SIDE-1||z>=SIDE-1)return;
 int ix=(int)x,iy=(int)y,iz=(int)z,index=ix+SIDE*(iy+SIDE*iz);
 float a=x-ix,b=y-iy,c=z-iz;
 for(int j=0;j<4;j++){
  float lo=mix(mix(field[index][j],field[index+1][j],a),mix(field[index+SIDE][j],field[index+SIDE+1][j],a),b);
  int hi=index+SIDE*SIDE;
  out[j]=mix(lo,mix(mix(field[hi][j],field[hi+1][j],a),mix(field[hi+SIDE][j],field[hi+SIDE+1][j],a),b),c);
 }
 for(int j=0;j<3;j++)out[j]*=nebula_get(EXPOSURE)*1.20f;
 out[3]*=.7f+nebula_get(SOFTNESS)*.67f;
}
