#ifndef NEBULA_COMET_H
#define NEBULA_COMET_H
/* Local preview units are deliberately enlarged, not AU. The source-star
 * offset is in AU; only its normalized direction or distance gates the tail. */
void nebula_comet_prepare(unsigned seed, float time);
void nebula_comet_tail_cell(float axial, float a, float b, float out[4]);
void nebula_comet_cell(float x, float y, float z, float out[4]);
void nebula_comet_render(const float right[3], const float up[3], const float forward[3],
                         int width, int height, float span, float (*rgb)[3],
                         float *alpha, unsigned char *density);
float nebula_comet_extent(void);
/* Head xyz, source-star xyz, anti-stellar axis xyz. */
const float *nebula_comet_geometry(void);
#endif
