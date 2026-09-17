# Nebula Workbench

A portable C99 nebula engine with an animated, rotatable volume view and the original 2D texture editor. The browser compiles the C engine to WebAssembly and runs it in a dedicated worker. JavaScript handles controls, timing, mouse/touch/keyboard input, canvas presentation, and downloads.

The volume is a procedural artistic model, not an astrophysical hydrodynamics simulation. It uses genuine 3D density and camera rotation, displayed as pixel art. It is not a rotating flat billboard. This is an independently written implementation inspired by the layered-noise workflow of https://github.com/townofdon/nebula-gen; the Noctis-style Nova glare is adapted from the user's attached RFL source, and no proprietary art is bundled.

## Use

Volume mode opens with gas animation and automatic rotation running. Drag the viewer or focus it and use arrow keys to rotate manually. Home or Reset view restores the camera. Pause motion freezes gas evolution, jet knots, and automatic rotation; manual rotation remains available while paused. Motion speed changes gas, knots, and orbit speed together. Auto rotate can be disabled independently to inspect gas motion from a fixed viewpoint. Hidden tabs suspend requests without advancing the scene clock.

The Stars tab provides:

- Colored stars: 0–64 modeled sources, separate from the optional distant preview starfield.
- Clearing radius: spherical density exclusion around every modeled star, in normalized world units. Zero disables the clearings. Radius varies deterministically by up to 18% per source.
- Herbig–Haro fraction: the fraction of stars with bipolar jets. The source count is `round(star_count * fraction)`; the UI also reports twice that number as lobes.
- Stellar glow, jet length, and star spread. Three of every four sources are initially sampled within the nebula shape; the others surround it. Spread scales these positions. Gas can obscure sources, and large spread or zoom can put them outside the viewport.

The jets are narrow opposing streams with outward-moving emission knots. Source positions, jet axes, and spherical clearings remain fixed in world space as gas evolves. Colored cavity rims approximate local excitation. Approximate volume extinction attenuates stars and jets behind gas.

Looking along either jet axis replaces the cones with an RFL-style dithered glare centered on its star. The cones and glare crossfade between 24° and 12° from the axis; within 12° the cone emission is fully hidden. Rotating away restores the streams. The glare follows the approaching lobe's tint (blue-white for Nova), pulses with the jet, and respects stellar glow and foreground gas extinction. This applies to every jet source, including Nova, and remains deterministic when paused.

Cloud, pillar, ring, and unmasked shapes work in Volume mode. Texture mode retains the 2D noise controls, seamless tiling, palettes, dithering, and raw-density exports. Tiling is a Texture-only option.

## Nova preset

Nova is a single event on the scene clock:

- 0–1.5 s: one centered red point, with no nebula or jet.
- 1.5–6 s: the point grows into a medium Noctis-style dither glare, reaching peak at 5 s and holding through 6 s. The flare uses RFL's hashed sparse discs, core glow, four asymmetric diffraction axes, and tint mixing.
- 6–22 s: an expanding spherical ejecta shell emerges as glare fades. The stellar remnant transitions to blue-white and flickers continuously. The shell radius increases from 0.10 to 1.12 world units; density cutoff rises linearly from 0.15 to 0.47, making the expanding gas thinner. The clearing radius grows from 0.12 to 0.28 at half the cutoff rate (0.01 world units per scene second). The cavity and glowing rim follow this radius in both preview and RFL exports.
- After 22 s: the full-size nebula continues moving around the flickering remnant, with cutoff held at 0.47 and clearing radius at 0.28.

A seeded Bernoulli trial gives a 50% chance of a bipolar jet source. It is chosen once per seed, stays stable under regeneration/pause/rotation, and appears only after the eruption begins. Replay Nova repeats the same seed from age zero; Randomize changes the seed and restarts the sequence. The live phase and cutoff are reported from C. Nova fixes one centered source and manages cutoff, clearing, and spherical shape; these controls are disabled while the preset is selected. Selecting another preset restores the previous star configuration.

`src/nova.c` implements the timeline and seed lottery. `src/noctis_glare.c` adapts `flare_hash2`, `draw_noctis_dither_disc`, and `draw_noctis_flare_sprite_tuned` from the uploaded `rfl_PLAYTEST/raycaster_planet.c` to the workbench's image accumulators. It uses no texture assets. Native hosts set `NOVA_MODE` before building the scene, then call the usual space render function with scene age.

## Build and run native C

```
make native
./nebula-native 42871 texture.ppm
./nebula-native --volume 42871 volume.ppm 3.0 0.8 0.2
./nebula-native --nova 42871 nova.ppm 14.0 0.8 0.2
```

Volume arguments after the output path are time in seconds, yaw in radians, and pitch in radians. Both commands write 256×256 PPM frames composited over black. The native CLI is a frame renderer; an SDL2, raylib, or Xlib host can repeatedly call the same volume API for animation.

## Rebuild the browser engine

The download includes the compiled engine. To rebuild it, install Zig (tested with 0.16.0):

```
make wasm WASM_CC="zig cc"
python3 -m http.server 8080 --directory dist
```

Open http://localhost:8080. Serve through HTTP rather than a file URL so the worker can load the WebAssembly module.

## Modules

- `src/noise.c`, `src/nebula.c`: preserved 2D field and palette renderer.
- `src/noise3.c`: seeded, periodic 3D lattice noise and fractal summation.
- `src/volume.c`: cached 3D noise, animated density, 3D masks, seeded stars, spherical exclusions, volume integration, and depth-attenuated stars/jets.
- `src/volume.h`: volume API and space parameter indices.
- `src/main.c`: native PPM host for both render paths.
- `dist/engine.js`: WebAssembly worker and regeneration cache.
- `dist/app.js`: live controls and interaction.

No graphics library is required by the engine. The browser is a thin host over RGBA8 buffers. The engine uses one static context, is not reentrant, and needs serialized access or one WebAssembly instance per worker.

## Volume API

Set noise/color values with `nebula_set` and `nebula_palette`. Set star/cavity/jet parameters with `nebula_space_set`, then call `nebula_space_build(seed)`. The noise cache rebuilds only when its seed or noise parameters change. After edits to the shape or source configuration, call build again to update the envelope, spherical clearings, and colored rims.

`nebula_space_render(width,height,time,yaw,pitch,zoom)` returns a library-owned RGBA8 buffer. Repeated calls with identical input yield identical pixels. Camera rotation can rerender a paused density field without regenerating it. `nebula_space_density()` returns the most recent view's gas column as grayscale bytes. `nebula_space_sample(x,y,z)` queries the current 3D field. `nebula_space_star_count()` and `nebula_space_jet_count()` report actual source counts.

Gas uses a cached 64³ 3D noise texture and a 64³ density grid covering world coordinates −1.25 to +1.25 on each axis. Time advects and combines distinct samples of the periodic noise, then reapplies the fixed shape and exclusions. Rendering uses 96 samples per ray, front-to-back approximate emission/extinction, and an orthographic camera. It has volume depth but does not yet provide a fly-through camera or export a complete 3D field. Dimensions are clamped to 1–512; larger output resolutions cost more per frame.

## Exports

Export PNG captures the latest complete color frame at the selected resolution with transparency. Modeled stars/jets are included in Volume mode; the optional preview background is excluded. Export density writes binary PGM (`P5`). In Volume mode, this is the integrated gas column for the current camera, scaled into 0–255, without stellar points, jets, or the color palette. In Texture mode, it is the original 2D field.

## Verification

```
node tests/check_volume.mjs
node tests/check_nova.mjs
node tests/check_jet_glare.mjs
```

This checks deterministic paused rendering, changes under rotation and time, gas removed at star centers and restored with zero cavity radius, exact star/jet counts including 0% and 100%, rectangular output, and retained 2D API behavior. Representative output frames were inspected directly. JavaScript syntax and local asset references were checked. Nova checks also cover phase order, glare growth, no gas before eruption, cutoff endpoints, expansion, core color and flicker, replay stability, and both jet outcomes across seeds. Jet glare checks cover both viewing directions, complete cone suppression, progressive angular fading, retained side views, phase gating, zero glow, and ordinary stars. No browser automation was run.

## Exporting RFL systems

The **RFL system** section exports a camera-independent `.rnb` volume. Choose
32³ for compact assets or 64³ for more detail. Export includes animated gas,
distance mip levels, colored stars, clearings and jet source records. Ordinary
presets bake an eight-frame, twelve-second gas loop; Nova bakes its expansion
and a separate remnant loop. Stars and jets animate independently in RFL.

Copy the result to RFL's `assets/nebulae/` folder, restart RFL, then select
**Systems → Workbench Nebula → Asset**. This requires the RFL source build with
`rfl_nebula.c`; older RFL builds do not understand `.rnb` files.

**Save editable recipe** retains all generation parameters and colors in a
`.nebula` text file. The RFL source bundle includes a native C baker:

```
make nebula_bake
./nebula_bake --recipe my-cloud.nebula assets/nebulae/my-cloud.rnb
```

`src/rfl_nebula_export.c` implements the same explicit little-endian RFLNEB1
serializer in native C and WebAssembly. It calls `nebula_space_bake(time)` and
`nebula_space_cell(x,y,z,out)` without rendering a preview. Exports use density
and RGB radiance in four bytes per voxel, conservative runtime occupancy masks,
and density-weighted mip colors. The loader validates version, dimensions,
metadata, timestamps, length and checksum before accepting an asset.

Compact ordinary assets occupy about 1.14 MiB; compact Nova is 2.28 MiB.
Detailed ordinary assets are 9.14 MiB and Nova is 18.28 MiB. Gas animation is a
baked approximation of the continuously evolving preview, with temporal
crossfades. Camera rotation and translation remain fully three-dimensional.

The native and browser-worker default exports matched byte for byte during
integration. Existing volume, Nova and jet-glare checks continue to pass, and
the worker resumes normal preview rendering after export.
