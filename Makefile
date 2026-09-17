CC ?= cc
CFLAGS ?= -O3 -std=c99 -Wall -Wextra
CORE = src/noise.c src/nebula.c src/noise3.c src/volume.c src/nova.c src/noctis_glare.c src/rfl_nebula_export.c
.PHONY: native wasm
native:
	$(CC) $(CFLAGS) $(CORE) src/main.c -lm -o nebula-native
wasm:
	$(WASM_CC) -O3 -target wasm32-freestanding -nostdlib -Wl,--no-entry -Wl,--export=nebula_set -Wl,--export=nebula_palette -Wl,--export=nebula_generate -Wl,--export=nebula_render -Wl,--export=nebula_density -Wl,--export=nebula_space_set -Wl,--export=nebula_space_build -Wl,--export=nebula_space_render -Wl,--export=nebula_space_density -Wl,--export=nebula_space_star_count -Wl,--export=nebula_space_jet_count -Wl,--export=nebula_space_sample -Wl,--export=nebula_space_stars -Wl,--export=nebula_nova_value -Wl,--export=nebula_nova_jet_seed -Wl,--export=nebula_export_rfl -Wl,--export=nebula_export_rfl_size -Wl,--export-memory -Wl,-z,stack-size=65536 $(CORE) -o dist/nebula.wasm
