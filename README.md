# EchoSurface

## Live Demo

[Play Echo Surface on GitHub Pages](https://henry-filgueiras.github.io/echo-surface/)

EchoSurface is a playful touch-first prototype exploring the idea of the screen as an instrument rather than a conventional interface.

The current prototype treats gesture shape as melodic intent while a shared harmonic state provides context. It also infers orchestration roles from the gesture itself, so the screen behaves more like a multi-voice ritual instrument than a menu-driven music toy.

Repeated contour families now accumulate into session-memory motifs with their own sigils, so the instrument can remember shared musical history and let you wake those memories back into play.

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
- Each inferred role now prefers a soft swim lane for readability: bass lower, pads mid-low, leads upper, percussion near the top, and echo floating as an overlay rather than a hard band.
- A subtle flow field gently encourages left-to-right motion, but backward drifts and loops remain playable and get interpreted musically as ornament, shimmer, or sustained echo instead of being blocked.
- A subtle progression strip can retune the harmonic loop, and a one-shot role palette can seal the next contour to a specific voice when needed.
- In call-and-response mode, a user contour can trigger a delayed answer phrase one bar later that keeps the contour family resemblance while shifting role, landing points, octave, and timing.
- When related contours recur within the same scope, the session promotes them into named motif entities that store canonical shape, harmonic/rhythmic tendencies, preferred role, and a dormant sigil.
- Zoomed-out scopes display dormant motif satellites that can be tapped to re-summon a phrase or dragged into another scope to reinterpret it under that local harmonic world.
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
