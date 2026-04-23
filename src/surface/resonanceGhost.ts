import type { ContourLoop, PolygonSpec } from "./model";
import { clamp } from "./contour";

/**
 * Resonance Ghost — v1 "nearest phase-lock" suggestion.
 *
 * A single deterministic hint computed from the current scene:
 * "if you moved this shape here, these two clusters would lock."
 *
 * Scope is intentionally narrow: polygon ↔ polygon only, at most one
 * suggestion at a time, no automatic mutation. The renderer draws a
 * dashed ghost outline at `ghostSpec` to show the attractor position.
 */

/**
 * Distance (in normalized world units) between polygon centres at which
 * two clock beacons feel "locked" — their influence halos just kiss.
 * Chosen around 2 × CLOCK_LATCH_RADIUS (0.28) so a contour drawn near
 * either centre is well within the other's reach.
 */
export const GHOST_PREFERRED_MID = 0.38;

/**
 * Half-width of the "already locked" band centered on GHOST_PREFERRED_MID.
 * Pairs whose distance falls inside [mid−this, mid+this] are considered
 * already in lock and suppress the ghost for that pair.
 */
export const GHOST_LOCK_WINDOW = 0.06;

/**
 * Maximum deviation from GHOST_PREFERRED_MID the heuristic will
 * consider a "near-lock" candidate. Beyond this the pair is effectively
 * independent — no ghost.
 */
export const GHOST_NEAR_LOCK_RANGE = 0.28;

/**
 * Minimum score (after same-sides bonus) for a ghost to be surfaced.
 * Keeps the suggestion rare and deliberate.
 */
export const GHOST_MIN_SCORE = 0.32;

/**
 * If the suggested move is smaller than this (normalized units), the ghost
 * is suppressed — the pair is already close enough that pointing at a
 * tiny delta feels like noise rather than guidance.
 */
export const GHOST_MIN_MOVE = 0.025;

/** Padding from canvas edges when clamping the ghost centre. */
const GHOST_EDGE_PAD = 0.06;

export type ResonanceGhost = {
  /** Loop whose polygon is the attractor (stationary partner). */
  anchorLoopId: number;
  /** Loop whose polygon is suggested to move. */
  moverLoopId: number;
  /** Spec of the suggested new polygon position. Same sides / radius /
   *  rotation as the mover's current polygon — only cx/cy change. */
  ghostSpec: PolygonSpec;
  /** Delta (normalized world units) from mover's current centre to ghost. */
  deltaX: number;
  deltaY: number;
  /** Score of this suggestion in [0, 1]. Higher = more confident. */
  score: number;
};

const gcd = (a: number, b: number): number => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
};

/** Compatibility bonus for rhythmic interoperability between two polygons. */
const sideCompatBonus = (sidesA: number, sidesB: number) => {
  if (sidesA === sidesB) return 0.25;
  if (gcd(sidesA, sidesB) > 1) return 0.10;
  return 0;
};

/**
 * Compute the single strongest phase-lock ghost suggestion, or null if no
 * pair qualifies.
 *
 * Deterministic: given the same inputs, always returns the same ghost.
 * The function does not mutate anything; callers are expected to render
 * the result and discard it on the next frame.
 */
export const computeResonanceGhost = (
  loops: ContourLoop[],
  nowMs: number,
): ResonanceGhost | null => {
  const polygons = loops
    .filter((loop) => loop.polygonSpec && nowMs >= loop.scheduledAtMs)
    .slice()
    .sort((a, b) => a.id - b.id);

  if (polygons.length < 2) return null;

  let best: ResonanceGhost | null = null;

  for (let i = 0; i < polygons.length; i += 1) {
    for (let j = i + 1; j < polygons.length; j += 1) {
      const loopA = polygons[i];
      const loopB = polygons[j];
      const specA = loopA.polygonSpec as PolygonSpec;
      const specB = loopB.polygonSpec as PolygonSpec;

      const dx = specB.cx - specA.cx;
      const dy = specB.cy - specA.cy;
      const dist = Math.hypot(dx, dy);
      if (dist < 1e-4) continue;

      const gap = Math.abs(dist - GHOST_PREFERRED_MID);

      // Inside the "already locked" band: nothing to suggest.
      if (gap <= GHOST_LOCK_WINDOW) continue;

      // Outside the near-lock reach: too far apart or overlapping to lock
      // with a small nudge. Stay silent rather than invent a move.
      if (gap > GHOST_NEAR_LOCK_RANGE) continue;

      const proximityScore = 1 - gap / GHOST_NEAR_LOCK_RANGE;
      const score = proximityScore + sideCompatBonus(specA.sides, specB.sides);
      if (score < GHOST_MIN_SCORE) continue;

      // Mover = the newer partner (or higher id on tie). The older shape
      // reads as the established home; the newer one is the one that
      // "wants to settle".
      const aIsMover =
        loopA.bornAt === loopB.bornAt
          ? loopA.id > loopB.id
          : loopA.bornAt > loopB.bornAt;
      const anchor = aIsMover ? loopB : loopA;
      const mover = aIsMover ? loopA : loopB;
      const anchorSpec = anchor.polygonSpec as PolygonSpec;
      const moverSpec = mover.polygonSpec as PolygonSpec;

      // Direction from anchor toward the mover — ghost sits along that
      // ray at the preferred lock distance. Preserving direction keeps
      // the suggestion feeling like "settle where you were heading".
      const rx = moverSpec.cx - anchorSpec.cx;
      const ry = moverSpec.cy - anchorSpec.cy;
      const rLen = Math.hypot(rx, ry);
      if (rLen < 1e-4) continue;
      const ux = rx / rLen;
      const uy = ry / rLen;

      const targetCx = clamp(
        anchorSpec.cx + ux * GHOST_PREFERRED_MID,
        GHOST_EDGE_PAD,
        1 - GHOST_EDGE_PAD,
      );
      const targetCy = clamp(
        anchorSpec.cy + uy * GHOST_PREFERRED_MID,
        GHOST_EDGE_PAD,
        1 - GHOST_EDGE_PAD,
      );

      const moveX = targetCx - moverSpec.cx;
      const moveY = targetCy - moverSpec.cy;
      if (Math.hypot(moveX, moveY) < GHOST_MIN_MOVE) continue;

      if (!best || score > best.score) {
        best = {
          anchorLoopId: anchor.id,
          moverLoopId: mover.id,
          ghostSpec: {
            sides: moverSpec.sides,
            cx: targetCx,
            cy: targetCy,
            rFraction: moverSpec.rFraction,
            rotation: moverSpec.rotation,
          },
          deltaX: moveX,
          deltaY: moveY,
          score,
        };
      }
    }
  }

  return best;
};
