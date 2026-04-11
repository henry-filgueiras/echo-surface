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

type MemoryChip = {
  id: number;
  hue: number;
  symmetry: number;
};

export type SurfacePreset = "seed" | "trace" | "hold";

type SurfaceSize = {
  width: number;
  height: number;
};

type AudioEngine = {
  context: AudioContext | null;
  master: GainNode | null;
  muted: boolean;
};

type SimulationState = {
  activeTouches: Map<number, ActiveTouch>;
  echoes: EchoRecord[];
  pulses: Pulse[];
  sparks: Spark[];
  interactions: number;
};

type EchoSurfaceProps = {
  preset?: SurfacePreset;
  captureMode?: boolean;
};

const MAX_ECHOES = 20;
const TAU = Math.PI * 2;
const SURFACE_PRESETS: SurfacePreset[] = ["seed", "trace", "hold"];

export const isSurfacePreset = (value: string | null): value is SurfacePreset =>
  value !== null && SURFACE_PRESETS.includes(value as SurfacePreset);

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const lerp = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;

const mix = (a: number, b: number, amount: number) => lerp(a, b, amount);

const distance = (a: NormalizedPoint, b: NormalizedPoint) =>
  Math.hypot(a.x - b.x, a.y - b.y);

const normalizedToPixels = (point: NormalizedPoint, size: SurfaceSize) => ({
  x: point.x * size.width,
  y: point.y * size.height,
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

const point = (x: number, y: number, t: number): NormalizedPoint => ({
  x,
  y,
  t,
});

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
  const age = now - pulse.bornAt;
  const progress = clamp(age / pulse.ttl, 0, 1);
  const baseRadius = mix(18, 170 * pulse.strength, progress);
  const copyCount = Math.max(pulse.symmetry, 1);
  const alpha = (1 - progress) * (0.28 + pulse.strength * 0.24);

  for (let copyIndex = 0; copyIndex < copyCount; copyIndex += 1) {
    const angle = (copyIndex / copyCount) * TAU;
    const rotated = rotatePoint(pulse.point, angle);
    const pixel = normalizedToPixels(rotated, size);
    const gradient = context.createRadialGradient(
      pixel.x,
      pixel.y,
      baseRadius * 0.1,
      pixel.x,
      pixel.y,
      baseRadius,
    );

    gradient.addColorStop(
      0,
      `hsla(${pulse.hue}, 88%, 72%, ${alpha * 0.52})`,
    );
    gradient.addColorStop(
      0.55,
      `hsla(${pulse.hue}, 82%, 60%, ${alpha * 0.16})`,
    );
    gradient.addColorStop(1, `hsla(${pulse.hue}, 82%, 58%, 0)`);

    context.fillStyle = gradient;
    context.beginPath();
    context.arc(pixel.x, pixel.y, baseRadius, 0, TAU);
    context.fill();

    context.lineWidth = mix(1.2, 4.2, pulse.strength);
    context.strokeStyle = `hsla(${pulse.hue}, 90%, 80%, ${alpha})`;
    context.beginPath();
    context.arc(pixel.x, pixel.y, baseRadius * 0.72, 0, TAU);
    context.stroke();
  }
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

const chooseHue = (point: NormalizedPoint, interactions: number) => {
  const seed = point.x * 128 + point.y * 54 + interactions * 19;
  return 18 + (seed % 186);
};

const chooseSymmetry = (point: NormalizedPoint) => {
  const distanceFromCenter = Math.hypot(point.x - 0.5, point.y - 0.5);
  return clamp(3 + Math.round(distanceFromCenter * 5), 3, 6);
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
}): EchoRecord => ({
  id,
  bornAt,
  hue,
  symmetry,
  holdCharge,
  duration: Math.max(pathDuration(points), 260),
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
  lastEchoPulseAt: bornAt - 1200,
  lastBoostAt: bornAt - 1200,
});

const createPresetState = (preset: SurfacePreset, now: number) => {
  const activeTouches = new Map<number, ActiveTouch>();
  let nextEchoId = 0;
  let nextPulseId = 0;

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
        interactions: echoes.length,
      },
      nextEchoId,
      nextPulseId,
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
        interactions: echoes.length,
      },
      nextEchoId,
      nextPulseId,
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
      interactions: echoes.length,
    },
    nextEchoId,
    nextPulseId,
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
  const soundRef = useRef<AudioEngine>({
    context: null,
    master: null,
    muted: false,
  });
  const pulseIdRef = useRef(0);
  const echoIdRef = useRef(0);
  const simulationRef = useRef<SimulationState>({
    activeTouches: new Map(),
    echoes: [],
    pulses: [],
    sparks: [],
    interactions: 0,
  });
  const [memory, setMemory] = useState<MemoryChip[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const memoryLabel = useMemo(
    () => `${memory.length.toString().padStart(2, "0")} / ${MAX_ECHOES}`,
    [memory.length],
  );

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

  const ensureAudio = async () => {
    if (typeof window === "undefined") {
      return;
    }

    const engine = soundRef.current;

    if (!engine.context) {
      const context = new window.AudioContext();
      const master = context.createGain();
      master.gain.value = 0.12;
      master.connect(context.destination);
      engine.context = context;
      engine.master = master;
    }

    if (engine.context.state === "suspended") {
      await engine.context.resume();
    }
  };

  const playTone = (hue: number, strength: number, mode: "tap" | "hold" | "ghost") => {
    const engine = soundRef.current;

    if (!engine.context || !engine.master || engine.muted) {
      return;
    }

    const now = engine.context.currentTime;
    const baseFrequency = mode === "hold" ? 124 : mode === "ghost" ? 208 : 172;
    const frequency = baseFrequency + (hue / 204) * (mode === "ghost" ? 240 : 310);
    const oscillator = engine.context.createOscillator();
    const overtone = engine.context.createOscillator();
    const gain = engine.context.createGain();
    const filter = engine.context.createBiquadFilter();
    const duration = mode === "hold" ? 0.44 : mode === "ghost" ? 0.24 : 0.31;

    oscillator.type = mode === "hold" ? "triangle" : "sine";
    overtone.type = "triangle";
    filter.type = "bandpass";
    filter.frequency.value = frequency * (mode === "ghost" ? 1.4 : 1.8);
    filter.Q.value = mode === "hold" ? 1.1 : 5.8;

    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(50, frequency * (mode === "hold" ? 0.72 : 1.14)),
      now + duration,
    );

    overtone.frequency.setValueAtTime(frequency * 1.5, now);
    overtone.frequency.exponentialRampToValueAtTime(
      frequency * 0.92,
      now + duration * 0.76,
    );

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(
      0.028 + strength * (mode === "ghost" ? 0.012 : 0.028),
      now + 0.02,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(filter);
    overtone.connect(filter);
    filter.connect(gain);
    gain.connect(engine.master);

    oscillator.start(now);
    overtone.start(now);
    oscillator.stop(now + duration + 0.04);
    overtone.stop(now + duration + 0.04);
  };

  const pushPulse = (point: NormalizedPoint, hue: number, strength: number, symmetry: number, source: Pulse["source"]) => {
    simulationRef.current.pulses.push({
      id: pulseIdRef.current++,
      bornAt: performance.now(),
      ttl: source === "ghost" ? 1650 : source === "collision" ? 980 : 1450,
      point,
      hue,
      strength: clamp(strength, 0.18, 1.7),
      symmetry,
      source,
    });
  };

  const pushSpark = (point: NormalizedPoint, hue: number, strength: number) => {
    simulationRef.current.sparks.push({
      point,
      hue,
      strength: clamp(strength, 0.2, 1),
      bornAt: performance.now(),
      ttl: 540,
    });
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
    const symmetry = clamp(
      touch.symmetry + Math.round(holdCharge * 2),
      3,
      6,
    );
    const energy = clamp(0.52 + touch.travel * 1.1 + holdCharge * 0.92, 0.52, 1.9);
    const lineWidth = 1.2 + holdCharge * 2.2 + Math.min(touch.travel * 8, 2);

    simulationRef.current.echoes = [
      ...simulationRef.current.echoes,
      {
        id: echoIdRef.current++,
        bornAt: performance.now(),
        hue: touch.hue,
        symmetry,
        holdCharge,
        duration,
        points,
        centroid,
        delay: 520 + Math.random() * 1200,
        speed: 0.76 + Math.random() * 0.56 + holdCharge * 0.18,
        phase: Math.random() * duration,
        resonance: 0.24 + holdCharge * 0.16,
        energy,
        drift: Math.random() * TAU,
        wobble: 0.002 + holdCharge * 0.005,
        lineWidth,
        lastEchoPulseAt: 0,
        lastBoostAt: 0,
      },
    ].slice(-MAX_ECHOES);

    simulationRef.current.interactions += 1;
    pushPulse(points.at(-1) ?? centroid, touch.hue, 0.72 + holdCharge * 0.48, symmetry, "touch");
    playTone(touch.hue, 0.6 + holdCharge * 0.5, "tap");
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
    syncMemory();
    syncActiveCount();
  }, [preset]);

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

      context.clearRect(0, 0, size.width, size.height);

      const background = context.createLinearGradient(0, 0, size.width, size.height);
      background.addColorStop(0, "#071219");
      background.addColorStop(0.5, "#0d2a2b");
      background.addColorStop(1, "#1e1012");
      context.fillStyle = background;
      context.fillRect(0, 0, size.width, size.height);

      const ambientEnergy = Math.min(
        1.2,
        state.echoes.length * 0.022 + state.activeTouches.size * 0.12,
      );
      const ambientGlow = context.createRadialGradient(
        size.width * 0.5,
        size.height * 0.52,
        0,
        size.width * 0.5,
        size.height * 0.52,
        Math.max(size.width, size.height) * 0.72,
      );
      ambientGlow.addColorStop(0, `rgba(120, 196, 182, ${0.05 + ambientEnergy * 0.05})`);
      ambientGlow.addColorStop(0.5, "rgba(232, 133, 94, 0.06)");
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

      for (const touch of state.activeTouches.values()) {
        const holdAge = now - touch.bornAt;
        const stillness = clamp(1 - touch.travel * 1.8, 0, 1);
        touch.holdCharge = clamp(((holdAge - 180) / 1450) * stillness, 0, 1);

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
          `hsla(${touch.hue}, 94%, 72%, 0.38)`,
          1.2 + touch.holdCharge * 3.2,
        );
        drawTouchNode(context, size, touch, now);
      }

      state.echoes.forEach((echo) => {
        echo.resonance = Math.max(0.08, echo.resonance - delta * 0.00012);

        const activeAge = now - echo.bornAt - echo.delay;
        const pathTime = activeAge <= 0 ? 0 : ((activeAge * echo.speed + echo.phase) % echo.duration);
        const sample = samplePath(echo.points, pathTime);
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

        drawPath(
          context,
          size,
          echo.points,
          echo.symmetry,
          `hsla(${echo.hue}, 84%, 66%, ${0.08 + echo.resonance * 0.06})`,
          echo.lineWidth,
          0.6,
        );

        if (activeAge > 0) {
          const ghost = {
            echoId: echo.id,
            point: ghostPoint,
            nextPoint: sample.nextPoint,
            hue: echo.hue,
            intensity: Math.min(1.2, 0.35 + echo.energy * 0.26 + shimmer + echo.resonance * 0.35),
            symmetry: echo.symmetry,
            resonance: echo.resonance,
          };

          ghostSnapshots.push(ghost);
          drawGhostNode(context, size, ghost, now);

          if (now - echo.lastEchoPulseAt > 780 - echo.energy * 120) {
            echo.lastEchoPulseAt = now;
            pushPulse(ghostPoint, echo.hue, 0.18 + echo.energy * 0.22 + echo.resonance * 0.18, echo.symmetry, "ghost");
            if (now - lastGhostToneAtRef.current > 180) {
              lastGhostToneAtRef.current = now;
              playTone(echo.hue, 0.12 + echo.resonance * 0.12, "ghost");
            }
          }
        }
      });

      state.pulses = state.pulses.filter((pulse) => now - pulse.bornAt < pulse.ttl);
      state.sparks = state.sparks.filter((spark) => now - spark.bornAt < spark.ttl);

      state.pulses.forEach((pulse) => drawPulse(context, size, pulse, now));

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

      activePoints.forEach(({ touch, point }) => {
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
                }
              }
            }
          }
        });
      });

      liveFilaments.forEach((filament) => drawFilament(context, size, filament));
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
  }, []);

  useEffect(() => {
    return () => {
      const engine = soundRef.current;
      if (engine.context) {
        void engine.context.close();
      }
    };
  }, []);

  const beginTouch = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    const surface = surfaceRef.current;

    if (!surface) {
      return;
    }

    surface.setPointerCapture(event.pointerId);
    void ensureAudio();

    const now = performance.now();
    const point = makeSurfacePoint(event, surface, now);
    const hue = chooseHue(point, simulationRef.current.interactions);
    const symmetry = chooseSymmetry(point);

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

    syncActiveCount();
    pushPulse(point, hue, 0.56, symmetry, "touch");
    playTone(hue, 0.48, "tap");
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
    syncActiveCount();
    syncMemory();
  };

  const toggleMuted = async () => {
    await ensureAudio();
    soundRef.current.muted = !soundRef.current.muted;
    setIsMuted(soundRef.current.muted);
  };

  return (
    <section className="surface-panel">
      <div className={`surface-frame${captureMode ? " surface-frame--capture" : ""}`}>
        {!captureMode ? (
          <header className="surface-frame__header">
            <div>
              <p className="eyebrow">Playable Invariant</p>
              <h2>Touches leave ghosts.</h2>
            </div>

            <div className="surface-frame__actions">
              <button
                className="surface-button"
                type="button"
                onClick={toggleMuted}
              >
                {isMuted ? "Wake sound" : "Quiet surface"}
              </button>
              <button
                className="surface-button surface-button--soft"
                type="button"
                onClick={clearSurface}
              >
                Clear echoes
              </button>
            </div>
          </header>
        ) : null}

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

          <div className="surface-hud surface-hud--top">
            <div className="hud-chip">
              <span>Memory</span>
              <strong>{memoryLabel}</strong>
            </div>
            <div className="hud-chip">
              <span>Active touch</span>
              <strong>{activeCount.toString().padStart(2, "0")}</strong>
            </div>
          </div>

          <div className="surface-hud surface-hud--bottom">
            <div className="surface-instruction">
              <p>Tap to seed ripples.</p>
              <p>Trace to braid paths.</p>
              <p>Hold to charge symmetry.</p>
            </div>

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
          </div>
        </div>
      </div>
    </section>
  );
}
