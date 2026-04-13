# Tides — Implementation Specification

**Feature:** Gestural force fields that reshape the active ensemble without adding new voices.

**Philosophy:** Tides fill the missing gestural scale between phrase-drawing (small, creates a voice) and scope-drawing (large closed loop, creates a world). A tide is a large, slow, open sweep that modulates existing phrases — dynamics, register, rhythm density, filter brightness — as a wave-front propagating across the canvas.

**It should feel like conducting an ocean, not tweaking a parameter.**

---

## Phase 1: Data Structures & Tide Detection

**Goal:** Detect tide gestures in the grammar layer and classify them by type.

### 1A. New types in `src/surface/model.ts`

Add these after the `ResonanceFilament` type (around line 237):

```typescript
// ---------------------------------------------------------------------------
// Tides — gestural force fields that reshape the active ensemble
// ---------------------------------------------------------------------------

export type TideType =
  | "swell"     // upward sweep → crescendo, brighten, expand register
  | "ebb"       // downward sweep → decrescendo, darken, compress register
  | "rush"      // left-to-right sweep → tighten rhythm, increase density
  | "linger"    // right-to-left sweep → loosen rhythm, increase sustain
  | "converge"  // spiral inward → intensify, compress toward center pitch
  | "disperse"; // spiral outward → thin texture, spread voices apart

export type TideWave = {
  id: number;
  type: TideType;
  bornAt: number;
  /** Normalized 0-1 path of the original gesture (resampled to ~20 points) */
  path: NormalizedPoint[];
  /** Centroid of the gesture path */
  centroid: NormalizedPoint;
  /** Primary direction vector (unit-length, normalized) */
  direction: { dx: number; dy: number };
  /** Peak intensity (0-1), derived from gesture travel and speed */
  intensity: number;
  /** How far the wave-front has propagated (0 = just born, 1 = fully propagated) */
  propagation: number;
  /** Decay bars remaining (starts at TIDE_DECAY_BARS, counts down) */
  decayBars: number;
  /** Scope this tide was drawn inside (null = root) */
  scopeId: ScopeId | null;
};
```

Add these constants after the polygon constants (around line 733):

```typescript
// ---------------------------------------------------------------------------
// Tide detection thresholds
// ---------------------------------------------------------------------------

/** Gesture must span at least this fraction of visible canvas (in max axis) */
export const TIDE_MIN_CANVAS_SPAN = 0.45;
/** Mean velocity must be below this (normalized units per ms) to feel "slow" */
export const TIDE_MAX_MEAN_VELOCITY = 0.00038;
/** Circularity must be below this (open sweep, not a closed scope loop) */
export const TIDE_MAX_CIRCULARITY = 0.52;
/** Minimum gesture duration in ms */
export const TIDE_MIN_DURATION_MS = 600;
/** Minimum travel (prevents accidental detection from slow tiny gestures) */
export const TIDE_MIN_TRAVEL = 0.32;
/** Bars over which the tide effect decays */
export const TIDE_DECAY_BARS = 4;
/** Wave-front propagation speed: fraction of canvas per bar */
export const TIDE_PROPAGATION_SPEED = 0.5;
/** Max simultaneous active tides */
export const MAX_TIDES = 6;
/** Resampled point count for tide path storage */
export const TIDE_RESAMPLE_COUNT = 20;
/** Distance from tide path at which effect drops to zero (normalized) */
export const TIDE_INFLUENCE_RADIUS = 0.35;
```

Add `tides: TideWave[]` to the `SimulationState` type:

```typescript
export type SimulationState = {
  activeTouches: Map<number, ActiveTouch>;
  loops: ContourLoop[];
  flashes: PlaybackFlash[];
  recentGestures: RecentGesture[];
  cadenceEvents: CadenceEvent[];
  fusionVoices: FusionVoice[];
  filaments: ResonanceFilament[];
  tides: TideWave[];          // ← ADD THIS
  surfaceEnergy: number;
};
```

### 1B. Tide detection in `src/interaction/grammar.ts`

Add a new exported function after `inferVoiceRole` (around line 328):

```typescript
/**
 * Detect whether a completed gesture is a tide (large, slow, open sweep).
 * Returns the TideType if detected, or null if the gesture is not a tide.
 *
 * Detection criteria (ALL must be met):
 *   1. max(xSpan, ySpan) >= TIDE_MIN_CANVAS_SPAN
 *   2. meanVelocity <= TIDE_MAX_MEAN_VELOCITY
 *   3. circularity < TIDE_MAX_CIRCULARITY
 *   4. durationMs >= TIDE_MIN_DURATION_MS
 *   5. travel >= TIDE_MIN_TRAVEL
 */
export const detectTide = (
  summary: GestureSummary,
  points: NormalizedPoint[],
): TideType | null => {
  const maxSpan = Math.max(summary.xSpan, summary.ySpan);
  if (maxSpan < TIDE_MIN_CANVAS_SPAN) return null;
  if (summary.durationMs < TIDE_MIN_DURATION_MS) return null;
  if (summary.travel < TIDE_MIN_TRAVEL) return null;
  if (summary.circularity >= TIDE_MAX_CIRCULARITY) return null;

  const meanVelocity = summary.travel / Math.max(summary.durationMs, 1);
  if (meanVelocity > TIDE_MAX_MEAN_VELOCITY) return null;

  // Classify type from gesture shape
  const first = points[0];
  const last = points[points.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // Spiral detection: high loopiness + travel but low circularity
  // (circularity is already below threshold, so check loopiness)
  if (summary.loopiness > 0.38 && summary.reversalRatio > 0.30) {
    // Inward vs outward: compare radius of first third vs last third
    const centroid = summary.centroid;
    const thirdLen = Math.floor(points.length / 3);
    const earlyRadius = points.slice(0, thirdLen).reduce(
      (sum, p) => sum + Math.hypot(p.x - centroid.x, p.y - centroid.y), 0
    ) / Math.max(thirdLen, 1);
    const lateRadius = points.slice(-thirdLen).reduce(
      (sum, p) => sum + Math.hypot(p.x - centroid.x, p.y - centroid.y), 0
    ) / Math.max(thirdLen, 1);

    return lateRadius < earlyRadius * 0.78 ? "converge" : "disperse";
  }

  // Directional sweeps: dominant axis determines type
  if (absDy > absDx * 1.15) {
    // Vertical dominant
    return dy < 0 ? "swell" : "ebb"; // up = swell (canvas Y is inverted)
  }

  if (absDx > absDy * 0.85) {
    // Horizontal dominant (lower threshold — horizontal sweeps are more natural)
    return dx > 0 ? "rush" : "linger";
  }

  // Diagonal: pick by stronger component
  if (absDy >= absDx) {
    return dy < 0 ? "swell" : "ebb";
  }
  return dx > 0 ? "rush" : "linger";
};
```

Add the necessary imports at the top of `grammar.ts`:

```typescript
import {
  // ... existing imports ...
  TIDE_MIN_CANVAS_SPAN,
  TIDE_MAX_MEAN_VELOCITY,
  TIDE_MAX_CIRCULARITY,
  TIDE_MIN_DURATION_MS,
  TIDE_MIN_TRAVEL,
  type TideType,
} from "../surface/model";
```

### 1C. Hook tide detection into gesture completion in `EchoSurface.tsx`

In the `pointerUp` handler, **before** the polygon check (around line 1602), add the tide check. Tides should be checked first because they are the largest-scale gesture:

```typescript
// ---- Tide check — large, slow, open sweep → ensemble modulation ----
if (touch.points.length >= 8) {
  const tideSummary = summarizeGesture(
    relativePoints, gestureDurationMs, simulationRef.current.recentGestures
  );
  const tideType = detectTide(tideSummary, relativePoints);
  if (tideType) {
    spawnTide(touch.points, tideType, tideSummary);
    return;
  }
}
// ---- end tide check ----
```

The `spawnTide` function (add in `EchoSurface.tsx` near the other spawn helpers):

```typescript
const spawnTide = (
  rawPoints: NormalizedPoint[],
  type: TideType,
  summary: GestureSummary,
) => {
  const now = performance.now();
  const resampled = resamplePath(rawPoints, TIDE_RESAMPLE_COUNT);
  const first = resampled[0];
  const last = resampled[resampled.length - 1];
  const rawDx = last.x - first.x;
  const rawDy = last.y - first.y;
  const mag = Math.hypot(rawDx, rawDy) || 1;

  const scopeForTide = findScopeAt(
    summary.centroid.x, summary.centroid.y, scopesRef.current,
  );

  const wave: TideWave = {
    id: tideIdRef.current++,
    type,
    bornAt: now,
    path: resampled,
    centroid: summary.centroid,
    direction: { dx: rawDx / mag, dy: rawDy / mag },
    intensity: clamp(summary.travel * 1.2, 0.3, 1.0),
    propagation: 0,
    decayBars: TIDE_DECAY_BARS,
    scopeId: scopeForTide?.id ?? null,
  };

  simulationRef.current.tides = [
    ...simulationRef.current.tides,
    wave,
  ].slice(-MAX_TIDES);
};
```

Add a ref for tide IDs alongside the other ID refs:

```typescript
const tideIdRef = useRef(0);
```

Initialize `tides: []` in the simulation state initialization.

**Files touched:** `src/surface/model.ts`, `src/interaction/grammar.ts`, `src/components/EchoSurface.tsx`

---

## Phase 2: Tide Propagation, Decay & Influence Math

**Goal:** A self-contained module that advances tide wave-fronts each frame and computes the composite modulation at any given point.

### 2A. Create `src/surface/tides.ts`

```typescript
import {
  TIDE_DECAY_BARS,
  TIDE_INFLUENCE_RADIUS,
  TIDE_PROPAGATION_SPEED,
  type NormalizedPoint,
  type TideType,
  type TideWave,
} from "./model";
import { clamp, distance } from "./contour";

// ---------------------------------------------------------------------------
// Per-frame tick: advance propagation and decay
// ---------------------------------------------------------------------------

/**
 * Advance all tide waves by one frame.
 * @param tides   Current active tides (mutated in place for perf)
 * @param deltaMs Time since last frame in ms
 * @param barMs   Duration of one bar in ms
 * @returns Filtered array with expired tides removed
 */
export const tickTides = (
  tides: TideWave[],
  deltaMs: number,
  barMs: number,
): TideWave[] => {
  const deltaBars = deltaMs / barMs;

  for (const tide of tides) {
    // Advance wave-front propagation (0 → 1 over ~2 bars)
    tide.propagation = clamp(
      tide.propagation + TIDE_PROPAGATION_SPEED * deltaBars,
      0, 1,
    );

    // Decay begins after propagation reaches 0.5
    if (tide.propagation > 0.5) {
      tide.decayBars = Math.max(0, tide.decayBars - deltaBars);
    }
  }

  // Remove fully decayed tides
  return tides.filter(t => t.decayBars > 0);
};

// ---------------------------------------------------------------------------
// Influence: what modulation does the tide ensemble exert at a point?
// ---------------------------------------------------------------------------

export type TideModulation = {
  /** Gain multiplier: 1.0 = no change, >1 = louder, <1 = quieter */
  gainMultiplier: number;
  /** Filter cutoff offset in Hz: positive = brighter, negative = darker */
  filterOffset: number;
  /** Register shift in semitones: positive = higher, negative = lower */
  registerShift: number;
  /** Rhythm tightness scalar: >1 = tighter quantization, <1 = looser */
  rhythmTightness: number;
  /** Sustain multiplier: >1 = more legato, <1 = more staccato */
  sustainMultiplier: number;
};

const IDENTITY_MODULATION: TideModulation = {
  gainMultiplier: 1,
  filterOffset: 0,
  registerShift: 0,
  rhythmTightness: 1,
  sustainMultiplier: 1,
};

/**
 * Compute the minimum distance from a point to a polyline path.
 */
const distanceToPath = (px: number, py: number, path: NormalizedPoint[]): number => {
  let minDist = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const ax = path[i].x, ay = path[i].y;
    const bx = path[i + 1].x, by = path[i + 1].y;
    const abx = bx - ax, aby = by - ay;
    const apx = px - ax, apy = py - ay;
    const t = clamp((apx * abx + apy * aby) / (abx * abx + aby * aby + 1e-9), 0, 1);
    const projX = ax + t * abx, projY = ay + t * aby;
    const d = Math.hypot(px - projX, py - projY);
    if (d < minDist) minDist = d;
  }
  return minDist;
};

/**
 * Per-tide-type modulation profiles.
 * Each returns the raw modulation at full intensity (before distance falloff).
 */
const TIDE_PROFILES: Record<TideType, TideModulation> = {
  swell:    { gainMultiplier: 1.45, filterOffset:  800, registerShift:  3, rhythmTightness: 1.0,  sustainMultiplier: 1.2 },
  ebb:      { gainMultiplier: 0.60, filterOffset: -600, registerShift: -3, rhythmTightness: 1.0,  sustainMultiplier: 1.3 },
  rush:     { gainMultiplier: 1.15, filterOffset:  300, registerShift:  0, rhythmTightness: 1.35, sustainMultiplier: 0.7 },
  linger:   { gainMultiplier: 0.90, filterOffset: -200, registerShift:  0, rhythmTightness: 0.65, sustainMultiplier: 1.5 },
  converge: { gainMultiplier: 1.55, filterOffset:  600, registerShift:  1, rhythmTightness: 1.25, sustainMultiplier: 0.8 },
  disperse: { gainMultiplier: 0.70, filterOffset: -400, registerShift: -1, rhythmTightness: 0.75, sustainMultiplier: 1.4 },
};

/**
 * Compute the composite tide modulation at a given point.
 * Multiple tides stack additively (offsets) or multiplicatively (multipliers).
 *
 * @param px  Normalized x position of the phrase/voice
 * @param py  Normalized y position of the phrase/voice
 * @param tides  All currently active tide waves
 * @param scopeId  Scope the phrase belongs to (null = root)
 */
export const computeTideModulation = (
  px: number,
  py: number,
  tides: TideWave[],
  scopeId: number | null,
): TideModulation => {
  if (tides.length === 0) return IDENTITY_MODULATION;

  let gain = 1;
  let filter = 0;
  let register = 0;
  let rhythm = 1;
  let sustain = 1;

  for (const tide of tides) {
    // Scope filtering: a tide only affects phrases in its scope (or root tides affect all)
    if (tide.scopeId !== null && tide.scopeId !== scopeId) continue;

    // Distance falloff
    const dist = distanceToPath(px, py, tide.path);
    if (dist >= TIDE_INFLUENCE_RADIUS) continue;
    const proximity = 1 - dist / TIDE_INFLUENCE_RADIUS;

    // Decay envelope: full strength while decayBars > TIDE_DECAY_BARS/2,
    // then linear fade to zero
    const decayFrac = tide.decayBars / TIDE_DECAY_BARS;
    const envelope = clamp(decayFrac * 2, 0, 1);

    // Propagation gate: effect only reaches this point after the wave-front passes
    // Wave-front position is tide.propagation (0→1 over the canvas)
    // Simple model: wave-front is a line perpendicular to tide direction,
    // advancing from the gesture start
    const first = tide.path[0];
    const projectedProgress =
      (px - first.x) * tide.direction.dx + (py - first.y) * tide.direction.dy;
    const maxProjection = tide.propagation * 1.4; // 1.4 = propagation overshoots slightly for feel
    const waveFrontGate = clamp(
      (maxProjection - projectedProgress + 0.15) * 4, // soft edge
      0, 1,
    );

    const strength = proximity * envelope * waveFrontGate * tide.intensity;
    if (strength < 0.01) continue;

    const profile = TIDE_PROFILES[tide.type];

    // Multiplicative params blend toward the profile value
    gain    *= 1 + (profile.gainMultiplier - 1) * strength;
    rhythm  *= 1 + (profile.rhythmTightness - 1) * strength;
    sustain *= 1 + (profile.sustainMultiplier - 1) * strength;
    // Additive params
    filter   += profile.filterOffset * strength;
    register += profile.registerShift * strength;
  }

  return {
    gainMultiplier: clamp(gain, 0.25, 2.5),
    filterOffset: clamp(filter, -1200, 1200),
    registerShift: clamp(register, -7, 7),
    rhythmTightness: clamp(rhythm, 0.4, 2.0),
    sustainMultiplier: clamp(sustain, 0.3, 2.5),
  };
};
```

### 2B. Wire tick into the animation loop in `EchoSurface.tsx`

In the main `requestAnimationFrame` callback (the big `tick` or `drawFrame` function), add after updating fusion voices:

```typescript
// Advance tide wave-fronts
const barMs = getBarMs(harmonicStateRef.current);
simulationRef.current.tides = tickTides(
  simulationRef.current.tides,
  deltaMs,
  barMs,
);
```

Import `tickTides` from `../surface/tides`.

**Files touched:** New file `src/surface/tides.ts`, `src/components/EchoSurface.tsx`

---

## Phase 3: Apply Tide Modulation to Playback

**Goal:** Existing phrases respond musically to active tides during playback.

### 3A. Modulate audio parameters during note triggering

In `EchoSurface.tsx`, find where `playMelodicTone` is called during the playback loop (the retrace/scheduling section, NOT the touch-preview call). There should be a section that iterates over active loops and triggers notes based on the playback head position.

At the point where a note is about to be played, compute the tide modulation:

```typescript
import { computeTideModulation } from "../surface/tides";

// ... inside the playback loop, when triggering a note for a loop:
const loopCentroid = averagePoint(loop.points);
const tideMod = computeTideModulation(
  loopCentroid.x,
  loopCentroid.y,
  simulationRef.current.tides,
  loop.scopeId,
);

// Apply to playMelodicTone call:
playMelodicTone({
  midi: note.midi + Math.round(tideMod.registerShift),  // register shift
  hue: roleHue,
  accent: note.accent * tideMod.gainMultiplier,          // dynamics
  durationMs: noteDurationMs * tideMod.sustainMultiplier, // sustain
  voice: /* existing logic */,
  filterOffset: tideMod.filterOffset,                    // NEW PARAM (see 3B)
});
```

### 3B. Extend `playMelodicTone` to accept `filterOffset`

The `playMelodicTone` function (defined inside `EchoSurface.tsx`) creates oscillators and filters. Add an optional `filterOffset` parameter:

```typescript
// In the playMelodicTone options type, add:
filterOffset?: number;

// Where the biquad filter frequency is set, add the offset:
filter.frequency.setValueAtTime(
  baseFrequency + (options.filterOffset ?? 0),
  audioCtx.currentTime,
);
```

This is the minimal audio integration. The `registerShift`, `gainMultiplier`, and `sustainMultiplier` are applied by adjusting `midi`, `accent`, and `durationMs` at the call site — no changes to `playMelodicTone` needed for those.

**Files touched:** `src/components/EchoSurface.tsx`

---

## Phase 4: Visual Rendering

**Goal:** Tide wave-fronts are visible as translucent propagating gradients, and phrases ripple as the wave passes through.

### 4A. Tide hue palette

Add to `src/surface/model.ts` or a new section in `src/rendering/glyphs.ts`:

```typescript
export const TIDE_VISUAL: Record<TideType, { hue: number; label: string }> = {
  swell:    { hue: 42,  label: "swell" },    // warm gold
  ebb:      { hue: 230, label: "ebb" },       // deep indigo
  rush:     { hue: 0,   label: "rush" },      // bright white (saturation=0)
  linger:   { hue: 272, label: "linger" },    // soft violet
  converge: { hue: 34,  label: "converge" },  // concentrated amber
  disperse: { hue: 186, label: "disperse" },  // dispersing cyan
};
```

### 4B. Wave-front rendering in `src/rendering/emitters.ts`

Add a new export function:

```typescript
/**
 * Draw all active tide wave-fronts on the canvas.
 * Called from the main render loop after drawing loops but before UI overlays.
 *
 * Visual language:
 * - Translucent gradient band perpendicular to tide direction
 * - Leading edge is bright, trailing edge fades
 * - Tide path shown as fading "high water mark" trail
 * - Overall alpha decreases with decay
 */
export const drawTideWaves = (
  ctx: CanvasRenderingContext2D,
  tides: TideWave[],
  size: SurfaceSize,
  camera: CameraState,
  nowMs: number,
): void => {
  for (const tide of tides) {
    const visual = TIDE_VISUAL[tide.type];
    const decayAlpha = clamp(tide.decayBars / TIDE_DECAY_BARS, 0, 1);
    const baseAlpha = 0.12 * tide.intensity * decayAlpha;
    if (baseAlpha < 0.005) continue;

    const w = size.width;
    const h = size.height;

    ctx.save();

    // 1. Draw the "high water mark" trail along the gesture path
    ctx.beginPath();
    ctx.strokeStyle = `hsla(${visual.hue}, 60%, 70%, ${baseAlpha * 2.5})`;
    ctx.lineWidth = 3 + tide.intensity * 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 0; i < tide.path.length; i++) {
      const px = tide.path[i].x * w;
      const py = tide.path[i].y * h;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // 2. Draw the wave-front as a perpendicular gradient band
    // Front position along the tide direction
    const first = tide.path[0];
    const frontDist = tide.propagation * 1.4;
    const frontX = (first.x + tide.direction.dx * frontDist) * w;
    const frontY = (first.y + tide.direction.dy * frontDist) * h;

    // Perpendicular direction for the gradient band
    const perpDx = -tide.direction.dy;
    const perpDy = tide.direction.dx;
    const bandHalfWidth = TIDE_INFLUENCE_RADIUS * Math.min(w, h);

    // Radial gradient centered on the wave-front
    const gradient = ctx.createRadialGradient(
      frontX, frontY, 0,
      frontX, frontY, bandHalfWidth,
    );
    const isWhite = tide.type === "rush"; // rush uses desaturated white
    const hslBase = isWhite
      ? `0, 0%, 90%`
      : `${visual.hue}, 55%, 65%`;
    gradient.addColorStop(0, `hsla(${hslBase}, ${baseAlpha * 1.6})`);
    gradient.addColorStop(0.5, `hsla(${hslBase}, ${baseAlpha * 0.8})`);
    gradient.addColorStop(1, `hsla(${hslBase}, 0)`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // 3. Subtle type label at the centroid (like scene labels)
    if (decayAlpha > 0.3) {
      const labelAlpha = (decayAlpha - 0.3) * 1.4 * tide.intensity;
      ctx.font = "11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = `hsla(${visual.hue}, 40%, 75%, ${clamp(labelAlpha * 0.5, 0, 0.4)})`;
      ctx.fillText(
        visual.label,
        tide.centroid.x * w,
        tide.centroid.y * h - 8,
      );
    }

    ctx.restore();
  }
};
```

### 4C. Call `drawTideWaves` from the render loop

In the main `drawFrame` / canvas rendering function in `EchoSurface.tsx`, add the call after drawing contour loops and before drawing UI overlays (scope breadcrumb, scene label, etc.):

```typescript
// Draw tide wave-fronts
drawTideWaves(
  ctx,
  simulationRef.current.tides,
  sizeRef.current,
  cameraRef.current,
  now,
);
```

Import `drawTideWaves` from `../rendering/emitters`.

**Files touched:** `src/surface/model.ts` or `src/rendering/glyphs.ts`, `src/rendering/emitters.ts`, `src/components/EchoSurface.tsx`

---

## Phase 5: Polish & Tuning

**Goal:** Refinements that make tides feel alive and integrated.

### 5A. Phrase ripple effect

In the loop rendering code (where each contour loop's retrace path is drawn), add a subtle visual wobble when a tide wave-front is passing through:

```typescript
const tideMod = computeTideModulation(
  loopCentroid.x, loopCentroid.y,
  simulationRef.current.tides,
  loop.scopeId,
);
// If tide is actively modulating, add a sine wobble to the glyph rendering
const tideActivity = Math.abs(tideMod.gainMultiplier - 1) +
  Math.abs(tideMod.registerShift) / 7 +
  Math.abs(tideMod.filterOffset) / 1200;
if (tideActivity > 0.05) {
  // Add per-point y-offset wobble during retrace drawing
  const wobble = Math.sin(now * 0.004 + pointIndex * 0.8) * tideActivity * 3;
  // Apply wobble to the y-coordinate of each drawn point
}
```

### 5B. Surface energy integration

When a tide is spawned, boost `surfaceEnergy` slightly (tides are performative acts):

```typescript
simulationRef.current.surfaceEnergy = clamp(
  simulationRef.current.surfaceEnergy + 0.06 * wave.intensity,
  0.14, 1.2,
);
```

### 5C. Tide spawning sound

When a tide is detected, play a soft "breath" sound — a filtered noise burst with long attack and release, at very low volume. Use the existing `triggerNoiseBurst` pathway but with:
- Much longer envelope (attack: 200ms, release: 600ms)
- Lower gain (0.06-0.12)
- Filter frequency matched to tide type (swell = higher, ebb = lower)
- This gives haptic audio feedback that something meta-gestural happened

---

## Integration Checklist

For each phase, verify:

- [ ] TypeScript compiles with no errors (`npx tsc --noEmit`)
- [ ] The app runs (`npm run dev`) and doesn't crash
- [ ] Phase 1: Draw a large, slow sweep across >50% of the canvas — console.log confirms tide detected
- [ ] Phase 2: Tide propagation advances and tides eventually expire
- [ ] Phase 3: Active phrases audibly change (brighter/darker, louder/quieter) when a tide wave passes
- [ ] Phase 4: Translucent wave-front is visible propagating across the canvas
- [ ] Phase 5: Phrase glyphs wobble subtly when modulated; tide spawn makes a soft sound

---

## Threshold Tuning Notes for Sonnet

The thresholds in this spec are educated guesses. If testing reveals issues:

**Tides triggering too easily** (stealing normal gestures):
- Raise `TIDE_MIN_CANVAS_SPAN` to 0.55
- Lower `TIDE_MAX_MEAN_VELOCITY` to 0.00030
- Raise `TIDE_MIN_TRAVEL` to 0.40

**Tides never triggering:**
- Lower `TIDE_MIN_CANVAS_SPAN` to 0.38
- Raise `TIDE_MAX_MEAN_VELOCITY` to 0.00048
- Lower `TIDE_MIN_DURATION_MS` to 450

**Tide effects too strong:**
- Halve all values in `TIDE_PROFILES`
- Reduce `TIDE_INFLUENCE_RADIUS` to 0.25

**Tide effects too subtle:**
- Double `TIDE_PROFILES` values
- Increase `TIDE_INFLUENCE_RADIUS` to 0.45

**Priority of gesture detection** in `pointerUp` should be:
1. Tide (largest scale — checked first)
2. Polygon (closed, cornered shapes)
3. Scope (closed, smooth loops)
4. Voice phrase (everything else)
