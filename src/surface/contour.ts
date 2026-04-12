import type { ContourAnchor, NormalizedPoint, SurfaceSize } from "./model";

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const lerp = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;

export const mix = (a: number, b: number, amount: number) => lerp(a, b, amount);

export const modulo = (value: number, divisor: number) =>
  ((value % divisor) + divisor) % divisor;

export const mixHue = (from: number, to: number, amount: number) => {
  const delta = modulo(to - from + 180, 360) - 180;
  return modulo(from + delta * amount, 360);
};

export const distance = (a: NormalizedPoint, b: NormalizedPoint) =>
  Math.hypot(a.x - b.x, a.y - b.y);

export const easeOutCubic = (value: number) => 1 - (1 - clamp(value, 0, 1)) ** 3;

export const easeInOutSine = (value: number) =>
  -(Math.cos(Math.PI * clamp(value, 0, 1)) - 1) / 2;

export const point = (x: number, y: number, t: number): NormalizedPoint => ({
  x,
  y,
  t,
});

export const normalizedToPixels = (
  pointValue: NormalizedPoint,
  size: SurfaceSize,
) => ({
  x: pointValue.x * size.width,
  y: pointValue.y * size.height,
});

export const averagePoint = (points: NormalizedPoint[]) => {
  if (points.length === 0) {
    return point(0.5, 0.5, 0);
  }

  const total = points.reduce(
    (accumulator, current) => ({
      x: accumulator.x + current.x,
      y: accumulator.y + current.y,
    }),
    { x: 0, y: 0 },
  );

  return point(
    total.x / points.length,
    total.y / points.length,
    points.at(-1)?.t ?? 0,
  );
};

export const pathDuration = (points: NormalizedPoint[]) => points.at(-1)?.t ?? 0;

export const getGestureTravel = (points: NormalizedPoint[]) =>
  points.slice(1).reduce(
    (total, current, index) => total + distance(points[index], current),
    0,
  );

export const samplePath = (points: NormalizedPoint[], targetTime: number) => {
  if (points.length === 0) {
    return point(0.5, 0.5, 0);
  }

  if (points.length === 1) {
    return points[0];
  }

  if (targetTime <= 0) {
    return points[0];
  }

  const finalPoint = points.at(-1) ?? points[0];
  if (targetTime >= finalPoint.t) {
    return finalPoint;
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];

    if (targetTime >= start.t && targetTime <= end.t) {
      const span = Math.max(end.t - start.t, 1);
      const amount = (targetTime - start.t) / span;

      return point(
        lerp(start.x, end.x, amount),
        lerp(start.y, end.y, amount),
        targetTime,
      );
    }
  }

  return finalPoint;
};

export const resamplePath = (points: NormalizedPoint[], count: number) => {
  if (points.length === 0) {
    return Array.from({ length: count }, (_, index) => point(0.5, 0.5, index));
  }

  if (points.length === 1) {
    return Array.from({ length: count }, (_, index) =>
      point(points[0].x, points[0].y, index),
    );
  }

  const duration = Math.max(pathDuration(points), 1);

  return Array.from({ length: count }, (_, index) => {
    const amount = index / Math.max(count - 1, 1);
    const sampled = samplePath(points, duration * amount);
    return point(sampled.x, sampled.y, sampled.t);
  });
};

export const buildPartialPath = (points: NormalizedPoint[], progress: number) => {
  if (points.length < 2) {
    return points;
  }

  const clamped = clamp(progress, 0, 1);
  if (clamped <= 0) {
    return [points[0]];
  }

  if (clamped >= 1) {
    return points;
  }

  const duration = Math.max(pathDuration(points), 1);
  const targetTime = duration * clamped;
  const partial: NormalizedPoint[] = [points[0]];

  for (let index = 1; index < points.length; index += 1) {
    const current = points[index];
    if (current.t < targetTime) {
      partial.push(current);
      continue;
    }

    partial.push(samplePath(points, targetTime));
    break;
  }

  return partial;
};

export const getGestureBounds = (points: NormalizedPoint[]) =>
  points.reduce(
    (bounds, current) => ({
      minX: Math.min(bounds.minX, current.x),
      maxX: Math.max(bounds.maxX, current.x),
      minY: Math.min(bounds.minY, current.y),
      maxY: Math.max(bounds.maxY, current.y),
    }),
    {
      minX: points[0]?.x ?? 0.5,
      maxX: points[0]?.x ?? 0.5,
      minY: points[0]?.y ?? 0.5,
      maxY: points[0]?.y ?? 0.5,
    },
  );

export const smoothResampledPath = (
  points: NormalizedPoint[],
  count: number,
  smoothingPasses: number,
) => {
  let result = resamplePath(points, count);

  for (let pass = 0; pass < smoothingPasses; pass += 1) {
    result = result.map((current, index) => {
      if (index === 0 || index === result.length - 1) {
        return current;
      }

      const previous = result[index - 1];
      const next = result[index + 1];

      return point(
        mix(current.x, (previous.x + next.x) * 0.5, 0.44),
        mix(current.y, (previous.y + next.y) * 0.5, 0.44),
        current.t,
      );
    });
  }

  return result;
};

export const chooseAnchorCount = (points: NormalizedPoint[]) => {
  const duration = Math.max(pathDuration(points), 420);
  const travel = getGestureTravel(points);
  const rawCount = Math.round(6 + travel * 18 + duration / 460);
  const clampedCount = clamp(rawCount, 6, 12);

  return clampedCount % 2 === 0 ? clampedCount : clampedCount + 1;
};

export const coerceContourPoints = (points: NormalizedPoint[]) => {
  if (points.length >= 4 && getGestureTravel(points) >= 0.05) {
    return points;
  }

  const center = averagePoint(points);
  const startX = clamp(center.x - 0.12, 0.06, 0.72);
  const endX = clamp(startX + 0.26, startX + 0.14, 0.94);
  const plateauY = clamp(center.y, 0.18, 0.82);

  return [
    point(startX, plateauY + 0.02, 0),
    point(lerp(startX, endX, 0.28), plateauY - 0.01, 170),
    point(lerp(startX, endX, 0.58), plateauY - 0.01, 380),
    point(endX, plateauY + 0.015, 760),
  ];
};

export const analyzeContour = (points: NormalizedPoint[]) => {
  const normalizedPoints = coerceContourPoints(points);
  const noteCount = chooseAnchorCount(normalizedPoints);
  const anchors = resamplePath(normalizedPoints, noteCount);
  const average = averagePoint(anchors);
  const desiredRegisterMidi = clamp(
    Math.round(77 - average.y * 22 + (0.5 - anchors[0].y) * 6),
    54,
    84,
  );

  return {
    noteCount,
    desiredRegisterMidi,
    anchors: anchors.map((current, index) => {
      const previous = anchors[Math.max(index - 1, 0)];
      const next = anchors[Math.min(index + 1, anchors.length - 1)];
      const deltaY = previous.y - current.y;
      const deltaX = current.x - previous.x;
      const magnitude = Math.abs(deltaY);
      const slope = magnitude / Math.max(Math.abs(deltaX), 0.012);
      const sustain = index > 0 && magnitude < 0.026;
      const leap = index > 0 && (magnitude > 0.14 || (magnitude > 0.08 && slope > 1.9));

      let movement = 0;
      if (index > 0) {
        if (sustain) {
          movement = 0;
        } else if (leap) {
          movement = deltaY > 0 ? 3 : -3;
        } else if (magnitude > 0.075) {
          movement = deltaY > 0 ? 2 : -2;
        } else {
          movement = deltaY > 0 ? 1 : -1;
        }
      }

      const directionChange =
        index > 0 &&
        index < anchors.length - 1 &&
        Math.sign(deltaY) !== 0 &&
        Math.sign(deltaY) !== Math.sign(current.y - next.y);
      const beatAligned =
        index === 0 ||
        index === anchors.length - 1 ||
        index % Math.max(1, Math.floor(noteCount / 4)) === 0;
      const emphasis = clamp(
        (index === 0 || index === anchors.length - 1 ? 0.9 : 0.18) +
          (sustain ? 0.12 : 0) +
          (leap ? 0.24 : 0) +
          (directionChange ? 0.2 : 0) +
          (beatAligned ? 0.14 : 0),
        0,
        1,
      );

      return {
        stepIndex: index,
        drawRatio: index / Math.max(noteCount - 1, 1),
        point: current,
        movement,
        sustain,
        leap,
        accent: beatAligned || directionChange || leap,
        emphasis,
      } satisfies ContourAnchor;
    }),
  };
};

export const getAnchorTimelineDuration = (anchors: ContourAnchor[]) =>
  Math.max(
    anchors.at(-1)?.point.t ??
      (anchors.length > 1 ? anchors.length - 1 : 1),
    1,
  );

export const getActiveAnchorStepIndex = (
  anchors: ContourAnchor[],
  progress: number,
) => {
  if (anchors.length === 0) {
    return 0;
  }

  const targetTime = getAnchorTimelineDuration(anchors) * clamp(progress, 0, 0.9999);

  for (let index = anchors.length - 1; index >= 0; index -= 1) {
    if (targetTime >= anchors[index].point.t) {
      return index;
    }
  }

  return 0;
};

export const getAnchorStepDuration = (
  anchors: ContourAnchor[],
  index: number,
  gateSteps = 1,
) => {
  if (anchors.length === 0) {
    return 1;
  }

  const totalDuration = getAnchorTimelineDuration(anchors);
  const averageStep = totalDuration / Math.max(anchors.length - 1, 1);
  const startTime = anchors[index]?.point.t ?? 0;
  const endIndex = index + Math.max(gateSteps, 1);
  const endTime =
    endIndex < anchors.length
      ? anchors[endIndex].point.t
      : totalDuration +
        averageStep * Math.min(endIndex - anchors.length + 1, Math.max(gateSteps, 1));

  return Math.max(endTime - startTime, averageStep);
};
