#ifndef NEBULA_IMAGE_TEXTURE_H
#define NEBULA_IMAGE_TEXTURE_H
#include "nebula.h"
/* Host copies straight-alpha RGBA8 pixels before selecting their dimensions.
 * Set dimensions to zero to restore the procedural generator. */
uint8_t *nebula_image_buffer(void);
void nebula_image_set(int width,int height);
int nebula_image_active(void);
void nebula_image_sample(float u,float v,float out[4]);
uint8_t *nebula_image_render(int width,int height);
uint8_t *nebula_image_density(void);
#endif
