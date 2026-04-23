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

### Submodules

This repo uses [`resonant-instrument-lab`](lab/resonant-instrument-lab) as a git submodule under `lab/resonant-instrument-lab/`. The submodule is the observability / intervention-atlas pipeline that the adapter's compiled worlds feed into (see below); nothing in the EchoSurface app itself depends on it at runtime.

Fresh clone with the submodule in one step:

```bash
git clone --recurse-submodules <repo-url>
```

Or, if you already cloned without submodules:

```bash
git submodule update --init --recursive
```

To pull updates to the submodule later:

```bash
git submodule update --remote --recursive
```

### Local prerequisites

```bash
./bootstrap.sh
```

`bootstrap.sh` installs the local build prerequisites we use in sister projects on macOS with Homebrew, errors out on non-macOS hosts, and finishes with `npm ci`.

## EchoSurface → Resonant Lab Adapter

The repo ships an offline compiler that turns an EchoSurface scene JSON into a [resonant-instrument-lab](lab/resonant-instrument-lab) garden config plus a provenance sidecar. The compiled world then runs through the Lab's existing `summary.json` / `atlas.json` pipeline. This is an **offline compiler bridge only** — there is no live / bi-directional integration yet.

- Spec: [`echo_adapter_v0.md`](./echo_adapter_v0.md) — the canonical design doc for the bridge. It defines scope, non-goals, the shape/contour → oscillator-cluster mapping, and the provenance contract.
- The `lab/resonant-instrument-lab` submodule exists so the adapter has a pinned, reproducible target for its generated configs; the submodule owns its own Python venv and simulator scripts.

### Proof-of-wormhole: `two_squares_one_contour`

One canonical example is committed as the first end-to-end proof that the bridge works. Its story, enforced by `tests/test_adapter_canonical.py`: *two squares phase-lock, the lock is brittle, and perturbing a node in the contour-anchored left square cleanly breaks it.*

| Artifact | Path |
| --- | --- |
| Input scene | [`examples/echo/two_squares_one_contour.json`](./examples/echo/two_squares_one_contour.json) |
| Generated garden config | [`configs/generated/echo_two_squares.yaml`](./configs/generated/echo_two_squares.yaml) |
| Provenance sidecar | [`configs/generated/echo_two_squares.provenance.json`](./configs/generated/echo_two_squares.provenance.json) |
| Simulator + atlas outputs | `runs/generated/echo_two_squares/{summary,atlas,topology}.json`, `state.npz`, `audio.wav`, `atlas_audio/` (gitignored; reproducible) |

Run it end-to-end:

```bash
# bootstraps the submodule + its venv, compiles the canonical example scene,
# runs the baseline sim, and builds the intervention atlas.
scripts/run_echo_pipeline.sh

# or run a different scene (stem resolves under examples/echo/<stem>.json):
scripts/run_echo_pipeline.sh my_scene
scripts/run_echo_pipeline.sh --scene path/to/scene.json --name custom_out
```

Outputs land at `configs/generated/<name>.{yaml,provenance.json}` and `runs/generated/<name>/{summary,atlas}.json`.

If you prefer to drive each stage yourself, the compiler is plain Python:

```bash
lab/resonant-instrument-lab/.venv/bin/python scripts/compile_echo_scene.py \
    --scene examples/echo/two_squares_one_contour.json \
    --out configs/generated/echo_two_squares.yaml \
    --provenance configs/generated/echo_two_squares.provenance.json
# it prints the exact run_sim.py / build_atlas.py follow-up commands.
```

The compiler is intentionally narrow: shapes become local oscillator clusters, contours become scheduled perturbations, everything else is deferred.

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
