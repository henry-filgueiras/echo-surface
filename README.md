# EchoSurface

EchoSurface is a playful touch-first prototype exploring the idea of the screen as an instrument rather than a conventional interface.

Touches, drags, and holds leave visible echoes that replay, interfere, and evolve over time, creating a living surface that can be “played” through motion and rhythm.

Part interaction experiment, part digital instrument, part sci-fi toy artifact.

## Run It

```bash
npm install
npm run dev
```

Then open the local Vite URL in a browser and play with the surface using mouse or touch.

## Interaction Model

- Tap to seed mirrored ripples.
- Drag to draw paths that come back later as semi-autonomous ghosts.
- Hold to charge the surface and thicken the echo response.
- The last 20 interactions remain in memory and reappear as playable traces.

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
