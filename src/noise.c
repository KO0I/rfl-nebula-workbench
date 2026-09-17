#include "nebula.h"
static uint32_t hash(uint32_t x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; return x ^ (x >> 16); }
static int floori(float x) { int i=(int)x; return i-(x<i); }
static int wrap(int x,int n) { x%=n; return x<0?x+n:x; }
static float cell(int x,int y,unsigned seed,int p) { return (hash((uint32_t)wrap(x,p)*374761393u ^ (uint32_t)wrap(y,p)*668265263u ^ seed)&0xffffff)/16777215.0f; }
static float fade(float t) { return t*t*t*(t*(t*6-15)+10); }
static float lerp(float a,float b,float t) { return a+(b-a)*t; }
float nebula_noise(float x,float y,unsigned seed,int period) {
 int ix=floori(x),iy=floori(y); float u=fade(x-ix),v=fade(y-iy);
 return lerp(lerp(cell(ix,iy,seed,period),cell(ix+1,iy,seed,period),u),lerp(cell(ix,iy+1,seed,period),cell(ix+1,iy+1,seed,period),u),v);
}
float nebula_fbm(float x,float y,unsigned seed,float scale,int octaves,float persistence,float lacunarity) {
 float sum=0,amp=1,total=0;
 for(int i=0;i<octaves;i++) { int period=(int)(scale+0.5f); if(period<1)period=1;
  sum+=amp*nebula_noise(x*period,y*period,seed+i*1619u,period); total+=amp; amp*=persistence; scale*=lacunarity;
 }
 return sum/total;
}
