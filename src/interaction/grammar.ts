import type { PointerEvent as ReactPointerEvent } from "react";

import {
  POLYGON_ANGLE_REGULARITY_TOLERANCE,
  POLYGON_CLOSURE_THRESHOLD,
  POLYGON_CLUSTER_DISTANCE_FRAC,
  POLYGON_CURVATURE_WINDOW,
  POLYGON_FIT_MIN_SCORE,
  POLYGON_MIN_CORNER_ANGLE_RAD,
  POLYGON_MIN_RADIUS_PX,
  POLYGON_MIN_TRAVEL,
  POLYGON_RADIUS_REGULARITY_TOLERANCE,
  POLYGON_RESAMPLE_COUNT,
  POLYGON_SQUARE_PREFERENCE_MARGIN,
  RESPONSE_ROLE_MAP,
  TAU,
  TIDE_DIRECTION_RATIO,
  TIDE_MAX_CIRCULARITY,
  TIDE_MAX_LOOPINESS,
  TIDE_MIN_DURATION_MS,
  TIDE_MIN_SPAN,
  TIDE_MIN_TRAVEL,
  type CameraState,
  type ContourAnchor,
  type GestureSummary,
  type NormalizedPoint,
  type PolygonSpec,
  type RecentGesture,
  type TideFlavor,
  type VoiceRole,
  VOICE_ROLE_LANES,
} from "../surface/model";
import {
  averagePoint,
  clamp,
  coerceContourPoints,
  distance,
  easeOutCubic,
  getGestureBounds,
  getGestureTravel,
  lerp,
  mix,
  modulo,
  pathDuration,
  point,
  smoothResampledPath,
} from "../surface/contour";
import { screenToWorld } from "../world/scope";

export const chooseHue = (pointValue: NormalizedPoint, interactions: number) => {
  const seed = pointValue.x * 132 + pointValue.y * 64 + interactions * 18;
  return 18 + (seed % 196);
};

export const summarizeGesture = (
  points: NormalizedPoint[],
  durationMs: number,
  recentGestures: RecentGesture[],
): GestureSummary => {
  const centroid = averagePoint(points);
  const travel = getGestureTravel(points);
  const bounds = getGestureBounds(points);
  const xSpan = bounds.maxX - bounds.minX;
  const ySpan = bounds.maxY - bounds.minY;
  const directDistance = distance(points[0] ?? centroid, points.at(-1) ?? centroid);
  const smoothness = travel / Math.max(directDistance, 0.01);
  let signChanges = 0;
  let xReversals = 0;
  let previousVerticalSign = 0;
  let previousHorizontalSign = 0;
  let forwardTravel = 0;
  let reverseTravel = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const verticalSign = Math.sign(previous.y - current.y);
    const horizontalSign = Math.sign(current.x - previous.x);

    if (
      verticalSign !== 0 &&
      previousVerticalSign !== 0 &&
      verticalSign !== previousVerticalSign
    ) {
      signChanges += 1;
    }
    if (
      horizontalSign !== 0 &&
      previousHorizontalSign !== 0 &&
      horizontalSign !== previousHorizontalSign
    ) {
      xReversals += 1;
    }

    if (horizontalSign !== 0) {
      previousHorizontalSign = horizontalSign;
    }

    if (verticalSign !== 0) {
      previousVerticalSign = verticalSign;
    }

    const deltaX = current.x - previous.x;
    if (deltaX >= 0) {
      forwardTravel += deltaX;
    } else {
      reverseTravel += Math.abs(deltaX);
    }
  }

  const zigzag = signChanges / Math.max(points.length - 1, 1);
  const startEndDistance = distance(points[0] ?? centroid, points.at(-1) ?? centroid);
  const balancedSpan =
    1 -
    clamp(
      Math.abs(xSpan - ySpan) / Math.max(Math.max(xSpan, ySpan), 0.001),
      0,
      1,
    );
  const radialTravel =
    points.reduce(
      (total, current) => total + Math.hypot(current.x - centroid.x, current.y - centroid.y),
      0,
    ) / Math.max(points.length, 1);
  const circularity = clamp(
    (1 - clamp(startEndDistance / 0.16, 0, 1)) * 0.44 +
      balancedSpan * 0.24 +
      clamp(travel / Math.max(radialTravel * TAU, 0.14), 0, 1) * 0.32,
    0,
    1,
  );
  const reversalRatio = clamp(
    reverseTravel / Math.max(forwardTravel + reverseTravel, 0.001) +
      clamp(xReversals / Math.max(points.length - 1, 1), 0, 1) * 0.28,
    0,
    1,
  );
  const forwardBias =
    (forwardTravel - reverseTravel) / Math.max(forwardTravel + reverseTravel, 0.001);
  const loopiness = clamp(
    circularity * 0.66 +
      clamp(xReversals / Math.max(points.length - 1, 1), 0, 1) * 0.22 +
      reversalRatio * 0.12,
    0,
    1,
  );
  const tapLike = durationMs < 280 && travel < 0.05;
  const nearbyTapCount = recentGestures.filter(
    (gesture) =>
      gesture.tapLike &&
      durationMs > 0 &&
      gesture.timestamp > performance.now() - 1100 &&
      distance(gesture.centroid, centroid) < 0.14,
  ).length;

  return {
    centroid,
    durationMs,
    travel,
    xSpan,
    ySpan,
    smoothness,
    zigzag,
    circularity,
    tapLike,
    nearbyTapCount,
    reversalRatio,
    loopiness,
    forwardBias,
  };
};

export const createBassDronePath = (points: NormalizedPoint[]) => {
  const centroid = averagePoint(points);
  const bounds = getGestureBounds(points);
  const xStart = clamp(bounds.minX - 0.04, 0.06, 0.84);
  const xEnd = clamp(bounds.maxX + 0.08, xStart + 0.12, 0.94);
  const baseY = clamp(centroid.y + 0.06, 0.32, 0.86);

  return [
    point(xStart, baseY, 0),
    point(lerp(xStart, xEnd, 0.28), baseY - 0.02, 220),
    point(lerp(xStart, xEnd, 0.56), baseY - 0.03, 420),
    point(lerp(xStart, xEnd, 0.82), baseY - 0.015, 700),
    point(xEnd, baseY, 980),
  ];
};

export const createPercussionPath = (
  points: NormalizedPoint[],
  nearbyTapCount: number,
) => {
  const centroid = averagePoint(points);
  const width = clamp(0.08 + nearbyTapCount * 0.018, 0.08, 0.18);
  const height = clamp(0.05 + nearbyTapCount * 0.014, 0.05, 0.13);
  const left = clamp(centroid.x - width * 0.5, 0.08, 0.88);
  const right = clamp(centroid.x + width * 0.5, left + 0.05, 0.92);
  const midX = (left + right) * 0.5;
  const top = clamp(centroid.y - height * 0.5, 0.12, 0.82);
  const bottom = clamp(centroid.y + height * 0.5, top + 0.03, 0.88);

  return [
    point(left, centroid.y, 0),
    point(midX, top, 110),
    point(right, centroid.y, 240),
    point(midX, bottom, 360),
    point(left, centroid.y, 520),
  ];
};

export const createEchoPath = (points: NormalizedPoint[]) => {
  const resampled = smoothResampledPath(points, 14, 1);
  const first = resampled[0];
  const last = resampled.at(-1) ?? first;

  if (distance(first, last) < 0.04) {
    return resampled;
  }

  const centroid = averagePoint(resampled);
  return [
    ...resampled,
    point(
      mix(last.x, centroid.x, 0.42),
      mix(last.y, centroid.y, 0.42),
      (last.t ?? 0) + 140,
    ),
    point(first.x, first.y, (last.t ?? 0) + 280),
  ];
};

export const createLeadPath = (points: NormalizedPoint[]) => {
  const contour = coerceContourPoints(points);
  const centroid = averagePoint(contour);

  return contour.map((current, index) => {
    if (index === 0 || index === contour.length - 1) {
      return current;
    }

    return point(
      current.x,
      clamp(centroid.y + (current.y - centroid.y) * 1.12, 0.08, 0.92),
      current.t,
    );
  });
};

export const applyGestureFieldToPath = (
  role: VoiceRole,
  points: NormalizedPoint[],
  summary: GestureSummary,
) => {
  if (points.length < 2) {
    return points;
  }

  const lane = VOICE_ROLE_LANES[role];
  const forwardAffinity = 0.72 + ((summary.forwardBias + 1) * 0.5) * 0.38;

  return points.map((current, index, values) => {
    const amount = index / Math.max(values.length - 1, 1);
    const previous = values[Math.max(index - 1, 0)] ?? current;
    const deltaX = current.x - previous.x;
    const reverseAllowance =
      clamp(-deltaX / 0.08, 0, 1) * (0.6 + summary.reversalRatio * 0.24);
    const laneEnvelope = 0.34 + Math.sin(amount * Math.PI) * 0.66;
    const overlayDrift =
      lane.overlay
        ? Math.sin(amount * TAU + summary.loopiness * Math.PI) * lane.spread * 0.1
        : 0;
    const targetY = lane.overlay ? lane.center + overlayDrift : lane.center;
    const lanePull =
      lane.strength *
      laneEnvelope *
      (lane.overlay ? 0.74 + summary.circularity * 0.18 : 1);
    const forwardPush =
      lane.flow *
      easeOutCubic(amount) *
      forwardAffinity *
      (1 - reverseAllowance * 0.82) *
      (1 - summary.loopiness * (lane.overlay ? 0.12 : 0.2));
    const flowRipple =
      Math.sin(current.y * Math.PI * 5 + amount * Math.PI * 2 + summary.circularity) *
      0.0022;

    return point(
      clamp(current.x + forwardPush + flowRipple, 0.04, 0.96),
      clamp(mix(current.y, targetY, lanePull), 0.05, 0.95),
      current.t,
    );
  });
};

export const inferVoiceRole = (
  points: NormalizedPoint[],
  durationMs: number,
  recentGestures: RecentGesture[],
) => {
  const summary = summarizeGesture(points, durationMs, recentGestures);

  if (durationMs > 1050 && summary.travel < 0.05) {
    return { role: "bass" as const, summary };
  }

  if (
    summary.circularity > 0.68 &&
    summary.travel > 0.14 &&
    summary.xSpan > 0.07 &&
    summary.ySpan > 0.07
  ) {
    return { role: "echo" as const, summary };
  }

  if (summary.tapLike && (summary.nearbyTapCount >= 1 || summary.durationMs < 180)) {
    return { role: "percussion" as const, summary };
  }

  if (
    summary.zigzag > 0.22 &&
    summary.travel > 0.12 &&
    (summary.ySpan > 0.11 || summary.smoothness > 1.5)
  ) {
    return { role: "lead" as const, summary };
  }

  if (
    durationMs > 620 &&
    summary.travel > 0.16 &&
    summary.smoothness < 1.7 &&
    summary.zigzag < 0.18
  ) {
    return { role: "pad" as const, summary };
  }

  if (summary.tapLike) {
    return { role: "percussion" as const, summary };
  }

  return {
    role: summary.smoothness < 1.55 ? ("pad" as const) : ("lead" as const),
    summary,
  };
};

export const shapePointsForRole = (
  role: VoiceRole,
  points: NormalizedPoint[],
  summary: GestureSummary,
) => {
  let shaped: NormalizedPoint[];

  switch (role) {
    case "pad":
      shaped = smoothResampledPath(coerceContourPoints(points), 12, 2);
      break;
    case "bass":
      shaped = createBassDronePath(points);
      break;
    case "lead":
      shaped = createLeadPath(points);
      break;
    case "percussion":
      shaped = createPercussionPath(points, summary.nearbyTapCount);
      break;
    case "echo":
      shaped = createEchoPath(smoothResampledPath(points, 16, 1));
      break;
  }

  return applyGestureFieldToPath(role, shaped, summary);
};

export const getResponseRole = (sourceRole: VoiceRole, seed: number) => {
  const options = RESPONSE_ROLE_MAP[sourceRole];
  return options[modulo(seed, options.length)];
};

export const buildResponsePoints = (
  sourcePoints: NormalizedPoint[],
  responseRole: VoiceRole,
  seed: number,
) => {
  const base = smoothResampledPath(sourcePoints, Math.max(sourcePoints.length, 10), 1);
  const centroid = averagePoint(base);
  const timingSkew = 1 + (seed % 3) * 0.08;
  const xPush = responseRole === "echo" ? 0.018 : responseRole === "lead" ? 0.012 : 0.008;
  const yLift =
    responseRole === "bass"
      ? 0.06
      : responseRole === "pad"
        ? -0.03
        : responseRole === "lead"
          ? -0.02
          : responseRole === "echo"
            ? 0.015
            : 0.02;
  const transformed = base.map((current, index) => {
    const amount = index / Math.max(base.length - 1, 1);
    const ripple = Math.sin(amount * Math.PI * 1.5 + seed) * 0.018;
    const tailBias = index >= base.length - 2 ? (responseRole === "bass" ? 0.03 : -0.022) : 0;

    return point(
      clamp(current.x * 0.94 + 0.03 + amount * xPush, 0.06, 0.95),
      clamp(
        mix(current.y, centroid.y, responseRole === "bass" ? 0.26 : 0.12) +
          ripple +
          yLift +
          tailBias,
        0.08,
        0.92,
      ),
      current.t * timingSkew + index * 16,
    );
  });
  const summary = summarizeGesture(
    transformed,
    Math.max(pathDuration(transformed), 1),
    [],
  );

  let shaped: NormalizedPoint[];

  switch (responseRole) {
    case "pad":
      shaped = smoothResampledPath(transformed, 12, 2);
      break;
    case "bass":
      shaped = smoothResampledPath(transformed, 10, 2).map((current, index, values) => {
        const amount = index / Math.max(values.length - 1, 1);
        return point(
          current.x,
          clamp(mix(current.y, centroid.y + 0.08, 0.34) + amount * 0.012, 0.16, 0.9),
          current.t,
        );
      });
      break;
    case "lead":
      shaped = createLeadPath(transformed);
      break;
    case "percussion":
      shaped = createPercussionPath(transformed, 1);
      break;
    case "echo":
      shaped = createEchoPath(smoothResampledPath(transformed, 16, 1));
      break;
  }

  return applyGestureFieldToPath(responseRole, shaped, summary);
};

export const makeSurfacePoint = (
  event: ReactPointerEvent<HTMLDivElement>,
  element: HTMLDivElement,
  time: number,
  camera?: CameraState,
) => {
  const bounds = element.getBoundingClientRect();
  const screenNormX = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
  const screenNormY = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);

  if (!camera || camera.zoom === 1) {
    return point(screenNormX, screenNormY, time);
  }

  const [worldX, worldY] = screenToWorld(screenNormX, screenNormY, camera);
  return point(worldX, worldY, time);
};

// ---------------------------------------------------------------------------
// Polygon gesture detection — confidence-based multi-fit classifier
// ---------------------------------------------------------------------------

/** Resample path to uniform spatial distance in pixel space. */
const spatialResamplePoints = (
  pts: NormalizedPoint[],
  count: number,
  w: number,
  h: number,
): NormalizedPoint[] => {
  if (pts.length < 2) return pts;
  const totalDist = pts
    .slice(1)
    .reduce(
      (s, p, i) =>
        s + Math.hypot((p.x - pts[i].x) * w, (p.y - pts[i].y) * h),
      0,
    );
  if (totalDist < 1) return pts;
  const step = totalDist / (count - 1);
  const result: NormalizedPoint[] = [pts[0]];
  let acc = 0;
  let pi = 0;

  for (let i = 1; i < count - 1; i++) {
    const target = i * step;
    while (pi < pts.length - 2) {
      const segLen = Math.hypot(
        (pts[pi + 1].x - pts[pi].x) * w,
        (pts[pi + 1].y - pts[pi].y) * h,
      );
      if (acc + segLen >= target) break;
      acc += segLen;
      pi++;
    }
    const segLen = Math.hypot(
      (pts[pi + 1].x - pts[pi].x) * w,
      (pts[pi + 1].y - pts[pi].y) * h,
    );
    const t = Math.min((target - acc) / Math.max(segLen, 0.001), 1);
    result.push(
      point(
        lerp(pts[pi].x, pts[pi + 1].x, t),
        lerp(pts[pi].y, pts[pi + 1].y, t),
        lerp(pts[pi].t, pts[pi + 1].t, t),
      ),
    );
  }
  result.push(pts[pts.length - 1]);
  return result;
};

// ── Per-N fit result (internal) ────────────────────────────────────────────────
type NGonFit = {
  sides: number;
  score: number;
  cx: number;   // normalised world
  cy: number;
  rFraction: number;
  rotation: number;
};

/**
 * Fit an exact N-gon to the curvature signal by partitioning the resampled
 * path into N equal windows and picking the sharpest corner in each window.
 *
 * Returns a scored fit, or null if the fit fails hard constraints.
 *
 * Score is in [0, 1]: higher is better.  It combines:
 *   • radius uniformity    (vertices equidistant from centroid)
 *   • angular uniformity   (vertices evenly spread around centroid)
 *   • edge-length uniformity
 *   • average corner sharpness normalised by the ideal angle for this N
 */
const fitNGon = (
  pts: NormalizedPoint[],
  curvatures: number[],
  N: number,
  W: number,
  H: number,
): NGonFit | null => {
  const M = pts.length;
  const minDim = Math.min(W, H);

  // Find best corner in each of N equal windows of the path
  const vertexIndices: number[] = [];
  for (let seg = 0; seg < N; seg++) {
    const start = Math.floor((seg * M) / N);
    const end = Math.floor(((seg + 1) * M) / N);
    let bestIdx = start;
    let bestVal = curvatures[start] ?? 0;
    for (let i = start + 1; i < end; i++) {
      if ((curvatures[i] ?? 0) > bestVal) {
        bestVal = curvatures[i];
        bestIdx = i;
      }
    }
    vertexIndices.push(bestIdx);
  }

  // Average corner sharpness (normalised: ideal interior angle for N-gon)
  const idealInteriorAngle = Math.PI - TAU / N; // π - 2π/N
  let avgSharpness = 0;
  for (const idx of vertexIndices) {
    avgSharpness += Math.min((curvatures[idx] ?? 0) / Math.max(idealInteriorAngle, 0.01), 1.5);
  }
  avgSharpness /= N;

  // Pixel-space vertices
  const pxVerts = vertexIndices.map((i) => ({
    x: pts[i].x * W,
    y: pts[i].y * H,
  }));

  // Centroid
  const pxCx = pxVerts.reduce((s, v) => s + v.x, 0) / N;
  const pxCy = pxVerts.reduce((s, v) => s + v.y, 0) / N;

  const pxRadii = pxVerts.map((v) => Math.hypot(v.x - pxCx, v.y - pxCy));
  const avgPxR = pxRadii.reduce((s, r) => s + r, 0) / N;

  if (avgPxR < POLYGON_MIN_RADIUS_PX) return null;

  // ── Radius uniformity ──────────────────────────────────────────────────────
  const radiusCV = Math.sqrt(
    pxRadii.reduce((s, r) => s + (r - avgPxR) ** 2, 0) / N,
  ) / (avgPxR || 1);
  if (radiusCV > POLYGON_RADIUS_REGULARITY_TOLERANCE) return null;

  // ── Angular uniformity ─────────────────────────────────────────────────────
  const angles = pxVerts
    .map((v) => Math.atan2(v.y - pxCy, v.x - pxCx))
    .sort((a, b) => a - b);
  const expectedSpacing = TAU / N;
  let maxAngleErr = 0;
  let sumAngleErrSq = 0;
  for (let i = 0; i < N; i++) {
    const nextAngle = i < N - 1 ? angles[i + 1] : angles[0] + TAU;
    const err = Math.abs(nextAngle - angles[i] - expectedSpacing);
    maxAngleErr = Math.max(maxAngleErr, err);
    sumAngleErrSq += err * err;
  }
  if (maxAngleErr > expectedSpacing * POLYGON_ANGLE_REGULARITY_TOLERANCE) return null;
  const angularCV = Math.sqrt(sumAngleErrSq / N) / expectedSpacing;

  // ── Edge-length uniformity ─────────────────────────────────────────────────
  const edges: number[] = [];
  for (let i = 0; i < N; i++) {
    const a = pxVerts[i];
    const b = pxVerts[(i + 1) % N];
    edges.push(Math.hypot(b.x - a.x, b.y - a.y));
  }
  const avgEdge = edges.reduce((s, e) => s + e, 0) / N;
  const edgeCV = Math.sqrt(
    edges.reduce((s, e) => s + (e - avgEdge) ** 2, 0) / N,
  ) / (avgEdge || 1);

  // ── Composite score (higher = better fit) ─────────────────────────────────
  // Each term is a penalty in [0,1]; we subtract from 1.
  const score =
    avgSharpness * 0.30
    - radiusCV  * 0.30
    - angularCV * 0.25
    - edgeCV    * 0.15;

  return {
    sides: N,
    score,
    cx: pxCx / W,
    cy: pxCy / H,
    rFraction: avgPxR / minDim,
    rotation: angles[0],
  };
};

/**
 * Detect a regular polygon in a closed freehand path.
 *
 * Algorithm (replaces original single-pass peak-cluster approach):
 *
 *   1. Verify closure + travel (unchanged gate)
 *   2. Resample to uniform spatial spacing
 *   3. Compute turning-angle curvature at each sample
 *   4. For N ∈ {3, 4, 5, 6}: partition path into N windows, pick sharpest
 *      corner in each, score the resulting N-gon fit
 *   5. Apply square-preference heuristic: if 4-gon score is within a
 *      margin of 3-gon score, prefer the 4-gon (squares are harder to
 *      draw cleanly on touch surfaces so they need extra forgiveness)
 *   6. Return the highest-scoring valid fit, or null
 */
export const detectPolygon = (
  rawPoints: NormalizedPoint[],
  surfaceWidth: number,
  surfaceHeight: number,
): PolygonSpec | null => {
  if (rawPoints.length < 6) return null;

  const W = surfaceWidth;
  const H = surfaceHeight;
  const minDim = Math.min(W, H);

  // 1. Closure gate — auto-close may have already nudged the path, so use
  //    a slightly relaxed threshold here (actual snapping adds the last vertex).
  const first = rawPoints[0];
  const last = rawPoints[rawPoints.length - 1];
  const closurePx = Math.hypot((first.x - last.x) * W, (first.y - last.y) * H);
  if (closurePx > POLYGON_CLOSURE_THRESHOLD * minDim) return null;

  // Travel gate
  const travelPx = rawPoints
    .slice(1)
    .reduce(
      (s, p, i) =>
        s + Math.hypot((p.x - rawPoints[i].x) * W, (p.y - rawPoints[i].y) * H),
      0,
    );
  if (travelPx < POLYGON_MIN_TRAVEL * minDim) return null;

  // 2. Spatially uniform resample
  const M = POLYGON_RESAMPLE_COUNT;
  const pts = spatialResamplePoints(rawPoints, M, W, H);

  // 3. Curvature (turning angle) at each sample
  const WIN = POLYGON_CURVATURE_WINDOW;
  const curvatures: number[] = new Array(M).fill(0);
  for (let i = WIN; i < M - WIN; i++) {
    const prev = pts[i - WIN];
    const curr = pts[i];
    const next = pts[i + WIN];
    const d1x = (curr.x - prev.x) * W;
    const d1y = (curr.y - prev.y) * H;
    const d2x = (next.x - curr.x) * W;
    const d2y = (next.y - curr.y) * H;
    const len1 = Math.hypot(d1x, d1y) || 0.001;
    const len2 = Math.hypot(d2x, d2y) || 0.001;
    curvatures[i] = Math.acos(
      clamp((d1x / len1) * (d2x / len2) + (d1y / len1) * (d2y / len2), -1, 1),
    );
  }

  // 4 & 5. Fit each candidate N, collect valid fits
  const candidates: NGonFit[] = [];
  for (const N of [3, 4, 5, 6]) {
    const fit = fitNGon(pts, curvatures, N, W, H);
    if (fit && fit.score >= POLYGON_FIT_MIN_SCORE) {
      candidates.push(fit);
    }
  }
  if (candidates.length === 0) return null;

  // Sort descending by score
  candidates.sort((a, b) => b.score - a.score);

  // 6. Square-preference heuristic: if best is triangle and a square fit
  //    exists within margin, upgrade to the square.
  let winner = candidates[0];
  if (winner.sides === 3) {
    const squareFit = candidates.find((c) => c.sides === 4);
    if (
      squareFit &&
      squareFit.score >= winner.score * (1 - POLYGON_SQUARE_PREFERENCE_MARGIN)
    ) {
      winner = squareFit;
    }
  }

  return {
    sides: winner.sides,
    cx: winner.cx,
    cy: winner.cy,
    rFraction: winner.rFraction,
    rotation: winner.rotation,
  };
};

/**
 * Build the regularized N-gon path in normalized world coordinates.
 * The path closes (first point = last point, modulo floating point).
 * Timestamps span 0–1000 ms for anchor timing compatibility.
 */
export const buildPolygonPath = (
  spec: PolygonSpec,
  surfaceWidth: number,
  surfaceHeight: number,
): NormalizedPoint[] => {
  const { sides, cx, cy, rFraction, rotation } = spec;
  const pxR = rFraction * Math.min(surfaceWidth, surfaceHeight);
  const result: NormalizedPoint[] = [];
  for (let i = 0; i <= sides; i++) {
    const angle = rotation + (i / sides) * TAU;
    result.push(
      point(
        cx + (Math.cos(angle) * pxR) / surfaceWidth,
        cy + (Math.sin(angle) * pxR) / surfaceHeight,
        (i / sides) * 1000,
      ),
    );
  }
  return result;
};

/**
 * Build N evenly-timed ContourAnchors at vertex positions for a polygon loop.
 * All vertices have accent=true and emphasis=1.0 — every vertex is an onset.
 */
export const buildPolygonAnchors = (
  spec: PolygonSpec,
  surfaceWidth: number,
  surfaceHeight: number,
): ContourAnchor[] => {
  const { sides, cx, cy, rFraction, rotation } = spec;
  const pxR = rFraction * Math.min(surfaceWidth, surfaceHeight);
  return Array.from({ length: sides }, (_, i) => {
    const angle = rotation + (i / sides) * TAU;
    const vx = cx + (Math.cos(angle) * pxR) / surfaceWidth;
    const vy = cy + (Math.sin(angle) * pxR) / surfaceHeight;
    return {
      stepIndex: i,
      drawRatio: i / sides,
      point: point(vx, vy, (i / sides) * 1000),
      movement: i === 0 ? 0 : 1,
      sustain: false,
      leap: false,
      accent: true,
      emphasis: 1.0,
    } satisfies ContourAnchor;
  });
};

// ---------------------------------------------------------------------------
// Tide gesture detection — large open sweep → traveling wavefront
// ---------------------------------------------------------------------------

/**
 * Flavour-specific visual hues for tide wavefronts.
 * Chosen to feel elemental and distinct from voice-role palette.
 */
const TIDE_FLAVOR_HUE: Record<TideFlavor, number> = {
  rush:   168, // sea-green / energising
  linger: 210, // cool blue / stretching
  swell:  42,  // warm gold / rising
  ebb:    272, // violet / receding
};

export type TideGestureResult = {
  flavor: TideFlavor;
  dirX: number;
  dirY: number;
  /** Wavefront origin (normalised world) — leading edge of the sweep. */
  originX: number;
  originY: number;
  /** Distance the wavefront should travel (normalised world). */
  travelSpan: number;
  hue: number;
};

/**
 * Returns tide gesture data when the supplied summary describes a large
 * open sweep, or null when the gesture should be treated as a musical phrase.
 *
 * Detection criteria (all must be satisfied):
 *   • Large travel and dominant-axis span
 *   • Low circularity and loopiness (not a scope / echo gesture)
 *   • One axis clearly dominant over the other (directional sweep)
 *   • Minimum duration to exclude accidental flicks
 *
 * Must be called AFTER polygon and scope checks already returned — those
 * gestures are consumed before reaching this detector.
 */
export const detectTideGesture = (
  summary: GestureSummary,
  gestureDurationMs: number,
  rawPoints: NormalizedPoint[],
): TideGestureResult | null => {
  // ── Gate checks ────────────────────────────────────────────────────────────
  if (
    summary.travel < TIDE_MIN_TRAVEL ||
    Math.max(summary.xSpan, summary.ySpan) < TIDE_MIN_SPAN ||
    summary.circularity > TIDE_MAX_CIRCULARITY ||
    summary.loopiness > TIDE_MAX_LOOPINESS ||
    gestureDurationMs < TIDE_MIN_DURATION_MS
  ) return null;

  // ── Directional gate — dominant axis must be clearly wider ─────────────────
  const isHorizontal = summary.xSpan > summary.ySpan * TIDE_DIRECTION_RATIO;
  const isVertical   = summary.ySpan > summary.xSpan * TIDE_DIRECTION_RATIO;
  if (!isHorizontal && !isVertical) return null;

  const centroid = summary.centroid;
  let flavor: TideFlavor;
  let dirX: number;
  let dirY: number;
  let originX: number;
  let originY: number;
  let travelSpan: number;

  if (isHorizontal) {
    // forwardBias > 0 means the gesture moved mostly left-to-right (rush)
    const goingRight = summary.forwardBias > 0;
    flavor = goingRight ? "rush" : "linger";
    dirX = goingRight ? 1 : -1;
    dirY = 0;
    // Origin = leading edge of the gesture in travel direction
    originX = goingRight
      ? centroid.x - summary.xSpan * 0.5   // leftmost point for rightward sweep
      : centroid.x + summary.xSpan * 0.5;  // rightmost point for leftward sweep
    originY = centroid.y;
    // Extend span so the wavefront clears the far canvas edge
    travelSpan = summary.xSpan + 0.30;
  } else {
    // Vertical: check where the gesture started vs ended
    const firstY = rawPoints[0]?.y ?? centroid.y;
    const lastY  = rawPoints[rawPoints.length - 1]?.y ?? firstY;
    const goingDown = lastY > firstY;
    flavor = goingDown ? "ebb" : "swell";
    dirX = 0;
    dirY = goingDown ? 1 : -1;
    originX = centroid.x;
    originY = goingDown
      ? centroid.y - summary.ySpan * 0.5   // topmost point for downward sweep
      : centroid.y + summary.ySpan * 0.5;  // bottommost point for upward sweep
    travelSpan = summary.ySpan + 0.30;
  }

  return {
    flavor,
    dirX,
    dirY,
    originX,
    originY,
    travelSpan,
    hue: TIDE_FLAVOR_HUE[flavor],
  };
};
