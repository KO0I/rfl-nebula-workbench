#include "rfl_nebula_export.h"
#include "volume.h"
#include "nova.h"

#define HEADER 160u
#define MAX_BYTES (20u*1024u*1024u)
static uint8_t output[MAX_BYTES];
static unsigned output_size;
static void u32(unsigned at,uint32_t v) {
 for(unsigned k=0;k<4;k++)output[at+k]=(uint8_t)(v>>(8*k));
}
static void f32(unsigned at,float v) { union {float f;uint32_t u;} b;b.f=v;u32(at,b.u); }
static uint8_t byte(float v) { return v<=0?0:v>=255?255:(uint8_t)(v+.5f); }
static uint32_t checksum(unsigned end) {
 uint32_t h=2166136261u;
 for(unsigned i=0;i<end;i++)h=(h^(i>=68&&i<72?0:output[i]))*16777619u;
 return h;
}
unsigned nebula_export_rfl_size(void) { return output_size; }
uint8_t *nebula_export_rfl(unsigned seed,int side) {
 static const float nova_times[16]={0,5.9f,6,6.6f,7.4f,8.5f,10,12,14,16,18,20,22,24,26,28};
 const char magic[8]={'R','F','L','N','E','B','1',0};
 int nova=nebula_space_get(NOVA_MODE)>.5f,frames=nova?16:8,levels=0;
 unsigned at=HEADER,stride=0;
 output_size=0;
 if(side!=16&&side!=32&&side!=64)return 0;
 for(int n=side;n>=8;n/=2){stride+=(unsigned)n*n*n*4;levels++;}
 nebula_space_build(seed);nebula_space_bake(nova?22:0);
 unsigned stars=(unsigned)nebula_space_star_count(),jets=(unsigned)nebula_space_jet_count();
 unsigned size=HEADER+stars*48+(unsigned)frames*4+stride*(unsigned)frames;
 if(size>MAX_BYTES)return 0;
 for(unsigned i=0;i<HEADER;i++)output[i]=0;
 for(int i=0;i<8;i++)output[i]=(uint8_t)magic[i];
 u32(8,HEADER);u32(12,1);u32(16,(unsigned)side);u32(20,(unsigned)levels);
 u32(24,(unsigned)frames);u32(28,stars);u32(32,nova?3:1);u32(36,seed);
 f32(40,nova?30:12);f32(44,1.25f);f32(48,nebula_get(OPACITY)*2.7f);
 f32(52,nebula_space_get(STAR_GLOW));f32(56,nebula_space_get(JET_LENGTH));
 f32(60,4);u32(64,size);f32(72,nova?22:0);
 /* Store the complete recipe for future rebakes in a separate .json export;
  * the game only consumes this bounded runtime representation. */
 const char *name=nova?"Nova":"Workbench Nebula";
 for(unsigned i=0;name[i]&&i<63;i++)output[96+i]=(uint8_t)name[i];
 const float *records=nebula_space_stars();
 for(unsigned s=0;s<stars;s++) {
  for(int j=0;j<11;j++)f32(at+(unsigned)j*4,records[s*11+j]);
  u32(at+44,s<jets?1:0);at+=48;
 }
 for(int f=0;f<frames;f++){f32(at,nova?nova_times[f]:(float)f*1.5f);at+=4;}
 for(int f=0;f<frames;f++) {
  nebula_space_bake(nova?nova_times[f]:(float)f*1.5f);
  unsigned prev=at;
  for(int z=0;z<side;z++)for(int y=0;y<side;y++)for(int x=0;x<side;x++) {
   float c[4];
   nebula_space_cell(((x+.5f)/side-.5f)*2.5f,((y+.5f)/side-.5f)*2.5f,((z+.5f)/side-.5f)*2.5f,c);
   for(int j=0;j<3;j++)output[at++]=byte(c[j]*(255.0f/4));
   output[at++]=byte(c[3]*255);
  }
  for(int n=side/2;n>=8;n/=2) {
   unsigned current=at,pn=(unsigned)n*2;
   for(int z=0;z<n;z++)for(int y=0;y<n;y++)for(int x=0;x<n;x++) {
    unsigned sum[4]={0,0,0,0};
    for(unsigned dz=0;dz<2;dz++)for(unsigned dy=0;dy<2;dy++)for(unsigned dx=0;dx<2;dx++) {
     unsigned p=prev+4*((unsigned)x*2+dx+pn*((unsigned)y*2+dy+pn*((unsigned)z*2+dz)));
     for(int j=0;j<3;j++)sum[j]+=(unsigned)output[p+j]*output[p+3];
     sum[3]+=output[p+3];
    }
    for(int j=0;j<3;j++)output[at++]=sum[3]?(uint8_t)((sum[j]+sum[3]/2)/sum[3]):0;
    output[at++]=(uint8_t)((sum[3]+4)/8);
   }
   prev=current;
  }
 }
 u32(68,checksum(size));output_size=size;return output;
}
