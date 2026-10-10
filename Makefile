CC ?= cc
CFLAGS ?= -O3 -std=c99 -Wall -Wextra
CORE = src/comet.c src/reference_nebula.c src/image_texture.c src/noise.c src/nebula.c src/noise3.c src/volume.c src/nova.c src/noctis_glare.c src/rfl_nebula_export.c
.PHONY: native wasm
native:
	$(CC) $(CFLAGS) $(CORE) src/main.c -lm -o nebula-native
wasm:
	$(WASM_CC) -O3 -flto -fno-builtin -target wasm32-freestanding -nostdlib -Wl,--no-entry -Wl,--export=nebula_set -Wl,--export=nebula_palette -Wl,--export=nebula_generate -Wl,--export=nebula_render -Wl,--export=nebula_density -Wl,--export=nebula_comet_geometry -Wl,--export=nebula_space_set -Wl,--export=nebula_space_build -Wl,--export=nebula_space_render -Wl,--export=nebula_space_density -Wl,--export=nebula_space_star_count -Wl,--export=nebula_space_jet_count -Wl,--export=nebula_space_sample -Wl,--export=nebula_space_stars -Wl,--export=nebula_nova_value -Wl,--export=nebula_nova_jet_seed -Wl,--export=nebula_export_rfl -Wl,--export=nebula_export_rfl_size -Wl,--export=nebula_image_buffer -Wl,--export=nebula_image_set -Wl,--export=nebula_image_render -Wl,--export=nebula_image_density -Wl,--export=nebula_reference_cloud_buffer -Wl,--export=nebula_reference_depth_buffer -Wl,--export=nebula_reference_stars_buffer -Wl,--export=nebula_reference_set -Wl,--export-memory -Wl,-z,stack-size=65536 $(CORE) -o dist/nebula.wasm
