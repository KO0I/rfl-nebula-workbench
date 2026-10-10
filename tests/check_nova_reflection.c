#include <assert.h>
#include <stdio.h>
#include "../src/volume.c"
int main(void) {
 nebula_space_set(NOVA_MODE,2);nebula_space_set(JET_LENGTH,1);
 nebula_space_build(42871);
 Vec polar=mul(stars[0].axis,.78f*echo_scale());
 Vec axis=stars[0].axis;
 Vec perpendicular=normal(absf(axis.x)<.8f?vec(0,-axis.z,axis.y):vec(-axis.y,axis.x,0));
 Vec equator=mul(perpendicular,.78f*echo_scale());
 assert(jet_growth(0)==0 && absf(jet_growth(2.5f)-.5f)<.00001f && jet_growth(5)==1 && jet_growth(20)==1);
 assert(reflection_color(polar,3,4,2)==0);
 assert(reflection_color(polar,5,4,2)>reflection_color(polar,5,4,1));
 assert(reflection_color(polar,6,4,2)>reflection_color(polar,6,4,1));
 assert(reflection_color(polar,7.3f,4,1)>reflection_color(polar,7.3f,4,2)*3);
 assert(reflection_color(equator,7.3f,4,2)>reflection_color(equator,7.3f,4,1));
 assert(reflection_color(equator,11,4,1)>reflection_color(equator,11,4,2)*3);
 assert(reflection_color(polar,10,4,2)>reflection_color(polar,10,4,1));
 assert(reflection_color(equator,13,4,2)>reflection_color(equator,13,4,1));
 assert(nova_brightness(16)==1 && nova_brightness(46)==.5f && nova_brightness(100)==.5f);
 assert(nova_brightness(30)<1 && nova_brightness(30)>.5f);
 float blue=reflection_color(polar,5,4,2);
 nebula_palette(4,255,0,0);assert(reflection_color(polar,5,4,2)==blue);
 nebula_palette(10,0,0,0);assert(reflection_color(polar,5,4,2)==0);
 nebula_space_set(NOVA_MODE,1);assert(jet_growth(6)==0 && jet_growth(11)==1);
 puts("Nova reflection passed: independent palettes, blue at 3 s, polar-first green at 6 s, outward front, five-second jets.");
}
