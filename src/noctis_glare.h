#ifndef NEBULA_NOCTIS_GLARE_H
#define NEBULA_NOCTIS_GLARE_H
/* Add the RFL-style optical flare into linear premultiplied image accumulators. */
void nebula_noctis_glare(float (*rgb)[3], float *alpha, int width, int height,
                        int cx, int cy, float growth, const float tint[3]);
/* Fade brightness and alpha together without changing the sparse pattern. */
void nebula_noctis_glare_scaled(float (*rgb)[3], float *alpha, int width, int height,
                               int cx, int cy, float growth, float strength,
                               const float tint[3]);
#endif
