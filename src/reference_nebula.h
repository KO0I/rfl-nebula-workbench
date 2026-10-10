#ifndef REFERENCE_NEBULA_H
#define REFERENCE_NEBULA_H
#include "nebula.h"
uint8_t *nebula_reference_cloud_buffer(void);
uint8_t *nebula_reference_depth_buffer(void);
float *nebula_reference_stars_buffer(void);
void nebula_reference_set(int width,int height,int stars,int spikes,int profile);
int nebula_reference_active(void);
int nebula_reference_star_count(void);
int nebula_reference_spikes(void);
void nebula_reference_seed(unsigned seed);
void nebula_reference_cell(float x,float y,float z,float time,float out[4]);
#endif
