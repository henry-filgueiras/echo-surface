import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type NormalizedPoint = {
  x: number;
  y: number;
  t: number;
};

type ActiveTouch = {
  pointerId: number;
  bornAt: number;
  hue: number;
  symmetry: number;
  holdCharge: number;
  lastPulseAt: number;
  lastSampleAt: number;
  points: NormalizedPoint[];
  travel: number;
};

type EchoRecord = {
  id: number;
  bornAt: number;
  hue: number;
  symmetry: number;
  holdCharge: number;
  duration: number;
  points: NormalizedPoint[];
  centroid: NormalizedPoint;
  delay: number;
  speed: number;
  phase: number;
  resonance: number;
  energy: number;
  drift: number;
  wobble: number;
  lineWidth: number;
  trailDecayMs: number;
  memoryLifeMs: number;
  replayIntervalMs: number;
  synthetic: boolean;
  scheduledAtMs: number;
  loopSteps: number;
  stepPoints: NormalizedPoint[];
  lastQuantizedStep: number;
  lastEchoPulseAt: number;
  lastBoostAt: number;
};

type Pulse = {
  id: number;
  bornAt: number;
  ttl: number;
  point: NormalizedPoint;
  hue: number;
  strength: number;
  symmetry: number;
  source: "touch" | "ghost" | "hold" | "collision";
};

type GhostSnapshot = {
  echoId: number;
  point: NormalizedPoint;
  nextPoint: NormalizedPoint;
  hue: number;
  intensity: number;
  symmetry: number;
  resonance: number;
};

type Filament = {
  from: NormalizedPoint;
  to: NormalizedPoint;
  hue: number;
  strength: number;
};

type Spark = {
  point: NormalizedPoint;
  bornAt: number;
  ttl: number;
  hue: number;
  strength: number;
};

type InterferenceEvent = {
  id: number;
  bornAt: number;
  ttl: number;
  point: NormalizedPoint;
  secondaryPoint?: NormalizedPoint;
  hue: number;
  strength: number;
  symmetry: number;
};

type TimeSignature = {
  label: string;
  numerator: number;
  denominator: number;
};

type TransportConfig = {
  bpm: number;
  quantizeMode: "nearest" | "next";
  signature: TimeSignature;
  stepsPerBeat: number;
};

type GestureEvent = {
  id: number;
  type: "tap" | "drag" | "hold";
  points: NormalizedPoint[];
  timestamp: number;
  duration: number;
  energy: number;
  hue: number;
  symmetry: number;
  centroid: NormalizedPoint;
  travel: number;
};

type MotifLane = {
  id: number;
  bornAt: number;
  lastSeenAt: number;
  hue: number;
  symmetry: number;
  strength: number;
  occurrences: number;
  points: NormalizedPoint[];
  centroid: NormalizedPoint;
  drift: number;
  sourceType: "drag" | "hold";
};

type ResonanceWell = {
  id: number;
  bornAt: number;
  ttl: number;
  point: NormalizedPoint;
  hue: number;
  symmetry: number;
  energy: number;
  drift: number;
  scheduledAtMs: number;
  lastQuantizedStep: number;
  lastPulseAt: number;
  lastToneAt: number;
};

type MemoryChip = {
  id: number;
  hue: number;
  symmetry: number;
};

export type SurfacePreset = "seed" | "trace" | "hold";
type SymmetryMode = "auto" | 2 | 4 | 6;

type SurfaceSize = {
  width: number;
  height: number;
};

type AudioEngine = {
  context: AudioContext | null;
  master: GainNode | null;
  compressor: DynamicsCompressorNode | null;
  fxSend: GainNode | null;
  noiseBuffer: AudioBuffer | null;
  muted: boolean;
  masterLevel: number;
};

type SimulationState = {
  activeTouches: Map<number, ActiveTouch>;
  echoes: EchoRecord[];
  pulses: Pulse[];
  sparks: Spark[];
  interferenceEvents: InterferenceEvent[];
  wells: ResonanceWell[];
  gestureLog: GestureEvent[];
  motifs: MotifLane[];
  surfaceEnergy: number;
  interactions: number;
};

type EchoSurfaceProps = {
  preset?: SurfacePreset;
  captureMode?: boolean;
};

const MAX_ECHOES = 12;
const TAU = Math.PI * 2;
const SURFACE_PRESETS: SurfacePreset[] = ["seed", "trace", "hold"];
type ToneMode = "tap" | "hold" | "ghost" | "collision";
const SYMMETRY_MODE_SEQUENCE: SymmetryMode[] = ["auto", 2, 4, 6];
const LOOP_ENABLED = true;
const ECHO_TRAIL_DECAY_MS = 2400;
const ECHO_MEMORY_LIFE_MS = 14000;
const IDLE_DEMO_AFTER_MS = 9000;
const DEMO_INTERVAL_MS = 2800;
const MAX_ACTIVE_PULSES = 32;
const MAX_ACTIVE_SPARKS = 48;
const MAX_ACTIVE_INTERFERENCE_EVENTS = 18;
const MAX_INTERFERENCE_FRONTS = 18;
const MAX_WELLS = 3;
const MAX_GESTURE_EVENTS = 48;
const MAX_MOTIFS = 4;
const MOTIF_POINT_COUNT = 18;
const WELL_TTL_MS = 18000;
const TRANSPORT_SIGNATURES: TimeSignature[] = [
  { label: "4/4", numerator: 4, denominator: 4 },
  { label: "3/4", numerator: 3, denominator: 4 },
  { label: "5/4", numerator: 5, denominator: 4 },
  { label: "7/8", numerator: 7, denominator: 8 },
];
const DEFAULT_TRANSPORT_CONFIG: TransportConfig = {
  bpm: 124,
  quantizeMode: "next",
  signature: TRANSPORT_SIGNATURES[0],
  stepsPerBeat: 4,
};

export const isSurfacePreset = (value: string | null): value is SurfacePreset =>
  value !== null && SURFACE_PRESETS.includes(value as SurfacePreset);

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const lerp = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;

const mix = (a: number, b: number, amount: number) => lerp(a, b, amount);

const distance = (a: NormalizedPoint, b: NormalizedPoint) =>
  Math.hypot(a.x - b.x, a.y - b.y);

const easeOutCubic = (value: number) => 1 - (1 - value) ** 3;

const easeInOutSine = (value: number) =>
  -(Math.cos(Math.PI * value) - 1) / 2;

const smoothPulse = (value: number) =>
  Math.sin(clamp(value, 0, 1) * Math.PI);

const modulo = (value: number, divisor: number) =>
  ((value % divisor) + divisor) % divisor;

const getBeatMs = (transportConfig: TransportConfig) =>
  (60000 / transportConfig.bpm) *
  (4 / transportConfig.signature.denominator);

const getStepMs = (transportConfig: TransportConfig) =>
  getBeatMs(transportConfig) / transportConfig.stepsPerBeat;

const getBarStepCount = (transportConfig: TransportConfig) =>
  transportConfig.signature.numerator * transportConfig.stepsPerBeat;

const getTransportStepPositionAtTime = (
  timeMs: number,
  transportConfig: TransportConfig,
) => timeMs / getStepMs(transportConfig);

const quantizeTimeMs = (
  timeMs: number,
  transportConfig: TransportConfig,
  mode: TransportConfig["quantizeMode"] = transportConfig.quantizeMode,
) => {
  const stepMs = getStepMs(transportConfig);
  const rawStep = timeMs / stepMs;
  const snappedStep =
    mode === "next" ? Math.ceil(rawStep) : Math.round(rawStep);

  return Math.max(0, snappedStep) * stepMs;
};

const quantizeDurationToSteps = (
  durationMs: number,
  transportConfig: TransportConfig,
) =>
  clamp(
    Math.ceil(durationMs / getStepMs(transportConfig)),
    2,
    64,
  );

const CLUB_SCALE = [0, 3, 5, 7, 10];

const midiToFrequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

const createDriveCurve = (amount: number) => {
  const curve = new Float32Array(256);
  const degrees = Math.PI / 180;

  for (let index = 0; index < curve.length; index += 1) {
    const x = index * (2 / (curve.length - 1)) - 1;
    curve[index] =
      ((3 + amount) * x * 20 * degrees) / (Math.PI + amount * Math.abs(x));
  }

  return curve;
};

const DRIVE_CURVE = createDriveCurve(24);

const pickClubFrequency = (hue: number, mode: ToneMode) => {
  const root =
    mode === "hold" ? 38 : mode === "ghost" ? 62 : mode === "collision" ? 57 : 50;
  const octaves = mode === "hold" ? 2 : 3;
  const totalSteps = CLUB_SCALE.length * octaves;
  const normalized = clamp(hue / 204, 0, 0.999);
  const stepIndex = Math.min(
    totalSteps - 1,
    Math.floor(normalized * totalSteps),
  );
  const octave = Math.floor(stepIndex / CLUB_SCALE.length);
  const interval = CLUB_SCALE[stepIndex % CLUB_SCALE.length];

  return midiToFrequency(root + interval + octave * 12);
};

const normalizedToPixels = (point: NormalizedPoint, size: SurfaceSize) => ({
  x: point.x * size.width,
  y: point.y * size.height,
});

const pixelsToNormalized = (
  point: { x: number; y: number },
  size: SurfaceSize,
): NormalizedPoint => ({
  x: clamp(point.x / size.width, 0, 1),
  y: clamp(point.y / size.height, 0, 1),
  t: 0,
});

const rotatePoint = (point: NormalizedPoint, angle: number): NormalizedPoint => {
  const dx = point.x - 0.5;
  const dy = point.y - 0.5;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    x: 0.5 + dx * cos - dy * sin,
    y: 0.5 + dx * sin + dy * cos,
    t: point.t,
  };
};

const averagePoint = (points: NormalizedPoint[]): NormalizedPoint => {
  if (points.length === 0) {
    return { x: 0.5, y: 0.5, t: 0 };
  }

  const sum = points.reduce(
    (accumulator, point) => {
      accumulator.x += point.x;
      accumulator.y += point.y;
      return accumulator;
    },
    { x: 0, y: 0 },
  );

  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
    t: points.at(-1)?.t ?? 0,
  };
};

const pathDuration = (points: NormalizedPoint[]) => points.at(-1)?.t ?? 0;

const samplePath = (points: NormalizedPoint[], targetTime: number) => {
  if (points.length === 0) {
    return {
      point: { x: 0.5, y: 0.5, t: 0 },
      nextPoint: { x: 0.5, y: 0.5, t: 0 },
    };
  }

  if (points.length === 1) {
    return {
      point: points[0],
      nextPoint: points[0],
    };
  }

  if (targetTime <= 0) {
    return {
      point: points[0],
      nextPoint: points[1],
    };
  }

  const finalIndex = points.length - 1;
  const finalTime = points[finalIndex].t;

  if (targetTime >= finalTime) {
    return {
      point: points[finalIndex],
      nextPoint: points[Math.max(finalIndex - 1, 0)],
    };
  }

  for (let index = 0; index < finalIndex; index += 1) {
    const start = points[index];
    const end = points[index + 1];

    if (targetTime >= start.t && targetTime <= end.t) {
      const span = Math.max(end.t - start.t, 1);
      const amount = (targetTime - start.t) / span;

      return {
        point: {
          x: lerp(start.x, end.x, amount),
          y: lerp(start.y, end.y, amount),
          t: targetTime,
        },
        nextPoint: end,
      };
    }
  }

  return {
    point: points[finalIndex],
    nextPoint: points[Math.max(finalIndex - 1, 0)],
  };
};

const buildQuantizedStepPoints = (
  points: NormalizedPoint[],
  loopSteps: number,
) => {
  if (points.length === 0) {
    return Array.from({ length: loopSteps }, () => ({
      x: 0.5,
      y: 0.5,
      t: 0,
    }));
  }

  const duration = Math.max(pathDuration(points), 260);

  return Array.from({ length: loopSteps }, (_, stepIndex) => ({
    ...samplePath(points, (duration * stepIndex) / loopSteps).point,
    t: stepIndex,
  }));
};

const sampleQuantizedLoop = (
  stepPoints: NormalizedPoint[],
  stepPosition: number,
) => {
  if (stepPoints.length === 0) {
    return {
      point: { x: 0.5, y: 0.5, t: 0 },
      nextPoint: { x: 0.5, y: 0.5, t: 0 },
      stepIndex: 0,
    };
  }

  if (stepPoints.length === 1) {
    return {
      point: stepPoints[0],
      nextPoint: stepPoints[0],
      stepIndex: 0,
    };
  }

  const wrappedStep = modulo(stepPosition, stepPoints.length);
  const stepIndex = Math.floor(wrappedStep);
  const nextStepIndex = (stepIndex + 1) % stepPoints.length;
  const amount = wrappedStep - stepIndex;
  const currentPoint = stepPoints[stepIndex];
  const nextPoint = stepPoints[nextStepIndex];

  return {
    point: {
      x: lerp(currentPoint.x, nextPoint.x, amount),
      y: lerp(currentPoint.y, nextPoint.y, amount),
      t: wrappedStep,
    },
    nextPoint,
    stepIndex,
  };
};

const resampleGesturePoints = (
  points: NormalizedPoint[],
  count: number,
) => {
  if (points.length === 0) {
    return Array.from({ length: count }, () => ({
      x: 0.5,
      y: 0.5,
      t: 0,
    }));
  }

  if (points.length === 1) {
    return Array.from({ length: count }, (_, index) => ({
      ...points[0],
      t: index,
    }));
  }

  const duration = Math.max(pathDuration(points), count - 1);

  return Array.from({ length: count }, (_, index) => ({
    ...samplePath(points, (duration * index) / Math.max(count - 1, 1)).point,
    t: index,
  }));
};

const normalizeGesturePoints = (points: NormalizedPoint[]) => {
  const centroid = averagePoint(points);
  const scale =
    Math.max(
      0.02,
      ...points.map((point) => Math.hypot(point.x - centroid.x, point.y - centroid.y)),
    ) || 0.02;

  return points.map((point) => ({
    x: (point.x - centroid.x) / scale,
    y: (point.y - centroid.y) / scale,
    t: point.t,
  }));
};

const compareGestureShapes = (
  first: NormalizedPoint[],
  second: NormalizedPoint[],
) =>
  first.reduce(
    (total, point, index) =>
      total +
      Math.hypot(point.x - second[index].x, point.y - second[index].y),
    0,
  ) / Math.max(first.length, 1);

const blendGestureShapes = (
  first: NormalizedPoint[],
  second: NormalizedPoint[],
  amount: number,
) =>
  first.map((point, index) => ({
    x: mix(point.x, second[index].x, amount),
    y: mix(point.y, second[index].y, amount),
    t: index,
  }));

const getGestureTravel = (points: NormalizedPoint[]) =>
  points.slice(1).reduce(
    (total, point, index) => total + distance(points[index], point),
    0,
  );

const getGestureDirection = (points: NormalizedPoint[]) => {
  if (points.length < 2) {
    return 0;
  }

  const start = points[0];
  const end = points.at(-1) ?? start;

  return Math.atan2(end.y - start.y, end.x - start.x);
};

const getMotifMotionPoints = (
  motif: MotifLane,
  transportStepPosition: number,
  energy: number,
) => {
  const speed = 0.32 + energy * 0.44;
  const sample = sampleQuantizedLoop(
    motif.points,
    transportStepPosition * speed + motif.drift * motif.points.length,
  );

  return sample;
};

const point = (x: number, y: number, t: number): NormalizedPoint => ({
  x,
  y,
  t,
});

const circleIntersections = (
  centerA: { x: number; y: number },
  radiusA: number,
  centerB: { x: number; y: number },
  radiusB: number,
) => {
  const dx = centerB.x - centerA.x;
  const dy = centerB.y - centerA.y;
  const distanceBetweenCenters = Math.hypot(dx, dy);

  if (
    distanceBetweenCenters === 0 ||
    distanceBetweenCenters > radiusA + radiusB ||
    distanceBetweenCenters < Math.abs(radiusA - radiusB)
  ) {
    return [] as { x: number; y: number }[];
  }

  const a =
    (radiusA * radiusA -
      radiusB * radiusB +
      distanceBetweenCenters * distanceBetweenCenters) /
    (2 * distanceBetweenCenters);
  const hSquared = radiusA * radiusA - a * a;

  if (hSquared < 0) {
    return [];
  }

  const h = Math.sqrt(hSquared);
  const midpoint = {
    x: centerA.x + (a * dx) / distanceBetweenCenters,
    y: centerA.y + (a * dy) / distanceBetweenCenters,
  };
  const offset = {
    x: (-dy * h) / distanceBetweenCenters,
    y: (dx * h) / distanceBetweenCenters,
  };

  return [
    {
      x: midpoint.x + offset.x,
      y: midpoint.y + offset.y,
    },
    {
      x: midpoint.x - offset.x,
      y: midpoint.y - offset.y,
    },
  ];
};

const getPulseFront = (
  pulse: Pulse,
  now: number,
  size: SurfaceSize,
) => {
  const age = now - pulse.bornAt;
  const progress = clamp(age / pulse.ttl, 0, 1);
  const eased = easeOutCubic(progress);
  const minDimension = Math.min(size.width, size.height);
  const radius = mix(
    14,
    minDimension * (0.08 + pulse.strength * 0.26),
    eased,
  );
  const thickness = mix(18, 3.5, progress) * (0.7 + pulse.strength * 0.22);
  const alpha =
    (1 - progress) ** 1.35 *
    (pulse.source === "collision" ? 0.42 : 0.24 + pulse.strength * 0.24);

  return {
    progress,
    radius,
    thickness,
    alpha,
  };
};

const DEMO_LIBRARY = [
  [
    point(0.22, 0.34, 0),
    point(0.31, 0.29, 180),
    point(0.41, 0.33, 360),
    point(0.49, 0.45, 620),
    point(0.44, 0.57, 860),
  ],
  [
    point(0.66, 0.24, 0),
    point(0.72, 0.3, 140),
    point(0.77, 0.43, 320),
    point(0.69, 0.56, 540),
    point(0.58, 0.6, 760),
  ],
  [
    point(0.36, 0.73, 0),
    point(0.47, 0.62, 200),
    point(0.58, 0.57, 360),
    point(0.63, 0.68, 560),
    point(0.53, 0.8, 760),
  ],
];

const makeSurfacePoint = (
  event: ReactPointerEvent<HTMLDivElement>,
  element: HTMLDivElement,
  time: number,
): NormalizedPoint => {
  const bounds = element.getBoundingClientRect();

  return {
    x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
    y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1),
    t: time,
  };
};

const drawPath = (
  context: CanvasRenderingContext2D,
  size: SurfaceSize,
  points: NormalizedPoint[],
  symmetry: number,
  strokeStyle: string,
  lineWidth: number,
  alphaScale = 1,
) => {
  if (points.length < 2) {
    return;
  }

  const copyCount = Math.max(symmetry, 1);

  for (let copyIndex = 0; copyIndex < copyCount; copyIndex += 1) {
    const angle = (copyIndex / copyCount) * TAU;
    context.beginPath();

    points.forEach((point, pointIndex) => {
      const rotated = rotatePoint(point, angle);
      const pixel = normalizedToPixels(rotated, size);

      if (pointIndex === 0) {
        context.moveTo(pixel.x, pixel.y);
      } else {
        context.lineTo(pixel.x, pixel.y);
      }
    });

    context.globalAlpha = alphaScale;
    context.lineWidth = lineWidth;
    context.strokeStyle = strokeStyle;
    context.stroke();
  }

  context.globalAlpha = 1;
};

const drawPulse = (
  context: CanvasRenderingContext2D,
  size: SurfaceSize,
  pulse: Pulse,
  now: number,
) => {
  const { progress, radius, thickness, alpha } = getPulseFront(pulse, now, size);
  const copyCount = Math.max(pulse.symmetry, 1);

  context.save();
  context.globalCompositeOperation = "lighter";

  for (let copyIndex = 0; copyIndex < copyCount; copyIndex += 1) {
    const angle = (copyIndex / copyCount) * TAU;
    const rotated = rotatePoint(pulse.point, angle);
    const pixel = normalizedToPixels(rotated, size);
    const glowRadius = radius + thickness * 1.6;
    const gradient = context.createRadialGradient(
      pixel.x,
      pixel.y,
      Math.max(0, radius - thickness * 0.8),
      pixel.x,
      pixel.y,
      glowRadius,
    );

    gradient.addColorStop(
      0,
      `hsla(${pulse.hue}, 90%, 74%, 0)`,
    );
    gradient.addColorStop(
      0.68,
      `hsla(${pulse.hue}, 88%, 68%, ${alpha * 0.28})`,
    );
    gradient.addColorStop(1, `hsla(${pulse.hue}, 82%, 58%, 0)`);

    context.fillStyle = gradient;
    context.beginPath();
    context.arc(pixel.x, pixel.y, glowRadius, 0, TAU);
    context.fill();

    context.shadowBlur = 22 + pulse.strength * 18;
    context.shadowColor = `hsla(${pulse.hue}, 92%, 74%, ${alpha})`;
    context.lineWidth = thickness;
    context.strokeStyle = `hsla(${pulse.hue}, 92%, 82%, ${alpha * 1.1})`;
    context.beginPath();
    context.arc(pixel.x, pixel.y, radius, 0, TAU);
    context.stroke();

    context.shadowBlur = 0;
    context.fillStyle = `hsla(${pulse.hue}, 94%, 82%, ${
      (1 - progress) * 0.15
    })`;
    context.beginPath();
    context.arc(pixel.x, pixel.y, 5 + pulse.strength * 3, 0, TAU);
    context.fill();
  }

  context.restore();
};

const drawInterferenceEvent = (
  context: CanvasRenderingContext2D,
  size: SurfaceSize,
  event: InterferenceEvent,
  now: number,
) => {
  const age = now - event.bornAt;
  const progress = clamp(age / event.ttl, 0, 1);
  const pulse = smoothPulse(1 - progress);
  const points = event.secondaryPoint
    ? [event.point, event.secondaryPoint]
    : [event.point];

  context.save();
  context.globalCompositeOperation = "lighter";

  const copyCount = Math.max(event.symmetry, 1);

  for (let copyIndex = 0; copyIndex < copyCount; copyIndex += 1) {
    const angle = (copyIndex / copyCount) * TAU;

    if (event.secondaryPoint) {
      const primaryPixel = normalizedToPixels(rotatePoint(event.point, angle), size);
      const secondaryPixel = normalizedToPixels(
        rotatePoint(event.secondaryPoint, angle),
        size,
      );
      const midpoint = {
        x: (primaryPixel.x + secondaryPixel.x) * 0.5,
        y: (primaryPixel.y + secondaryPixel.y) * 0.5 - 18 * pulse,
      };
      const alpha = (1 - progress) * (0.18 + event.strength * 0.16);

      context.strokeStyle = `hsla(${event.hue}, 100%, 82%, ${alpha})`;
      context.lineWidth = 1 + event.strength * 2.1;
      context.beginPath();
      context.moveTo(primaryPixel.x, primaryPixel.y);
      context.quadraticCurveTo(
        midpoint.x,
        midpoint.y,
        secondaryPixel.x,
        secondaryPixel.y,
      );
      context.stroke();
    }

    points.forEach((point, index) => {
      const rotated = rotatePoint(point, angle);
      const pixel = normalizedToPixels(rotated, size);
      const coreRadius = 16 + event.strength * 28 * pulse;
      const harmonicRadius = 8 + event.strength * 44 * easeOutCubic(progress);
      const alpha = (1 - progress) * (0.32 + event.strength * 0.26);
      const gradient = context.createRadialGradient(
        pixel.x,
        pixel.y,
        0,
        pixel.x,
        pixel.y,
        coreRadius * 1.8,
      );

      gradient.addColorStop(0, `hsla(${event.hue}, 94%, 84%, ${alpha * 0.9})`);
      gradient.addColorStop(
        0.5,
        `hsla(${event.hue}, 92%, 70%, ${alpha * 0.34})`,
      );
      gradient.addColorStop(1, `hsla(${event.hue}, 92%, 62%, 0)`);

      context.fillStyle = gradient;
      context.beginPath();
      context.arc(pixel.x, pixel.y, coreRadius * 1.8, 0, TAU);
      context.fill();

      context.lineWidth = 1.4 + event.strength * 2.8;
      context.strokeStyle = `hsla(${event.hue}, 100%, 84%, ${alpha})`;
      context.beginPath();
      context.arc(pixel.x, pixel.y, harmonicRadius + index * 4, 0, TAU);
      context.stroke();

      context.fillStyle = `hsla(${event.hue}, 100%, 92%, ${alpha})`;
      context.beginPath();
      context.arc(pixel.x, pixel.y, 3 + event.strength * 2.2, 0, TAU);
      context.fill();
    });
  }

  context.restore();
};

const drawGhostNode = (
  context: CanvasRenderingContext2D,
  size: SurfaceSize,
  ghost: GhostSnapshot,
  now: number,
) => {
  const copyCount = Math.max(ghost.symmetry, 1);

  for (let copyIndex = 0; copyIndex < copyCount; copyIndex += 1) {
    const angle = (copyIndex / copyCount) * TAU;
    const point = rotatePoint(ghost.point, angle);
    const nextPoint = rotatePoint(ghost.nextPoint, angle);
    const pixel = normalizedToPixels(point, size);
    const nextPixel = normalizedToPixels(nextPoint, size);
    const tail = {
      x: lerp(nextPixel.x, pixel.x, 0.78),
      y: lerp(nextPixel.y, pixel.y, 0.78),
    };
    const shimmer = 0.72 + Math.sin(now * 0.0021 + copyIndex + ghost.echoId) * 0.18;

    context.strokeStyle = `hsla(${ghost.hue}, 88%, 70%, ${
      0.14 + ghost.intensity * 0.24
    })`;
    context.lineWidth = 1.2 + ghost.intensity * 2.4;
    context.beginPath();
    context.moveTo(tail.x, tail.y);
    context.quadraticCurveTo(
      mix(tail.x, pixel.x, 0.52),
      mix(tail.y, pixel.y, 0.52),
      pixel.x,
      pixel.y,
    );
    context.stroke();

    const gradient = context.createRadialGradient(
      pixel.x,
      pixel.y,
      0,
      pixel.x,
      pixel.y,
      22 + ghost.intensity * 18,
    );

    gradient.addColorStop(
      0,
      `hsla(${ghost.hue}, 92%, 78%, ${0.48 * shimmer})`,
    );
    gradient.addColorStop(
      0.55,
      `hsla(${ghost.hue}, 88%, 64%, ${0.15 + ghost.resonance * 0.16})`,
    );
    gradient.addColorStop(1, `hsla(${ghost.hue}, 88%, 60%, 0)`);

    context.fillStyle = gradient;
    context.beginPath();
    context.arc(pixel.x, pixel.y, 24 + ghost.intensity * 18, 0, TAU);
    context.fill();

    context.fillStyle = `hsla(${ghost.hue}, 96%, 84%, ${0.88 * shimmer})`;
    context.beginPath();
    context.arc(pixel.x, pixel.y, 2.4 + ghost.intensity * 2.8, 0, TAU);
    context.fill();
  }
};

const drawFilament = (
  context: CanvasRenderingContext2D,
  size: SurfaceSize,
  filament: Filament,
) => {
  const from = normalizedToPixels(filament.from, size);
  const to = normalizedToPixels(filament.to, size);
  const midpoint = {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
  };

  context.strokeStyle = `hsla(${filament.hue}, 92%, 78%, ${filament.strength})`;
  context.lineWidth = 1 + filament.strength * 3.2;
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.quadraticCurveTo(
    midpoint.x,
    midpoint.y - 22 * filament.strength,
    to.x,
    to.y,
  );
  context.stroke();
};

const drawSpark = (
  context: CanvasRenderingContext2D,
  size: SurfaceSize,
  spark: Spark,
  now: number,
) => {
  const age = now - spark.bornAt;
  const progress = clamp(age / spark.ttl, 0, 1);
  const alpha = (1 - progress) * spark.strength * 0.75;
  const pixel = normalizedToPixels(spark.point, size);
  const radius = mix(2, 28 * spark.strength, progress);

  context.strokeStyle = `hsla(${spark.hue}, 98%, 86%, ${alpha})`;
  context.lineWidth = 1.1 + spark.strength * 1.8;

  for (let index = 0; index < 4; index += 1) {
    const angle = now * 0.001 + index * (Math.PI / 2);
    context.beginPath();
    context.moveTo(
      pixel.x + Math.cos(angle) * radius * 0.2,
      pixel.y + Math.sin(angle) * radius * 0.2,
    );
    context.lineTo(
      pixel.x + Math.cos(angle) * radius,
      pixel.y + Math.sin(angle) * radius,
    );
    context.stroke();
  }
};

const drawTouchNode = (
  context: CanvasRenderingContext2D,
  size: SurfaceSize,
  touch: ActiveTouch,
  now: number,
) => {
  const point = touch.points.at(-1);

  if (!point) {
    return;
  }

  const copyCount = Math.max(touch.symmetry, 1);

  for (let copyIndex = 0; copyIndex < copyCount; copyIndex += 1) {
    const angle = (copyIndex / copyCount) * TAU;
    const rotated = rotatePoint(point, angle);
    const pixel = normalizedToPixels(rotated, size);
    const pulse = 0.6 + Math.sin(now * 0.004 + copyIndex) * 0.18;
    const radius = 20 + touch.holdCharge * 42;

    const gradient = context.createRadialGradient(
      pixel.x,
      pixel.y,
      0,
      pixel.x,
      pixel.y,
      radius,
    );

    gradient.addColorStop(
      0,
      `hsla(${touch.hue}, 96%, 78%, ${0.36 * pulse})`,
    );
    gradient.addColorStop(
      0.65,
      `hsla(${touch.hue}, 88%, 62%, ${0.14 + touch.holdCharge * 0.16})`,
    );
    gradient.addColorStop(1, `hsla(${touch.hue}, 88%, 60%, 0)`);

    context.fillStyle = gradient;
    context.beginPath();
    context.arc(pixel.x, pixel.y, radius, 0, TAU);
    context.fill();

    context.strokeStyle = `hsla(${touch.hue}, 100%, 84%, ${
      0.26 + touch.holdCharge * 0.28
    })`;
    context.lineWidth = 1.4 + touch.holdCharge * 2.8;
    context.beginPath();
    context.arc(pixel.x, pixel.y, 12 + touch.holdCharge * 12, 0, TAU);
    context.stroke();
  }
};

const drawMemoryBloom = (
  context: CanvasRenderingContext2D,
  size: SurfaceSize,
  point: NormalizedPoint,
  hue: number,
  symmetry: number,
  intensity: number,
  drift: number,
  now: number,
) => {
  const copyCount = Math.max(symmetry, 1);

  context.save();
  context.globalCompositeOperation = "screen";

  for (let copyIndex = 0; copyIndex < copyCount; copyIndex += 1) {
    const angle = (copyIndex / copyCount) * TAU;
    const rotated = rotatePoint(point, angle);
    const pixel = normalizedToPixels(rotated, size);
    const pulse = 0.78 + Math.sin(now * 0.0011 + drift + copyIndex * 0.6) * 0.14;
    const radius = 34 + intensity * 48 * pulse;
    const gradient = context.createRadialGradient(
      pixel.x,
      pixel.y,
      0,
      pixel.x,
      pixel.y,
      radius,
    );

    gradient.addColorStop(0, `hsla(${hue}, 88%, 76%, ${intensity * 0.18})`);
    gradient.addColorStop(0.44, `hsla(${hue}, 86%, 68%, ${intensity * 0.08})`);
    gradient.addColorStop(1, `hsla(${hue}, 82%, 60%, 0)`);

    context.fillStyle = gradient;
    context.beginPath();
    context.arc(pixel.x, pixel.y, radius, 0, TAU);
    context.fill();
  }

  context.restore();
};

const drawMotifLane = (
  context: CanvasRenderingContext2D,
  size: SurfaceSize,
  motif: MotifLane,
  now: number,
  surfaceEnergy: number,
  transportStepPosition: number,
) => {
  const age = now - motif.lastSeenAt;
  const life = clamp(1 - age / 32000, 0, 1);
  const strength = motif.strength * (0.35 + life * 0.65);

  if (strength < 0.06) {
    return;
  }

  context.save();
  context.shadowBlur = 14 + strength * 18;
  context.shadowColor = `hsla(${motif.hue}, 92%, 72%, ${0.12 + strength * 0.18})`;
  drawPath(
    context,
    size,
    motif.points,
    motif.symmetry,
    `hsla(${motif.hue}, 88%, 72%, ${0.06 + strength * 0.18})`,
    4.4 + strength * 5.2,
    0.58,
  );
  context.restore();

  drawPath(
    context,
    size,
    motif.points,
    motif.symmetry,
    `hsla(${motif.hue}, 92%, 80%, ${0.12 + strength * 0.2})`,
    1.2 + strength * 1.8,
    0.9,
  );

  const motifPulse = getMotifMotionPoints(motif, transportStepPosition, surfaceEnergy);
  const copyCount = Math.max(motif.symmetry, 1);

  context.save();
  context.globalCompositeOperation = "lighter";

  for (let copyIndex = 0; copyIndex < copyCount; copyIndex += 1) {
    const angle = (copyIndex / copyCount) * TAU;
    const rotated = rotatePoint(motifPulse.point, angle);
    const pixel = normalizedToPixels(rotated, size);
    const gradient = context.createRadialGradient(
      pixel.x,
      pixel.y,
      0,
      pixel.x,
      pixel.y,
      26 + strength * 20,
    );

    gradient.addColorStop(
      0,
      `hsla(${motif.hue}, 100%, 84%, ${0.22 + strength * 0.2})`,
    );
    gradient.addColorStop(
      0.45,
      `hsla(${motif.hue}, 92%, 70%, ${0.08 + strength * 0.08})`,
    );
    gradient.addColorStop(1, `hsla(${motif.hue}, 88%, 62%, 0)`);

    context.fillStyle = gradient;
    context.beginPath();
    context.arc(pixel.x, pixel.y, 24 + strength * 18, 0, TAU);
    context.fill();
  }

  context.restore();
};

const drawResonanceWell = (
  context: CanvasRenderingContext2D,
  size: SurfaceSize,
  well: ResonanceWell,
  now: number,
) => {
  const age = now - well.bornAt;
  const life = clamp(1 - age / well.ttl, 0, 1);
  const shimmer = 0.78 + Math.sin(now * 0.0012 + well.drift) * 0.14;
  const copyCount = Math.max(well.symmetry, 1);

  context.save();
  context.globalCompositeOperation = "screen";

  for (let copyIndex = 0; copyIndex < copyCount; copyIndex += 1) {
    const angle = (copyIndex / copyCount) * TAU;
    const rotated = rotatePoint(well.point, angle);
    const pixel = normalizedToPixels(rotated, size);
    const radius = (11 + well.energy * 10) * (0.9 + shimmer * 0.18);
    const gradient = context.createRadialGradient(
      pixel.x,
      pixel.y,
      0,
      pixel.x,
      pixel.y,
      radius * 2.6,
    );

    gradient.addColorStop(
      0,
      `hsla(${well.hue}, 92%, 82%, ${(0.22 + well.energy * 0.08) * life})`,
    );
    gradient.addColorStop(
      0.5,
      `hsla(${well.hue}, 88%, 68%, ${(0.1 + well.energy * 0.04) * life})`,
    );
    gradient.addColorStop(1, `hsla(${well.hue}, 84%, 60%, 0)`);

    context.fillStyle = gradient;
    context.beginPath();
    context.arc(pixel.x, pixel.y, radius * 2.6, 0, TAU);
    context.fill();

    context.strokeStyle = `hsla(${well.hue}, 94%, 84%, ${(0.22 + well.energy * 0.12) * life})`;
    context.lineWidth = 1 + well.energy * 1.8;
    context.beginPath();
    context.arc(pixel.x, pixel.y, radius * 1.2, 0, TAU);
    context.stroke();

    context.strokeStyle = `hsla(${well.hue}, 88%, 76%, ${(0.1 + well.energy * 0.08) * life})`;
    context.lineWidth = 1;
    context.beginPath();
    context.arc(pixel.x, pixel.y, radius * (1.9 + shimmer * 0.14), 0, TAU);
    context.stroke();

    for (let satelliteIndex = 0; satelliteIndex < 2; satelliteIndex += 1) {
      const orbitAngle =
        now * 0.0011 * (0.9 + well.energy * 0.18) +
        well.drift +
        satelliteIndex * Math.PI +
        copyIndex * 0.12;
      const orbitRadius = radius * (1.55 + satelliteIndex * 0.42);
      const satellite = {
        x: pixel.x + Math.cos(orbitAngle) * orbitRadius,
        y: pixel.y + Math.sin(orbitAngle) * orbitRadius,
      };

      context.fillStyle = `hsla(${well.hue}, 100%, 88%, ${(0.42 + well.energy * 0.16) * life})`;
      context.beginPath();
      context.arc(satellite.x, satellite.y, 1.8 + well.energy * 0.9, 0, TAU);
      context.fill();
    }
  }

  context.restore();
};

const chooseHue = (point: NormalizedPoint, interactions: number) => {
  const seed = point.x * 128 + point.y * 54 + interactions * 19;
  return 18 + (seed % 186);
};

const chooseSymmetry = (point: NormalizedPoint) => {
  const distanceFromCenter = Math.hypot(point.x - 0.5, point.y - 0.5);
  if (distanceFromCenter < 0.16) {
    return 1;
  }

  if (distanceFromCenter < 0.3) {
    return 2;
  }

  return point.x < 0.24 || point.x > 0.76 ? 4 : 3;
};

const formatSymmetryMode = (
  mode: SymmetryMode,
  lastResolvedSymmetry: number,
) => {
  if (mode === "auto") {
    return `AUTO x${lastResolvedSymmetry}`;
  }

  if (mode === 2) {
    return "DUAL x2";
  }

  if (mode === 4) {
    return "QUAD x4";
  }

  return "KALEID x6";
};

const createEchoRecord = ({
  id,
  bornAt,
  hue,
  symmetry,
  holdCharge,
  points,
  delay,
  speed,
  phase,
  resonance,
  energy,
  drift,
  wobble,
  lineWidth,
  trailDecayMs = ECHO_TRAIL_DECAY_MS,
  memoryLifeMs = ECHO_MEMORY_LIFE_MS,
  replayIntervalMs = 860,
  synthetic = false,
  transportConfig = DEFAULT_TRANSPORT_CONFIG,
}: {
  id: number;
  bornAt: number;
  hue: number;
  symmetry: number;
  holdCharge: number;
  points: NormalizedPoint[];
  delay: number;
  speed: number;
  phase: number;
  resonance: number;
  energy: number;
  drift: number;
  wobble: number;
  lineWidth: number;
  trailDecayMs?: number;
  memoryLifeMs?: number;
  replayIntervalMs?: number;
  synthetic?: boolean;
  transportConfig?: TransportConfig;
}): EchoRecord => {
  const duration = Math.max(pathDuration(points), 260);
  const loopSteps = quantizeDurationToSteps(duration, transportConfig);

  return {
    id,
    bornAt,
    hue,
    symmetry,
    holdCharge,
    duration,
    points,
    centroid: averagePoint(points),
    delay,
    speed,
    phase,
    resonance,
    energy,
    drift,
    wobble,
    lineWidth,
    trailDecayMs,
    memoryLifeMs,
    replayIntervalMs,
    synthetic,
    scheduledAtMs: quantizeTimeMs(bornAt, transportConfig),
    loopSteps,
    stepPoints: buildQuantizedStepPoints(points, loopSteps),
    lastQuantizedStep: -1,
    lastEchoPulseAt: bornAt - 1200,
    lastBoostAt: bornAt - 1200,
  };
};

const createWellRecord = ({
  id,
  bornAt,
  point,
  hue,
  symmetry,
  energy,
  drift,
  ttl = WELL_TTL_MS,
  transportConfig = DEFAULT_TRANSPORT_CONFIG,
}: {
  id: number;
  bornAt: number;
  point: NormalizedPoint;
  hue: number;
  symmetry: number;
  energy: number;
  drift: number;
  ttl?: number;
  transportConfig?: TransportConfig;
}): ResonanceWell => ({
  id,
  bornAt,
  ttl,
  point,
  hue,
  symmetry,
  energy,
  drift,
  scheduledAtMs: quantizeTimeMs(bornAt, transportConfig),
  lastQuantizedStep: -1,
  lastPulseAt: bornAt - 900,
  lastToneAt: bornAt - 1200,
});

const requantizeEchoRecord = (
  echo: EchoRecord,
  transportConfig: TransportConfig,
  resetStep = true,
) => {
  const loopSteps = quantizeDurationToSteps(echo.duration, transportConfig);
  echo.scheduledAtMs = quantizeTimeMs(echo.bornAt, transportConfig);
  echo.loopSteps = loopSteps;
  echo.stepPoints = buildQuantizedStepPoints(echo.points, loopSteps);
  if (resetStep) {
    echo.lastQuantizedStep = -1;
  }
};

const requantizeWellRecord = (
  well: ResonanceWell,
  transportConfig: TransportConfig,
  resetStep = true,
) => {
  well.scheduledAtMs = quantizeTimeMs(well.bornAt, transportConfig);
  if (resetStep) {
    well.lastQuantizedStep = -1;
  }
};

const createPresetState = (preset: SurfacePreset, now: number) => {
  const activeTouches = new Map<number, ActiveTouch>();
  let nextEchoId = 0;
  let nextPulseId = 0;
  let nextWellId = 0;
  let nextMotifId = 0;

  if (preset === "seed") {
    const echoes = [
      createEchoRecord({
        id: nextEchoId++,
        bornAt: now - 1800,
        hue: 38,
        symmetry: 3,
        holdCharge: 0.18,
        points: [
          point(0.28, 0.33, 0),
          point(0.31, 0.29, 160),
          point(0.35, 0.32, 320),
          point(0.33, 0.38, 500),
          point(0.27, 0.37, 680),
        ],
        delay: 260,
        speed: 0.92,
        phase: 180,
        resonance: 0.72,
        energy: 1.18,
        drift: 1.2,
        wobble: 0.005,
        lineWidth: 2.4,
      }),
      createEchoRecord({
        id: nextEchoId++,
        bornAt: now - 2200,
        hue: 152,
        symmetry: 4,
        holdCharge: 0.22,
        points: [
          point(0.63, 0.27, 0),
          point(0.69, 0.24, 140),
          point(0.73, 0.31, 340),
          point(0.67, 0.38, 520),
          point(0.6, 0.34, 720),
        ],
        delay: 340,
        speed: 0.82,
        phase: 320,
        resonance: 0.68,
        energy: 1.08,
        drift: 3.1,
        wobble: 0.004,
        lineWidth: 2.1,
      }),
      createEchoRecord({
        id: nextEchoId++,
        bornAt: now - 1600,
        hue: 92,
        symmetry: 5,
        holdCharge: 0.14,
        points: [
          point(0.43, 0.66, 0),
          point(0.49, 0.61, 160),
          point(0.55, 0.66, 330),
          point(0.51, 0.74, 540),
          point(0.44, 0.72, 740),
        ],
        delay: 420,
        speed: 1.04,
        phase: 150,
        resonance: 0.62,
        energy: 1.12,
        drift: 4.3,
        wobble: 0.005,
        lineWidth: 2.3,
      }),
    ];

    const pulses: Pulse[] = [
      {
        id: nextPulseId++,
        bornAt: now - 420,
        ttl: 1650,
        point: point(0.29, 0.33, now - 420),
        hue: 38,
        strength: 0.88,
        symmetry: 3,
        source: "touch",
      },
      {
        id: nextPulseId++,
        bornAt: now - 580,
        ttl: 1650,
        point: point(0.64, 0.31, now - 580),
        hue: 152,
        strength: 0.78,
        symmetry: 4,
        source: "ghost",
      },
      {
        id: nextPulseId++,
        bornAt: now - 300,
        ttl: 1450,
        point: point(0.5, 0.68, now - 300),
        hue: 92,
        strength: 0.64,
        symmetry: 5,
        source: "touch",
      },
    ];

    return {
      state: {
        activeTouches,
        echoes,
        pulses,
        sparks: [],
        interferenceEvents: [],
        wells: [],
        gestureLog: [],
        motifs: [
          {
            id: nextMotifId++,
            bornAt: now - 3200,
            lastSeenAt: now - 600,
            hue: 42,
            symmetry: 3,
            strength: 0.72,
            occurrences: 2,
            points: resampleGesturePoints(
              [
                point(0.25, 0.34, 0),
                point(0.33, 0.3, 1),
                point(0.39, 0.33, 2),
                point(0.36, 0.41, 3),
                point(0.28, 0.4, 4),
              ],
              MOTIF_POINT_COUNT,
            ),
            centroid: point(0.32, 0.36, 0),
            drift: 0.28,
            sourceType: "drag" as const,
          },
        ],
        surfaceEnergy: 0.22,
        interactions: echoes.length,
      },
      nextEchoId,
      nextPulseId,
      nextWellId,
    };
  }

  if (preset === "trace") {
    const echoes = [
      createEchoRecord({
        id: nextEchoId++,
        bornAt: now - 2800,
        hue: 172,
        symmetry: 4,
        holdCharge: 0.3,
        points: [
          point(0.17, 0.64, 0),
          point(0.28, 0.54, 170),
          point(0.4, 0.43, 360),
          point(0.54, 0.37, 540),
          point(0.68, 0.42, 760),
          point(0.8, 0.58, 1020),
        ],
        delay: 260,
        speed: 0.86,
        phase: 620,
        resonance: 0.82,
        energy: 1.28,
        drift: 2.4,
        wobble: 0.004,
        lineWidth: 2.8,
      }),
      createEchoRecord({
        id: nextEchoId++,
        bornAt: now - 2400,
        hue: 28,
        symmetry: 5,
        holdCharge: 0.22,
        points: [
          point(0.18, 0.29, 0),
          point(0.31, 0.38, 180),
          point(0.44, 0.53, 360),
          point(0.56, 0.64, 560),
          point(0.72, 0.69, 760),
          point(0.83, 0.63, 920),
        ],
        delay: 220,
        speed: 0.98,
        phase: 340,
        resonance: 0.74,
        energy: 1.22,
        drift: 5.2,
        wobble: 0.004,
        lineWidth: 2.6,
      }),
      createEchoRecord({
        id: nextEchoId++,
        bornAt: now - 1900,
        hue: 108,
        symmetry: 6,
        holdCharge: 0.18,
        points: [
          point(0.46, 0.19, 0),
          point(0.52, 0.28, 140),
          point(0.57, 0.42, 320),
          point(0.51, 0.57, 520),
          point(0.45, 0.72, 760),
        ],
        delay: 460,
        speed: 1.08,
        phase: 280,
        resonance: 0.7,
        energy: 1.16,
        drift: 0.7,
        wobble: 0.005,
        lineWidth: 2.4,
      }),
    ];

    const pulses: Pulse[] = [
      {
        id: nextPulseId++,
        bornAt: now - 460,
        ttl: 1650,
        point: point(0.49, 0.5, now - 460),
        hue: 100,
        strength: 0.72,
        symmetry: 6,
        source: "collision",
      },
      {
        id: nextPulseId++,
        bornAt: now - 260,
        ttl: 1450,
        point: point(0.62, 0.46, now - 260),
        hue: 172,
        strength: 0.64,
        symmetry: 4,
        source: "ghost",
      },
    ];

    const sparks: Spark[] = [
      {
        point: point(0.49, 0.5, now - 220),
        bornAt: now - 220,
        ttl: 540,
        hue: 104,
        strength: 0.86,
      },
    ];

    return {
      state: {
        activeTouches,
        echoes,
        pulses,
        sparks,
        interferenceEvents: [],
        wells: [],
        gestureLog: [],
        motifs: [
          {
            id: nextMotifId++,
            bornAt: now - 3600,
            lastSeenAt: now - 400,
            hue: 166,
            symmetry: 4,
            strength: 0.84,
            occurrences: 3,
            points: resampleGesturePoints(
              [
                point(0.2, 0.64, 0),
                point(0.33, 0.55, 1),
                point(0.49, 0.44, 2),
                point(0.64, 0.46, 3),
                point(0.76, 0.59, 4),
              ],
              MOTIF_POINT_COUNT,
            ),
            centroid: point(0.48, 0.54, 0),
            drift: 1.2,
            sourceType: "drag" as const,
          },
          {
            id: nextMotifId++,
            bornAt: now - 3000,
            lastSeenAt: now - 700,
            hue: 34,
            symmetry: 5,
            strength: 0.66,
            occurrences: 2,
            points: resampleGesturePoints(
              [
                point(0.22, 0.31, 0),
                point(0.35, 0.41, 1),
                point(0.49, 0.56, 2),
                point(0.62, 0.66, 3),
                point(0.78, 0.67, 4),
              ],
              MOTIF_POINT_COUNT,
            ),
            centroid: point(0.49, 0.52, 0),
            drift: 2.1,
            sourceType: "drag" as const,
          },
        ],
        surfaceEnergy: 0.3,
        interactions: echoes.length,
      },
      nextEchoId,
      nextPulseId,
      nextWellId,
    };
  }

  const centerTouch: ActiveTouch = {
    pointerId: 9001,
    bornAt: now - 1900,
    hue: 132,
    symmetry: 6,
    holdCharge: 0.82,
    lastPulseAt: now - 220,
    lastSampleAt: now - 24,
    points: [
      point(0.51, 0.48, now - 1900),
      point(0.514, 0.482, now - 900),
      point(0.517, 0.486, now - 120),
    ],
    travel: 0.012,
  };

  activeTouches.set(centerTouch.pointerId, centerTouch);

  const echoes = [
    createEchoRecord({
      id: nextEchoId++,
      bornAt: now - 2600,
      hue: 132,
      symmetry: 6,
      holdCharge: 0.56,
      points: [
        point(0.42, 0.51, 0),
        point(0.47, 0.43, 160),
        point(0.55, 0.42, 320),
        point(0.61, 0.49, 520),
        point(0.57, 0.57, 700),
        point(0.48, 0.59, 920),
      ],
      delay: 180,
      speed: 0.94,
      phase: 420,
      resonance: 0.9,
      energy: 1.34,
      drift: 1.8,
      wobble: 0.006,
      lineWidth: 3.1,
    }),
    createEchoRecord({
      id: nextEchoId++,
      bornAt: now - 1800,
      hue: 24,
      symmetry: 4,
      holdCharge: 0.24,
      points: [
        point(0.29, 0.41, 0),
        point(0.36, 0.36, 150),
        point(0.44, 0.38, 320),
        point(0.46, 0.48, 500),
        point(0.39, 0.58, 720),
        point(0.3, 0.55, 920),
      ],
      delay: 540,
      speed: 1.06,
      phase: 200,
      resonance: 0.72,
      energy: 1.1,
      drift: 4.6,
      wobble: 0.005,
      lineWidth: 2.5,
    }),
  ];

  const pulses: Pulse[] = [
    {
      id: nextPulseId++,
      bornAt: now - 180,
      ttl: 1450,
      point: point(0.515, 0.486, now - 180),
      hue: 132,
      strength: 0.82,
      symmetry: 6,
      source: "hold",
    },
    {
      id: nextPulseId++,
      bornAt: now - 420,
      ttl: 980,
      point: point(0.48, 0.49, now - 420),
      hue: 78,
      strength: 0.72,
      symmetry: 6,
      source: "collision",
    },
  ];

  return {
    state: {
      activeTouches,
      echoes,
      pulses,
      sparks: [
        {
          point: point(0.49, 0.49, now - 160),
          bornAt: now - 160,
          ttl: 540,
          hue: 84,
          strength: 0.76,
        },
      ],
      interferenceEvents: [],
      wells: [
        createWellRecord({
          id: nextWellId++,
          bornAt: now - 2400,
          point: point(0.515, 0.486, now - 2400),
          hue: 136,
          symmetry: 6,
          energy: 0.82,
          drift: 1.6,
          transportConfig: DEFAULT_TRANSPORT_CONFIG,
        }),
      ],
      gestureLog: [],
      motifs: [
        {
          id: nextMotifId++,
          bornAt: now - 2800,
          lastSeenAt: now - 280,
          hue: 132,
          symmetry: 6,
          strength: 0.92,
          occurrences: 3,
          points: resampleGesturePoints(
            [
              point(0.44, 0.49, 0),
              point(0.48, 0.43, 1),
              point(0.56, 0.43, 2),
              point(0.61, 0.5, 3),
              point(0.56, 0.57, 4),
              point(0.48, 0.57, 5),
              point(0.44, 0.49, 6),
            ],
            MOTIF_POINT_COUNT,
          ),
          centroid: point(0.51, 0.5, 0),
          drift: 0.74,
          sourceType: "hold" as const,
        },
      ],
      surfaceEnergy: 0.42,
      interactions: echoes.length,
    },
    nextEchoId,
    nextPulseId,
    nextWellId,
  };
};

export function EchoSurface({
  preset,
  captureMode = false,
}: EchoSurfaceProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef<SurfaceSize>({ width: 0, height: 0 });
  const animationFrameRef = useRef<number | null>(null);
  const lastGhostToneAtRef = useRef(0);
  const lastKickAtRef = useRef(0);
  const lastCollisionToneAtRef = useRef(0);
  const soundRef = useRef<AudioEngine>({
    context: null,
    master: null,
    compressor: null,
    fxSend: null,
    noiseBuffer: null,
    muted: false,
    masterLevel: 0.24,
  });
  const pulseIdRef = useRef(0);
  const echoIdRef = useRef(0);
  const wellIdRef = useRef(0);
  const gestureEventIdRef = useRef(0);
  const motifIdRef = useRef(0);
  const interferenceIdRef = useRef(0);
  const lastInteractionAtRef = useRef(performance.now());
  const lastDemoAtRef = useRef(0);
  const demoCursorRef = useRef(0);
  const interferenceCooldownRef = useRef(new Map<string, number>());
  const demoStateRef = useRef(false);
  const symmetryModeRef = useRef<SymmetryMode>("auto");
  const simulationRef = useRef<SimulationState>({
    activeTouches: new Map(),
    echoes: [],
    pulses: [],
    sparks: [],
    interferenceEvents: [],
    wells: [],
    gestureLog: [],
    motifs: [],
    surfaceEnergy: 0.18,
    interactions: 0,
  });
  const [memory, setMemory] = useState<MemoryChip[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [demoAwake, setDemoAwake] = useState(false);
  const [symmetryMode, setSymmetryMode] = useState<SymmetryMode>("auto");
  const [transportSignatureIndex, setTransportSignatureIndex] = useState(0);
  const [lastResolvedSymmetry, setLastResolvedSymmetry] = useState(1);
  const transportConfig = useMemo(
    () => ({
      ...DEFAULT_TRANSPORT_CONFIG,
      signature: TRANSPORT_SIGNATURES[transportSignatureIndex],
    }),
    [transportSignatureIndex],
  );

  const symmetryDisplay = useMemo(
    () => formatSymmetryMode(symmetryMode, lastResolvedSymmetry),
    [lastResolvedSymmetry, symmetryMode],
  );
  const decayLabel = `${(ECHO_TRAIL_DECAY_MS / 1000).toFixed(1)}s`;
  const replayLabel = demoAwake ? "DEMO" : LOOP_ENABLED ? "ON" : "OFF";
  const timeLabel = `${transportConfig.signature.label} @${transportConfig.bpm}`;
  const whisperLabel = demoAwake
    ? "the surface is replaying its own memory"
    : activeCount > 0
      ? "keep moving until the ghosts start answering back"
      : "tap • trace • hold still to plant a listening point";

  const syncMemory = () => {
    setMemory(
      simulationRef.current.echoes.map((echo) => ({
        id: echo.id,
        hue: echo.hue,
        symmetry: echo.symmetry,
      })),
    );
  };

  const syncActiveCount = () => {
    setActiveCount(simulationRef.current.activeTouches.size);
  };

  const classifyGestureEvent = (
    travel: number,
    holdCharge: number,
    points: NormalizedPoint[],
  ): GestureEvent["type"] => {
    if (holdCharge > 0.44 && points.length > 2) {
      return "hold";
    }

    if (travel > 0.08 || points.length > 5) {
      return "drag";
    }

    return "tap";
  };

  const learnMotifFromEvent = (event: GestureEvent) => {
    if (event.type === "tap" || event.points.length < 4) {
      return;
    }

    const state = simulationRef.current;
    const resampled = resampleGesturePoints(event.points, MOTIF_POINT_COUNT);
    const normalized = normalizeGesturePoints(resampled);
    const direction = getGestureDirection(normalized);
    const matchThreshold = event.type === "hold" ? 0.28 : 0.24;
    let bestMatch:
      | {
          score: number;
          motif: MotifLane;
        }
      | undefined;

    state.motifs.forEach((motif) => {
      const motifNormalized = normalizeGesturePoints(motif.points);
      const shapeScore = compareGestureShapes(normalized, motifNormalized);
      const directionScore = Math.abs(
        Math.atan2(
          Math.sin(direction - getGestureDirection(motifNormalized)),
          Math.cos(direction - getGestureDirection(motifNormalized)),
        ),
      );
      const centroidScore = distance(event.centroid, motif.centroid);
      const totalScore = shapeScore + directionScore * 0.12 + centroidScore * 0.34;

      if (
        totalScore < matchThreshold &&
        (!bestMatch || totalScore < bestMatch.score)
      ) {
        bestMatch = { motif, score: totalScore };
      }
    });

    if (bestMatch) {
      const { motif } = bestMatch;
      motif.points = blendGestureShapes(motif.points, resampled, 0.28);
      motif.centroid = averagePoint(motif.points);
      motif.hue = mix(motif.hue, event.hue, 0.28);
      motif.symmetry = Math.max(motif.symmetry, event.symmetry);
      motif.strength = clamp(motif.strength + 0.16, 0.24, 1.5);
      motif.lastSeenAt = event.timestamp;
      motif.occurrences += 1;
      return;
    }

    const previousMatch = [...state.gestureLog]
      .reverse()
      .find((priorEvent) => {
        if (
          priorEvent.id === event.id ||
          priorEvent.type !== event.type ||
          priorEvent.points.length < 4
        ) {
          return false;
        }

        const priorResampled = resampleGesturePoints(
          priorEvent.points,
          MOTIF_POINT_COUNT,
        );
        const priorNormalized = normalizeGesturePoints(priorResampled);
        const shapeScore = compareGestureShapes(normalized, priorNormalized);
        const directionScore = Math.abs(
          Math.atan2(
            Math.sin(direction - getGestureDirection(priorNormalized)),
            Math.cos(direction - getGestureDirection(priorNormalized)),
          ),
        );

        return (
          shapeScore + directionScore * 0.12 < matchThreshold &&
          distance(event.centroid, priorEvent.centroid) < 0.34
        );
      });

    if (!previousMatch || state.motifs.length >= MAX_MOTIFS) {
      return;
    }

    const priorResampled = resampleGesturePoints(
      previousMatch.points,
      MOTIF_POINT_COUNT,
    );
    const motifPoints = blendGestureShapes(priorResampled, resampled, 0.5);

    state.motifs = [
      ...state.motifs,
      {
        id: motifIdRef.current++,
        bornAt: event.timestamp,
        lastSeenAt: event.timestamp,
        hue: mix(previousMatch.hue, event.hue, 0.5),
        symmetry: Math.max(previousMatch.symmetry, event.symmetry),
        strength: 0.56,
        occurrences: 2,
        points: motifPoints,
        centroid: averagePoint(motifPoints),
        drift: Math.random() * TAU,
        sourceType: event.type,
      },
    ].slice(-MAX_MOTIFS);
  };

  const appendGestureEvent = (event: GestureEvent) => {
    const state = simulationRef.current;
    state.gestureLog = [...state.gestureLog, event].slice(-MAX_GESTURE_EVENTS);
    state.surfaceEnergy = clamp(
      state.surfaceEnergy +
        event.energy *
          (event.type === "tap" ? 0.08 : event.type === "hold" ? 0.18 : 0.14),
      0.12,
      1.5,
    );
    learnMotifFromEvent(event);
  };

  const remixGestureEventPoints = (event: GestureEvent, remixIndex: number) => {
    const centroid = event.centroid;
    const points = event.points.map((point) => ({ ...point }));
    const variant = remixIndex % 4;

    return points.map((point, pointIndex) => {
      const dx = point.x - centroid.x;
      const dy = point.y - centroid.y;
      const baseTime = pointIndex === 0 ? 0 : point.t;

      if (variant === 0) {
        return {
          x: clamp(point.x, 0.04, 0.96),
          y: clamp(point.y, 0.04, 0.96),
          t: baseTime * 1.2,
        };
      }

      if (variant === 1) {
        return {
          x: clamp(centroid.x - dx * 0.94, 0.04, 0.96),
          y: clamp(centroid.y + dy * 0.94, 0.04, 0.96),
          t: baseTime * 1.1,
        };
      }

      if (variant === 2) {
        const rotated = {
          x:
            centroid.x +
            dx * Math.cos(Math.PI / 8) -
            dy * Math.sin(Math.PI / 8),
          y:
            centroid.y +
            dx * Math.sin(Math.PI / 8) +
            dy * Math.cos(Math.PI / 8),
        };

        return {
          x: clamp(rotated.x, 0.04, 0.96),
          y: clamp(rotated.y, 0.04, 0.96),
          t: baseTime * 1.28,
        };
      }

      const radial = rotatePoint(
        {
          x: clamp(0.5 + (point.x - 0.5) * 0.92, 0.04, 0.96),
          y: clamp(0.5 + (point.y - 0.5) * 0.92, 0.04, 0.96),
          t: baseTime,
        },
        (Math.PI / Math.max(event.symmetry, 2)) * 0.5,
      );

      return {
        x: clamp(radial.x, 0.04, 0.96),
        y: clamp(radial.y, 0.04, 0.96),
        t: baseTime * 1.36,
      };
    });
  };

  const resolveSymmetry = (point: NormalizedPoint) => {
    const mode = symmetryModeRef.current;
    const symmetry = mode === "auto" ? chooseSymmetry(point) : mode;

    setLastResolvedSymmetry(symmetry);
    return symmetry;
  };

  const cycleSymmetryMode = () => {
    const now = performance.now();

    setSymmetryMode((current) => {
      const currentIndex = SYMMETRY_MODE_SEQUENCE.indexOf(current);
      const next =
        SYMMETRY_MODE_SEQUENCE[
          (currentIndex + 1) % SYMMETRY_MODE_SEQUENCE.length
        ];

      symmetryModeRef.current = next;
      if (next !== "auto") {
        setLastResolvedSymmetry(next);
      }
      return next;
    });

    lastInteractionAtRef.current = now;
    syncDemoState(false);
  };

  const cycleTimeSignature = () => {
    setTransportSignatureIndex(
      (current) => (current + 1) % TRANSPORT_SIGNATURES.length,
    );
    lastInteractionAtRef.current = performance.now();
    syncDemoState(false);
  };

  const ensureAudio = async () => {
    if (typeof window === "undefined") {
      return;
    }

    const engine = soundRef.current;

    if (!engine.context) {
      const context = new window.AudioContext();
      const compressor = context.createDynamicsCompressor();
      const master = context.createGain();
      const fxSend = context.createGain();
      const delay = context.createDelay(1.2);
      const feedback = context.createGain();
      const delayFilter = context.createBiquadFilter();
      const noiseBuffer = context.createBuffer(
        1,
        context.sampleRate,
        context.sampleRate,
      );
      const noiseData = noiseBuffer.getChannelData(0);

      compressor.threshold.value = -18;
      compressor.knee.value = 22;
      compressor.ratio.value = 3.6;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.2;

      master.gain.value = engine.masterLevel;

      delay.delayTime.value = (60 / 132) * 0.75;
      feedback.gain.value = 0.42;
      delayFilter.type = "lowpass";
      delayFilter.frequency.value = 3200;
      delayFilter.Q.value = 0.8;

      for (let index = 0; index < noiseData.length; index += 1) {
        noiseData[index] = Math.random() * 2 - 1;
      }

      fxSend.connect(delay);
      delay.connect(delayFilter);
      delayFilter.connect(feedback);
      feedback.connect(delay);
      delayFilter.connect(compressor);
      compressor.connect(master);
      master.connect(context.destination);

      engine.context = context;
      engine.master = master;
      engine.compressor = compressor;
      engine.fxSend = fxSend;
      engine.noiseBuffer = noiseBuffer;
    }

    if (engine.context.state === "suspended") {
      await engine.context.resume();
    }
  };

  const duckMix = (intensity: number, recovery = 0.24) => {
    const engine = soundRef.current;

    if (!engine.context || !engine.master) {
      return;
    }

    const now = engine.context.currentTime;
    const baseline = engine.masterLevel;
    const floor = baseline * (1 - clamp(0.16 + intensity * 0.26, 0.16, 0.58));

    engine.master.gain.cancelScheduledValues(now);
    engine.master.gain.setValueAtTime(
      Math.max(engine.master.gain.value, baseline),
      now,
    );
    engine.master.gain.linearRampToValueAtTime(floor, now + 0.012);
    engine.master.gain.exponentialRampToValueAtTime(baseline, now + recovery);
  };

  const triggerNoiseBurst = (
    hue: number,
    intensity: number,
    flavor: "hat" | "clap",
  ) => {
    const engine = soundRef.current;

    if (
      !engine.context ||
      !engine.compressor ||
      !engine.fxSend ||
      !engine.noiseBuffer ||
      engine.muted
    ) {
      return;
    }

    const now = engine.context.currentTime;
    const source = engine.context.createBufferSource();
    const highpass = engine.context.createBiquadFilter();
    const bandpass = engine.context.createBiquadFilter();
    const gain = engine.context.createGain();
    const send = engine.context.createGain();

    source.buffer = engine.noiseBuffer;

    highpass.type = "highpass";
    highpass.frequency.value =
      flavor === "hat" ? 5200 : 1600 + intensity * 900;

    bandpass.type = "bandpass";
    bandpass.frequency.value =
      flavor === "hat" ? 8800 : 2100 + (hue / 204) * 1400;
    bandpass.Q.value = flavor === "hat" ? 0.9 : 1.6;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(
      flavor === "hat" ? 0.055 + intensity * 0.05 : 0.085 + intensity * 0.08,
      now + 0.004,
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + (flavor === "hat" ? 0.09 : 0.18),
    );

    send.gain.value = flavor === "hat" ? 0.06 : 0.14;

    source.connect(highpass);
    highpass.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(engine.compressor);
    gain.connect(send);
    send.connect(engine.fxSend);

    source.start(now);
    source.stop(now + 0.24);
  };

  const triggerKick = (hue: number, intensity: number) => {
    const engine = soundRef.current;

    if (!engine.context || !engine.compressor || engine.muted) {
      return;
    }

    const now = engine.context.currentTime;
    const body = engine.context.createOscillator();
    const punch = engine.context.createOscillator();
    const bodyGain = engine.context.createGain();
    const punchGain = engine.context.createGain();
    const endFrequency = 42 + (hue % 16);

    body.type = "sine";
    punch.type = "triangle";

    body.frequency.setValueAtTime(158 + intensity * 44, now);
    body.frequency.exponentialRampToValueAtTime(endFrequency, now + 0.34);

    punch.frequency.setValueAtTime(88 + intensity * 26, now);
    punch.frequency.exponentialRampToValueAtTime(endFrequency * 1.25, now + 0.16);

    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.exponentialRampToValueAtTime(
      0.34 + intensity * 0.34,
      now + 0.01,
    );
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

    punchGain.gain.setValueAtTime(0.0001, now);
    punchGain.gain.exponentialRampToValueAtTime(
      0.11 + intensity * 0.08,
      now + 0.006,
    );
    punchGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    body.connect(bodyGain);
    punch.connect(punchGain);
    bodyGain.connect(engine.compressor);
    punchGain.connect(engine.compressor);

    body.start(now);
    punch.start(now);
    body.stop(now + 0.5);
    punch.stop(now + 0.18);

    triggerNoiseBurst(hue, 0.18 + intensity * 0.18, "clap");
    duckMix(0.7 + intensity * 0.18, 0.22);
  };

  const playTone = (hue: number, strength: number, mode: ToneMode) => {
    const engine = soundRef.current;

    if (
      !engine.context ||
      !engine.compressor ||
      !engine.fxSend ||
      engine.muted
    ) {
      return;
    }

    const now = engine.context.currentTime;
    const frequency = pickClubFrequency(hue, mode);
    const primary = engine.context.createOscillator();
    const secondary = engine.context.createOscillator();
    const sub = engine.context.createOscillator();
    const filter = engine.context.createBiquadFilter();
    const drive = engine.context.createWaveShaper();
    const gain = engine.context.createGain();
    const send = engine.context.createGain();
    const isHold = mode === "hold";
    const isGhost = mode === "ghost";
    const isCollision = mode === "collision";
    const duration = isHold ? 0.76 : isGhost ? 0.34 : isCollision ? 0.2 : 0.56;
    const peak = isHold
      ? 0.075 + strength * 0.085
      : isGhost
        ? 0.055 + strength * 0.055
        : isCollision
          ? 0.06 + strength * 0.045
          : 0.085 + strength * 0.08;
    const filterStart = isHold
      ? 760 + strength * 420
      : isGhost
        ? 2200 + strength * 1400
        : isCollision
          ? 2800 + strength * 900
          : 1700 + strength * 2400;
    const filterEnd = isHold ? 180 : isGhost ? 980 : isCollision ? 700 : 420;

    primary.type = isHold ? "triangle" : "sawtooth";
    secondary.type = isGhost ? "triangle" : isCollision ? "square" : "sawtooth";
    sub.type = "sine";

    primary.detune.value = isHold ? -4 : -9;
    secondary.detune.value = isHold ? 4 : 9;

    primary.frequency.setValueAtTime(frequency, now);
    primary.frequency.exponentialRampToValueAtTime(
      Math.max(32, frequency * (isGhost ? 1.02 : isHold ? 0.92 : 0.84)),
      now + duration,
    );

    secondary.frequency.setValueAtTime(
      frequency * (isGhost ? 1.005 : 1.002),
      now,
    );
    secondary.frequency.exponentialRampToValueAtTime(
      frequency * (isGhost ? 1.2 : 0.96),
      now + duration * 0.72,
    );

    sub.frequency.setValueAtTime(frequency * (isGhost ? 1 : 0.5), now);
    sub.frequency.exponentialRampToValueAtTime(
      Math.max(30, frequency * (isGhost ? 0.96 : 0.48)),
      now + duration,
    );

    filter.type = isGhost ? "bandpass" : "lowpass";
    filter.Q.value = isHold ? 1.4 : isGhost ? 4.8 : 3.2;
    filter.frequency.setValueAtTime(filterStart, now);
    filter.frequency.exponentialRampToValueAtTime(filterEnd, now + duration);

    drive.curve = DRIVE_CURVE;
    drive.oversample = "2x";

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(
      peak,
      now + (isCollision ? 0.004 : 0.016),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    send.gain.value = isHold ? 0.14 : isGhost ? 0.34 : isCollision ? 0.1 : 0.24;

    primary.connect(filter);
    secondary.connect(filter);
    sub.connect(filter);
    filter.connect(drive);
    drive.connect(gain);
    gain.connect(engine.compressor);
    gain.connect(send);
    send.connect(engine.fxSend);

    primary.start(now);
    secondary.start(now);
    sub.start(now);
    primary.stop(now + duration + 0.06);
    secondary.stop(now + duration + 0.06);
    sub.stop(now + duration + 0.06);
  };

  const pushPulse = (point: NormalizedPoint, hue: number, strength: number, symmetry: number, source: Pulse["source"]) => {
    const energyScale =
      0.9 + simulationRef.current.surfaceEnergy * (source === "touch" ? 0.22 : 0.14);

    simulationRef.current.pulses.push({
      id: pulseIdRef.current++,
      bornAt: performance.now(),
      ttl:
        source === "collision"
          ? 880
          : source === "hold"
            ? 1800
            : source === "ghost"
              ? 1650
              : 1500,
      point,
      hue,
      strength: clamp(strength * energyScale, 0.18, 1.9),
      symmetry,
      source,
    });

    if (simulationRef.current.pulses.length > MAX_ACTIVE_PULSES) {
      simulationRef.current.pulses.splice(
        0,
        simulationRef.current.pulses.length - MAX_ACTIVE_PULSES,
      );
    }
  };

  const pushSpark = (point: NormalizedPoint, hue: number, strength: number) => {
    simulationRef.current.sparks.push({
      point,
      hue,
      strength: clamp(strength, 0.2, 1),
      bornAt: performance.now(),
      ttl: 540,
    });

    if (simulationRef.current.sparks.length > MAX_ACTIVE_SPARKS) {
      simulationRef.current.sparks.splice(
        0,
        simulationRef.current.sparks.length - MAX_ACTIVE_SPARKS,
      );
    }
  };

  const pushInterference = (
    point: NormalizedPoint,
    hue: number,
    strength: number,
    symmetry: number,
    secondaryPoint?: NormalizedPoint,
  ) => {
    simulationRef.current.interferenceEvents.push({
      id: interferenceIdRef.current++,
      bornAt: performance.now(),
      ttl: 1200,
      point,
      secondaryPoint,
      hue,
      strength: clamp(strength, 0.24, 1.4),
      symmetry,
    });

    if (
      simulationRef.current.interferenceEvents.length >
      MAX_ACTIVE_INTERFERENCE_EVENTS
    ) {
      simulationRef.current.interferenceEvents.splice(
        0,
        simulationRef.current.interferenceEvents.length -
          MAX_ACTIVE_INTERFERENCE_EVENTS,
      );
    }
  };

  const pushWell = (
    point: NormalizedPoint,
    hue: number,
    energy: number,
    symmetry: number,
  ) => {
    const state = simulationRef.current;
    const existing = state.wells.find((well) => distance(well.point, point) < 0.08);
    const now = performance.now();

    if (existing) {
      existing.bornAt = now;
      existing.hue = mix(existing.hue, hue, 0.55);
      existing.energy = clamp(existing.energy + energy * 0.3, 0.3, 1.6);
      existing.symmetry = Math.max(existing.symmetry, symmetry);
      existing.scheduledAtMs = quantizeTimeMs(now, transportConfig);
      existing.lastQuantizedStep = -1;
      existing.lastPulseAt = now - 260;
      return;
    }

    state.wells = [
      ...state.wells,
      createWellRecord({
        id: wellIdRef.current++,
        bornAt: now,
        point,
        hue,
        symmetry,
        energy: clamp(energy, 0.42, 1.2),
        drift: Math.random() * TAU,
        transportConfig,
      }),
    ].slice(-MAX_WELLS);
  };

  const syncDemoState = (value: boolean) => {
    if (demoStateRef.current === value) {
      return;
    }

    demoStateRef.current = value;
    setDemoAwake(value);
  };

  const wakeSurfaceMemory = (now: number) => {
    const state = simulationRef.current;
    const recentEvent =
      state.gestureLog.length > 0
        ? state.gestureLog[
            state.gestureLog.length -
              1 -
              (demoCursorRef.current % state.gestureLog.length)
          ]
        : undefined;

    if (recentEvent) {
      const remixedPoints = remixGestureEventPoints(recentEvent, demoCursorRef.current);
      const centroid = averagePoint(remixedPoints);
      const motifBoost = state.motifs.find(
        (motif) => distance(motif.centroid, recentEvent.centroid) < 0.22,
      );

      demoCursorRef.current += 1;
      state.echoes = [
        ...state.echoes,
        createEchoRecord({
          id: echoIdRef.current++,
          bornAt: now - 120,
          hue: motifBoost ? mix(recentEvent.hue, motifBoost.hue, 0.32) : recentEvent.hue,
          symmetry: Math.max(recentEvent.symmetry, motifBoost?.symmetry ?? 1),
          holdCharge: recentEvent.type === "hold" ? 0.24 : 0.14,
          points: remixedPoints,
          delay: 140,
          speed: 0.72,
          phase: 0,
          resonance: 0.52,
          energy: 0.72 + recentEvent.energy * 0.24,
          drift: Math.random() * TAU,
          wobble: 0.0026,
          lineWidth: 2.2,
          synthetic: true,
          replayIntervalMs: 820,
          transportConfig,
        }),
      ].slice(-MAX_ECHOES);
      pushPulse(
        centroid,
        recentEvent.hue,
        0.24 + recentEvent.energy * 0.12,
        Math.max(recentEvent.symmetry, motifBoost?.symmetry ?? 1),
        "ghost",
      );
      pushSpark(centroid, recentEvent.hue, 0.28);
      playTone(recentEvent.hue, 0.14 + recentEvent.energy * 0.06, "ghost");

      if (recentEvent.type === "hold" || recentEvent.energy > 0.76) {
        pushWell(
          centroid,
          recentEvent.hue,
          0.34 + recentEvent.energy * 0.18,
          Math.max(2, recentEvent.symmetry),
        );
      }

      state.surfaceEnergy = clamp(state.surfaceEnergy + 0.04, 0.12, 1.5);
      syncMemory();
      return;
    }

    if (state.echoes.length === 0) {
      const gesture = DEMO_LIBRARY[demoCursorRef.current % DEMO_LIBRARY.length];
      const hue = 34 + (demoCursorRef.current * 38) % 150;
      const symmetry = resolveSymmetry(averagePoint(gesture));

      demoCursorRef.current += 1;
      state.echoes = [
        ...state.echoes,
        createEchoRecord({
          id: echoIdRef.current++,
          bornAt: now - 200,
          hue,
          symmetry,
          holdCharge: 0.16,
          points: gesture.map((entry) => ({ ...entry })),
          delay: 180,
          speed: 0.88,
          phase: 0,
          resonance: 0.64,
          energy: 0.96,
          drift: Math.random() * TAU,
          wobble: 0.003,
          lineWidth: 2,
          synthetic: true,
          replayIntervalMs: 960,
          transportConfig,
        }),
      ].slice(-MAX_ECHOES);
      pushPulse(averagePoint(gesture), hue, 0.32, symmetry, "ghost");
      pushSpark(averagePoint(gesture), hue, 0.3);
      playTone(hue, 0.18, "ghost");
      syncMemory();
      return;
    }

    const echo = state.echoes[demoCursorRef.current % state.echoes.length];
    demoCursorRef.current += 1;
    echo.resonance = clamp(echo.resonance + 0.24, 0.08, 1.5);
    const loopProgressSteps =
      getTransportStepPositionAtTime(now, transportConfig) -
      getTransportStepPositionAtTime(echo.scheduledAtMs, transportConfig);
    const sample = sampleQuantizedLoop(
      echo.stepPoints,
      Math.max(0, loopProgressSteps),
    );
    pushPulse(sample.point, echo.hue, 0.36 + echo.resonance * 0.1, echo.symmetry, "ghost");
    pushSpark(sample.point, echo.hue, 0.34);

    if (now - lastGhostToneAtRef.current > 160) {
      lastGhostToneAtRef.current = now;
      playTone(echo.hue, 0.16 + echo.resonance * 0.1, "ghost");
      triggerNoiseBurst(echo.hue, 0.12 + echo.resonance * 0.08, "hat");
    }

    state.surfaceEnergy = clamp(state.surfaceEnergy + 0.02, 0.12, 1.5);
    setLastResolvedSymmetry(echo.symmetry);
  };

  const finalizeTouch = (pointerId: number) => {
    const touch = simulationRef.current.activeTouches.get(pointerId);

    if (!touch) {
      return;
    }

    simulationRef.current.activeTouches.delete(pointerId);
    syncActiveCount();

    const points = touch.points.map((point) => ({
      ...point,
      t: point.t - touch.bornAt,
    }));

    const duration = Math.max(pathDuration(points), 260);
    const centroid = averagePoint(points);
    const stillness = clamp(1 - touch.travel * 1.7, 0, 1);
    const holdCharge = clamp(touch.holdCharge * 0.7 + stillness * 0.28, 0, 1);
    const gestureType = classifyGestureEvent(touch.travel, holdCharge, points);
    const symmetry = Math.max(
      touch.symmetry,
      clamp(touch.symmetry + Math.round(holdCharge * 2), 3, 6),
    );
    const energy = clamp(0.52 + touch.travel * 1.1 + holdCharge * 0.92, 0.52, 1.9);
    const lineWidth = 1.2 + holdCharge * 2.2 + Math.min(touch.travel * 8, 2);
    const now = performance.now();
    const endpoint = points.at(-1) ?? centroid;
    const gestureEvent: GestureEvent = {
      id: gestureEventIdRef.current++,
      type: gestureType,
      points,
      timestamp: now,
      duration,
      energy,
      hue: touch.hue,
      symmetry,
      centroid,
      travel: touch.travel,
    };

    appendGestureEvent(gestureEvent);

    simulationRef.current.echoes = [
      ...simulationRef.current.echoes,
      createEchoRecord({
        id: echoIdRef.current++,
        bornAt: now,
        hue: touch.hue,
        symmetry,
        holdCharge,
        points,
        delay: 520 + Math.random() * 1200,
        speed: 0.76 + Math.random() * 0.56 + holdCharge * 0.18,
        phase: Math.random() * duration,
        resonance: 0.24 + holdCharge * 0.16,
        energy,
        drift: Math.random() * TAU,
        wobble: 0.002 + holdCharge * 0.005,
        lineWidth,
        trailDecayMs: ECHO_TRAIL_DECAY_MS,
        memoryLifeMs: ECHO_MEMORY_LIFE_MS,
        replayIntervalMs: 720 + Math.random() * 460,
        synthetic: false,
        transportConfig,
      }),
    ].slice(-MAX_ECHOES);

    simulationRef.current.interactions += 1;
    pushPulse(endpoint, touch.hue, 0.72 + holdCharge * 0.48, symmetry, "touch");
    playTone(touch.hue, 0.6 + holdCharge * 0.5, "tap");
    if (now - lastKickAtRef.current > 110) {
      lastKickAtRef.current = now;
      triggerKick(touch.hue, 0.34 + holdCharge * 0.36);
    }

    if (gestureEvent.type === "hold") {
      pushWell(
        centroid,
        touch.hue,
        0.56 + holdCharge * 0.42,
        Math.max(2, symmetry),
      );
      pushPulse(centroid, touch.hue, 0.34 + holdCharge * 0.24, symmetry, "hold");
      pushSpark(centroid, touch.hue, 0.34 + holdCharge * 0.18);
      playTone(touch.hue, 0.22 + holdCharge * 0.14, "hold");
    }

    lastInteractionAtRef.current = now;
    syncDemoState(false);
    setLastResolvedSymmetry(symmetry);
    syncMemory();
  };

  useEffect(() => {
    if (!preset) {
      return;
    }

    const snapshot = createPresetState(preset, performance.now());
    simulationRef.current = snapshot.state;
    echoIdRef.current = snapshot.nextEchoId;
    pulseIdRef.current = snapshot.nextPulseId;
    wellIdRef.current = snapshot.nextWellId;
    gestureEventIdRef.current = snapshot.state.gestureLog.length;
    motifIdRef.current = snapshot.state.motifs.length;
    interferenceCooldownRef.current.clear();
    syncMemory();
    syncActiveCount();
    setLastResolvedSymmetry(
      snapshot.state.echoes.at(-1)?.symmetry ??
        snapshot.state.activeTouches.values().next().value?.symmetry ??
        1,
    );
  }, [preset]);

  useEffect(() => {
    symmetryModeRef.current = symmetryMode;
  }, [symmetryMode]);

  useEffect(() => {
    simulationRef.current.echoes.forEach((echo) =>
      requantizeEchoRecord(echo, transportConfig),
    );
    simulationRef.current.wells.forEach((well) =>
      requantizeWellRecord(well, transportConfig),
    );
  }, [transportConfig]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const surface = surfaceRef.current;

    if (!canvas || !surface) {
      return undefined;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return undefined;
    }

    const resize = () => {
      const bounds = surface.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = bounds.width * dpr;
      canvas.height = bounds.height * dpr;
      canvas.style.width = `${bounds.width}px`;
      canvas.style.height = `${bounds.height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = {
        width: bounds.width,
        height: bounds.height,
      };
    };

    resize();

    const observer = new ResizeObserver(() => resize());
    observer.observe(surface);

    let previousTime = performance.now();

    const frame = (now: number) => {
      const delta = Math.min(48, now - previousTime || 16);
      previousTime = now;
      const size = sizeRef.current;
      const state = simulationRef.current;
      const liveFilaments: Filament[] = [];
      const ghostSnapshots: GhostSnapshot[] = [];
      const transportStepPosition = getTransportStepPositionAtTime(
        now,
        transportConfig,
      );
      const currentTransportStep = Math.floor(transportStepPosition);
      const barStepCount = getBarStepCount(transportConfig);
      const idleForMs = now - lastInteractionAtRef.current;
      const demoModeActive =
        idleForMs > IDLE_DEMO_AFTER_MS && state.activeTouches.size === 0;

      syncDemoState(demoModeActive);

      const dreamIntervalMs = mix(
        DEMO_INTERVAL_MS + 600,
        DEMO_INTERVAL_MS - 700,
        clamp(state.surfaceEnergy, 0, 1),
      );

      if (demoModeActive && now - lastDemoAtRef.current > dreamIntervalMs) {
        lastDemoAtRef.current = now;
        wakeSurfaceMemory(now);
      }

      const echoCountBeforeDecay = state.echoes.length;
      state.echoes = state.echoes.filter(
        (echo) => now - echo.bornAt < echo.memoryLifeMs,
      );
      state.wells = state.wells.filter((well) => now - well.bornAt < well.ttl);
      state.motifs = state.motifs.filter(
        (motif) => now - motif.lastSeenAt < 38000 && motif.strength > 0.08,
      );

      if (state.echoes.length !== echoCountBeforeDecay) {
        syncMemory();
      }

      const interactionDensity = state.gestureLog.reduce((total, event) => {
        const age = now - event.timestamp;

        if (age > 9000) {
          return total;
        }

        return total + event.energy * Math.exp(-age / 2600);
      }, 0);
      const holdDrive = Array.from(state.activeTouches.values()).reduce(
        (total, touch) => total + touch.holdCharge * 0.28,
        0,
      );
      const targetSurfaceEnergy = clamp(
        0.12 +
          interactionDensity * 0.18 +
          holdDrive +
          state.motifs.length * 0.05 +
          (demoModeActive ? 0.04 : 0),
        0.12,
        1.3,
      );
      state.surfaceEnergy = mix(
        state.surfaceEnergy,
        targetSurfaceEnergy,
        0.05,
      );

      context.clearRect(0, 0, size.width, size.height);

      const background = context.createLinearGradient(0, 0, size.width, size.height);
      background.addColorStop(0, "#071219");
      background.addColorStop(0.5, "#0d2a2b");
      background.addColorStop(1, "#1e1012");
      context.fillStyle = background;
      context.fillRect(0, 0, size.width, size.height);

      const ambientEnergy = Math.min(
        1.32,
        state.surfaceEnergy * 0.68 +
          state.echoes.length * 0.026 +
          state.activeTouches.size * 0.14 +
          state.interferenceEvents.length * 0.06 +
          state.wells.length * 0.08,
      );
      const ambientGlow = context.createRadialGradient(
        size.width * 0.5,
        size.height * 0.52,
        0,
        size.width * 0.5,
        size.height * 0.52,
        Math.max(size.width, size.height) * 0.72,
      );
      ambientGlow.addColorStop(0, `rgba(120, 196, 182, ${0.06 + ambientEnergy * 0.07})`);
      ambientGlow.addColorStop(
        0.5,
        `rgba(232, 133, 94, ${0.04 + state.surfaceEnergy * 0.05})`,
      );
      ambientGlow.addColorStop(1, "rgba(7, 18, 25, 0)");
      context.fillStyle = ambientGlow;
      context.fillRect(0, 0, size.width, size.height);

      context.strokeStyle = "rgba(227, 233, 217, 0.055)";
      context.lineWidth = 1;
      for (let ringIndex = 1; ringIndex <= 7; ringIndex += 1) {
        const radius = (Math.min(size.width, size.height) * 0.12) * ringIndex;
        context.beginPath();
        context.arc(size.width * 0.5, size.height * 0.5, radius, 0, TAU);
        context.stroke();
      }

      for (let axisIndex = 0; axisIndex < 12; axisIndex += 1) {
        const angle = (axisIndex / 12) * TAU;
        context.beginPath();
        context.moveTo(size.width * 0.5, size.height * 0.5);
        context.lineTo(
          size.width * 0.5 + Math.cos(angle) * size.width * 0.58,
          size.height * 0.5 + Math.sin(angle) * size.height * 0.58,
        );
        context.stroke();
      }

      state.motifs.forEach((motif) => {
        motif.strength = Math.max(
          0.08,
          motif.strength - delta * 0.00003 * (1.1 - state.surfaceEnergy * 0.35),
        );
        drawMotifLane(
          context,
          size,
          motif,
          now,
          state.surfaceEnergy,
          transportStepPosition,
        );
      });

      state.wells.forEach((well) => {
        const life = clamp(1 - (now - well.bornAt) / well.ttl, 0, 1);
        well.energy = clamp(well.energy - delta * 0.00003, 0.26, 1.5);

        const scheduledStep = Math.floor(
          getTransportStepPositionAtTime(well.scheduledAtMs, transportConfig),
        );
        const relativeStep = currentTransportStep - scheduledStep;
        const wellStepSpacing =
          state.surfaceEnergy > 0.72
            ? Math.max(1, Math.floor(transportConfig.stepsPerBeat / 2))
            : transportConfig.stepsPerBeat;
        const isBeatStep =
          relativeStep >= 0 &&
          relativeStep % wellStepSpacing === 0 &&
          currentTransportStep !== well.lastQuantizedStep;

        if (isBeatStep) {
          well.lastQuantizedStep = currentTransportStep;
          const accent = relativeStep % barStepCount === 0 ? 1 : 0.72;

          pushPulse(
            well.point,
            well.hue,
            (0.14 + well.energy * 0.14) *
              (0.45 + life * 0.55) *
              accent,
            well.symmetry,
            "hold",
          );
          pushSpark(well.point, well.hue, 0.16 + well.energy * 0.1 * accent);
          playTone(
            well.hue,
            (0.08 + well.energy * 0.06) * (0.4 + life * 0.6) * accent,
            "hold",
          );
          triggerNoiseBurst(
            well.hue,
            (0.05 + well.energy * 0.03) * (0.4 + life * 0.6) * accent,
            "hat",
          );
        }

        drawResonanceWell(context, size, well, now);
      });

      for (const touch of state.activeTouches.values()) {
        const holdAge = now - touch.bornAt;
        const stillness = clamp(1 - touch.travel * 1.8, 0, 1);
        touch.holdCharge = clamp(
          easeInOutSine(clamp((holdAge - 120) / 1320, 0, 1)) * stillness,
          0,
          1,
        );

        if (touch.holdCharge > 0.08 && now - touch.lastPulseAt > 240 - touch.holdCharge * 90) {
          const point = touch.points.at(-1);

          if (point) {
            touch.lastPulseAt = now;
            pushPulse(point, touch.hue, 0.28 + touch.holdCharge * 0.5, touch.symmetry, "hold");
            playTone(touch.hue, 0.22 + touch.holdCharge * 0.26, "hold");
          }
        }

        drawPath(
          context,
          size,
          touch.points,
          touch.symmetry,
          `hsla(${touch.hue}, 94%, 76%, 0.48)`,
          1.6 + touch.holdCharge * 3.6,
        );
        drawTouchNode(context, size, touch, now);
      }

      state.echoes.forEach((echo) => {
        const age = now - echo.bornAt;
        const trailFade = clamp(1 - age / echo.trailDecayMs, 0, 1);
        const memoryFade =
          clamp(1 - age / echo.memoryLifeMs, 0, 1) *
          (0.78 + state.surfaceEnergy * 0.42);
        echo.resonance = Math.max(0.08 * memoryFade, echo.resonance - delta * 0.00009);
        const scheduledStepPosition = getTransportStepPositionAtTime(
          echo.scheduledAtMs,
          transportConfig,
        );
        const loopProgressSteps = transportStepPosition - scheduledStepPosition;
        const sample = sampleQuantizedLoop(
          echo.stepPoints,
          Math.max(0, loopProgressSteps),
        );
        const shimmer = 0.4 + Math.sin(now * 0.0012 + echo.drift) * 0.2;
        const wobbleAmount = echo.wobble * (0.6 + echo.resonance);

        const ghostPoint = {
          x: clamp(
            sample.point.x + Math.cos(now * 0.0013 + echo.drift) * wobbleAmount,
            0.04,
            0.96,
          ),
          y: clamp(
            sample.point.y + Math.sin(now * 0.0017 + echo.drift) * wobbleAmount,
            0.04,
            0.96,
          ),
          t: sample.point.t,
        };

        const motifGuide = state.motifs.reduce<
          | {
              motif: MotifLane;
              sample: ReturnType<typeof getMotifMotionPoints>;
              distanceToGhost: number;
            }
          | undefined
        >((best, motif) => {
          const sample = getMotifMotionPoints(
            motif,
            transportStepPosition + echo.drift,
            state.surfaceEnergy,
          );
          const distanceToGhost = distance(sample.point, ghostPoint);

          if (distanceToGhost > 0.22) {
            return best;
          }

          if (!best || distanceToGhost < best.distanceToGhost) {
            return {
              motif,
              sample,
              distanceToGhost,
            };
          }

          return best;
        }, undefined);

        if (motifGuide) {
          liveFilaments.push({
            from: ghostPoint,
            to: motifGuide.sample.point,
            hue: mix(echo.hue, motifGuide.motif.hue, 0.5),
            strength: clamp(0.08 + motifGuide.motif.strength * 0.12, 0.08, 0.28),
          });
          ghostPoint.x = mix(
            ghostPoint.x,
            motifGuide.sample.point.x,
            0.12 + motifGuide.motif.strength * 0.14,
          );
          ghostPoint.y = mix(
            ghostPoint.y,
            motifGuide.sample.point.y,
            0.12 + motifGuide.motif.strength * 0.14,
          );
          echo.resonance = clamp(
            echo.resonance + motifGuide.motif.strength * 0.004,
            0.08,
            1.8,
          );
        }

        drawMemoryBloom(
          context,
          size,
          echo.centroid,
          echo.hue,
          echo.symmetry,
          0.06 + memoryFade * 0.18 + trailFade * 0.12 + echo.resonance * 0.04,
          echo.drift,
          now,
        );

        if (trailFade > 0.01) {
          context.save();
          context.shadowBlur = 18 + trailFade * 26;
          context.shadowColor = `hsla(${echo.hue}, 88%, 70%, ${
            trailFade * 0.22
          })`;
          drawPath(
            context,
            size,
            echo.points,
            echo.symmetry,
            `hsla(${echo.hue}, 90%, 76%, ${trailFade * 0.22})`,
            echo.lineWidth * (1.4 + trailFade * 0.8),
            0.72,
          );
          context.restore();

          drawPath(
            context,
            size,
            echo.points,
            echo.symmetry,
            `hsla(${echo.hue}, 84%, 68%, ${
              0.04 + trailFade * 0.24 + echo.resonance * 0.03
            })`,
            echo.lineWidth,
            0.78,
          );
        }

        if (loopProgressSteps >= 0 && memoryFade > 0.02) {
          const ghost = {
            echoId: echo.id,
            point: ghostPoint,
            nextPoint: sample.nextPoint,
            hue: echo.hue,
            intensity: Math.min(
              1.3,
              (0.24 + echo.energy * 0.22 + shimmer + echo.resonance * 0.26) *
                (0.34 + memoryFade * 0.9 + state.surfaceEnergy * 0.18),
            ),
            symmetry: echo.symmetry,
            resonance: echo.resonance * (0.5 + memoryFade * 0.5),
          };

          ghostSnapshots.push(ghost);
          drawGhostNode(context, size, ghost, now);

          const relativeLoopStep =
            currentTransportStep - Math.floor(scheduledStepPosition);
          const echoStepSpacing =
            state.surfaceEnergy > 0.74
              ? Math.max(1, Math.floor(transportConfig.stepsPerBeat / 2))
              : transportConfig.stepsPerBeat;
          const isBeatStep =
            relativeLoopStep >= 0 &&
            currentTransportStep !== echo.lastQuantizedStep &&
            relativeLoopStep % echoStepSpacing === 0;

          if (LOOP_ENABLED && isBeatStep) {
            echo.lastQuantizedStep = currentTransportStep;
            const accent = relativeLoopStep % barStepCount === 0 ? 1 : 0.72;

            pushPulse(
              ghostPoint,
              echo.hue,
              (0.16 + echo.energy * 0.16 + echo.resonance * 0.12) *
                (0.3 + memoryFade * 0.7) *
                accent,
              echo.symmetry,
              "ghost",
            );
            playTone(
              echo.hue,
              (0.1 + echo.resonance * 0.08) *
                (0.4 + memoryFade * 0.6) *
                accent,
              "ghost",
            );
            triggerNoiseBurst(
              echo.hue,
              (0.08 + echo.resonance * 0.05) *
                (0.3 + memoryFade * 0.7) *
                accent,
              "hat",
            );
          }
        }
      });

      state.pulses = state.pulses.filter((pulse) => now - pulse.bornAt < pulse.ttl);
      state.sparks = state.sparks.filter((spark) => now - spark.bornAt < spark.ttl);
      state.interferenceEvents = state.interferenceEvents.filter(
        (event) => now - event.bornAt < event.ttl,
      );

      const activePulseIds = new Set(state.pulses.map((pulse) => pulse.id));
      interferenceCooldownRef.current.forEach((_, pairKey) => {
        const [leftId, rightId] = pairKey.split("-").map(Number);

        if (!activePulseIds.has(leftId) || !activePulseIds.has(rightId)) {
          interferenceCooldownRef.current.delete(pairKey);
        }
      });

      state.pulses.forEach((pulse) => drawPulse(context, size, pulse, now));

      const pulseFronts = state.pulses
        .filter((pulse) => pulse.source !== "collision")
        .slice(-MAX_INTERFERENCE_FRONTS)
        .map((pulse) => ({
          pulse,
          front: getPulseFront(pulse, now, size),
          center: normalizedToPixels(pulse.point, size),
        }))
        .filter(
          ({ front }) => front.progress > 0.06 && front.progress < 0.98 && front.alpha > 0.05,
        );

      for (let index = 0; index < pulseFronts.length; index += 1) {
        const current = pulseFronts[index];

        for (let compareIndex = index + 1; compareIndex < pulseFronts.length; compareIndex += 1) {
          const other = pulseFronts[compareIndex];
          const pairKey =
            current.pulse.id < other.pulse.id
              ? `${current.pulse.id}-${other.pulse.id}`
              : `${other.pulse.id}-${current.pulse.id}`;
          const ringDifference = Math.abs(current.front.radius - other.front.radius);
          const tolerance = current.front.thickness + other.front.thickness;

          if (
            ringDifference > tolerance * 1.3 ||
            interferenceCooldownRef.current.has(pairKey)
          ) {
            continue;
          }

          const intersections = circleIntersections(
            current.center,
            current.front.radius,
            other.center,
            other.front.radius,
          );

          if (intersections.length === 0) {
            continue;
          }

          interferenceCooldownRef.current.set(pairKey, now);
          const blend = clamp(1 - ringDifference / Math.max(tolerance, 1), 0, 1);
          const hue = mix(current.pulse.hue, other.pulse.hue, 0.5);
          const symmetry = Math.max(current.pulse.symmetry, other.pulse.symmetry);
          const primary = pixelsToNormalized(intersections[0], size);
          const secondary =
            intersections[1] &&
            Math.hypot(
              intersections[0].x - intersections[1].x,
              intersections[0].y - intersections[1].y,
            ) > 12
              ? pixelsToNormalized(intersections[1], size)
              : undefined;

          pushInterference(primary, hue, 0.46 + blend * 0.54, symmetry, secondary);
          pushPulse(primary, hue, 0.22 + blend * 0.34, symmetry, "collision");
          pushSpark(primary, hue, 0.42 + blend * 0.26);

          if (secondary) {
            pushSpark(secondary, hue, 0.32 + blend * 0.22);
          }

          if (now - lastCollisionToneAtRef.current > 120) {
            lastCollisionToneAtRef.current = now;
            playTone(hue, 0.24 + blend * 0.2, "collision");
            triggerNoiseBurst(hue, 0.24 + blend * 0.16, "clap");
          }
        }
      }

      const activePoints = Array.from(state.activeTouches.values())
        .map((touch) => ({
          touch,
          point: touch.points.at(-1),
        }))
        .filter(
          (
            value,
          ): value is {
            touch: ActiveTouch;
            point: NormalizedPoint;
          } => Boolean(value.point),
        );

      for (let index = 0; index < state.wells.length; index += 1) {
        const current = state.wells[index];

        for (
          let compareIndex = index + 1;
          compareIndex < state.wells.length;
          compareIndex += 1
        ) {
          const other = state.wells[compareIndex];
          const gap = distance(current.point, other.point);

          if (gap < 0.44) {
            liveFilaments.push({
              from: current.point,
              to: other.point,
              hue: mix(current.hue, other.hue, 0.5),
              strength: clamp((0.44 - gap) * 0.56, 0.06, 0.2),
            });
          }
        }
      }

      state.wells.forEach((well) => {
        ghostSnapshots.forEach((ghost) => {
          const gap = distance(well.point, ghost.point);

          if (gap < 0.22) {
            liveFilaments.push({
              from: well.point,
              to: ghost.point,
              hue: mix(well.hue, ghost.hue, 0.5),
              strength: clamp((0.22 - gap) * 2.2, 0.06, 0.34),
            });

            well.energy = clamp(
              well.energy + (0.22 - gap) * 0.007,
              0.26,
              1.6,
            );

            if (gap < 0.06 && now - well.lastPulseAt > 220) {
              well.lastPulseAt = now;
              pushPulse(
                {
                  x: mix(well.point.x, ghost.point.x, 0.5),
                  y: mix(well.point.y, ghost.point.y, 0.5),
                  t: now,
                },
                mix(well.hue, ghost.hue, 0.5),
                0.18 + well.energy * 0.14,
                Math.max(well.symmetry, ghost.symmetry),
                "ghost",
              );

              if (now - well.lastToneAt > 280) {
                well.lastToneAt = now;
                playTone(
                  mix(well.hue, ghost.hue, 0.5),
                  0.12 + well.energy * 0.08,
                  "ghost",
                );
              }
            }
          }
        });
      });

      activePoints.forEach(({ touch, point }) => {
        state.wells.forEach((well) => {
          const gap = distance(point, well.point);

          if (gap < 0.18) {
            liveFilaments.push({
              from: point,
              to: well.point,
              hue: mix(touch.hue, well.hue, 0.5),
              strength: clamp((0.18 - gap) * 3, 0.08, 0.42),
            });

            well.energy = clamp(
              well.energy + (0.18 - gap) * 0.012,
              0.26,
              1.6,
            );

            if (gap < 0.055 && now - well.lastPulseAt > 180) {
              well.lastPulseAt = now;
              pushPulse(
                {
                  x: mix(point.x, well.point.x, 0.5),
                  y: mix(point.y, well.point.y, 0.5),
                  t: now,
                },
                mix(touch.hue, well.hue, 0.5),
                0.24 + well.energy * 0.14,
                Math.max(touch.symmetry, well.symmetry),
                "hold",
              );
              pushSpark(
                {
                  x: mix(point.x, well.point.x, 0.5),
                  y: mix(point.y, well.point.y, 0.5),
                  t: now,
                },
                mix(touch.hue, well.hue, 0.5),
                0.26 + well.energy * 0.12,
              );

              if (now - well.lastToneAt > 240) {
                well.lastToneAt = now;
                playTone(
                  mix(touch.hue, well.hue, 0.5),
                  0.14 + well.energy * 0.08,
                  "hold",
                );
              }
            }
          }
        });

        ghostSnapshots.forEach((ghost) => {
          const copyCount = Math.max(ghost.symmetry, 1);

          for (let copyIndex = 0; copyIndex < copyCount; copyIndex += 1) {
            const angle = (copyIndex / copyCount) * TAU;
            const rotatedGhost = rotatePoint(ghost.point, angle);
            const gap = distance(point, rotatedGhost);

            if (gap < 0.18) {
              liveFilaments.push({
                from: point,
                to: rotatedGhost,
                hue: mix(touch.hue, ghost.hue, 0.5),
                strength: clamp((0.18 - gap) * 4.1, 0.08, 0.54),
              });

              const echo = state.echoes.find((item) => item.id === ghost.echoId);

              if (echo) {
                echo.resonance = clamp(echo.resonance + (0.18 - gap) * 0.02, 0.08, 1.8);

                if (gap < 0.05 && now - echo.lastBoostAt > 200) {
                  echo.lastBoostAt = now;
                  pushPulse(
                    {
                      x: mix(point.x, rotatedGhost.x, 0.5),
                      y: mix(point.y, rotatedGhost.y, 0.5),
                      t: now,
                    },
                    mix(touch.hue, ghost.hue, 0.5),
                    0.4 + echo.resonance * 0.22,
                    Math.max(touch.symmetry, ghost.symmetry),
                    "collision",
                  );
                  pushSpark(
                    {
                      x: mix(point.x, rotatedGhost.x, 0.5),
                      y: mix(point.y, rotatedGhost.y, 0.5),
                      t: now,
                    },
                    mix(touch.hue, ghost.hue, 0.5),
                    0.45 + echo.resonance * 0.22,
                  );
                  if (now - lastCollisionToneAtRef.current > 90) {
                    lastCollisionToneAtRef.current = now;
                    playTone(
                      mix(touch.hue, ghost.hue, 0.5),
                      0.3 + echo.resonance * 0.16,
                      "collision",
                    );
                    triggerNoiseBurst(
                      mix(touch.hue, ghost.hue, 0.5),
                      0.28 + echo.resonance * 0.16,
                      "clap",
                    );
                  }
                }
              }
            }
          }
        });
      });

      liveFilaments.forEach((filament) => drawFilament(context, size, filament));
      state.interferenceEvents.forEach((event) =>
        drawInterferenceEvent(context, size, event, now),
      );
      state.sparks.forEach((spark) => drawSpark(context, size, spark, now));
      animationFrameRef.current = window.requestAnimationFrame(frame);
    };

    animationFrameRef.current = window.requestAnimationFrame(frame);

    return () => {
      observer.disconnect();
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [transportConfig]);

  useEffect(() => {
    return () => {
      const engine = soundRef.current;
      if (engine.context) {
        void engine.context.close();
      }
    };
  }, []);

  const beginTouch = async (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    const surface = surfaceRef.current;

    if (!surface) {
      return;
    }

    surface.setPointerCapture(event.pointerId);
    await ensureAudio();

    const now = performance.now();
    const point = makeSurfacePoint(event, surface, now);
    const hue = chooseHue(point, simulationRef.current.interactions);
    const symmetry = resolveSymmetry(point);

    simulationRef.current.activeTouches.set(event.pointerId, {
      pointerId: event.pointerId,
      bornAt: now,
      hue,
      symmetry,
      holdCharge: 0,
      lastPulseAt: now,
      lastSampleAt: now,
      points: [point],
      travel: 0,
    });

    lastInteractionAtRef.current = now;
    syncDemoState(false);
    syncActiveCount();
    pushPulse(point, hue, 0.56, symmetry, "touch");
    playTone(hue, 0.48, "tap");
    triggerNoiseBurst(hue, 0.12, "hat");
  };

  const moveTouch = (event: ReactPointerEvent<HTMLDivElement>) => {
    const surface = surfaceRef.current;

    if (!surface) {
      return;
    }

    const touch = simulationRef.current.activeTouches.get(event.pointerId);

    if (!touch) {
      return;
    }

    const now = performance.now();
    const point = makeSurfacePoint(event, surface, now);
    const lastPoint = touch.points.at(-1);

    if (!lastPoint) {
      touch.points.push(point);
      return;
    }

    const gap = distance(lastPoint, point);
    const elapsed = now - touch.lastSampleAt;

    lastInteractionAtRef.current = now;

    if (gap < 0.003 && elapsed < 18) {
      return;
    }

    touch.travel += gap;
    touch.points.push(point);
    touch.lastSampleAt = now;

    if (touch.points.length > 80) {
      touch.points.shift();
    }

    if (gap > 0.012 || now - touch.lastPulseAt > 90) {
      touch.lastPulseAt = now;
      pushPulse(point, touch.hue, 0.2 + gap * 4.4, touch.symmetry, "touch");
    }
  };

  const endTouch = (event: ReactPointerEvent<HTMLDivElement>) => {
    finalizeTouch(event.pointerId);

    if (surfaceRef.current?.hasPointerCapture(event.pointerId)) {
      surfaceRef.current.releasePointerCapture(event.pointerId);
    }
  };

  const cancelTouch = (event: ReactPointerEvent<HTMLDivElement>) => {
    finalizeTouch(event.pointerId);

    if (surfaceRef.current?.hasPointerCapture(event.pointerId)) {
      surfaceRef.current.releasePointerCapture(event.pointerId);
    }
  };

  const clearSurface = () => {
    simulationRef.current.activeTouches.clear();
    simulationRef.current.echoes = [];
    simulationRef.current.pulses = [];
    simulationRef.current.sparks = [];
    simulationRef.current.interferenceEvents = [];
    simulationRef.current.wells = [];
    simulationRef.current.gestureLog = [];
    simulationRef.current.motifs = [];
    simulationRef.current.surfaceEnergy = 0.12;
    interferenceCooldownRef.current.clear();
    lastInteractionAtRef.current = performance.now();
    syncActiveCount();
    syncMemory();
    syncDemoState(false);
  };

  const toggleMuted = async () => {
    await ensureAudio();
    soundRef.current.muted = !soundRef.current.muted;
    lastInteractionAtRef.current = performance.now();
    syncDemoState(false);
    setIsMuted(soundRef.current.muted);
  };

  const stopSurfaceGesture = (event: {
    stopPropagation: () => void;
  }) => {
    event.stopPropagation();
  };

  return (
    <section className="surface-panel">
      <div className={`surface-frame${captureMode ? " surface-frame--capture" : ""}`}>
        <div
          ref={surfaceRef}
          className={`surface${captureMode ? " surface--capture" : ""}`}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={beginTouch}
          onPointerMove={moveTouch}
          onPointerUp={endTouch}
          onPointerCancel={cancelTouch}
        >
          <canvas ref={canvasRef} />

          <div className="surface-cockpit">
            <div className="memory-strip" aria-hidden="true">
              {Array.from({ length: MAX_ECHOES }).map((_, index) => {
                const chip = memory[index];
                return (
                  <span
                    className="memory-strip__chip"
                    key={chip ? chip.id : `empty-${index}`}
                    style={
                      chip
                        ? ({
                            "--chip-hue": `${chip.hue}`,
                            "--chip-scale": `${0.86 + chip.symmetry * 0.08}`,
                          } as CSSProperties)
                        : undefined
                    }
                    data-filled={Boolean(chip)}
                  />
                );
              })}
            </div>

            <div className="surface-cockpit__readout">
              <p>ECHO x{memory.length}</p>
              <p>TIME {timeLabel}</p>
              <p>DECAY {decayLabel}</p>
              <p>LOOP {replayLabel}</p>
              <p>SYM {symmetryDisplay}</p>
            </div>

            {demoAwake ? <span className="surface-cockpit__badge">dreaming</span> : null}
          </div>

          {!captureMode ? (
            <div
              className="surface-controls"
              onClick={stopSurfaceGesture}
              onPointerCancel={stopSurfaceGesture}
              onPointerDown={stopSurfaceGesture}
              onPointerMove={stopSurfaceGesture}
              onPointerUp={stopSurfaceGesture}
            >
              <button
                className="surface-tool"
                type="button"
                onClick={cycleTimeSignature}
              >
                {transportConfig.signature.label}
              </button>
              <button
                className="surface-tool"
                type="button"
                onClick={cycleSymmetryMode}
              >
                {symmetryMode === "auto" ? "Auto" : `Sym x${symmetryMode}`}
              </button>
              <button className="surface-tool" type="button" onClick={toggleMuted}>
                {isMuted ? "Sound off" : "Sound on"}
              </button>
              <button
                className="surface-tool surface-tool--soft"
                type="button"
                onClick={clearSurface}
              >
                Clear
              </button>
            </div>
          ) : null}

          {!captureMode ? (
            <p className="surface-whisper" aria-live="polite">
              {whisperLabel}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
