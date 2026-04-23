# EchoSurface → Resonant Lab Adapter v0

## Purpose

Define the **smallest honest bridge** from **EchoSurface** into **resonant-instrument-lab**.

This adapter does **not** try to solve melody generation, harmony generation, or “make drawings sound good” directly.

Instead, it treats EchoSurface as a **gestural authoring surface for dynamical musical worlds**, and compiles a small subset of EchoSurface primitives into a **Coupled Oscillator Garden** config plus optional scheduled perturbations.

The output is meant to flow into the existing Resonant Lab pipeline:

* simulator
* detector-grounded `summary.json`
* `atlas.json`
* browser A/B viewer
* audible intervention comparison

## Non-goals

This pass is **not**:

* a full EchoSurface integration
* a live bi-directional sync
* a browser-to-simulator runtime bridge
* a generic drawing-to-music engine
* a DAW / MIDI / plugin layer
* a taste engine for melody mapping

Keep it narrow.

---

## High-level thesis

The bridge point is:

* **EchoSurface** = embodied **world authoring / perturbation**
* **Resonant Lab** = semantic **observability / intervention atlas**

In other words:

* shapes do **not** directly emit melodies
* contours do **not** directly become note sequences

Instead:

* shapes instantiate **local oscillator ecologies**
* contours and tides become **scheduled perturbations**
* the Lab stack diagnoses the resulting world and ranks interventions

---

## Deliverable

Implement a first-pass offline compiler:

**`scripts/compile_echo_scene.py`**

Input:

* `echo_scene.json`

Output:

* one generated garden config YAML
* one small provenance JSON sidecar
* optional convenience command / printed follow-up commands for running summary + atlas

Example usage:

```bash
python scripts/compile_echo_scene.py \
  --scene examples/echo/two_squares_one_contour.json \
  --out configs/generated/echo_two_squares.yaml \
  --provenance configs/generated/echo_two_squares.provenance.json
```

---

## Input schema: `echo_scene.json`

Use a deliberately tiny schema for v0.

```json
{
  "schema_version": 1,
  "canvas": { "width": 1.0, "height": 1.0 },

  "shapes": [
    {
      "id": "shape_A",
      "kind": "square",
      "center": [0.28, 0.50],
      "radius": 0.10,
      "weight": 1.0,
      "rotation_deg": 0.0
    },
    {
      "id": "shape_B",
      "kind": "square",
      "center": [0.72, 0.50],
      "radius": 0.10,
      "weight": 1.0,
      "rotation_deg": 0.0
    }
  ],

  "contours": [
    {
      "id": "contour_1",
      "anchor_shape_id": "shape_A",
      "points": [[0.22, 0.54], [0.30, 0.60], [0.36, 0.48]],
      "strength": 0.7
    }
  ],

  "tides": []
}
```

### Supported fields in v0

#### `shapes[*]`

* `id: string`
* `kind: "triangle" | "square" | "pentagon" | "hexagon"`
* `center: [x, y]` in unit square
* `radius: float`
* `weight: float`
* `rotation_deg: float`

#### `contours[*]`

* `id: string`
* `anchor_shape_id: string`
* `points: [[x, y], ...]`
* `strength: float`

#### `tides[*]`

Accepted in schema, but **may be ignored in v0** if needed to keep scope tight.

---

## Compiler output: generated garden config

The compiler emits a valid Resonant Lab config YAML compatible with the existing simulator.

It should populate at minimum:

* `meta.name`
* `scene.N`
* `scene.nodes[*].pos`
* `scene.nodes[*].omega_0_hz`
* `scene.nodes[*].gamma`
* `scene.nodes[*].voice`
* `coupling.K0`
* `coupling.sigma`
* `noise.eta`
* `run.duration_s`
* `run.control_rate_hz`
* `run.seed`
* optional scheduled events derived from contours

The generated config does **not** need to be beautiful. It needs to be:

* deterministic
* valid
* interpretable
* capable of producing a nontrivial atlas story

---

## Core mapping table

This is the **canonical v0 mapping**.

| EchoSurface primitive | Garden meaning                                 |
| --------------------- | ---------------------------------------------- |
| shape center          | cluster centroid                               |
| shape radius          | cluster spread                                 |
| shape kind            | local frequency-family prior                   |
| shape weight          | local coupling-strength bias                   |
| contour               | scheduled node-nudge field anchored to a shape |
| tide                  | deferred / optional in v0                      |
| scope                 | out of scope for v0                            |

### Important rule

These are **world-authoring mappings**, not direct sound/melody mappings.

---

## Shape compilation rules

Each shape compiles into a **small local cluster** of nodes.

### Default node counts by shape kind

* `triangle` → 3 nodes
* `square` → 4 nodes
* `pentagon` → 5 nodes
* `hexagon` → 6 nodes

This means `shape.kind` determines **cluster cardinality** in v0.

That is intentionally literal and easy to inspect.

### Node placement

For a shape with:

* center = `(cx, cy)`
* radius = `r`
* kind with `k` corners
* rotation = `θ0`

place `k` nodes evenly around a circle:

```text
x_i = cx + r * cos(θ0 + 2π i / k)
y_i = cy + r * sin(θ0 + 2π i / k)
```

Then clamp into `[0, 1]` if needed.

This is not meant to recreate full EchoSurface drawing geometry. It is a simple, deterministic cluster scaffold.

### Frequency-family prior by shape kind

Use these default base families:

* `triangle` → around `3.0 Hz`
* `square` → around `2.0 Hz`
* `pentagon` → around `2.5 Hz`
* `hexagon` → around `3.0 Hz`

Then assign per-node frequencies by adding small symmetric offsets around that base.

Example default offset templates:

* triangle: `[-0.10, 0.00, +0.10]`
* square: `[-0.15, -0.05, +0.05, +0.15]`
* pentagon: `[-0.16, -0.08, 0.00, +0.08, +0.16]`
* hexagon: `[-0.20, -0.12, -0.04, +0.04, +0.12, +0.20]`

Then apply a small scale factor from `shape.weight` if desired.

### Voice assignment

For v0:

* assign voices cyclically by node index
* no attempt at tasteful voicing
* the goal is merely stable per-node identity

### Gamma

Set a single default, e.g.:

* `gamma = 1.0` for all nodes

No shape-derived gamma semantics yet.

---

## Coupling defaults

Use one global coupling block for the generated config.

Recommended v0 defaults:

* `K0 = 1.0`
* `sigma = 0.18`
* `eta = 0.0`
* `duration_s = 12.0`
* `control_rate_hz = 200`

These can be tuned later. For v0, prefer stability and simplicity over expressive richness.

### Optional weight influence

You may let the mean or max shape `weight` mildly scale `K0`, but do **not** make this complicated.

If implemented, keep it simple, e.g.:

```text
K0 = 0.8 + 0.4 * mean(shape.weight)
```

If that feels unnecessary, leave `K0` fixed.

---

## Contour compilation rules

Contours are the **most important reinterpretation**.

Contours do **not** become melodies.

Contours become **scheduled perturbations**.

### v0 contour meaning

Each contour compiles into one or more `nudge`-style events targeted at the nodes belonging to its `anchor_shape_id`.

If the runtime event schema does not already support the exact desired nudge event for generated configs, emit a provenance instruction and/or keep the contour semantics in the sidecar for later use. But the preferred path is to compile into a valid scheduled perturbation the current simulator already understands.

### Minimal v0 behavior

For each contour:

1. find its anchored shape
2. find all node indices generated from that shape
3. derive:

   * one event time
   * one delta magnitude
   * one target subset

#### Event time

Set from contour length / density, or simply:

* `t = 4.0 s` for the first contour
* `t += 1.0 s` for each subsequent contour

Deterministic and boring is fine.

#### Delta magnitude

Map from `strength`, e.g.:

```text
delta_hz = 0.10 + 0.20 * strength
```

#### Target subset

Use:

* all nodes from the anchor shape, or
* the node nearest the contour centroid

Pick **one** policy and document it in provenance. My preference for v0 is:

* **target all nodes from the anchored shape**

because it makes the contour’s effect more visible in the resulting regime.

### If contour events are too invasive

Fallback is acceptable:

* compile the baseline world only
* write intended contour-induced perturbations into provenance JSON
* do not block the pass on perfect event semantics

But prefer real simulator events if current schema/runtime allows.

---

## Tides

### v0 recommendation

Support the field in the input schema, but **defer actual tide compilation** unless it comes nearly free.

If implemented, the narrowest honest tide is:

* one temporary global `setK` event
* or one temporary global noise burst

But tides are **not required** for the first proof object.

---

## Provenance sidecar

Emit a JSON sidecar describing how EchoSurface primitives became garden artifacts.

Example:

```json
{
  "schema_version": 1,
  "scene_name": "echo_two_squares",
  "generated_config_path": "configs/generated/echo_two_squares.yaml",

  "shape_to_nodes": {
    "shape_A": [0, 1, 2, 3],
    "shape_B": [4, 5, 6, 7]
  },

  "contour_to_events": {
    "contour_1": [
      {
        "kind": "nudge",
        "target_nodes": [0, 1, 2, 3],
        "time_s": 4.0,
        "delta_hz": 0.24
      }
    ]
  },

  "notes": [
    "Shapes compiled to local oscillator clusters.",
    "Contours compiled to scheduled perturbations, not melodies."
  ]
}
```

### Why provenance matters

This is load-bearing.

Without provenance, the bridge is opaque.

With provenance, future UI can say:

* this cluster came from shape A
* this perturbation came from contour_1
* this brittle node belongs to the left square

---

## First proof object

Implement exactly one canonical example:

## Example scene

**Two squares + one contour**

### Input

* left square
* right square
* one contour anchored to the left square

### Expected compiled world

* two local 4-node clusters
* moderate inter-cluster coupling
* one scheduled perturbation affecting the left cluster

### Expected payoff

When run through Resonant Lab:

* produces a readable topology
* produces a meaningful summary
* produces a nontrivial atlas ranking

The atlas should ideally tell a story like:

* one cluster is brittle
* one node is load-bearing
* one intervention best splits the system
* one intervention preserves coherence

The exact regime is not fixed ahead of time; the point is to produce a world with a legible causal story.

---

## CLI ergonomics

If possible, the compiler should print follow-up commands after writing output, e.g.:

```bash
python scripts/run_sim.py \
  --config configs/generated/echo_two_squares.yaml \
  --out runs/generated/echo_two_squares \
  --summary --summary-json

python scripts/build_atlas.py \
  --config configs/generated/echo_two_squares.yaml \
  --out runs/generated/echo_two_squares
```

This is optional but desirable.

---

## Acceptance criteria

The pass is successful if all of the following are true:

1. `echo_scene.json` compiles deterministically into a valid garden config.
2. The generated config runs through existing Resonant Lab tooling without manual edits.
3. A provenance sidecar is emitted and clearly maps shapes/contours to generated nodes/events.
4. The example scene produces a nontrivial semantic story in `summary.json` and/or `atlas.json`.
5. The implementation remains narrow — no generic integration framework, no live sync, no melody engine.

---

## Explicitly out of scope

Do **not** add any of the following in this pass:

* live EchoSurface runtime integration
* browser-to-Python bridge
* shape-to-note melody generation
* harmonic analysis
* MIDI import/export
* DAW/plugin integration
* semantic zoom/scopes
* reverse mapping from lab findings back into EchoSurface
* a generalized graphics parser
* a full EchoSurface document model

This is a **proof-of-wormhole**, not a merger.

---

## Preferred implementation notes

* Keep everything deterministic.
* Reuse existing config validation if possible.
* Prefer a small, readable script over a reusable framework.
* If a design fork appears, choose the narrowest path that produces a meaningful atlas story.

---

## One-sentence summary

**EchoSurface v0 becomes a gestural authoring surface for small dynamical musical worlds; Resonant Lab remains the semantic HUD and intervention atlas for those worlds.**
