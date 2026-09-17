#ifndef RFL_NEBULA_EXPORT_H
#define RFL_NEBULA_EXPORT_H
#include <stdint.h>
/* RFLNEB1, explicit little-endian encoding. Result is owned by the exporter.
 * Bakes the current settings/palette, independent of preview camera and time.
 * side: 16,32,64. Ordinary: eight-frame loop. Nova: event + remnant loop. */
uint8_t *nebula_export_rfl(unsigned seed, int side);
unsigned nebula_export_rfl_size(void);
#endif
