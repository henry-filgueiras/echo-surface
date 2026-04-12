# EchoSurface

## Live Demo

[Play Echo Surface on GitHub Pages](https://henry-filgueiras.github.io/echo-surface/)

EchoSurface is a playful touch-first prototype exploring the idea of the screen as an instrument rather than a conventional interface.

The current prototype treats gesture shape as melodic intent while a shared harmonic state provides context. It also infers orchestration roles from the gesture itself, so the screen behaves more like a multi-voice ritual instrument than a menu-driven music toy.

Part interaction experiment, part digital instrument, part sci-fi toy artifact.

## Run It

```bash
npm install
npm run dev
```

Then open the local Vite URL in a browser and play with the surface using mouse or touch.

## Interaction Model

- Draw left to right to sketch a melodic contour.
- Upward movement rises, downward movement falls, flatter spans sustain, and sharper vertical moves become leaps.
- Notes are quantized to the active scale instead of mapped directly to raw frequencies.
- Stable landing points bias toward active chord tones as the progression cycles.
- Long smooth drags become pads, long holds become bass drones, clustered taps wake percussion, sharp zigzags become leads, and circular motion opens echo or FX voices.
- Playback visibly retraces each contour with luminous transient glyphs at note events.

## Bootstrap

```bash
./bootstrap.sh
```

`bootstrap.sh` installs the local build prerequisites we use in sister projects on macOS with Homebrew, errors out on non-macOS hosts, and finishes with `npm ci`.

## Bazel Targets

```bash
bazel run //:demo_dev
bazel run //:demo_dist
bazel run //:guide_screenshots
bazel run //:docker_up
bazel run //:docker_down
```

Component source groups are also exposed as Bazel targets:

- `//src:app_component`
- `//src:app_entry_component`
- `//src:styles_component`
- `//src/components:echo_surface_component`
- `//src/components:how_to_play_component`

## Docker

`bazel run //:docker_up` builds the demo container and serves it locally at [http://localhost:8080](http://localhost:8080). `bazel run //:docker_down` tears the environment back down.

## GitHub Pages

Pushes to `main` trigger `.github/workflows/deploy-pages.yml`, which builds the app and publishes `dist/` to GitHub Pages automatically.
