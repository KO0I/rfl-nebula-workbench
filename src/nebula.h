#ifndef NEBULA_H
#define NEBULA_H
#include <stdint.h>
#define NEBULA_MAX 512
/* Parameter ABI shared by native and browser hosts. */
enum { SCALE, OCTAVES, PERSISTENCE, LACUNARITY, WARP, LAYER2, MIX,
       MASK, THRESHOLD, SOFTNESS, STRETCH, TILE, EXPOSURE, OPACITY, DITHER, PARAM_COUNT };
float nebula_get(int parameter);
const uint8_t *nebula_colors(void);
void nebula_set(int parameter, float value);
void nebula_palette(int index, int r, int g, int b);
void nebula_generate(int width, int height, unsigned seed);
uint8_t *nebula_render(int density_view);
uint8_t *nebula_density(void);
float nebula_noise(float x, float y, unsigned seed, int period);
float nebula_fbm(float x, float y, unsigned seed, float scale, int octaves, float persistence, float lacunarity);
#endif
