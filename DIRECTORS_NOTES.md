# EchoSurface Director's Notes

As of April 13, 2026.

This file is a compact handoff artifact for future sessions. The goal is to preserve intent, not just features.

Per `CLAUDE.md`, this doc is organized into **Current Canon** (present-state truth, edited in place) and **Resolved Dragons and Pivots** (append-only devlog, dated entries). The long-form "Where We Have Been" / phase history below these two sections predates the convention and is retained verbatim as background context.

## Current Canon

### EchoSurface → Resonant Lab adapter (v0)

`echo_adapter_v0.md` at the repo root is the canonical spec for the adapter bridge. The bridge is an **offline compiler**, not a live integration, not a melody engine, not a runtime sync. It treats EchoSurface scenes as authoring input for small dynamical oscillator worlds that are then diagnosed by Resonant Lab's existing summary/atlas pipeline.

**Submodule.** `lab/resonant-instrument-lab/` is a git submodule. After cloning, run `git submodule update --init --recursive`. The submodule owns its own venv at `lab/resonant-instrument-lab/.venv/` (created by `lab/resonant-instrument-lab/run.sh` or manually via `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`).

**Directory layout for the adapter:**
- `scripts/run_echo_pipeline.sh` — end-to-end driver. Idempotent bootstrap (submodule + lab venv) followed by compile → sim → atlas. Default scene is the canonical `two_squares_one_contour`; pass a stem or `--scene PATH` for others. This is the entry point worth protecting.
- `scripts/compile_echo_scene.py` — the compiler itself. Reads `echo_scene.json`, writes a validated garden YAML + provenance JSON sidecar. Imports `sim.config.validate` directly from the submodule so schema drift cannot silently pass.
- `examples/echo/` — canonical input scenes. `two_squares_one_contour.json` is the first proof object.
- `configs/generated/` — compiled outputs (YAML config + `.provenance.json` sidecar). Committed, since they are the canonical proof artifacts.
- `runs/` — simulator outputs (`state.npz`, `audio.wav`, `summary.json`, `atlas.json`, `atlas_audio/`). Gitignored; reproducible from the committed config.
- `tests/test_adapter_canonical.py` — regression + canonization tests for the canonical example. Protects the story contract below. Run via `lab/resonant-instrument-lab/.venv/bin/python tests/test_adapter_canonical.py`.

**Canonical example story contract** (enforced by `tests/test_adapter_canonical.py`):
- The compiler is deterministic; two runs over the same scene emit byte-identical YAML.
- The generated config validates through `sim.config.load` and carries the exact adapter fingerprint: `N=8`, `coupling.K0=2.0`, `coupling.sigma=0.22`, four `nudge` events at `t=4.0 s` targeting the `shape_A` node set (0–3).
- Baseline detector matrix is exactly two fires: `phase_locked` (longest window ≥ 8 s) and `brittle_lock`. The other six detectors (`drifting`, `phase_beating`, `flam`, `polyrhythmic`, `dominant_cluster`, `unstable_bridge`) stay silent.
- Atlas top-1 and top-2 both sit in the contour-anchored left cluster (nodes 0–3). Top-1 specifically flips `phase_locked` FIRED → silent.
- Atlas top score is ≥ 3× the rank-5 score, and the best right-cluster score is ≤ 0.5× the top. These two bounds are what "meaningful separation from the bulk" means in code.
- **Phrasing note** (load-bearing): the contour anchors a *shape*, not individual nodes — target policy is `all_nodes_from_anchor_shape`. Copy that says "a node in the contour-anchored left square" is accurate; copy that says "a contour-anchored node" is not. `test_provenance_wording_is_precise` polices provenance text but the same care applies to docs and commit messages.

**End-to-end pipeline (deterministic):**

```
scripts/run_echo_pipeline.sh [stem]                          # one-shot driver

# which expands to:
scripts/compile_echo_scene.py  →  configs/generated/<name>.yaml + .provenance.json
lab/.../scripts/run_sim.py     →  runs/generated/<name>/summary.json  (plus state.npz, audio.wav, topology.json)
lab/.../scripts/build_atlas.py →  runs/generated/<name>/atlas.json
```

**Canonical v0 mapping (do not broaden without updating `echo_adapter_v0.md`):**
- `shape.kind` → cluster cardinality (triangle=3, square=4, pentagon=5, hexagon=6) **and** base frequency family (3.0 / 2.0 / 2.5 / 3.0 Hz)
- `shape.center` + `shape.radius` + `shape.rotation_deg` → `k` node positions on a circle around the center, clamped to `[0,1]`
- `shape.kind` (template) → symmetric Δω offsets applied to the base, step size 0.04 Hz across all kinds (e.g. square = `[-0.06, -0.02, +0.02, +0.06]` Hz). Tight enough that each cluster locks internally and a single counterfactual nudge can tip a node off the plateau.
- `shape.weight` → mild global scale: `K0 = 1.6 + 0.4 · mean(weight)` (= 2.0 at default weight, matching the lab's `regime_two_cluster` / `regime_locked` references).
- `contour` → one `nudge` event per node of the anchor shape, at `t = 4.0 + i · 1.0` s, with `delta_hz = 0.10 + 0.20 · strength`. Target policy is **all nodes from anchor shape** (documented in provenance).
- `tide` → accepted in input schema, deferred in v0.
- Fixed defaults: `sigma=0.22`, `eta=0.0`, `gamma=0.10`, `duration=12.0 s`, `control_rate=200 Hz`, `audio_rate=22050 Hz`, `seed=42`. `gamma=0.10` (not the spec's `e.g., 1.0`) because it matches every validated reference fixture.

**Provenance is load-bearing.** The sidecar (`configs/generated/<name>.provenance.json`, schema_version 1) records `shape_to_nodes`, per-shape metadata, per-contour compiled events, the full mapping rules (kind table, formulas, defaults), and deferred-tide counts. Without it, the bridge is opaque. Every future UI reading the generated atlas should be able to answer "which cluster came from which shape?" from this file alone.

**Explicitly out of scope (v0):** live EchoSurface integration, browser↔Python runtime bridge, shape-to-note melody generation, harmonic analysis, MIDI/DAW layers, semantic zoom / scopes, reverse-mapping lab findings back into EchoSurface, generalized graphics parser, full EchoSurface document model.

## Resolved Dragons and Pivots

### 2026-04-22 — Claude Opus 4.7 (1M context) — submodule bump: Pages-bundle smoke tests landed in the lab

Bumped the `lab/resonant-instrument-lab` pointer (`51945ac → d704d8b`) to pick up a browser-smoke / public-artifact hardening pass inside the submodule. No changes on the EchoSurface side beyond the submodule pointer — the lab's `docs/` tree is the outward-facing live demo, and the smoke harness lives next to the code that produces it.

The submodule's new `tests/test_docs_pages.py` asserts (stdlib-only, ~0.1 s total): `docs/index.html` presence + canonical `<title>`; the two canonical hero links verbatim (`brittle_lock` atlas with `ablate_n4` preselected, `locked` vs `two_cluster` A/B); the `docs/demo/` viewer whitelist is exact; the canonical `brittle_lock` fixture carries every browser-consumed file plus an audible baseline `audio.wav` and every audible `atlas_audio/<id>.wav`; the `.nojekyll` sentinel is present; every local href + img src + viewer-query-string URL on the landing page resolves to a file under `docs/`; and every catalogue fixture has a `summary.json`. Full breakdown is in the submodule's `DIRECTORS_NOTES.md` under the matching dated entry. No adapter-side code, config, or schema changes this pass — the EchoSurface adapter canon remains as-is.

### 2026-04-22 — Claude Opus 4.7 (1M context) — README navigation pass for the wormhole

Docs-only update to `README.md` so a reader landing on the repo can see the Resonant Lab bridge without grepping. No code, schema, or config changes.

Changes:
- Split `## Bootstrap` into two subsections: **Submodules** (explaining what `lab/resonant-instrument-lab/` is, plus `git clone --recurse-submodules`, `git submodule update --init --recursive`, and the update-later command) and **Local prerequisites** (the existing `./bootstrap.sh` note, unchanged).
- Reworked `## EchoSurface → Resonant Lab Adapter` intro to name the bridge as an offline-compiler-only integration and to list two bullet points: what `echo_adapter_v0.md` is, and why the submodule exists (pinned/reproducible target for generated configs).
- Added `### Proof-of-wormhole: two_squares_one_contour` subsection with the one-sentence story (phase-lock is brittle; perturbing a node in the contour-anchored left square breaks it), a 4-row artifact table (scene JSON / generated YAML / provenance JSON / runs/ outputs with gitignored note), and the existing `scripts/run_echo_pipeline.sh` + manual `compile_echo_scene.py` snippets.

Explicitly deferred: no new compiler work, no live integration, no schema changes, no feature implementation, no repo reorganization. Tone kept factual; copy avoids implying a live integration exists. Story phrasing honours the 2026-04-22 wording-protocol entry below — "a node in the contour-anchored left square", not "a contour-anchored node".

### 2026-04-22 — Claude Opus 4.7 (1M context) — canonization + regression tests

Locked in the legibility story from the previous tuning pass so the canonical `two_squares_one_contour` example cannot silently drift back into detector soup. Added `tests/test_adapter_canonical.py` (12 assertions) covering: deterministic compilation, lab-side config validation, the adapter fingerprint (N/K0/sigma/event count/event time/event target set), provenance's shape_to_nodes mapping and per-shape-anchoring wording, the 2-fire / 6-silent baseline detector matrix, a `phase_locked` window floor of 8 s, atlas top-1 + top-2 both on left-cluster nodes, top-1 flipping `phase_locked` FIRED → silent, top score ≥ 3× rank-5, and best right-cluster score ≤ 0.5× top. All 12 pass.

The tests deliberately avoid brittle assertions: no exact confidence values, no byte-size checks on runs-directory artifacts, no full 16-rank ordering. Each assertion maps to a sentence in the story, not to a specific float.

Also refined the wording protocol for the adapter. The contour anchors a *shape* (target policy: `all_nodes_from_anchor_shape`); individual nodes are not "contour-anchored". Copy like "a node in the contour-anchored left square" is accurate; "a contour-anchored node" is not. This is now called out explicitly in Current Canon and policed in provenance text by a dedicated test. Per the CLAUDE.md append-only rule on this section, the prior devlog entry's imprecise phrasing is left as-is — the protocol correction lives in Current Canon and in this entry.

Tiny compiler-side change: none. The spec, constants, scene, and pipeline are unchanged; only tests + canon text were added.

### 2026-04-22 — Claude Opus 4.7 (1M context) — legibility tuning pass

Narrowed the adapter's default constants so the canonical two-squares scene tells a crisp one-sentence story. Architecture unchanged; only the mapping constants moved. Changes (all in `scripts/compile_echo_scene.py`):

- **Offset templates tightened** with a uniform 0.04 Hz step across all kinds: triangle `±0.04, 0`; square `±0.06, ±0.02`; pentagon `±0.08, ±0.04, 0`; hexagon `±0.10, ±0.06, ±0.02`. Was roughly 2.5× wider, spilling per-cluster Δω into the same range as the inter-cluster separation.
- **K0 formula**: `0.8 + 0.4·mean(weight)` → `1.6 + 0.4·mean(weight)`. At default weight=1.0 this resolves to K0=2.0, matching the lab's `regime_two_cluster.yaml` / `regime_locked.yaml` references.
- **sigma**: `0.18 → 0.22`. Wider spatial kernel lets the two squares couple through space firmly enough to lock rather than chatter.

Baseline detector set for the canonical example went from **7 of 8 fired (mostly low-confidence noise, `flam` dominant)** to **2 fired: `phase_locked` (11.57s of 12s) and `brittle_lock` (3s window)**. Tail `r` rose from 0.31 to 0.92. The atlas now has a clean hierarchy: top intervention is `ablate node 1` at score 1.22, second is `nudge node 0 by +0.25 Hz` at 1.05, then a 0.82-point cliff to everything else. Both top interventions are in the contour-anchored left square — the story the spec's example scene was always gesturing at.

**One-sentence story of the canonical example:** *"The two squares phase-lock, but the lock is brittle — perturbing a contour-anchored node in the left square cleanly breaks it."*

Kept deliberately untouched: the scene JSON (positions, radii, weights, strength, rotation), `gamma`, `eta`, event timing (`t=4.0 + i·1.0` s), contour `delta_hz` formula, target policy, duration, seed. Future legibility passes can revisit those if a different story is worth telling.

### 2026-04-22 — Claude Opus 4.7 (1M context) — pipeline driver script

Baked the end-to-end command chain into `scripts/run_echo_pipeline.sh` so the compile → sim → atlas mechanism is version-controlled rather than living only in memory / docs. The script is idempotent: it initializes the submodule on first run, creates `lab/resonant-instrument-lab/.venv/` and installs `numpy + pyyaml` if missing, then runs the three stages in sequence. Default invocation uses the canonical `two_squares_one_contour` scene; a stem arg or `--scene/--name` flags route to other scenes. README and Current Canon now point at the script as the primary entry point; the raw per-stage commands remain documented for anyone who wants finer control.

### 2026-04-22 — Claude Opus 4.7 (1M context)

**Built the EchoSurface → Resonant Lab adapter v0** per `echo_adapter_v0.md`. This is the first concrete bridge between the two projects since the submodule was added on 2026-04-22 (commit `35ba4f7`) and the spec on `1543733`.

Deliverables: `scripts/compile_echo_scene.py`, `examples/echo/two_squares_one_contour.json`, and the compiled proof artifacts under `configs/generated/echo_two_squares.{yaml,provenance.json}`. `.gitignore` gained `runs/` so simulator artifacts (large `.npz`/`.wav` plus per-fixture atlases) stay out of version control — they're reproducible from the config.

Verified end-to-end: the compiled 8-node / 4-event world fires 7 of 8 detectors in `summary.json`, and `build_atlas.py` ranks 16 interventions with a clear spread (top: "ablate node 7", score 3.57, 3 detector flips; bottom: 0.25). That's the nontrivial atlas story the spec asked for.

Decisions made that are worth recording:
- Chose **`all_nodes_from_anchor_shape`** as the contour-target policy over the nearest-centroid-node alternative. Rationale per spec: higher visible effect on the regime. Documented in `provenance.mapping.target_policy`.
- Chose **`gamma = 0.10`** over the spec's "e.g. `1.0`". Rationale: 0.10 is what every validated reference fixture in `lab/.../configs/regime_*.yaml` uses, so it reliably produces a nontrivial regime. The spec's `1.0` is flagged as an example, not a contract. Documented in `provenance.notes`.
- Chose to **commit `configs/generated/`** (YAML + provenance) but **gitignore `runs/`**. The generated config is itself a proof artifact of the compiler contract; the simulator outputs are derivable. This is how the lab treats its own `demo/` runs too.
- Chose a **single-file, no-framework compiler**. The spec explicitly says "Prefer a small, readable script over a reusable framework." No abstraction layer, no plugin system, no CLI around the lab scripts — the compiler just prints the two follow-up commands.

The adapter stays narrow by design. Any next pass that wants to widen it — live integration, tide compilation, melody generation, reverse mapping — should update `echo_adapter_v0.md` first so the spec and the implementation stay coupled.

## Core Thesis

EchoSurface began as an expressive touch surface, but the more interesting identity emerged once we treated it as a composition toy and ritual instrument.

Current north star:

`gesture shape expresses melodic intent, while harmonic state provides context`

And the visual thesis sitting beside it:

`the screen should feel like an instrument, not a control panel`

That means:

- gestures should author music more than knobs do
- harmony should quietly reshape meaning under the same contour
- playback should look alive, luminous, and slightly ceremonial
- UI chrome should stay light enough that the canvas remains the protagonist

## Where We Have Been

### Phase 1: From Touch Surface To Harmonic Toy

We introduced a global harmonic engine with tonic, mode, progression, bar count, bars-per-chord, and BPM. The surface stopped behaving like raw pitch painting and started behaving like musical material being interpreted inside a harmonic frame.

Important change in mindset:

- not "finger Y position equals frequency"
- instead "drawn contour implies relative melodic movement"

That was the first big shift toward musical coherence.

### Phase 2: Contour As Melody

Contours now get interpreted as:

- upward motion = rise
- downward motion = fall
- flatter motion = sustain
- sharper vertical moves = leaps

Those movements are then quantized into the active scale, with stable landings biased toward chord tones. This means a single phrase shape can survive harmonic motion and reharmonize gracefully instead of sounding like a literal replay.

### Phase 3: Retrace And Luminous Playback

Playback moved from abstract triggering into visible retrace. The drawn path is now replayed as a glowing contour, with note glyphs appearing along the line. This made the instrument legible. Users can see not only that something is playing, but how the gesture became phrase.

This was important because the surface needed to feel authored, not generative in a detached way.

### Phase 4: Orchestration Roles Instead Of Instrument Menus

We replaced explicit instrument picking with orchestration roles:

- `pad`
- `bass`
- `lead`
- `percussion`
- `echo`

The surface infers role from gesture character:

- long smooth drag -> pad
- long hold -> bass
- clustered taps -> percussion
- sharp zigzag contour -> lead
- circular motion -> echo / fx

We later added a subtle one-shot role seal so the next contour can be steered, but the main identity still depends on gesture inference.

This was a strong conceptual win. The user is not selecting a patch from a menu. They are casting a kind of musical behavior.

### Phase 5: Dialogue And Ritual Structure

We added call-and-response so a melodic contour can receive an answer phrase one bar later. The response preserves recognizable contour identity but varies harmonic landing, role, octave, and timing offset.

Then we added cadence events every 8 bars when multiple voices are active:

- harmonic resolution
- global ripple bloom
- radial sigil pulse
- brighter glyph intensity

This gave the piece larger-scale phrasing. The instrument began to feel less like a loop toy and more like a ritual ecology with arrival points.

### Phase 6: Fusion Voices

Most recently, overlapping active phrases can now spawn a temporary fusion voice. The overlap is not a simple layer boost. It becomes its own transient phenomenon:

- overlap is detected from playback-head proximity plus partial path overlap
- the fusion voice blends source colors and glyphs
- it takes on a distinct timbral role: `shimmer`, `arp`, or `harmonic-echo`
- it emits transient luminous note events in its own visual language

This is the first real sign that the system can generate ensemble interactions, not just independent voices sharing the same canvas.

### Phase 7: Soft Spatial Readability

One emerging problem was that once several roles were alive together, the surface could become beautiful but slightly difficult to parse. The answer was not to impose lanes as hard constraints. That would have damaged the instrument's sense of freedom.

Instead, we introduced soft spatial preferences:

- `bass` tends lower
- `pad` tends mid-low
- `lead` tends upper
- `percussion` accents near the top
- `echo` behaves more like an overlay field than a strict track

This matters conceptually. The screen is not becoming a piano roll. It is becoming more legible in the same way an ensemble onstage is legible: voices occupy tendencies, not prison cells.

Alongside the vertical tendency, we also added a subtle left-to-right flow field that gently encourages forward temporal motion. The key word is gently. Backward motion, circles, and local reversals are still allowed because they are musically meaningful:

- loops -> trill / shimmer behavior
- reversals -> syncopation / ornament
- circles -> sustained echo

This phase is easy to misunderstand if looked at only as implementation. It is not "constraint for order." It is "bias for readability."

### Phase 8: Silence As A First-Class Event

Another important shift was realizing that the system was still too eager to make everything speak all the time. Even with contour shaping, many phrase subdivisions were implicitly treated as note opportunities.

That is not how living music breathes.

So the phrase model now treats three states as primary:

- `note`
- `sustain`
- `rest`

This is not merely an audio detail. It changes the ontology of the score. Silence is now authored and rendered, not inferred after the fact as absence.

Preferred interpretation became:

- timing gaps between gesture segments can become rests
- long flatter horizontal spans can become either sustain or silence
- lower regions can softly encourage silence through a threshold bias

Playback now shows rests as dim ghost placeholders or fading empty glyph spaces. This was important. If silence is musically real, it should also be visually real. The user should feel that the surface is choosing to breathe, not failing to fire.

### Phase 10 (addendum): Polygon Snap — Geometric Shape Attraction

Closed contour phrases drawn as approximately regular polygons (triangle, square, pentagon, hexagon) now snap to canonical n-gon shapes and are interpreted as rhythmic cycles.

**Detection.** When `finalizeTouch` processes a closed gesture, it runs a new polygon detector *before* the scope/voice routing path. The detector:
1. Verifies closure (first ↔ last pixel distance ≤ 22% of min(w,h))
2. Resamples to 52 spatially-uniform points in pixel space (aspect-ratio aware)
3. Computes turning angle at each sample using a 3-sample window
4. Finds local curvature peaks → corner candidates
5. Clusters peaks within 8% of path count → N vertices
6. Accepts if N ∈ {3, 4, 5, 6} and both radius regularity (std/mean < 44%) and angular regularity (max spacing error < 46% of expected 2π/N) pass

This intentionally rejects smooth circles (no sharp peaks) so scope creation is unaffected.

**Snapping.** When accepted, the gesture is regularized:
- Center and radius computed from detected vertex centroid (pixel space, then converted back to normalized world coords)
- N evenly-spaced anchors placed at canonical vertex positions (aspect-ratio corrected)
- Path replaced with clean N-gon perimeter (N+1 points, closed)
- `polygonSpec` attached to the `ContourLoop` record

**Musical mapping.** Each polygon side maps to a voice role and rhythmic identity:
- Triangle (3) → `percussion` — triplet / 3-beat cycle
- Square (4) → `percussion` — four-on-the-floor / 4-beat cycle
- Pentagon (5) → `lead` — 5-beat odd meter
- Hexagon (6) → `pad` — 6-step compound groove

Every vertex is an accent onset (`accent: true`, `emphasis: 1.0`). Edges are traversal/sustain. One full perimeter = one bar. The N anchors fire N evenly-spaced notes per bar regardless of scene or harmonic rhythm.

**Visual sigil.** Polygon loops render as canonical geometric sigils (not warped voice contours):
- Full polygon outline (clean, not role-warped)
- Inner polygon rotated π/sides (stacked lozenge feel)
- Radial spokes centre → vertices
- Vertex dots (active vertex glows brighter + shadow)
- Active-edge retrace: completed edges bright, current edge with animated partial highlight
- Slow drift rotation in dormant state — feels alive, not frozen
- N-label below sigil

Polygon loops still participate in the full system: fusion detection, call-and-response, motif memory, cadence events, scope harmonic contexts.

**Key concept.** The polygon gesture is "ritual attraction" not "vector edit". The user draws a rough shape; the surface recognizes intent and snaps it to a canonical rhythmic cycle. The sigil-like rendering makes the relationship between shape and rhythm legible: square = four-on-the-floor is readable at a glance.

### Phase 9: Local Rhythm Gravity

We then added proximity-based phrase locking, but in a very specific way: not as hard quantization, and not as a grid imposed from above.

Instead, nearby active phrases now emit a soft rhythmic attraction field. When a new phrase is drawn near them, the system can:

- gently align onset timing
- bias local note spacing toward nearby rhythmic signatures
- inherit some motif density when it helps the phrase belong
- let response phrases phase-lock to nearby calls

What matters is the constraint style. The contour is still the user's. The field is only there to make adjacent phrases feel socially aware of one another.

This is especially important for cases like:

- a nearby four-on-the-floor pulse softly attracting quarter-note feel
- a nearby syncopated figure lending a timing skeleton without cloning itself
- a response phrase feeling rhythmically related to the call without becoming a copy

The principle is:

`phrases near each other may rhyme in time, but they should not snap into sameness`

### Phase 14.5: Polygon Snap Refinement — Touch-Friendly Classification

Three targeted fixes for the polygon snap system:

**1. Magnetic closure halo.** Once a gesture has traveled far enough to be a polygon candidate, a pulsing dashed ring appears around the start point. The ring breathes at 1.8 Hz and grows brighter as the finger approaches it. On touch devices the snap radius is `10%` of the short dimension — roughly 80–90px on a 9-inch iPad. On mouse/pen it's `5.5%`. When the stroke enters the halo, the gesture is auto-closed (last point snapped to first point) and `finalizeTouch` is called immediately, so the user doesn't need to precisely land on the origin.

**2. Confidence-based multi-fit classifier.** The original detector found N peaks, got one cluster count, then pass/failed a single N-gon. The new `fitNGon` helper partitions the resampled path into N equal windows and picks the sharpest corner in each, so a weak or merged corner (common in rough squares) is still represented. Each candidate N ∈ {3, 4, 5, 6} is scored independently on four axes: radius uniformity, angular uniformity, edge-length uniformity, and average corner sharpness normalised by the ideal interior angle for that N. All valid fits are collected and sorted; the highest-scoring N wins.

**3. Square preference heuristic.** When the highest-scoring fit is a triangle (N=3) but a square fit (N=4) scores within 14% of it, the square is chosen instead. Rationale: a right-angle corner is harder to draw cleanly than an equilateral corner, so squares that are drawn "well enough" were being mis-classified as triangles whenever one corner was slightly merged. This makes square drawing feel forgiving on iPad without inflating false positives for genuine triangles.

**Constants added to model.ts:**
- `POLYGON_HALO_RADIUS_TOUCH` (0.10), `POLYGON_HALO_RADIUS_MOUSE` (0.055)
- `POLYGON_HALO_MIN_TRAVEL_FRAC` (0.22)
- `POLYGON_FIT_MIN_SCORE` (0.18)
- `POLYGON_SQUARE_PREFERENCE_MARGIN` (0.14)

### Phase 14: Resonance Filaments — Phase Binding Between Polygon Loops

Canonical polygon loops can now be bound together into **polyrhythmic ecosystems** through resonance filaments.

**Interaction.** Drag from an active polygon sigil to another active polygon sigil. A dashed preview tether trails the finger. On release over a target polygon, a filament is created. Tap near the midpoint of an existing filament to cycle its binding mode.

**Binding modes.** Three modes are supported:
- **ratio-lock** (default): Both loops exchange pulses at their own step rate, making the N_A:N_B polyrhythm visually legible. Triangle↔square shows 3:4, pentagon↔square shows 5:4, square↔square shows synchronized pulse.
- **phase-align**: On each bar boundary, loop B's phase is nudged to align with loop A. Pulses travel both directions simultaneously. The pair gradually converges to rhythmic unison despite different step counts.
- **call-offset**: Pulses travel only A→B. When each pulse arrives at B, a resonance tone is scheduled at B's harmonic context — effectively making A call, B answer, with travel time as the offset.

**Visual tether.** Filaments render inside the world-space camera pass (so they zoom/pan with sigils). The tether is a quadratic Bezier arc bowed slightly perpendicular to the AB line. Two layers: outer glow halo + inner dashed line. The binding mode label appears at the arc midpoint: `3:4` for ratio-lock, `≡` for phase-align, `↠` for call-offset. Mode hues: phase-align = cyan, ratio-lock = amber, call-offset = magenta.

**Travelling pulses.** Each polygon step event spawns a pulse on all connected filaments. Pulses travel along the Bezier curve, with a short comet trail behind them. Travel time is proportional to the geometric distance between sigil centres, roughly half a beat minimum. Pulses are hue-colored by their source polygon.

**Filament lifecycle.** If either polygon loop is evicted (e.g., when MAX_LOOPS is exceeded), its filaments are automatically pruned. Max filaments is bounded by MAX_LOOPS^2 in practice but is not enforced separately.

**Key concept.** The filament makes the polyrhythm legible — you can *see* 3:4 happening as three pulses chase four pulses across the same arc. The goal is to make the surface feel like a living organism where rhythmic relationships are visible relationships.

### Phase 15: Radial Shape Palette — Touch-First Shape Summoning

The frustration addressed here: freehand polygon inference (Phase 10 / 14.5) is powerful but unreliable under hurried or imprecise touch input. Closing a shape precisely enough to trigger detection requires deliberate effort that interrupts creative flow on iPad.

The solution is an explicit, primary interaction that feels like *summoning* rather than *selecting*.

**Interaction.** A long press (~480ms) on empty canvas opens a radial shape palette centered at the touch anchor. During the press, a dashed pulsing ring grows around the touch point, giving tactile-visual feedback that the palette is loading. On the timer firing, the musical gesture in progress is silently abandoned and the palette blooms. The user drags (or holds still) over a wedge, then lifts to stamp the canonical shape. Lifting without entering a wedge dismisses the palette cleanly.

**Palette layout.** Four shapes arranged at cardinal positions around the anchor point:
- North (up): Triangle (3) — percussion / triplet
- East (right): Square (4) — percussion / four-on-the-floor
- South (down): Pentagon (5) — lead / 5-beat odd meter
- West (left): Hexagon (6) — pad / 6-step compound groove

Each wedge is an annular sector (inner radius ~30px, outer radius ~90px) with a role-colored radial gradient fill, a canonical polygon glyph at the midpoint, and a subtle N-label near the outer rim. A glowing center eye pulses under the anchor point.

**Visual feel.** The palette breathes at ~1.25 Hz (scale oscillation ± 4%). It arrives via an ease-out-cubic scale animation over ~280ms. The hovered wedge intensifies — brighter fill, thicker glyph stroke, soft shadow bloom. Non-hovered wedges stay dimly luminous, suggesting presence without demanding attention.

**System integration.** Stamped shapes use `spawnPolygonLoop` with a pre-built `PolygonSpec` (10% of min dimension, vertex pointing up). They are identical in musical participation to freehand-drawn polygons: rhythmic loop roles, phase bindings, resonance filaments, motif memory, and scope harmonic reinterpretation all work exactly the same.

**Preserving freehand.** The long-press detection is a timer-based hijack of the existing musical gesture. If the finger moves more than ~14px before the timer fires, the long-press is cancelled and the gesture proceeds as normal freehand input. So the freehand path (including polygon snap) remains fully intact as the "fast but imprecise" shortcut. The palette is the "slower but guaranteed" path.

**GestureMode extension.** A new `"palette-open"` mode was added to the existing strict state machine alongside `idle`, `musical`, `camera`, `motif-drag`, and `filament-drag`. Long-press timer cancellation is fully handled in all exit paths: second-finger camera transition, musical end, musical cancel.

**Key concept.** The gesture is not "opening a menu." It is "holding still until the field responds." The palette appearing below the anchor is less like a UI popup and more like energy pooling at the touch point until a pattern emerges. Releasing over a shape is releasing that held intention.

A sixth feeling worth protecting:

6. "The surface recognized what I meant, not just what I drew."

## What The Surface Is Now

At the moment, EchoSurface is roughly:

- a harmonic contour composer
- a gesture-inferred chamber ensemble
- a ritual score visualizer
- a lightly generative call-and-response system
- a time-based climax engine with cadence events
- an overlap-sensitive interaction field with fusion blooms
- a soft-lane ensemble score with readable role geography
- a phrase engine where silence and sustain are compositional material
- a local rhythm-gravity field where nearby phrases can phase-lock softly
- a dramaturgical form-engine with verse/chorus/bridge/drop scene arcs
- a hierarchical composition space where scopes create local harmonic worlds
- a session-memory layer where repeated contour families condense into named motifs
- a satellite-sigil ecology where dormant memories can be reawakened or migrated
- a geometric ritual field where drawn polygon shapes snap to canonical rhythmic cycles
- a polyrhythmic ecosystem where polygon loops can be bound by resonance filaments that make rhythmic ratios visible and audible
- a touch-first shape summoning system where long-press opens a radial palette that lets users stamp canonical rhythmic polygons without needing to draw them precisely
- a proximity-based clock hierarchy where polygon shapes act as local time beacons and new contours drawn near them inherit the beacon's N-beat cycle and phase
- a conduction layer where large sweeping gestures spawn traveling wavefronts (tides) that visibly pass through timing fields and temporarily awaken clock halos, playback heads, and latch tethers
- a tide interference layer where two overlapping wavefronts produce a visible collision bloom, a spiral vortex, and amplified field response at the crossing point — making simultaneous conductor gestures feel orchestrally meaningful
- a taste field layer where each scope can hold a musical personality (leapBias, syncopationBias, cadenceBias, tensionBias, repetitionBias, contourSmoothness) that shapes phrase realization without changing what was drawn — visible as subtle flowing taste currents inside scope boundaries

It is not trying to be a DAW, piano roll, or synth workstation.

That is worth defending.

The magic seems strongest when the user feels:

1. "I drew that."
2. "The system understood the shape, not just the coordinates."
3. "The world around it answered musically."

An additional feeling worth protecting now is:

4. "The silences felt chosen."

And now, a fifth:

5. "The world remembered us."

A sixth, added after clock latching:

6. "The shapes taught the phrases when to move."

### Phase 16: Clock Latching — Proximity-Based Temporal Entrainment

Canonical polygon loops are now explicit clock beacons. When a freehand contour is drawn within `CLOCK_LATCH_RADIUS` (0.28 of the shorter canvas dimension) of an active polygon shape, it latches onto that shape's timing and never lets go.

**What "latching" means.** The contour adopts two things from the polygon at birth:

- **Cycle duration**: `N × beatMs` — so a triangle gives a 3-beat phrase, a square a 4-beat phrase, pentagon 5-beat odd meter, hexagon compound 6. Before this, all contours cycled in one 4/4 bar regardless of nearby context. Now the polygon's meter is the dominant clock.
- **Phase reference**: the contour's `scheduledAtMs` is set to the beacon's next cycle start, so both enter their next cycle together.

**Sticky latching.** Once set at creation time, `clockLatch` never changes. The contour keeps the polygon's meter even if moved elsewhere later. The timing relationship is authored at the moment of drawing, not continuously maintained.

**Polygon cycle durations were also corrected.** Previously every polygon (triangle through hexagon) looped in exactly one 4/4 bar regardless of side count. That was musically inconsistent. Polygon `loopBars` is now `sides / BEATS_PER_BAR`:
- Triangle: `loopBars = 0.75` — 3 beats per cycle
- Square: `loopBars = 1.00` — 4 beats per cycle (unchanged)
- Pentagon: `loopBars = 1.25` — 5 beats per cycle
- Hexagon: `loopBars = 1.50` — 6 beats per cycle

This also makes the filament system's ratio labels (3:4, 5:4 etc.) reflect the actual cycle durations.

**Visual feedback.** Two simultaneous signals at latch moment:
1. A luminous dashed tether appears from contour centroid to polygon centre. It has an outer glow halo and a bright comet pulse that travels beacon → contour over the first 65 % of the tether's ~1.6-second life.
2. The beacon polygon receives a bright `"bar"` flash — a one-time ceremonial pulse that teaches the user "that shape owned this moment."

**Bonus: meter glyph.** Latched contours display a small glowing digit (3 / 4 / 5 / 6) near the playback head. The digit pops in with an ease-out-cubic over ~900 ms then settles to a gentle persistent pulse. A thin ring around the digit keeps it legible against busy backgrounds.

**Fallback.** If no polygon is within latch radius at draw time, the contour uses the existing global clock as before. Nothing breaks.

**Architecture note.** Polygon shapes are now formalized as clock sources in the codebase: the `ClockLatch` type on `ContourLoop` records the beacon ID, sides, and adopted cycle duration. The `findClockBeacon` helper does a linear search over active polygon loops and returns the nearest within radius. Future Tides work can query `clockLatch` directly to know which temporal family a contour belongs to.

### Phase 16.5: Clock Influence Halos — Latch Field Readability Pass

A focused visual polish pass on the clock latching system to make timing fields self-teaching without adding any UI chrome.

**Influence Halo.** Every active polygon loop now renders a persistent faint halo at its `CLOCK_LATCH_RADIUS` (0.28 of the shorter canvas dimension). The halo has:
- A very soft interior radial glow (low-opacity, fully transparent at the edge)
- A slowly drifting dashed perimeter ring that breathes at a polygon-specific rate (`0.55 + sides × 0.04` Hz) so overlapping halos feel independently alive
- A bright perimeter flash on each cycle's downbeat (`cycleProgress ≈ 0`)
- Color tinted by the polygon's role hue

This is rendered as a pre-pass inside the world-space camera transform, before the sigils and contours, so the fields sit beneath all other content like a floor glow.

**Proximity Feedback During Draw.** While a live stroke is in progress and the stroke head enters a beacon's latch field:
- The beacon's halo brightens and widens at its perimeter (the `isNearest && isDrawing` path in `drawClockInfluenceHaloPx`)
- A faint dashed preview tether appears from the beacon centre to the live stroke head — gradient from beacon hue to stroke hue, with a slow animated dash offset
- A transient meter glyph (3 / 4 / 5 / 6) floats near the stroke head, pulsing at the beacon's cycle rate so it feels like a live invitation rather than a tooltip
- Non-nearest beacons dim slightly while drawing to focus attention

**Field Overlap Readability.** When multiple latch fields overlap on screen:
- Interior glows blend naturally (additive canvas alpha compositing)
- The nearest beacon to the live stroke gets full brightness; others reduce to `0.42×` opacity
- Only one preview tether is ever visible at a time (nearest beacon wins)

**Implementation.** `drawClockInfluenceHaloPx` in `emitters.ts` handles all halo rendering. The EchoSurface render loop runs a halo pre-pass immediately after applying the camera transform, computing the nearest beacon to the live stroke head before iterating over all active polygon loops. The `_nearestBeaconForProximity` local variable threads the nearest-beacon result into the live-touch rendering section that already existed, adding the preview tether and meter glyph after the existing closure halo block.

**Key constraint maintained.** No toolbars, labels, or debug UI introduced. Every element (interior glow, pulsing ring, tether, digit) is diegetic — it reads as emanation from the shape, not annotation over it.

A seventh feeling now worth protecting:

7. "I could feel where the beat lives before I drew the phrase."

### Phase 17: Tides — Conduction Wavefront Layer

As of April 14, 2026.

The surface now responds to large open sweeping gestures with a visible traveling wavefront — a **tide** — that temporarily modulates nearby timing fields as it passes through them. This is a performance and conduction layer, not a composition layer. No phrase notes are created. No permanent mutations happen. The user is conducting the field, not programming it.

**Conceptual framing.** A tide is what happens between notes, not what makes the notes. The conductor's arm sweeping left-to-right is not playing a pitch — it is shaping time, energy, and density across the ensemble. The tide does the same: it passes through clock beacons, latched contours, and polygon sigils and leaves them slightly more awake, more vivid, and subtly stretched or rushed in their cycle. The effect decays fully within 2–3 seconds.

**Gesture detection.** Tide gestures are large open sweeps classified after polygon and scope detection have already run. A gesture becomes a tide when:

- Total travel > 0.48 normalised canvas units
- Dominant-axis span > 0.40 (either X or Y must dominate)
- Dominant axis is at least 1.8× the minor axis (ensures a directional sweep, not a wide arc)
- Circularity < 0.44 and loopiness < 0.40 (rules out echo/scope gestures)
- Duration ≥ 160 ms (rules out accidental fast flicks)

The four supported flavors and their visual hues:

- **rush** (L→R horizontal): sea-green / 168°
- **linger** (R→L horizontal): cool blue / 210°
- **swell** (B→T vertical, upward): warm gold / 42°
- **ebb** (T→B vertical, downward): violet / 272°

If no flavor can be classified (ambiguous direction), the gesture falls through to normal voice inference.

An explicit role seal (`previewRole`) bypasses tide detection entirely, preserving the seal's intent.

**Wavefront rendering.** The tide renders as a semi-transparent luminous ribbon traveling in the gesture direction:

- A broad soft gradient trail behind the leading edge (88 px wide, fades rearward)
- A bright luminous line at the leading edge (slightly breathing in width)
- 14 scattered particle motes near the front, each with its own twinkle phase
- Total lifetime 2.4 seconds; wavefront crosses gesture span in ~680 ms then coasts
- Max 3 concurrent waves (oldest pruned first) to prevent visual overload

The wavefront is rendered inside the world-space camera transform, after the clock influence halo pre-pass and before contour/flash rendering. It sits visually above the field glows but below the phrase voices.

**Field modulation.** As the wavefront passes over a clock beacon or contour playback head, a `getTideModulation(worldX, worldY, waves, now)` helper computes a [0–1] modulation factor based on signed distance from the wavefront front edge:

- Attack zone (4% of canvas ahead of front): modulation rises
- At front: peak modulation
- Trail zone (20% behind front): exponential-eased decay
- Otherwise: zero

Affected systems:

1. **Clock influence halos** (`drawClockInfluenceHaloPx`): receives optional `tideMod` (0–1). At peak, the downbeat flash is boosted by +0.55, interior glow by +5%, ring base alpha by +18%, ring shadow by +16 px, and the halo radius dilates +10%.

2. **Contour playback heads**: head glow radius expands up to +18%, alpha lifts up to +38%, and the role glyph scales up to +28% at peak modulation.

3. **Latch tethers**: tether alpha lifts by up to +60% at peak, making the temporal family relationship briefly more legible as the wave sweeps through.

**Architecture.** `TideWave` and `TideFlavor` live in `model.ts`. Detection (`detectTideGesture`) lives in `grammar.ts` alongside other gesture classifiers. Rendering (`drawTideWavefront`, `getTideModulation`) live in `emitters.ts`. `SimulationState` gained a `tideWaves: TideWave[]` field. The `finalizeTouch` path in `EchoSurface.tsx` runs tide detection after `inferVoiceRole` but before voice spawning, returning early if a tide is created.

**Strong Phase 1 constraint maintained.** No deep semantic mutations in Phase 1. The moduluation is 100% visual and reversible. Cycle durations, note pitches, harmonic context, and phrase structures are all untouched. The tide teaches by resonance — the field brightens and pulses when the wave arrives, then settles back.

An eighth feeling now worth protecting:

8. "I could feel the field breathing when I swept my hand across it."

### Phase 17.5: Tide Interference — Orchestral Collision Layer

As of April 14, 2026.

When two active tide wavefronts overlap or cross paths, the system now renders a visible **collision bloom** at their intersection and amplifies nearby field elements — making overlapping conductor gestures feel orchestrally meaningful and physically grounded.

**Conceptual framing.** Two conductors sweeping in different directions simultaneously are not playing the same thing twice. They are creating interference — a momentary energy concentration where the two intentions physically meet. That superposition should be visible and felt by the ensemble around it. The bloom is not decorative; it is the visual proof that two forces coincided.

**Interference detection.** Each render frame, `computeTideInterferenceNodes` checks all pairs of active waves (O(n²), n ≤ 3) for a geometric crossing point:

- **Horizontal × Vertical** — clean point crossing at `(frontX_H, frontY_V)`. The most dramatic case: two perpendicular sweeps produce a specific pixel address.
- **H × H (near-coincident)** — bloom at horizontal midpoint, only when the two fronts are within 2× the modulation zone of each other.
- **V × V (near-coincident)** — same, vertical midpoint.

Strength is the product of both waves' individual modulation at the crossing point (`modA × modB`). This means the bloom only lights up when both fronts are simultaneously present — it decays naturally as either wave moves on.

**Collision bloom rendering.** `drawTideInterferenceBloom` draws four back-to-front layers at the crossing point:

1. **Outer soft radial haze** — blended hue (short-arc mix of both wave hues), radius scales with strength.
2. **Interference rings** — two concentric pulsing rings, each tinted to one of the source wave hues, oscillating with a golden-ratio phase offset so they feel independently alive.
3. **Inner bright core** — white-hot radial bloom that breathes slowly; marks the exact collision address.
4. **Spiral vortex particles** — 20 deterministically seeded motes orbiting the collision point. They alternate between the two source hues, spiral outward with pulsing radii, and drift continuously at a slow angular rate. The orbit is continuous while the collision is active; it doesn't restart each frame.

**Nearby field amplification.** A `getTideInterferenceMod(worldX, worldY, nodes)` helper returns a proximity-based boost [0–1] based on distance from the nearest collision node (influence radius: 0.24 normalised units). This boost is added at ×1.4 on top of the existing single-wave `getTideModulation` result at three sites:

- **Clock influence halos**: downbeat flash, ring brightness, and radius dilation increase further inside the collision zone.
- **Contour playback heads**: glow radius and alpha boosted beyond single-wave level.
- **Latch tethers**: alpha lift extended — temporal family relationships become maximally legible at the collision moment.

**Architecture.** `TideInterferenceNode`, `TIDE_INTERFERENCE_RADIUS`, `computeTideInterferenceNodes`, `getTideInterferenceMod`, and `drawTideInterferenceBloom` all live in `emitters.ts`. No new state on `SimulationState` — nodes are ephemeral and recomputed each frame. The interference pre-compute runs once per render frame before the clock-halo pass so all downstream systems share the same node list. The bloom draw happens inside the world-space camera transform, above the wavefront ribbons but below note flashes.

**Constraint maintained.** No musical mutations. No permanent field changes. The collision is 100% visual and conduction-layer. It decays completely when either contributing wave expires.

A ninth feeling now worth protecting:

9. "When two sweeps crossed, the whole ensemble heard it."

### Phase 10: Scene Morphing — Macro Musical Form

The surface now composes larger musical form over time through four named scene states:

- `verse` — settled, spacious, sparse voices, root-biased chord landings, 82% cadence weight
- `chorus` — lifted and open, 3rd-biased landings, denser voices, warmer/brighter palette shift, 128% cadence weight
- `bridge` — suspended tension, 5th-biased landings, very sparse voices, muted/cooler palette, 58% cadence weight
- `drop` — maximum density, root-grounded, near-zero rests, full voice weight, richest colour, 188% cadence weight

The default cycle is `verse → chorus → verse → bridge → chorus → drop` on an 8-bar clock.

Each scene modifies five independent dimensions:
1. **Harmonic progression bias** — the preferred chord-tone landing index shifts the note resolution at stable phrase points
2. **Voice activity weighting** — probability of spawning call-and-response voices; bridge is sparse (30%), drop is always on (100%)
3. **Visual color palette** — the harmonic wash hue, saturation, and brightness shift per scene (warm amber in chorus, violet in bridge, gold in drop)
4. **Cadence intensity** — the cadence event fires harder or softer depending on scene
5. **Rest density** — the rest-score threshold is lifted (bridge, verse) or lowered (chorus, drop), biasing phrase density

The `phraseToken` now includes the scene name, so all active loops immediately rebuild their phrase notes when a scene transition fires.

**Bonus: early transition.** If `surfaceEnergy ≥ 0.72`, `activeRoles ≥ 3`, and `recentGestures ≥ 3` within the last two bars, the system can skip ahead before the 8-bar window expires — jumping `verse → chorus` or `chorus → drop` in response to high interaction energy or phrase density. This makes the surface feel compositionally responsive to how intensely it is being played.

### Phase 11: Motif Awakening And Session Memory

The next real shift was giving the surface memory that could be played, not just observed.

Contour phrases now get compared across the session. When enough of them repeat or cluster into the same recognizable family inside a parent scope, the system promotes them into a named motif entity rather than leaving them as unrelated loops.

Each motif now preserves:

- canonical contour shape
- preferred voice role
- harmonic tendencies
- rhythm skeleton
- canonical sigil

This matters conceptually because EchoSurface should not only interpret a single gesture correctly. It should start to remember shared musical history and let that history become part of the instrument.

The visual form of that memory is important. Promoted motifs appear as dormant satellite sigils orbiting their parent scope when zoomed out. That makes memory spatial instead of administrative:

- the scope is the local harmonic world
- the orbiting sigils are remembered phrase beings sleeping around it

Interaction now supports two important acts:

- tap a dormant sigil to re-summon the motif
- drag it into another scope to reinterpret that same remembered contour under the destination scope's harmonic world

That second behavior is the real unlock. A motif stops being a frozen preset and becomes migratory musical memory. Identity stays recognizable while meaning changes with context.

Awakened motifs also participate in call-and-response. This was necessary. If the remembered material cannot enter the dialogue system, it is decorative memory instead of living memory.

One subtle but crucial implementation consequence followed from this phase: scope-local harmonic worlds now need to matter during playback, not just at phrase birth. Reinterpretation only feels true if the same contour actually reharmonizes when it crosses into a new scope.

## Architectural Compaction Note

1. **New module structure**

- `src/world/scope.ts` now owns scope lookup, scope-context resolution, and screen/world transform logic.
- `src/music/engine.ts` now owns harmonic timing, scale/chord resolution, rhythm attraction, phrase construction, fusion behavior, and preset loop seeding.
- `src/rendering/glyphs.ts` now owns glyph drawing, role colour resolution, dialogue hue treatment, and loop warping.
- `src/rendering/emitters.ts` now owns scope sigils and the zoom-threshold emitter/sigil blend.
- `src/interaction/grammar.ts` now owns gesture summarization, role inference, gesture shaping, response-contour shaping, and pointer-to-surface coordinate capture.
- `src/emergence/memory.ts` now owns session-memory promotion, motif canonicalization, motif materialization, projected memory chips, and scope-level motif density / active-role snapshots.
- `src/surface/model.ts` and `src/surface/contour.ts` became the substrate: shared ontology, role/style constants, and contour/time primitives used by every higher layer.

2. **Concepts that emerged as first-class primitives**

- `ContourLoop` is now clearly the core authored musical object: a contour, anchor set, phrase state, role identity, and scope attachment.
- `ScopeRecord` is no longer just a rendering overlay. It is a musical world with inherited overrides and camera semantics.
- `GestureSummary` and contour utilities became a proper interaction grammar instead of hidden heuristics inside the component.
- `PhraseNote`, `RhythmAttractionField`, and `FusionVoice` now read as music-engine primitives rather than incidental render-time data.
- `MotifRecord` is now a first-class session-memory object rather than a vague future concept. That is important because recall, migration, and transformation all depend on it having real stored musical identity.
- `MotifSnapshot` / memory projection remains the lightweight emergence read model sitting beside the fuller motif records.

3. **Duplication and drift discovered**

- Scope-level active-role and motif-density logic had drifted into the render loop as ad hoc calculations; that is now centralized in `emergence/memory.ts`.
- Role semantics were previously leaking across interaction, rendering, and music in one file. The real invariant is that role is shared ontology, while each subsystem interprets it differently.
- Contour math, path sampling, and temporal interpolation were serving rendering, fusion overlap, rhythm locking, and phrase triggering simultaneously, but were not treated as a shared primitive. That was a hidden source of coupling.
- A key hidden invariant is that phrase state must be rebuilt whenever the harmonic/scene token changes before note triggering or motif-density reads happen; otherwise rendering and playback silently diverge.
- Another hidden invariant is that loop scheduling depends on resolving the innermost scope context before bar alignment. If scope resolution happens later, the phrase belongs to the wrong harmonic world even if its visuals look correct.

A minimal scene label appears bottom-centre with per-scene colour accents and a fade-in animation on each transition. It stays peripheral enough that the canvas remains the protagonist.

Important conceptual point: this is not "song sections" in the DAW sense. It is dramaturgical. The surface is not following a chart; it is accumulating conviction over time and releasing it.

### Phase 11: Scope Hierarchy — Hierarchical Composition Worlds

The surface is no longer a single flat plane. It now supports softly bounded elliptical "scopes": regions that contain their own harmonic context, voice phrases, and sub-scopes.

**Scope creation gesture.** Drawing a large, slow, closed loop (high circularity, loopiness, and travel, with the path ending near its origin, over at least 900ms) spawns a scope ellipse. The system assigns a randomly chosen ritual label (Liminal, Veil, Threshold, Hollow, Reverie, etc.) and a unique hue derived from its position.

**Scope records.** Each scope stores: center (cx, cy), radii (rx, ry), hue, label, parent/child ids, loop ids, and optional harmonic overrides for tonic, mode, BPM, progression, or scene. Overrides are applied on top of the parent's context, not instead of it. Walking the tree root→leaf produces the effective harmonic world for any phrase.

**Camera and semantic zoom.** The canvas applies a camera transform (translate + scale) each frame via smooth lerp. Two-finger pinch or scroll wheel zooms, with the cursor/pinch midpoint held stable in world space. Zooming in past a threshold while a scope is under view enters that scope. Zooming back out exits to the parent. This is not a node editor — it is more like falling into a world and surfacing again.

**Clock emitters.** Each scope renders animated concentric rings that pulse on the beat, synchronized to BPM. They communicate rhythmic identity without adding UI controls.

**Scope breadcrumb.** When inside a focused scope, a minimal breadcrumb appears top-center showing the scope name (tinted to its hue) and a tap-to-exit arrow. It disappears when at the root level.

**Musical implication.** Phrases drawn inside a scope inherit its harmonic overrides. Two scopes on the same canvas can be in different keys, modes, or scenes. The canvas becomes a composition of worlds rather than a composition on a single plane.

Important conceptual note: scopes are not containers in an app-UI sense. They are more like harmonic territories: fields of influence that give a region of the canvas its own musical character. The user is not managing a hierarchy — they are drawing an instrument and discovering that some regions sound different.

### Phase 12: Scope Sigils — Semantic Compression Through Symbol

When viewing the full collection (camera at default zoom = 1), each scope now collapses into a canonical **sigil**: a layered sacred-geometry glyph that encodes the scope's musical invariants as stable visual symbols.

The sigil is procedurally derived from six invariants, each mapped to a geometric dimension:

- **Tonic (key)** → polygon rotation angle. C = 0°, each chromatic step = +30°. The key is literally encoded as an orientation, so two scopes in different keys will always point differently.
- **Mode** → polygon type. Major = hexagon, minor = pentagon. The structural shape of the sigil changes with mode.
- **BPM** → spoke count. `<75bpm` → 3 spokes, `75–104` → 4, `105–144` → 6, `145+` → 8. Slow tempos read as heavy and sparse; fast tempos read as energetic and radially dense.
- **Scene section** → outer ring system. `verse` = single dashed ring (spacious); `chorus` = two solid rings (lifted); `bridge` = broken arc ring (suspended); `drop` = triple bold rings (maximum density).
- **Active voice roles** → orbiting satellites. Each active role in the scope produces a small role-glyph (circle/square/star/diamond/wave) orbiting the sigil at a fixed radius. Voice count and roles are readable at a glance.
- **Motif density** → center-eye radius. The central "eye" of the sigil expands with denser phrase activity, giving a direct visual reading of how rich the scope's phrase content is.

**Animation reflecting live state:**
- Slow base rotation (≈ 1° every 3 seconds) — the entire sigil drifts as a unit; it is alive, not frozen.
- Beat pulse — the center eye and ring brightness expand on each beat and decay sharply afterward, directly mirroring the scope's BPM.
- Voice satellites orbit in alternating directions, accelerating subtly during cadence events.
- Cadence glow brightens all layers during climax events.

**Zoom-based crossfade:**
The sigil and the full scope rendering crossfade smoothly as the camera zoom transitions from 1.0 (full collection) to 2.6 (zoomed in). At zoom=1 only the sigil is visible; by zoom=2.6 the full ellipse + clock emitters take over. This means "falling into" a scope is a gradual reveal — the abstract glyph expands into the navigable territory.

**Visual language / aesthetic:**
The sigil layers are: background halo → outer scene rings → radial spokes → primary polygon → inner star → voice satellites → center eye. This stacking produces a Vitruvian / ritual-circle aesthetic with clear semantic load. Each scope looks like a sigil that has been *cast*, not *configured*.

**Conceptual note:** The sigil is the scope's identity at rest: a compressed symbolic artifact representing its complete musical state. When you can see three scopes at once, you can read them as three distinct ritual objects without needing to enter any of them. This is semantic compression through symbolic representation.

### Phase 13: Instrument-Grade Touch Interaction

The previous touch handling was ad hoc: pinch detection happened mid-flight inside `moveTouch` by counting active pointers, retroactively marking both touches as `isPinch`, and relying on `finalizeTouch` to skip them. This caused several failure modes:

- A brief window where two-finger gestures recorded musical points before the pinch was recognized
- Zoom anchoring that computed world-space distance between fingers instead of screen-space, making zoom drift unpredictably
- Pan correction that called `screenToWorld` on already-world-coordinate values, resulting in no pan effect at all
- Wheel zoom that read from the lerp-lagged `cam.zoom` instead of `cam.targetZoom`, causing drift when scrolling rapidly

The fix is a strict explicit state machine called `GestureMode` (local to `EchoSurface.tsx`):

- `idle` — no pointers active
- `musical` — exactly one finger; records voice gesture points
- `camera` — exactly two fingers; drives pinch-zoom and pan only
- `motif-drag` — one finger dragging a dormant sigil into a new scope

The critical rule: when a second finger goes down while in `musical`, the in-progress musical gesture is immediately discarded (no voice emits), and the state transitions to `camera`. There is no state in which a gesture simultaneously produces both a voice and camera movement.

Zoom anchoring is now computed with the correct formula in both contexts:

- **Pinch zoom** stores an `anchorWorldX/Y` at the moment the second finger lands — the world point under the screen-space centroid of the two touches. Each subsequent move event computes `newZoom` as an absolute ratio `initialZoom * (currentDist / initialDist)` (no delta accumulation), then sets `targetViewCx = anchorWorldX - (centroidScreenX - 0.5) / newZoom`. The anchor world point is guaranteed to remain under the live centroid by identity.

- **Wheel zoom** now anchors against `targetZoom` and `targetViewCx/Cy` (not the lerp-lagged actual values), so rapid wheel events accumulate correctly instead of drifting.

The `isPinch` field was removed from `ActiveTouch` since the state machine makes it redundant. `PinchTracker` remains in `model.ts` for backward type compatibility but is no longer used operationally.

This phase prioritized iPad and touch-first behavior as a precondition for any future interaction work.

## Current Implementation Shape

Most of the intelligence currently lives in:

- `src/components/EchoSurface.tsx`

Supporting presentation and framing live in:

- `src/styles.css`
- `src/App.tsx`
- `src/components/HowToPlay.tsx`
- `README.md`

Important systems already present in `EchoSurface.tsx`:

- harmonic state and bar clock
- contour analysis and phrase-note building
- role inference from gesture summary
- soft swim-lane bias and subtle forward flow shaping
- proximity-based rhythm attraction and soft phrase locking
- phrase-event classification into note / sustain / rest
- anchor-timeline playback timing so gaps can remain musically meaningful
- retrace playback and glyph rendering
- call-and-response generation
- cadence ritual events
- fusion voice spawning and rendering
- scene morphing state machine (verse/chorus/bridge/drop) with early-trigger logic
- scope hierarchy: ScopeRecord tree, CameraState, semantic zoom, scope gesture creation
- clock emitter rendering and scope breadcrumb UI
- explicit GestureMode interaction state machine (idle / musical / camera / motif-drag)

This is powerful, but also means the main surface file is becoming the entire instrument brain. If the project keeps growing, it may be worth extracting pure musical logic into separate modules without losing the fast, sketch-like iteration style that got us here.

## Design Rules Worth Keeping

- Preserve the "screen as instrument" feeling.
- Prefer gesture interpretation over explicit control surfaces.
- Keep controls subtle and peripheral.
- Favor musical coherence over literal input mapping.
- Favor beauty over realism.
- Favor soft biases over hard rules.
- Let readability emerge from tendencies, not locked tracks.
- Treat silence as authored material, not missing output.
- Let harmony contextualize gesture rather than dominate it.
- Let nearby phrases influence one another through soft timing gravity, not hard snapping.
- When adding a system, ask whether it feels like ritual behavior or app behavior.

## New Heuristics Worth Remembering

These are not sacred formulas, but they are part of the current aesthetic contract.

### Spatial Heuristics

- roles may prefer regions, but gestures should still be free to trespass
- the `echo` voice should feel like a spectral overlay, not a lane-occupant in the usual sense
- forward time should be visually encouraged, but never enforced so strongly that reverse or circular marks feel "wrong"

### Phrase Heuristics

- not every subdivision deserves a note
- flatter motion can mean sustain, but it can also mean withholding
- timing gaps are expressive and should survive interpretation when possible
- nearby phrases may share pulse and density without sharing exact contour
- if the system must choose between density and breath, breath is often the more musical choice

### Visual Heuristics

- a rest should read as present absence
- the user should be able to see that a phrase contains space, not just hear it
- placeholders for silence should stay subtle enough that the score remains luminous rather than diagrammatic

## Tensions To Watch

These tensions are productive, but they can also break the spell if handled badly.

### 1. Clarity vs Mystery

Too little explanation and the user feels lost.
Too much explanation and it becomes software instead of enchantment.

### 2. Gesture Freedom vs Musical Guarantees

If the system over-quantizes, the surface can feel polite and samey.
If it under-quantizes, the musicality collapses.

### 3. More Features vs Less Chrome

The canvas wants to stay sacred. Every new selector risks turning the spell circle into a dashboard.

### 4. Generative Surprise vs User Ownership

Responses, cadences, and fusion events are interesting only if the user still feels authorship.

### 5. Readability vs Over-Scaffolding

The new lanes and flow field help a lot, but they can be pushed too far. If every role becomes visually over-disciplined, the instrument stops feeling like drawing and starts feeling like sorting.

### 6. Density vs Breath

Now that rests are first-class, a new failure mode appears: over-correcting into emptiness or making the system feel hesitant. Silence should feel intentional and phrased, not timid.

## AI Pontification: Where I Think This Could Go

This section is intentionally a little more speculative.

### Ritual Form, Not Just Loop Form

Right now the system has bars, chord changes, answers, and cadences. That is a strong start, but it could eventually support larger ceremonial arcs:

- invocation
- gathering
- agitation
- revelation
- cadence
- release

That could be driven by density, ensemble spread, contour temperature, or elapsed performance time. The point would not be "song sections" in a normal sense. The point would be giving the surface dramaturgy.

### Phrase Memory As Living Material

The instrument could begin remembering families of phrases, not just currently active loops.

Possible behaviors:

- a new contour can awaken an older contour variant
- repeated motifs can become stronger "spells"
- the surface can gradually ornament remembered phrases
- the surface can remember where a phrase tends to leave silence, not just where it speaks
- certain shapes can become recurring leitmotifs for a session

This would make the instrument feel like it has memory, not just playback.

### Harmonic Weather

The harmonic engine is currently explicit and useful, but still fairly stable. A next step could be a more atmospheric harmonic model:

- modal drift over time
- temporary borrowed chords
- suspension bars before full resolution
- tension fields created by ensemble density
- cadence events that actually reshape the next progression

This would keep the thesis intact while making harmony feel more alive than a fixed loop.

### Conductor Gestures

A compelling direction would be to reserve a small family of meta-gestures that do not add phrases but steer the ensemble:

- spiral inward = intensify
- wide horizontal sweep = thin texture
- vertical hold at center = suspend harmony
- ring around active voices = bind them into unison or octave spread

If done well, this would be far better than adding more buttons.

### Voice Personalities

The current roles are good, but they could become more socially aware.

Examples:

- `pad` could absorb and reharmonize nearby phrases
- `bass` could act as a gravitational anchor for fusion events
- `lead` could challenge or invert a prior phrase
- `percussion` could carve temporary rhythmic lattices into the bar
- `echo` could smear motifs across bars or answer late

That would move the ensemble toward behavior, not just timbre.

### Fusion As A Bigger Compositional System

Fusion voices are currently local and temporary. They could evolve into one of the most distinctive ideas in the project.

Possible next steps:

- allow triple-overlap events for rare "apotheosis" moments
- let repeated pairings stabilize into recurring hybrid roles
- make fusion alter harmony, not just ornament it
- let fusion glyphs seed answer phrases
- create a sense that some combinations are more alchemically compatible than others

This is high potential territory.

### Silence Rituals

Now that silence exists as an event, there is a lot of room to make it more ceremonial rather than merely subtractive.

Possible next steps:

- let a phrase accumulate "rest gravity" so repeated quiet gestures hollow out space around them
- let cadence moments briefly widen silence windows before the next arrival
- create visible breath marks or evaporating sigils between separated note clusters
- allow certain low, slow gestures to become near-silent conductorial marks rather than conventional voices

This could become one of the more distinctive parts of the instrument if handled delicately.

### Spatial Composition

The surface currently uses space for contour shape and visual placement, but there is room to push spatial meaning further:

- upper/lower regions could imply register families or harmonic brightness
- center vs edge could affect ritual weight
- quadrants could influence response temperament
- orbiting around an existing phrase could count as a relationship gesture

The risk here is making the space too coded. The opportunity is making the canvas feel more like a true field of forces.

### Performance Capture

Eventually this thing should probably be able to leave behind artifacts:

- export a performance as video
- export phrase data as JSON or MIDI-like abstractions
- snapshot a "ritual state" and resume it later
- save seeds for harmonic settings plus gesture memories

That would make EchoSurface feel less ephemeral when desired, while preserving the liveness of play.

## Good Next Steps If We Want Low Risk

- refine fusion overlap thresholds by ear and eye
- add one or two more progression moods, not a giant menu
- add a barely visible session state snapshot/export
- factor musical helper logic out of `EchoSurface.tsx`
- improve guide material so delayed answer and cadence behavior are easier to understand

## Good Next Steps If We Want High Reward

- **Tides** (designed, spec complete — see `TIDES_SPEC.md`)
- conductor gestures (partially subsumed by Tides)
- long-form ritual states / scene evolution
- persistent hybrid roles from repeated fusion pairings
- harmony that responds to ensemble behavior

### Phase 16 (Designed): Tides — Gestural Force Fields

Tides fill the missing gestural scale between phrases (small, creates a voice) and scopes (large closed loop, creates a world). A tide is a large, slow, open sweep across the canvas that does not add a new voice — instead, it modulates the existing ensemble as a propagating wave-front.

**Detection.** A tide is distinguished from other gestures by three simultaneous conditions: the gesture spans >45% of the visible canvas in its longest axis, mean velocity is below a "slow and deliberate" threshold, and circularity is low (open sweep, not a closed loop). No mode switch needed — the gesture itself is the mode.

**Types (inferred from shape):**
- Upward sweep → **swell** (crescendo, brighten filters, expand register)
- Downward sweep → **ebb** (decrescendo, darken, compress register)
- Left-to-right → **rush** (tighten rhythm, increase density, shorten sustain)
- Right-to-left → **linger** (loosen rhythm, increase sustain, more legato)
- Spiral inward → **converge** (intensify, compress toward center pitch)
- Spiral outward → **disperse** (thin texture, spread voices apart)

**Propagation and decay.** The tide emanates from the gesture path as a wave-front traveling across the canvas. Phrases are affected as the wave passes through them. Effect intensity falls off with distance from the gesture path. Peak effect at wave-front passage, then exponential decay over ~4 bars. Multiple tides can overlap and compound.

**Musical modulation.** Each tide type has a profile affecting five parameters: gain multiplier, filter cutoff offset, register shift (semitones), rhythm tightness scalar, and sustain multiplier. These are applied to each phrase's playback based on spatial proximity to the tide path.

**Visual language.** Translucent gradient wave-front in tide-specific hue (swell=gold, ebb=indigo, rush=white, linger=violet, converge=amber, disperse=cyan). Phrases ripple as the wave passes through. Fading "high water mark" trail along the gesture path. At scope zoom-out, tides appear as weather patterns.

**Scope awareness.** Tides drawn inside a scope only affect that scope's phrases. Root-level tides affect everything.

**Why this feature.** It adds dynamics, tempo feel, register width, and density control through pure gesture — no new UI chrome. It connects to the existing "Conductor Gestures" and "Harmonic Weather" aspirations but through embodied drawing rather than automation. It makes silence active (an ebb tide is a way of drawing toward silence). And it deepens the performance skill curve: first you learn to draw melodies, then you learn to build worlds, then you learn to conduct the weather.

Full implementation specification with function signatures, threshold values, and file paths: `TIDES_SPEC.md`

### Phase 11: Taste Field — Stylistic Realization Layer

As of April 14, 2026.

A new architectural layer sits between contour analysis and final note playback: the **Taste Field**. Where the previous pipeline was `analyzeContour → buildPhraseNotes → playback`, it is now `analyzeContour → buildPhraseNotes → realizeContourWithTaste → playback`.

**Conceptual framing.** Raw contour analysis tells you the shape of a gesture — where it rises, falls, leaps, sustains. `buildPhraseNotes` maps that shape onto scale tones. But a musical personality is still missing. Two pianists playing from the same lead sheet sound different because of their taste: one favors stepwise voice leading, one reaches for leaps; one lands phrases crisply on the beat, another plays with off-beat delay; one returns to familiar motifs, another constantly diverges. The Taste Field gives each scope its own musical personality without changing what the user drew.

**TasteProfile type.** Six normalised [0–1] biases define a taste:

- `leapBias` — 0 = always smooth stepwise lines, 1 = preserve raw leaps from contour
- `repetitionBias` — tendency to echo recent prior motif fragments at matching steps
- `syncopationBias` — push note onsets toward off-beats
- `tensionBias` — prefer non-chord tones on weak beats (dissonance appetite)
- `cadenceBias` — strength of phrase-end resolution toward tonic/chord tone
- `contourSmoothness` — pre-quantize melodic smoothing (neighbor averaging before scale snap)

**Scope ownership.** Each `ScopeRecord` now has an optional `tasteProfile?: TasteProfile`. The inner-scope-wins resolution means a child scope can have a sharper, more dissonant taste than its parent, and loops drawn in that scope will feel that personality without any global harmonic disruption.

**Realization pipeline.** `realizeContourWithTaste(ctx: TasteRealizationContext): PhraseNote[]` applies six passes in a defined order:

1. **Contour smoothing** — softens sharp local pitch changes before quantization
2. **Voice leading** — converts leaps to stepwise moves at probability `1 - leapBias`
3. **Repetition echo** — borrows pitches from the same loop's prior motif at echoed step indices, deterministically keyed by step + midi to avoid nondeterminism
4. **Syncopation shift** — probabilistically promotes off-beat triggers and suppresses some strong-beat triggers
5. **Tension injection** — on non-accented non-leap steps, push toward nearest non-chord-tone scale neighbor
6. **Cadence resolution** — in the final ~28% of steps, bias notes toward chord tones; last note always snapped if cadenceBias > 0.5

**Identity invariant.** Each pass refuses changes that reverse the note's directional movement. A rising gesture stays a rising gesture. A leap that is smoothed still moves in the same direction, just by a smaller interval. This is the architectural commitment: taste shapes the phrase, the contour defines it.

**Key correctness guarantee.** All output pitches remain in the current scale. No chromatic passing tones are introduced. Chord-tone snaps check against `getChordPitchClasses`; non-chord-tone injections check `buildExtendedScaleMidis`. The surface stays harmonically grounded even with high tensionBias.

**Taste Currents — visual vector field.** Each scope with a taste profile (or the default profile) renders subtle "taste current" flow lines inside the scope ellipse. `bakeTasteCurrentField()` computes a 7×7 grid of (x, y, dx, dy, strength) samples where each bias contributes a flow component:

- cadenceBias → rightward pull (phrase-end direction)
- leapBias → vertical excitation proportional to distance from center
- syncopationBias → diagonal shimmer computed from a slow time offset
- tensionBias → radial push outward from center
- repetitionBias → slow curl/eddy field (perpendicular rotation)
- contourSmoothness → convergent flow toward y=0.5 horizontal axis

`drawTasteCurrents()` in `emitters.ts` renders these as short animated arrows inside the scope ellipse, clipped to the ellipse boundary, at very low opacity (~0.22 × alpha). They become visible as the user zooms into a scope (sigilWeight drops, so `1 - sigilWeight` rises). They read as barely-there directionality — wind patterns or ocean currents, not UI chrome.

The field is cached on the scope (`scope.tasteCurrentField`) and regenerated every 8 seconds via `ensureTasteCurrentField()`. The slow regeneration interval, combined with `now`-seeded drift phases in both `bakeTasteCurrentField` and `drawTasteCurrents`, ensures the currents look alive without flickering.

**Architecture files:**

- `src/music/taste.ts` — all realization logic, TasteRealizationContext, DEFAULT_TASTE_PROFILE, field baking
- `src/surface/model.ts` — TasteProfile, TasteCurrentSample, TasteCurrentField types; `tasteProfile?` and `tasteCurrentField?` added to ScopeRecord
- `src/rendering/emitters.ts` — `drawTasteCurrents()` added at end of file; imports TasteCurrentField and TasteProfile from model
- `src/components/EchoSurface.tsx` — buildPhraseNotes result passed through realizeContourWithTaste before being stored; taste currents rendered inside scope loop before sigil layer

**Extensibility designed-in.** The six-pass pipeline structure makes it easy to add new passes (ornament injection, microtonal nuance, register gravity) without touching existing passes. Each pass is a pure `PhraseNote[] → PhraseNote[]` transform. The TasteProfile can grow new fields with defaults that produce no change.

A tenth feeling now worth protecting:

10. "The phrase felt like mine but more musical than I thought I was."

## If Another Chat Picks This Up Later

The most important thing to remember is that this project became interesting when it stopped being a generic audiovisual synth pad and started becoming a compositional ritual surface.

If future changes are ambiguous, bias toward:

- embodied musical gesture
- minimal chrome
- visible causality
- harmonic reinterpretation
- ensemble behavior
- theatrical beauty

If a new idea makes it feel more like software than sorcery, it probably needs another pass.
