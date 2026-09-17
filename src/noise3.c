#include "volume.h"
static uint32_t hash(uint32_t x) {
 x^=x>>16; x*=0x7feb352du; x^=x>>15; x*=0x846ca68bu; return x^(x>>16);
}
static int wrap(int x,int p) { x%=p;return x<0?x+p:x; }
static int floori(float x) { int i=(int)x;return i-(x<i); }
static float cell(int x,int y,int z,unsigned s,int p) {
 return (hash((uint32_t)wrap(x,p)*374761393u ^ (uint32_t)wrap(y,p)*668265263u ^ (uint32_t)wrap(z,p)*2246822519u ^ s)&0xffffff)/16777215.0f;
}
static float fade(float x) { return x*x*x*(x*(x*6-15)+10); }
static float mix(float a,float b,float t) { return a+(b-a)*t; }
float nebula_noise3(float x,float y,float z,unsigned seed,int p) {
 int ix=floori(x),iy=floori(y),iz=floori(z);float a=fade(x-ix),b=fade(y-iy),c=fade(z-iz);
 float lo=mix(mix(cell(ix,iy,iz,seed,p),cell(ix+1,iy,iz,seed,p),a),mix(cell(ix,iy+1,iz,seed,p),cell(ix+1,iy+1,iz,seed,p),a),b);
 float hi=mix(mix(cell(ix,iy,iz+1,seed,p),cell(ix+1,iy,iz+1,seed,p),a),mix(cell(ix,iy+1,iz+1,seed,p),cell(ix+1,iy+1,iz+1,seed,p),a),b);
 return mix(lo,hi,c);
}
float nebula_fbm3(float x,float y,float z,unsigned seed,float scale,int octaves,float persistence,float lacunarity) {
 float value=0,weight=1,total=0;
 for(int i=0;i<octaves;i++) {int period=(int)(scale+.5f);if(period<1)period=1;
  value+=weight*nebula_noise3(x*period,y*period,z*period,seed+i*1619u,period);
  total+=weight;weight*=persistence;scale*=lacunarity;
 }
 return value/total;
}
