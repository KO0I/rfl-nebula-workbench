#ifndef NEBULA_NOVA_H
#define NEBULA_NOVA_H
/* Seconds belong to the scene clock: pausing the host freezes all phases. */
enum { NOVA_POINT, NOVA_GLARE, NOVA_EXPANDING, NOVA_REMNANT };
enum { NOVA_PHASE_VALUE, NOVA_CUTOFF_VALUE, NOVA_RADIUS_VALUE,
       NOVA_GLARE_VALUE, NOVA_EXPANSION_VALUE, NOVA_REMNANT_VALUE, NOVA_CLEARING_VALUE };
typedef struct {
 int phase;
 float cutoff, radius, glare, expansion, remnant, clearing;
} NovaState;
NovaState nebula_nova_at(float seconds);
float nebula_nova_value(float seconds, int field);
int nebula_nova_jet_seed(unsigned seed);
#endif
