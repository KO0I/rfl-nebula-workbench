#ifndef NEBULA_VOLUME_H
#define NEBULA_VOLUME_H
#include "nebula.h"
#define VOLUME_SIDE 64
#define STAR_LIMIT 64
/* Positions, exclusion radii, and jet axes use the same world coordinates. */
enum { STAR_COUNT, CAVITY_RADIUS, JET_FRACTION, STAR_GLOW, JET_LENGTH, STAR_SPREAD, NOVA_MODE, SPACE_PARAM_COUNT };
void nebula_space_set(int parameter, float value);
float nebula_space_get(int parameter);
void nebula_space_build(unsigned seed);
uint8_t *nebula_space_render(int width, int height, float time,
                            float yaw, float pitch, float zoom);
uint8_t *nebula_space_density(void);
int nebula_space_star_count(void);
int nebula_space_jet_count(void);
float nebula_space_sample(float x, float y, float z);
/* Read-only contiguous records: xyz, radius, axis xyz, RGB, phase. */
const float *nebula_space_stars(void);
/* Offline asset baking: update gas without rendering a camera view. */
void nebula_space_bake(float time);
void nebula_space_cell(float x, float y, float z, float out[4]);
float nebula_noise3(float x, float y, float z, unsigned seed, int period);
float nebula_fbm3(float x, float y, float z, unsigned seed, float scale,
                  int octaves, float persistence, float lacunarity);
#endif
