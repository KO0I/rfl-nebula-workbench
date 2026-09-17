#include "nova.h"
#include <stdint.h>
static float clamp01(float x) { return x<0?0:x>1?1:x; }
static float smooth(float x) { x=clamp01(x);return x*x*(3-2*x); }
NovaState nebula_nova_at(float seconds) {
 NovaState s;
 /* Hold a red point, raise and hold the glare, then eject an expanding shell. */
 s.phase=seconds<1.5f?NOVA_POINT:seconds<6?NOVA_GLARE:seconds<22?NOVA_EXPANDING:NOVA_REMNANT;
 s.expansion=clamp01((seconds-6)/16);
 s.cutoff=.15f+(.47f-.15f)*s.expansion;
 s.clearing=.12f+.5f*(s.cutoff-.15f);
 s.radius=seconds<6?0:.10f+1.02f*s.expansion;
 s.glare=smooth((seconds-1.5f)/3.5f)*(1-smooth((seconds-6)/3.0f));
 s.remnant=smooth((seconds-6)/1.2f);
 return s;
}
float nebula_nova_value(float seconds,int field) {
 NovaState s=nebula_nova_at(seconds);
 switch(field) {
 case NOVA_PHASE_VALUE:return (float)s.phase;
 case NOVA_CUTOFF_VALUE:return s.cutoff;
 case NOVA_RADIUS_VALUE:return s.radius;
 case NOVA_GLARE_VALUE:return s.glare;
 case NOVA_EXPANSION_VALUE:return s.expansion;
 case NOVA_REMNANT_VALUE:return s.remnant;
 case NOVA_CLEARING_VALUE:return s.clearing;
 default:return 0;
 }
}
int nebula_nova_jet_seed(unsigned seed) {
 /* One Bernoulli decision per seed; do not round 1 * 0.5 into an always-on jet. */
 uint32_t h=seed^0x9e3779b9u;
 h^=h>>16;h*=0x7feb352du;h^=h>>15;h*=0x846ca68bu;h^=h>>16;
 return (int)(h&1u);
}
