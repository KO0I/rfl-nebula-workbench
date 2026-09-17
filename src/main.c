#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "nebula.h"
#include "volume.h"

int main(int argc,char **argv) {
 int nova=argc>1 && strcmp(argv[1],"--nova")==0;
 int volume=nova || (argc>1 && strcmp(argv[1],"--volume")==0);
 int first=volume?2:1;
 unsigned seed=argc>first?(unsigned)strtoul(argv[first],0,10):42871;
 const char *path=argc>first+1?argv[first+1]:"nebula.ppm";
 float time=argc>first+2?strtof(argv[first+2],0):0;
 float yaw=argc>first+3?strtof(argv[first+3],0):0;
 float pitch=argc>first+4?strtof(argv[first+4],0):.2f;
 uint8_t *rgba;
 if(volume) {
  nebula_set(THRESHOLD,.38f);nebula_set(EXPOSURE,.95f);nebula_set(OPACITY,.78f);
  nebula_space_set(CAVITY_RADIUS,.23f);nebula_space_set(STAR_GLOW,.8f);
  if(nova) {
   const int colors[6][3]={{6,14,33},{18,43,79},{44,88,142},{98,143,197},{171,215,245},{237,249,255}};
   for(int i=0;i<6;i++)nebula_palette(i,colors[i][0],colors[i][1],colors[i][2]);
   nebula_set(SCALE,6);nebula_set(WARP,1.7f);nebula_set(MIX,.58f);nebula_set(THRESHOLD,.15f);
   nebula_set(SOFTNESS,.30f);nebula_set(EXPOSURE,1.35f);nebula_set(OPACITY,.88f);
   nebula_space_set(NOVA_MODE,1);nebula_space_set(CAVITY_RADIUS,.12f);
  }
  nebula_space_build(seed);rgba=nebula_space_render(256,256,time,yaw,pitch,1.25f);
 } else {
  nebula_generate(256,256,seed);rgba=nebula_render(0);
 }
 FILE *f=fopen(path,"wb");if(!f){perror(path);return 1;}
 fprintf(f,"P6\n256 256\n255\n");
 for(int i=0;i<256*256;i++) {
  uint8_t rgb[3];for(int j=0;j<3;j++)rgb[j]=rgba[i*4+j]*rgba[i*4+3]/255;
  if(fwrite(rgb,1,3,f)!=3){fclose(f);return 1;}
 }
 return fclose(f)!=0;
}
