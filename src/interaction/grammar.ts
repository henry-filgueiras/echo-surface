import type { PointerEvent as ReactPointerEvent } from "react";

import {
  POLYGON_ANGLE_REGULARITY_TOLERANCE,
  POLYGON_CLOSURE_THRESHOLD,
  POLYGON_CLUSTER_DISTANCE_FRAC,
  POLYGON_CURVATURE_WINDOW,
  POLYGON_MIN_CORNER_ANGLE_RAD,
  POLYGON_MIN_RADIUS_PX,
  POLYGON_MIN_TRAVEL,
  POLYGON_RADIUS_REGULARITY_TOLERANCE,
  POLYGON_RESAMPLE_COUNT,
  RESPONSE_ROLE_MAP,
  TAU,
  type CameraState,
  type ContourAnchor,
  type GestureSummary,
  type NormalizedPoint,
  type PolygonSpec,
  type RecentGesture,
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
// Polygon gesture detection helpers
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

/**
 * Attempt to detect a regular polygon in a closed freehand path.
 *
 * Returns a PolygonSpec if the gesture looks like a 3-6 sided regular polygon,
 * or null if it does not qualify.
 *
 * The algorithm:
 *   1. Verify closure (first ↔ last in pixel space)
 *   2. Resample to uniform spatial spacing
 *   3. Measure turning-angle at each sample (curvature)
 *   4. Find local curvature peaks → corner candidates
 *   5. Cluster nearby peaks → N vertices
 *   6. Reject if N ∉ {3, 4, 5, 6}
 *   7. Check radius and angular regularity
 *   8. Return canonical PolygonSpec
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

  // 1. Check closure
  const first = rawPoints[0];
  const last = rawPoints[rawPoints.length - 1];
  const closurePx = Math.hypot((first.x - last.x) * W, (first.y - last.y) * H);
  if (closurePx > POLYGON_CLOSURE_THRESHOLD * minDim) return null;

  // Travel check
  const travelPx = rawPoints
    .slice(1)
    .reduce(
      (s, p, i) =>
        s + Math.hypot((p.x - rawPoints[i].x) * W, (p.y - rawPoints[i].y) * H),
      0,
    );
  if (travelPx < POLYGON_MIN_TRAVEL * minDim) return null;

  // 2. Spatially uniform resample (pixel space)
  const M = POLYGON_RESAMPLE_COUNT;
  const pts = spatialResamplePoints(rawPoints, M, W, H);

  // 3. Turning angle at each sample
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
    const cosAngle = clamp(
      (d1x / len1) * (d2x / len2) + (d1y / len1) * (d2y / len2),
      -1,
      1,
    );
    curvatures[i] = Math.acos(cosAngle);
  }

  // 4. Local maxima above threshold
  const peaks: number[] = [];
  for (let i = 1; i < M - 1; i++) {
    if (
      curvatures[i] >= POLYGON_MIN_CORNER_ANGLE_RAD &&
      curvatures[i] > curvatures[i - 1] &&
      curvatures[i] > curvatures[i + 1]
    ) {
      peaks.push(i);
    }
  }
  if (peaks.length < 3) return null;

  // 5. Cluster nearby peaks
  const clusterDist = Math.max(2, Math.round(M * POLYGON_CLUSTER_DISTANCE_FRAC));
  const clusters: number[][] = [];
  for (const peak of peaks) {
    const existing = clusters.find(
      (c) => peak - (c[c.length - 1] ?? 0) < clusterDist,
    );
    if (existing) {
      existing.push(peak);
    } else {
      clusters.push([peak]);
    }
  }

  const N = clusters.length;
  if (N < 3 || N > 6) return null;

  // 6. Representative vertex = sample with highest curvature in each cluster
  const vertices = clusters.map((cluster) => {
    const best = cluster.reduce((a, b) =>
      curvatures[a] > curvatures[b] ? a : b,
    );
    return pts[best];
  });

  // 7. Centroid and radii in pixel space
  const pxVerts = vertices.map((v) => ({ x: v.x * W, y: v.y * H }));
  const pxCx = pxVerts.reduce((s, v) => s + v.x, 0) / N;
  const pxCy = pxVerts.reduce((s, v) => s + v.y, 0) / N;
  const pxRadii = pxVerts.map((v) => Math.hypot(v.x - pxCx, v.y - pxCy));
  const avgPxR = pxRadii.reduce((s, r) => s + r, 0) / N;

  if (avgPxR < POLYGON_MIN_RADIUS_PX) return null;

  // Radius regularity
  const radiusStd = Math.sqrt(
    pxRadii.reduce((s, r) => s + (r - avgPxR) ** 2, 0) / N,
  );
  if (radiusStd / avgPxR > POLYGON_RADIUS_REGULARITY_TOLERANCE) return null;

  // Angular regularity
  const angles = pxVerts
    .map((v) => Math.atan2(v.y - pxCy, v.x - pxCx))
    .sort((a, b) => a - b);
  const expectedSpacing = TAU / N;
  let maxAngleError = 0;
  for (let i = 0; i < N; i++) {
    const nextAngle = i < N - 1 ? angles[i + 1] : angles[0] + TAU;
    const spacing = nextAngle - angles[i];
    maxAngleError = Math.max(
      maxAngleError,
      Math.abs(spacing - expectedSpacing),
    );
  }
  if (maxAngleError > expectedSpacing * POLYGON_ANGLE_REGULARITY_TOLERANCE) {
    return null;
  }

  return {
    sides: N,
    cx: pxCx / W,
    cy: pxCy / H,
    rFraction: avgPxR / minDim,
    rotation: angles[0],
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
