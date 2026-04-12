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
  lastSampleAt: number;
  hue: number;
  previewRole: VoiceRole | null;
  points: NormalizedPoint[];
  travel: number;
};

export type HarmonicState = {
  tonic: string;
  mode: "major" | "minor";
  progression: string[];
  currentBar: number;
  barsPerChord: number;
  bpm: number;
};

type SurfaceSize = {
  width: number;
  height: number;
};

type VoiceRole = "pad" | "bass" | "lead" | "percussion" | "echo";

type RolePalette = {
  hue: number;
  saturation: number;
  lightness: number;
};

type RoleMotion = "breathe" | "weight" | "spark" | "pulse" | "orbit";

type VoiceRoleStyle = {
  glyph: "circle" | "square" | "star" | "diamond" | "wave";
  palette: RolePalette;
  motion: RoleMotion;
};

type ProgressionOption = {
  id: string;
  label: string;
  progression: string[];
};

type RecentGesture = {
  timestamp: number;
  centroid: NormalizedPoint;
  durationMs: number;
  travel: number;
  tapLike: boolean;
  circularity: number;
  zigzag: number;
};

type ContourAnchor = {
  stepIndex: number;
  drawRatio: number;
  point: NormalizedPoint;
  movement: number;
  sustain: boolean;
  leap: boolean;
  accent: boolean;
  emphasis: number;
};

type PhraseNote = {
  stepIndex: number;
  midi: number;
  trigger: boolean;
  gateSteps: number;
  chordTone: boolean;
  accent: number;
  sustain: boolean;
  leap: boolean;
  movement: number;
};

type ContourLoop = {
  id: number;
  bornAt: number;
  role: VoiceRole;
  hue: number;
  dialogueKind: "source" | "response";
  answerToLoopId?: number;
  energy: number;
  points: NormalizedPoint[];
  anchors: ContourAnchor[];
  noteCount: number;
  desiredRegisterMidi: number;
  loopBars: number;
  scheduledAtMs: number;
  lastTriggeredToken: string;
  lastPhraseToken: string;
  phraseNotes: PhraseNote[];
  synthetic: boolean;
  motionSeed: number;
  clusterSize: number;
  registerShift: number;
  landingBias: number;
};

type PlaybackFlash = {
  id: number;
  bornAt: number;
  ttl: number;
  point: NormalizedPoint;
  role: VoiceRole;
  response: boolean;
  hue: number;
  strength: number;
  kind: "touch" | "note" | "bar";
};

type CadenceEvent = {
  id: number;
  bornAt: number;
  ttl: number;
  barNumber: number;
  hue: number;
  intensity: number;
};

type AudioEngine = {
  context: AudioContext | null;
  compressor: DynamicsCompressorNode | null;
  master: GainNode | null;
  fxSend: GainNode | null;
  noiseBuffer: AudioBuffer | null;
  muted: boolean;
  masterLevel: number;
};

type SimulationState = {
  activeTouches: Map<number, ActiveTouch>;
  loops: ContourLoop[];
  flashes: PlaybackFlash[];
  recentGestures: RecentGesture[];
  cadenceEvents: CadenceEvent[];
  surfaceEnergy: number;
};

type MemoryChip = {
  id: number;
  hue: number;
  role: VoiceRole;
};

type ToneVoice = VoiceRole | "touch" | "bar";
type VoiceRoleOverride = VoiceRole | "auto";

export type SurfacePreset = "seed" | "trace" | "hold";

type EchoSurfaceProps = {
  preset?: SurfacePreset;
  captureMode?: boolean;
};

const MAX_LOOPS = 12;
const MAX_ACTIVE_FLASHES = 56;
const MAX_POINTS_PER_GESTURE = 120;
const TAU = Math.PI * 2;
const SURFACE_PRESETS: SurfacePreset[] = ["seed", "trace", "hold"];
const LOOP_BARS = 1;
const BEATS_PER_BAR = 4;
const IDLE_PAD_AFTER_MS = 1200;
const CADENCE_BAR_INTERVAL = 8;
const CADENCE_TTL_MS = 2400;
const NOTE_RANGE_MIN = 48;
const NOTE_RANGE_MAX = 88;
const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;
const VOICE_ROLE_STYLES: Record<VoiceRole, VoiceRoleStyle> = {
  pad: {
    glyph: "circle",
    palette: { hue: 248, saturation: 88, lightness: 70 },
    motion: "breathe",
  },
  bass: {
    glyph: "square",
    palette: { hue: 6, saturation: 80, lightness: 54 },
    motion: "weight",
  },
  lead: {
    glyph: "star",
    palette: { hue: 44, saturation: 95, lightness: 68 },
    motion: "spark",
  },
  percussion: {
    glyph: "diamond",
    palette: { hue: 0, saturation: 0, lightness: 92 },
    motion: "pulse",
  },
  echo: {
    glyph: "wave",
    palette: { hue: 176, saturation: 72, lightness: 62 },
    motion: "orbit",
  },
};
const VOICE_ROLE_ORDER: VoiceRole[] = [
  "pad",
  "bass",
  "lead",
  "percussion",
  "echo",
];
const RESPONSE_GLYPH_HUE = 184;
const RESPONSE_ROLE_MAP: Record<VoiceRole, VoiceRole[]> = {
  pad: ["lead", "echo"],
  bass: ["pad", "echo"],
  lead: ["echo", "pad"],
  percussion: ["echo", "bass"],
  echo: ["lead", "pad"],
};
const PROGRESSION_OPTIONS: ProgressionOption[] = [
  {
    id: "cadence",
    label: "Cadence",
    progression: ["I", "IV", "V", "I"],
  },
  {
    id: "lift",
    label: "Lift",
    progression: ["I", "V", "vi", "IV"],
  },
  {
    id: "orbit",
    label: "Orbit",
    progression: ["vi", "IV", "I", "V"],
  },
  {
    id: "turn",
    label: "Turn",
    progression: ["ii", "V", "I", "vi"],
  },
];
const MODE_INTERVALS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
} as const;
const DEFAULT_HARMONIC_STATE: HarmonicState = {
  tonic: "C",
  mode: "major",
  progression: ["I", "IV", "V", "I"],
  currentBar: 1,
  barsPerChord: 2,
  bpm: 100,
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

const modulo = (value: number, divisor: number) =>
  ((value % divisor) + divisor) % divisor;

const easeOutCubic = (value: number) => 1 - (1 - clamp(value, 0, 1)) ** 3;

const easeInOutSine = (value: number) =>
  -(Math.cos(Math.PI * clamp(value, 0, 1)) - 1) / 2;

const midiToFrequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

const noteNameToPitchClass = (note: string) =>
  NOTE_NAMES.indexOf(note.toUpperCase() as (typeof NOTE_NAMES)[number]);

const point = (x: number, y: number, t: number): NormalizedPoint => ({
  x,
  y,
  t,
});

const normalizedToPixels = (pointValue: NormalizedPoint, size: SurfaceSize) => ({
  x: pointValue.x * size.width,
  y: pointValue.y * size.height,
});

const averagePoint = (points: NormalizedPoint[]) => {
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

const pathDuration = (points: NormalizedPoint[]) => points.at(-1)?.t ?? 0;

const getGestureTravel = (points: NormalizedPoint[]) =>
  points.slice(1).reduce(
    (total, current, index) => total + distance(points[index], current),
    0,
  );

const getBeatMs = (harmonicState: HarmonicState) => 60000 / harmonicState.bpm;

const getBarMs = (harmonicState: HarmonicState) =>
  getBeatMs(harmonicState) * BEATS_PER_BAR;

const getBarIndexAtTime = (
  timeMs: number,
  clockStartMs: number,
  harmonicState: HarmonicState,
) => Math.max(0, Math.floor((timeMs - clockStartMs) / getBarMs(harmonicState)));

const getBarNumberAtTime = (
  timeMs: number,
  clockStartMs: number,
  harmonicState: HarmonicState,
) => getBarIndexAtTime(timeMs, clockStartMs, harmonicState) + 1;

const getBarProgressAtTime = (
  timeMs: number,
  clockStartMs: number,
  harmonicState: HarmonicState,
) =>
  clamp(
    modulo(timeMs - clockStartMs, getBarMs(harmonicState)) /
      getBarMs(harmonicState),
    0,
    1,
  );

const getChordIndexForBar = (barNumber: number, harmonicState: HarmonicState) =>
  Math.floor((Math.max(barNumber, 1) - 1) / harmonicState.barsPerChord) %
  harmonicState.progression.length;

const getChordForBar = (barNumber: number, harmonicState: HarmonicState) =>
  harmonicState.progression[getChordIndexForBar(barNumber, harmonicState)];

const getScalePitchClasses = (harmonicState: HarmonicState) => {
  const tonicPitchClass = Math.max(0, noteNameToPitchClass(harmonicState.tonic));

  return MODE_INTERVALS[harmonicState.mode].map((interval) =>
    modulo(tonicPitchClass + interval, 12),
  );
};

const romanToDegree = (roman: string) => {
  const cleaned = roman.replace(/[^ivIV]/g, "").toUpperCase();

  switch (cleaned) {
    case "I":
      return 0;
    case "II":
      return 1;
    case "III":
      return 2;
    case "IV":
      return 3;
    case "V":
      return 4;
    case "VI":
      return 5;
    case "VII":
      return 6;
    default:
      return 0;
  }
};

const getChordPitchClasses = (
  harmonicState: HarmonicState,
  chordSymbol: string,
) => {
  const scalePitchClasses = getScalePitchClasses(harmonicState);
  const degree = romanToDegree(chordSymbol);

  return [0, 2, 4].map(
    (offset) => scalePitchClasses[(degree + offset) % scalePitchClasses.length],
  );
};

const buildExtendedScaleMidis = (
  harmonicState: HarmonicState,
  minMidi = NOTE_RANGE_MIN,
  maxMidi = NOTE_RANGE_MAX,
) => {
  const scalePitchClasses = getScalePitchClasses(harmonicState);
  const values: number[] = [];

  for (let midi = minMidi; midi <= maxMidi; midi += 1) {
    if (scalePitchClasses.includes(modulo(midi, 12))) {
      values.push(midi);
    }
  }

  return values;
};

const findNearestValueIndex = (values: number[], target: number) => {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  values.forEach((value, index) => {
    const gap = Math.abs(value - target);
    if (gap < bestDistance) {
      bestDistance = gap;
      bestIndex = index;
    }
  });

  return bestIndex;
};

const findNearestChordToneIndex = (
  values: number[],
  target: number,
  chordPitchClasses: number[],
) => {
  const chordToneValues = values
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => chordPitchClasses.includes(modulo(value, 12)));

  if (chordToneValues.length === 0) {
    return findNearestValueIndex(values, target);
  }

  let bestIndex = chordToneValues[0].index;
  let bestDistance = Math.abs(chordToneValues[0].value - target);

  chordToneValues.forEach(({ value, index }) => {
    const gap = Math.abs(value - target);
    if (gap < bestDistance) {
      bestDistance = gap;
      bestIndex = index;
    }
  });

  return bestIndex;
};

const findNearestPreferredChordToneIndex = (
  values: number[],
  target: number,
  chordPitchClasses: number[],
  preferredToneIndex: number,
) => {
  const preferredPitchClass =
    chordPitchClasses[modulo(preferredToneIndex, chordPitchClasses.length)] ??
    chordPitchClasses[0];
  const preferredCandidates = values
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => modulo(value, 12) === preferredPitchClass);

  if (preferredCandidates.length === 0) {
    return findNearestChordToneIndex(values, target, chordPitchClasses);
  }

  let bestIndex = preferredCandidates[0].index;
  let bestDistance = Math.abs(preferredCandidates[0].value - target);

  preferredCandidates.forEach(({ value, index }) => {
    const gap = Math.abs(value - target);
    if (gap < bestDistance) {
      bestDistance = gap;
      bestIndex = index;
    }
  });

  return bestIndex;
};

const samplePath = (points: NormalizedPoint[], targetTime: number) => {
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

const resamplePath = (points: NormalizedPoint[], count: number) => {
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
    return point(sampled.x, sampled.y, index);
  });
};

const buildPartialPath = (points: NormalizedPoint[], progress: number) => {
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

const drawPolyline = (
  context: CanvasRenderingContext2D,
  size: SurfaceSize,
  points: NormalizedPoint[],
  strokeStyle: string,
  lineWidth: number,
) => {
  if (points.length < 2) {
    return;
  }

  context.beginPath();

  points.forEach((pointValue, index) => {
    const pixel = normalizedToPixels(pointValue, size);
    if (index === 0) {
      context.moveTo(pixel.x, pixel.y);
    } else {
      context.lineTo(pixel.x, pixel.y);
    }
  });

  context.strokeStyle = strokeStyle;
  context.lineWidth = lineWidth;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.stroke();
};

const getRoleColor = (
  role: VoiceRole,
  alpha: number,
  lightnessOffset = 0,
  saturationOffset = 0,
) => {
  const palette = VOICE_ROLE_STYLES[role].palette;

  return `hsla(${palette.hue}, ${clamp(
    palette.saturation + saturationOffset,
    0,
    100,
  )}%, ${clamp(palette.lightness + lightnessOffset, 0, 100)}%, ${alpha})`;
};

const getGestureBounds = (points: NormalizedPoint[]) =>
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

const smoothResampledPath = (
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

const chooseHue = (pointValue: NormalizedPoint, interactions: number) => {
  const seed = pointValue.x * 132 + pointValue.y * 64 + interactions * 18;
  return 18 + (seed % 196);
};

const chooseAnchorCount = (points: NormalizedPoint[]) => {
  const duration = Math.max(pathDuration(points), 420);
  const travel = getGestureTravel(points);
  const rawCount = Math.round(6 + travel * 18 + duration / 460);
  const clampedCount = clamp(rawCount, 6, 12);

  return clampedCount % 2 === 0 ? clampedCount : clampedCount + 1;
};

const coerceContourPoints = (points: NormalizedPoint[]) => {
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

const analyzeContour = (points: NormalizedPoint[]) => {
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
      };
    }),
  };
};

const summarizeGesture = (
  points: NormalizedPoint[],
  durationMs: number,
  recentGestures: RecentGesture[],
) => {
  const centroid = averagePoint(points);
  const travel = getGestureTravel(points);
  const bounds = getGestureBounds(points);
  const xSpan = bounds.maxX - bounds.minX;
  const ySpan = bounds.maxY - bounds.minY;
  const directDistance = distance(points[0] ?? centroid, points.at(-1) ?? centroid);
  const smoothness = travel / Math.max(directDistance, 0.01);
  let signChanges = 0;
  let previousVerticalSign = 0;

  for (let index = 1; index < points.length; index += 1) {
    const sign = Math.sign(points[index - 1].y - points[index].y);
    if (sign !== 0 && previousVerticalSign !== 0 && sign !== previousVerticalSign) {
      signChanges += 1;
    }
    if (sign !== 0) {
      previousVerticalSign = sign;
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
  };
};

const createBassDronePath = (points: NormalizedPoint[]) => {
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

const createPercussionPath = (
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

const createEchoPath = (points: NormalizedPoint[]) => {
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

const createLeadPath = (points: NormalizedPoint[]) => {
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

const inferVoiceRole = (
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

const shapePointsForRole = (
  role: VoiceRole,
  points: NormalizedPoint[],
  summary: ReturnType<typeof summarizeGesture>,
) => {
  switch (role) {
    case "pad":
      return smoothResampledPath(coerceContourPoints(points), 12, 2);
    case "bass":
      return createBassDronePath(points);
    case "lead":
      return createLeadPath(points);
    case "percussion":
      return createPercussionPath(points, summary.nearbyTapCount);
    case "echo":
      return createEchoPath(smoothResampledPath(points, 16, 1));
  }
};

const getResponseRole = (sourceRole: VoiceRole, seed: number) => {
  const options = RESPONSE_ROLE_MAP[sourceRole];
  return options[modulo(seed, options.length)];
};

const buildResponsePoints = (
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

  switch (responseRole) {
    case "pad":
      return smoothResampledPath(transformed, 12, 2);
    case "bass":
      return smoothResampledPath(transformed, 10, 2).map((current, index, values) => {
        const amount = index / Math.max(values.length - 1, 1);
        return point(
          current.x,
          clamp(mix(current.y, centroid.y + 0.08, 0.34) + amount * 0.012, 0.16, 0.9),
          current.t,
        );
      });
    case "lead":
      return createLeadPath(transformed);
    case "percussion":
      return createPercussionPath(transformed, 1);
    case "echo":
      return createEchoPath(shapePointsForRole("echo", transformed, summary));
  }
};

const buildPhraseNotes = (
  loop: ContourLoop,
  harmonicState: HarmonicState,
  chordSymbol: string,
) => {
  const scaleMidis = buildExtendedScaleMidis(harmonicState);
  const chordPitchClasses = getChordPitchClasses(harmonicState, chordSymbol);
  const firstAnchor = loop.anchors[0];
  const registerTarget =
    loop.role === "bass"
      ? clamp(loop.desiredRegisterMidi - 24, 36, 56)
      : loop.role === "pad"
        ? clamp(loop.desiredRegisterMidi - 8, 54, 72)
        : loop.role === "lead"
          ? clamp(loop.desiredRegisterMidi + 6, 68, 88)
          : loop.role === "percussion"
            ? clamp(loop.desiredRegisterMidi - 4, 50, 72)
            : clamp(loop.desiredRegisterMidi + 2, 62, 84);
  const shiftedRegisterTarget = clamp(
    registerTarget + loop.registerShift,
    NOTE_RANGE_MIN,
    NOTE_RANGE_MAX,
  );
  const startTarget = shiftedRegisterTarget + (0.5 - firstAnchor.point.y) * 4;
  let scaleIndex = findNearestChordToneIndex(
    scaleMidis,
    startTarget,
    chordPitchClasses,
  );

  const notes = loop.anchors.map((anchor, index) => {
    if (index > 0) {
      const roleMovement =
        loop.role === "pad"
          ? clamp(anchor.movement, -1, 1)
          : loop.role === "bass"
            ? clamp(anchor.movement, -1, 1)
            : loop.role === "echo"
              ? clamp(anchor.movement, -2, 2)
              : anchor.movement;
      const rawIndex = clamp(
        scaleIndex + roleMovement,
        0,
        scaleMidis.length - 1,
      );
      const wantsStability =
        loop.role === "pad" ||
        loop.role === "bass" ||
        anchor.accent ||
        anchor.sustain ||
        index === loop.anchors.length - 1 ||
        anchor.emphasis > 0.62;

      if (wantsStability) {
        const chordIndex =
          loop.dialogueKind === "response"
            ? findNearestPreferredChordToneIndex(
                scaleMidis,
                scaleMidis[rawIndex],
                chordPitchClasses,
                loop.landingBias,
              )
            : findNearestChordToneIndex(
                scaleMidis,
                scaleMidis[rawIndex],
                chordPitchClasses,
              );
        scaleIndex =
          Math.abs(chordIndex - rawIndex) <= 2 || anchor.emphasis > 0.82
            ? chordIndex
            : rawIndex;
      } else {
        scaleIndex = rawIndex;
      }
    }

    if (index === loop.anchors.length - 1) {
      scaleIndex =
        loop.dialogueKind === "response"
          ? findNearestPreferredChordToneIndex(
              scaleMidis,
              scaleMidis[scaleIndex],
              chordPitchClasses,
              loop.landingBias,
            )
          : findNearestChordToneIndex(
              scaleMidis,
              scaleMidis[scaleIndex],
              chordPitchClasses,
            );
    }

    const midi = scaleMidis[scaleIndex];
    const onStrongSubdivision =
      index === 0 ||
      index === loop.anchors.length - 1 ||
      index % Math.max(1, Math.floor(loop.anchors.length / 4)) === 0;
    const trigger =
      loop.role === "pad"
        ? onStrongSubdivision || anchor.accent
        : loop.role === "bass"
          ? index === 0 || index === Math.floor(loop.anchors.length / 2) || index === loop.anchors.length - 1
          : loop.role === "lead"
            ? !anchor.sustain || anchor.accent || anchor.leap
            : loop.role === "percussion"
              ? index === 0 || index % 2 === 0 || anchor.accent
              : index > 0 && (index % 2 === 1 || anchor.leap || anchor.accent || index === loop.anchors.length - 1);
    const gateSteps =
      loop.role === "pad"
        ? 2 + (anchor.sustain ? 1 : 0)
        : loop.role === "bass"
          ? index === 0 ? 4 : 2
          : loop.role === "percussion"
            ? 1
            : loop.role === "echo"
              ? 2
              : 1;
    const resolvedMidi =
      loop.role === "bass"
        ? scaleMidis[
            findNearestChordToneIndex(
              scaleMidis,
              index === 0
                ? shiftedRegisterTarget - 5
                : shiftedRegisterTarget + 2,
              index % 2 === 0 ? [chordPitchClasses[0], chordPitchClasses[2]] : chordPitchClasses,
            )
          ]
        : loop.role === "percussion"
          ? scaleMidis[
              findNearestChordToneIndex(
                scaleMidis,
                shiftedRegisterTarget + (index % 3 === 0 ? 7 : 0),
                index % 3 === 1
                  ? [chordPitchClasses[1] ?? chordPitchClasses[0]]
                  : [chordPitchClasses[0], chordPitchClasses[2] ?? chordPitchClasses[0]],
              )
            ]
          : midi;
    const phraseNote: PhraseNote = {
      stepIndex: anchor.stepIndex,
      midi: resolvedMidi,
      trigger,
      gateSteps,
      chordTone: chordPitchClasses.includes(modulo(resolvedMidi, 12)),
      accent: clamp(
        0.24 +
          anchor.emphasis * 0.46 +
          (anchor.leap ? 0.16 : 0) +
          (loop.role === "lead" ? 0.12 : 0) +
          (loop.role === "percussion" ? 0.08 : 0) +
          (loop.role === "bass" && index === 0 ? 0.18 : 0),
        0.2,
        1,
      ),
      sustain: anchor.sustain || loop.role === "pad" || loop.role === "bass",
      leap: anchor.leap,
      movement: anchor.movement,
    };

    return phraseNote;
  });

  for (let index = 1; index < notes.length; index += 1) {
    if (
      loop.role !== "percussion" &&
      loop.anchors[index].sustain &&
      notes[index].midi === notes[index - 1].midi
    ) {
      notes[index].trigger = false;
      notes[index - 1].gateSteps += 1;
    }
  }

  return notes;
};

const createLoopRecord = ({
  id,
  bornAt,
  role,
  hue,
  dialogueKind = "source",
  answerToLoopId,
  energy,
  points,
  scheduledAtMs,
  synthetic,
  clusterSize = 1,
  registerShift = 0,
  landingBias = 0,
}: {
  id: number;
  bornAt: number;
  role: VoiceRole;
  hue: number;
  dialogueKind?: "source" | "response";
  answerToLoopId?: number;
  energy: number;
  points: NormalizedPoint[];
  scheduledAtMs: number;
  synthetic: boolean;
  clusterSize?: number;
  registerShift?: number;
  landingBias?: number;
}): ContourLoop => {
  const contour = analyzeContour(points);

  return {
    id,
    bornAt,
    role,
    hue,
    dialogueKind,
    answerToLoopId,
    energy,
    points,
    anchors: contour.anchors,
    noteCount: contour.noteCount,
    desiredRegisterMidi: contour.desiredRegisterMidi,
    loopBars: LOOP_BARS,
    scheduledAtMs,
    lastTriggeredToken: "",
    lastPhraseToken: "",
    phraseNotes: [],
    synthetic,
    motionSeed: Math.random() * TAU,
    clusterSize,
    registerShift,
    landingBias,
  };
};

const getCurrentChordHue = (harmonicState: HarmonicState, chordSymbol: string) => {
  const tonicPitchClass = Math.max(0, noteNameToPitchClass(harmonicState.tonic));
  const chordRootPitchClass =
    getChordPitchClasses(harmonicState, chordSymbol)[0] ?? tonicPitchClass;

  return 20 + modulo(chordRootPitchClass * 27 + tonicPitchClass * 11, 220);
};

const getLoopHue = (role: VoiceRole) => {
  const palette = VOICE_ROLE_STYLES[role].palette;
  return palette.hue;
};

const getDialogueHue = (loop: ContourLoop, chordHue?: number) =>
  loop.dialogueKind === "response"
    ? mix(RESPONSE_GLYPH_HUE, chordHue ?? RESPONSE_GLYPH_HUE, 0.16)
    : loop.hue;

const formatVoiceRoleLabel = (role: VoiceRole) => {
  switch (role) {
    case "pad":
      return "Pad";
    case "bass":
      return "Bass";
    case "lead":
      return "Lead";
    case "percussion":
      return "Perc";
    case "echo":
      return "Echo";
  }
};

const getVoiceRoleGlyphLabel = (role: VoiceRole) => {
  switch (role) {
    case "pad":
      return "◯";
    case "bass":
      return "◼";
    case "lead":
      return "✦";
    case "percussion":
      return "⟡";
    case "echo":
      return "~";
  }
};

const drawRoleGlyph = (
  context: CanvasRenderingContext2D,
  role: VoiceRole,
  x: number,
  y: number,
  size: number,
  alpha: number,
  rotation = 0,
  hueOverride?: number,
) => {
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.strokeStyle =
    hueOverride === undefined
      ? getRoleColor(role, alpha, 18, role === "percussion" ? -100 : 8)
      : `hsla(${hueOverride}, ${role === "percussion" ? 10 : 88}%, 84%, ${alpha})`;
  context.fillStyle =
    hueOverride === undefined
      ? getRoleColor(role, alpha * 0.42, 12, role === "percussion" ? -100 : 2)
      : `hsla(${hueOverride}, ${role === "percussion" ? 10 : 82}%, 72%, ${alpha * 0.42})`;
  context.lineWidth = 1.25;
  context.lineCap = "round";
  context.lineJoin = "round";

  switch (VOICE_ROLE_STYLES[role].glyph) {
    case "circle":
      context.beginPath();
      context.arc(0, 0, size * 0.72, 0, TAU);
      context.fill();
      context.stroke();
      break;
    case "square":
      context.beginPath();
      context.rect(-size * 0.62, -size * 0.62, size * 1.24, size * 1.24);
      context.fill();
      context.stroke();
      break;
    case "diamond":
      context.beginPath();
      context.moveTo(0, -size * 0.78);
      context.lineTo(size * 0.78, 0);
      context.lineTo(0, size * 0.78);
      context.lineTo(-size * 0.78, 0);
      context.closePath();
      context.fill();
      context.stroke();
      break;
    case "wave":
      context.fillStyle = "transparent";
      context.beginPath();
      context.moveTo(-size, 0);
      context.quadraticCurveTo(-size * 0.5, -size * 0.7, 0, 0);
      context.quadraticCurveTo(size * 0.5, size * 0.7, size, 0);
      context.stroke();
      break;
    case "star":
      context.beginPath();
      for (let index = 0; index < 8; index += 1) {
        const angle = (index / 8) * TAU;
        const radius = index % 2 === 0 ? size : size * 0.42;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;

        if (index === 0) {
          context.moveTo(px, py);
        } else {
          context.lineTo(px, py);
        }
      }
      context.closePath();
      context.fill();
      context.stroke();
      break;
  }

  context.restore();
};

const warpPointForRole = (
  pointValue: NormalizedPoint,
  nextPoint: NormalizedPoint,
  role: VoiceRole,
  motionSeed: number,
  progress: number,
  now: number,
) => {
  const dx = nextPoint.x - pointValue.x;
  const dy = nextPoint.y - pointValue.y;
  const magnitude = Math.hypot(dx, dy) || 1;
  const tangentX = dx / magnitude;
  const tangentY = dy / magnitude;
  const perpX = -tangentY;
  const perpY = tangentX;
  const phase = now * 0.0014 + motionSeed + progress * TAU;
  let offsetX = 0;
  let offsetY = 0;

  switch (VOICE_ROLE_STYLES[role].motion) {
    case "breathe":
      offsetX = perpX * Math.sin(phase * 0.7) * 0.012;
      offsetY = perpY * Math.sin(phase * 0.7) * 0.012;
      break;
    case "weight":
      offsetY = 0.012 + Math.sin(phase * 0.5) * 0.006;
      offsetX = tangentX * 0.004 * Math.sin(phase);
      break;
    case "spark":
      offsetX =
        tangentX * 0.008 * Math.sin(phase * 1.8) +
        perpX * 0.004 * Math.cos(phase * 2.1);
      offsetY =
        tangentY * 0.008 * Math.sin(phase * 1.8) +
        perpY * 0.004 * Math.cos(phase * 2.1);
      break;
    case "pulse":
      offsetX = perpX * 0.006 * Math.sign(Math.sin(phase * 2.8));
      offsetY = perpY * 0.006 * Math.sign(Math.sin(phase * 2.8));
      break;
    case "orbit":
      offsetX =
        perpX * Math.sin(phase * 1.1) * 0.018 +
        tangentX * Math.cos(phase * 0.8) * 0.004;
      offsetY =
        perpY * Math.sin(phase * 1.1) * 0.018 +
        tangentY * Math.cos(phase * 0.8) * 0.004;
      break;
  }

  return point(
    clamp(pointValue.x + offsetX, 0.04, 0.96),
    clamp(pointValue.y + offsetY, 0.05, 0.95),
    pointValue.t,
  );
};

const makeSurfacePoint = (
  event: ReactPointerEvent<HTMLDivElement>,
  element: HTMLDivElement,
  time: number,
) => {
  const bounds = element.getBoundingClientRect();

  return point(
    clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
    clamp((event.clientY - bounds.top) / bounds.height, 0, 1),
    time,
  );
};

const createPresetState = (
  preset: SurfacePreset,
  now: number,
  clockStartMs: number,
  harmonicState: HarmonicState,
) => {
  const barMs = getBarMs(harmonicState);
  let nextLoopId = 0;
  let nextFlashId = 0;

  const makeLoop = (
    role: VoiceRole,
    points: NormalizedPoint[],
    barOffset: number,
    phase: number,
    energy: number,
  ) =>
    createLoopRecord({
      id: nextLoopId++,
      bornAt: now - 2200 + phase,
      role,
      hue: getLoopHue(role),
      energy,
      points,
      scheduledAtMs:
        clockStartMs + (getBarIndexAtTime(now, clockStartMs, harmonicState) - barOffset) * barMs,
      synthetic: true,
    });

  if (preset === "seed") {
    return {
      loops: [
        makeLoop(
          "lead",
          [
            point(0.16, 0.63, 0),
            point(0.28, 0.53, 160),
            point(0.44, 0.4, 340),
            point(0.64, 0.46, 620),
            point(0.83, 0.32, 880),
          ],
          1,
          0,
          0.78,
        ),
      ],
      flashes: [
        {
          id: nextFlashId++,
          bornAt: now - 180,
          ttl: 980,
          point: point(0.64, 0.46, 0),
          role: "lead" as const,
          response: false,
          hue: getLoopHue("lead"),
          strength: 0.82,
          kind: "note" as const,
        },
      ],
      cadenceEvents: [],
    };
  }

  if (preset === "trace") {
    return {
      loops: [
        makeLoop(
          "pad",
          [
            point(0.12, 0.7, 0),
            point(0.26, 0.56, 180),
            point(0.42, 0.37, 360),
            point(0.61, 0.29, 580),
            point(0.84, 0.41, 860),
          ],
          2,
          0,
          0.92,
        ),
        makeLoop(
          "lead",
          [
            point(0.18, 0.25, 0),
            point(0.34, 0.36, 180),
            point(0.49, 0.52, 380),
            point(0.66, 0.64, 620),
            point(0.86, 0.57, 880),
          ],
          1,
          140,
          0.84,
        ),
      ],
      flashes: [],
      cadenceEvents: [],
    };
  }

  return {
    loops: [
      makeLoop(
        "pad",
        [
          point(0.14, 0.56, 0),
          point(0.3, 0.46, 170),
          point(0.46, 0.46, 370),
          point(0.66, 0.45, 620),
          point(0.85, 0.29, 920),
        ],
        1,
        0,
        0.96,
      ),
      makeLoop(
        "bass",
        [
          point(0.18, 0.74, 0),
          point(0.34, 0.7, 170),
          point(0.46, 0.71, 340),
          point(0.61, 0.72, 580),
          point(0.83, 0.69, 860),
        ],
        0,
        180,
        0.74,
      ),
    ],
    flashes: [],
    cadenceEvents: [],
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
  const soundRef = useRef<AudioEngine>({
    context: null,
    compressor: null,
    master: null,
    fxSend: null,
    noiseBuffer: null,
    muted: false,
    masterLevel: 0.2,
  });
  const simulationRef = useRef<SimulationState>({
    activeTouches: new Map(),
    loops: [],
    flashes: [],
    recentGestures: [],
    cadenceEvents: [],
    surfaceEnergy: 0.18,
  });
  const harmonicStateRef = useRef<HarmonicState>(DEFAULT_HARMONIC_STATE);
  const clockStartMsRef = useRef(performance.now());
  const lastBarTriggerRef = useRef(0);
  const lastInteractionAtRef = useRef(performance.now());
  const flashIdRef = useRef(0);
  const loopIdRef = useRef(0);
  const cadenceIdRef = useRef(0);
  const nextRoleOverrideRef = useRef<VoiceRoleOverride>("auto");
  const callResponseEnabledRef = useRef(true);
  const [harmonicState, setHarmonicState] = useState(DEFAULT_HARMONIC_STATE);
  const [memory, setMemory] = useState<MemoryChip[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [progressionIndex, setProgressionIndex] = useState(0);
  const [nextRoleOverride, setNextRoleOverride] =
    useState<VoiceRoleOverride>("auto");
  const [callResponseEnabled, setCallResponseEnabled] = useState(true);

  const currentChord = useMemo(
    () => getChordForBar(harmonicState.currentBar, harmonicState),
    [harmonicState],
  );
  const keyLabel = `${harmonicState.tonic} ${harmonicState.mode}`;
  const ensembleLabel =
    memory.length === 0
      ? "voices awaken by gesture"
      : Array.from(new Set(memory.map((chip) => chip.role))).join(" • ");
  const whisperLabel =
    activeCount > 0
      ? "long drag pad • hold bass • tap cluster percussion • zigzag lead • circle echo"
      : nextRoleOverride === "auto"
        ? callResponseEnabled
          ? "draw a phrase and the surface will answer one bar later"
          : "draw a phrase and let the surface infer the voice"
        : `next contour sealed as ${formatVoiceRoleLabel(nextRoleOverride)}`;

  const syncMemory = () => {
    setMemory(
      simulationRef.current.loops.map((loop) => ({
        id: loop.id,
        hue: loop.hue,
        role: loop.role,
      })),
    );
  };

  const syncActiveCount = () => {
    setActiveCount(simulationRef.current.activeTouches.size);
  };

  const pushFlash = (
    pointValue: NormalizedPoint,
    role: VoiceRole,
    hue: number,
    strength: number,
    kind: PlaybackFlash["kind"],
    response = false,
  ) => {
    simulationRef.current.flashes.push({
      id: flashIdRef.current++,
      bornAt: performance.now(),
      ttl: kind === "bar" ? 1200 : 920,
      point: pointValue,
      role,
      response,
      hue,
      strength,
      kind,
    });

    if (simulationRef.current.flashes.length > MAX_ACTIVE_FLASHES) {
      simulationRef.current.flashes.splice(
        0,
        simulationRef.current.flashes.length - MAX_ACTIVE_FLASHES,
      );
    }
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
      const noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);

      compressor.threshold.value = -22;
      compressor.knee.value = 20;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.22;

      master.gain.value = engine.masterLevel;

      delay.delayTime.value = 0.32;
      feedback.gain.value = 0.24;
      delayFilter.type = "lowpass";
      delayFilter.frequency.value = 2400;

      fxSend.gain.value = 0.15;

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
      engine.compressor = compressor;
      engine.master = master;
      engine.fxSend = fxSend;
      engine.noiseBuffer = noiseBuffer;
    }

    if (engine.context.state === "suspended") {
      await engine.context.resume();
    }
  };

  const triggerNoiseBurst = (role: VoiceRole, intensity: number, hue: number) => {
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

    const context = engine.context;
    const now = context.currentTime;
    const source = context.createBufferSource();
    const highpass = context.createBiquadFilter();
    const bandpass = context.createBiquadFilter();
    const gain = context.createGain();
    const send = context.createGain();

    source.buffer = engine.noiseBuffer;
    highpass.type = "highpass";
    highpass.frequency.value = role === "percussion" ? 1800 : 2600;
    bandpass.type = "bandpass";
    bandpass.frequency.value = role === "percussion" ? 3200 : 4200 + hue;
    bandpass.Q.value = role === "percussion" ? 1.2 : 2.2;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.035 + intensity * 0.08, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (role === "percussion" ? 0.12 : 0.22));

    send.gain.value = role === "echo" ? 0.22 : 0.08;

    source.connect(highpass);
    highpass.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(engine.compressor);
    gain.connect(send);
    send.connect(engine.fxSend);

    source.start(now);
    source.stop(now + 0.24);
  };

  const playMelodicTone = ({
    midi,
    hue,
    accent,
    durationMs,
    voice,
  }: {
    midi: number;
    hue: number;
    accent: number;
    durationMs: number;
    voice: ToneVoice;
  }) => {
    const engine = soundRef.current;

    if (
      !engine.context ||
      !engine.compressor ||
      !engine.fxSend ||
      engine.muted
    ) {
      return;
    }

    const context = engine.context;
    const now = context.currentTime;
    const duration = clamp(durationMs / 1000, 0.12, 1.8);
    const frequency = midiToFrequency(midi);
    const primary = context.createOscillator();
    const secondary = context.createOscillator();
    const sub = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const send = context.createGain();
    const brightness = hue / 220;
    const isBar = voice === "bar";
    const isTouch = voice === "touch";
    const role = !isBar && !isTouch ? voice : undefined;

    primary.type =
      isBar || role === "pad"
        ? "triangle"
        : role === "bass"
          ? "sine"
          : role === "percussion"
            ? "square"
            : "sawtooth";
    secondary.type =
      isBar || role === "echo"
        ? "sine"
        : role === "bass"
          ? "triangle"
          : "triangle";
    sub.type = "sine";

    primary.detune.value = isTouch ? -3 : role === "pad" ? -2 : -7;
    secondary.detune.value = isTouch ? 3 : role === "pad" ? 2 : 7;

    primary.frequency.setValueAtTime(frequency, now);
    secondary.frequency.setValueAtTime(
      frequency *
        (isBar
          ? 1.5
          : role === "bass"
            ? 1.01
            : role === "percussion"
              ? 2
              : 1.003),
      now,
    );
    sub.frequency.setValueAtTime(
      frequency * (isBar ? 0.5 : role === "percussion" ? 1 : 0.5),
      now,
    );

    filter.type =
      isBar || role === "bass" || role === "pad"
        ? "lowpass"
        : role === "echo"
          ? "bandpass"
          : "bandpass";
    filter.Q.value =
      isBar ? 1.1 : role === "pad" ? 0.9 : role === "echo" ? 4.2 : role === "percussion" ? 5.6 : 2.4;
    filter.frequency.setValueAtTime(
      (isBar
        ? 420
        : role === "bass"
          ? 280
          : role === "pad"
            ? 620
            : role === "echo"
              ? 1800
              : role === "percussion"
                ? 2400
                : 820) +
        accent * 1400 +
        brightness * 500,
      now,
    );
    filter.frequency.exponentialRampToValueAtTime(
      isBar ? 180 : role === "bass" ? 120 : role === "pad" ? 160 : role === "echo" ? 720 : 260,
      now + duration,
    );

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(
      (isBar
        ? 0.055
        : isTouch
          ? 0.045
          : role === "pad"
            ? 0.05
            : role === "bass"
              ? 0.06
              : role === "percussion"
                ? 0.04
                : role === "echo"
                  ? 0.038
                  : 0.072) +
        accent * 0.06,
      now + (isBar ? 0.04 : role === "pad" ? 0.08 : role === "bass" ? 0.03 : 0.018),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    send.gain.value =
      isBar ? 0.08 : role === "pad" ? 0.22 : role === "echo" ? 0.32 : role === "bass" ? 0.06 : 0.16;

    primary.connect(filter);
    secondary.connect(filter);
    sub.connect(filter);
    filter.connect(gain);
    gain.connect(engine.compressor);
    gain.connect(send);
    send.connect(engine.fxSend);

    primary.start(now);
    secondary.start(now);
    sub.start(now);
    primary.stop(now + duration + 0.05);
    secondary.stop(now + duration + 0.05);
    sub.stop(now + duration + 0.05);

    if (role === "percussion") {
      triggerNoiseBurst("percussion", 0.34 + accent * 0.4, hue);
    }

    if (role === "echo") {
      triggerNoiseBurst("echo", 0.12 + accent * 0.12, hue);
    }
  };

  const playChordPad = (chordSymbol: string, barNumber: number) => {
    const engine = soundRef.current;
    if (!engine.context || engine.muted) {
      return;
    }

    const harmonic = harmonicStateRef.current;
    const scale = buildExtendedScaleMidis(harmonic, 36, 72);
    const chordPitchClasses = getChordPitchClasses(harmonic, chordSymbol);
    const targets = [43, 50, 57];
    const accent = barNumber % harmonic.barsPerChord === 1 ? 0.92 : 0.72;
    const hue = getCurrentChordHue(harmonic, chordSymbol);

    targets.forEach((target, index) => {
      const chordIndex = findNearestChordToneIndex(scale, target, chordPitchClasses);
      playMelodicTone({
        midi: scale[chordIndex] + (index === 0 ? 0 : 12),
        hue,
        accent: accent * (index === 0 ? 0.88 : 0.56),
        durationMs: getBarMs(harmonic) * 0.92,
        voice: "bar",
      });
    });
  };

  const playCadenceResolution = () => {
    const engine = soundRef.current;
    if (!engine.context || engine.muted) {
      return;
    }

    const harmonic = harmonicStateRef.current;
    const scale = buildExtendedScaleMidis(harmonic, 36, 84);
    const tonicChordPitchClasses = getChordPitchClasses(harmonic, "I");
    const targets = [40, 52, 59, 64];

    targets.forEach((target, index) => {
      const chordIndex = findNearestPreferredChordToneIndex(
        scale,
        target,
        tonicChordPitchClasses,
        index === 0 ? 0 : index === 1 ? 1 : 2,
      );
      playMelodicTone({
        midi: scale[chordIndex] + (index >= 2 ? 12 : 0),
        hue: getCurrentChordHue(harmonic, "I"),
        accent: index === 0 ? 1 : 0.88 - index * 0.08,
        durationMs: getBarMs(harmonic) * (index === 0 ? 1.3 : 1.08),
        voice: index === 0 ? "bass" : "pad",
      });
    });
  };

  const triggerCadenceEvent = (barNumber: number, intensity: number) => {
    const harmonic = harmonicStateRef.current;
    const hue = getCurrentChordHue(harmonic, "I");

    simulationRef.current.cadenceEvents.push({
      id: cadenceIdRef.current++,
      bornAt: performance.now(),
      ttl: CADENCE_TTL_MS,
      barNumber,
      hue,
      intensity,
    });

    if (simulationRef.current.cadenceEvents.length > 2) {
      simulationRef.current.cadenceEvents.splice(
        0,
        simulationRef.current.cadenceEvents.length - 2,
      );
    }

    pushFlash(point(0.5, 0.5, performance.now()), "pad", hue, 1.25, "bar");
    playCadenceResolution();
  };

  const getPreviewMidi = (
    pointValue: NormalizedPoint,
    timeMs: number,
    roleHint?: VoiceRole | null,
  ) => {
    const harmonic = harmonicStateRef.current;
    const barNumber = getBarNumberAtTime(timeMs, clockStartMsRef.current, harmonic);
    const chordSymbol = getChordForBar(barNumber, harmonic);
    const scale = buildExtendedScaleMidis(harmonic);
    const chordPitchClasses = getChordPitchClasses(harmonic, chordSymbol);
    const roleOffset =
      roleHint === "bass"
        ? -24
        : roleHint === "pad"
          ? -8
          : roleHint === "lead"
            ? 6
            : roleHint === "echo"
              ? 2
              : 0;
    const target = clamp(Math.round(78 - pointValue.y * 24 + roleOffset), 40, 88);

    return scale[findNearestChordToneIndex(scale, target, chordPitchClasses)];
  };

  const createResponseLoop = (sourceLoop: ContourLoop, seed: number) => {
    const harmonic = harmonicStateRef.current;
    const responseRole = getResponseRole(sourceLoop.role, seed);
    const responsePoints = buildResponsePoints(sourceLoop.points, responseRole, seed);
    const responseScheduledAtMs =
      sourceLoop.scheduledAtMs +
      getBarMs(harmonic) +
      getBeatMs(harmonic) * (0.16 + modulo(seed, 3) * 0.07);
    const registerShift =
      responseRole === "bass"
        ? -12
        : responseRole === "lead"
          ? 12
          : modulo(seed, 2) === 0
            ? 12
            : -12;
    const landingBias = 1 + modulo(seed, 2);

    return createLoopRecord({
      id: loopIdRef.current++,
      bornAt: performance.now(),
      role: responseRole,
      hue: getLoopHue(responseRole),
      dialogueKind: "response",
      answerToLoopId: sourceLoop.id,
      energy: clamp(sourceLoop.energy * 0.86, 0.38, 1.08),
      points: responsePoints,
      scheduledAtMs: responseScheduledAtMs,
      synthetic: true,
      clusterSize: 1,
      registerShift,
      landingBias,
    });
  };

  const finalizeTouch = (pointerId: number) => {
    const touch = simulationRef.current.activeTouches.get(pointerId);

    if (!touch) {
      return;
    }

    simulationRef.current.activeTouches.delete(pointerId);
    syncActiveCount();

    const relativePoints = touch.points.map((current) =>
      point(current.x, current.y, current.t - touch.bornAt),
    );
    const now = performance.now();
    const gestureDurationMs = Math.max(now - touch.bornAt, pathDuration(relativePoints), 1);
    const inferred = inferVoiceRole(
      relativePoints,
      gestureDurationMs,
      simulationRef.current.recentGestures,
    );
    const role = touch.previewRole ?? inferred.role;
    const contourPoints = shapePointsForRole(role, relativePoints, inferred.summary);
    const harmonic = harmonicStateRef.current;
    const currentBarIndex = getBarIndexAtTime(now, clockStartMsRef.current, harmonic);
    const nextBarStartMs =
      clockStartMsRef.current + (currentBarIndex + 1) * getBarMs(harmonic);
    const energy = clamp(0.42 + touch.travel * 1.4, 0.42, 1.2);
    const endPoint = contourPoints.at(-1) ?? averagePoint(contourPoints);
    const roleHue = getLoopHue(role);

    simulationRef.current.recentGestures = [
      ...simulationRef.current.recentGestures,
      {
        timestamp: now,
        centroid: inferred.summary.centroid,
        durationMs: gestureDurationMs,
        travel: inferred.summary.travel,
        tapLike: inferred.summary.tapLike,
        circularity: inferred.summary.circularity,
        zigzag: inferred.summary.zigzag,
      },
    ].slice(-18);

    const sourceLoop = createLoopRecord({
      id: loopIdRef.current++,
      bornAt: now,
      role,
      hue: roleHue,
      dialogueKind: "source",
      energy,
      points: contourPoints,
      scheduledAtMs: nextBarStartMs,
      synthetic: false,
      clusterSize: inferred.summary.nearbyTapCount + 1,
    });
    const responseLoop =
      callResponseEnabledRef.current && role !== "percussion"
        ? createResponseLoop(sourceLoop, loopIdRef.current + Math.round(now))
        : undefined;

    simulationRef.current.loops = [
      ...simulationRef.current.loops,
      sourceLoop,
      ...(responseLoop ? [responseLoop] : []),
    ].slice(-MAX_LOOPS);

    simulationRef.current.surfaceEnergy = clamp(
      simulationRef.current.surfaceEnergy +
        0.1 +
        energy * 0.08 +
        (role === "lead" || role === "percussion" ? 0.06 : 0),
      0.14,
      1.2,
    );
    lastInteractionAtRef.current = now;

    pushFlash(endPoint, role, roleHue, 0.84, "touch");
    playMelodicTone({
      midi: getPreviewMidi(endPoint, now, role),
      hue: roleHue,
      accent: role === "bass" ? 0.92 : role === "percussion" ? 0.64 : 0.76,
      durationMs:
        getBeatMs(harmonic) *
        (role === "pad" ? 1.1 : role === "bass" ? 1.4 : role === "percussion" ? 0.3 : 0.72),
      voice: role === "percussion" ? "percussion" : role === "bass" ? "bass" : "touch",
    });

    if (touch.previewRole) {
      selectNextRoleOverride("auto");
    }

    syncMemory();
  };

  useEffect(() => {
    nextRoleOverrideRef.current = nextRoleOverride;
  }, [nextRoleOverride]);

  useEffect(() => {
    callResponseEnabledRef.current = callResponseEnabled;
  }, [callResponseEnabled]);

  useEffect(() => {
    if (!preset) {
      return;
    }

    const snapshot = createPresetState(
      preset,
      performance.now(),
      clockStartMsRef.current,
      harmonicStateRef.current,
    );

    simulationRef.current.loops = snapshot.loops;
    simulationRef.current.flashes = snapshot.flashes;
    simulationRef.current.cadenceEvents = snapshot.cadenceEvents;
    simulationRef.current.recentGestures = [];
    simulationRef.current.surfaceEnergy = 0.3;
    simulationRef.current.activeTouches.clear();
    loopIdRef.current = snapshot.loops.length;
    flashIdRef.current = snapshot.flashes.length;
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

    const drawNoteGlyph = (
      loop: ContourLoop,
      pointValue: NormalizedPoint,
      nextPoint: NormalizedPoint,
      active: boolean,
      note: PhraseNote,
      cycleProgress: number,
      now: number,
      chordHue: number,
      glyphBoost: number,
    ) => {
      const warpedPoint = warpPointForRole(
        pointValue,
        nextPoint,
        loop.role,
        loop.motionSeed,
        cycleProgress + note.stepIndex / Math.max(loop.noteCount, 1),
        now,
      );
      const warpedNext = warpPointForRole(
        nextPoint,
        nextPoint,
        loop.role,
        loop.motionSeed,
        cycleProgress + note.stepIndex / Math.max(loop.noteCount, 1) + 0.02,
        now,
      );
      const size = sizeRef.current;
      const pixel = normalizedToPixels(warpedPoint, size);
      const nextPixel = normalizedToPixels(warpedNext, size);
      const angle = Math.atan2(nextPixel.y - pixel.y, nextPixel.x - pixel.x);
      const glow = (active ? 1 : note.trigger ? 0.5 : 0.24) * glyphBoost;
      const radius =
        (note.chordTone ? 18 : 14) + note.accent * 12 + (active ? 6 : 0) + (glyphBoost - 1) * 8;
      const glyphHue = getDialogueHue(loop, chordHue);
      const halo = context.createRadialGradient(
        pixel.x,
        pixel.y,
        0,
        pixel.x,
        pixel.y,
        radius,
      );

      halo.addColorStop(
        0,
        loop.dialogueKind === "response"
          ? `hsla(${glyphHue}, 90%, 82%, ${0.26 * glow})`
          : getRoleColor(loop.role, 0.22 * glow, 16, 6),
      );
      halo.addColorStop(
        0.52,
        loop.dialogueKind === "response"
          ? `hsla(${glyphHue}, 84%, 70%, ${0.12 * glow})`
          : getRoleColor(loop.role, 0.1 * glow, 4, 2),
      );
      halo.addColorStop(
        1,
        loop.dialogueKind === "response"
          ? `hsla(${glyphHue}, 84%, 68%, 0)`
          : getRoleColor(loop.role, 0, 0, 0),
      );
      context.fillStyle = halo;
      context.beginPath();
      context.arc(pixel.x, pixel.y, radius, 0, TAU);
      context.fill();

      drawRoleGlyph(
        context,
        loop.role,
        pixel.x,
        pixel.y,
        (note.trigger ? 5.2 : 4) + note.accent * 2 + (active ? 2.2 : 0),
        0.42 + glow * 0.42,
        angle,
        loop.dialogueKind === "response" ? glyphHue : undefined,
      );

      if (active) {
        context.strokeStyle = getRoleColor(loop.role, 0.52, 18, 4);
        context.lineWidth = 1;
        context.beginPath();
        context.arc(pixel.x, pixel.y, radius * 0.62, 0, TAU);
        context.stroke();
      }
    };

    const warpPathForLoop = (
      points: NormalizedPoint[],
      loop: ContourLoop,
      cycleProgress: number,
      now: number,
    ) =>
      points.map((pointValue, index) =>
        warpPointForRole(
          pointValue,
          points[Math.min(index + 1, points.length - 1)] ?? pointValue,
          loop.role,
          loop.motionSeed,
          cycleProgress + index / Math.max(points.length - 1, 1),
          now,
        ),
      );

    const frame = (now: number) => {
      const size = sizeRef.current;
      const state = simulationRef.current;
      const harmonic = harmonicStateRef.current;
      const barNumber = getBarNumberAtTime(now, clockStartMsRef.current, harmonic);
      const chordSymbol = getChordForBar(barNumber, harmonic);
      const chordHue = getCurrentChordHue(harmonic, chordSymbol);
      const barProgress = getBarProgressAtTime(now, clockStartMsRef.current, harmonic);
      const activeRoles = new Set(
        state.loops
          .filter((loop) => now >= loop.scheduledAtMs)
          .map((loop) => loop.role),
      );
      const cadenceShouldTrigger =
        barNumber > 0 &&
        barNumber % CADENCE_BAR_INTERVAL === 0 &&
        activeRoles.size > 1;

      if (barNumber !== harmonic.currentBar) {
        harmonic.currentBar = barNumber;
        setHarmonicState({ ...harmonic });
      }

      if (lastBarTriggerRef.current !== barNumber) {
        lastBarTriggerRef.current = barNumber;
        playChordPad(chordSymbol, barNumber);
        pushFlash(point(0.5, 0.5, now), "pad", chordHue, 0.74, "bar");
        if (cadenceShouldTrigger) {
          triggerCadenceEvent(
            barNumber,
            clamp(0.74 + activeRoles.size * 0.12, 0.74, 1.28),
          );
        }
      }

      const idleAge = now - lastInteractionAtRef.current;
      state.surfaceEnergy = mix(
        state.surfaceEnergy,
        clamp(
          0.16 +
            state.loops.length * 0.05 +
            state.activeTouches.size * 0.16 +
            (cadenceShouldTrigger ? 0.08 : 0) +
            (idleAge < IDLE_PAD_AFTER_MS ? 0.08 : 0),
          0.16,
          1,
        ),
        0.04,
      );

      state.cadenceEvents = state.cadenceEvents.filter(
        (event) => now - event.bornAt < event.ttl,
      );
      const cadenceGlow = state.cadenceEvents.reduce((strongest, event) => {
        const age = now - event.bornAt;
        const progress = clamp(age / event.ttl, 0, 1);
        const intensity = event.intensity * (1 - progress) ** 0.5;
        return Math.max(strongest, intensity);
      }, 0);

      context.clearRect(0, 0, size.width, size.height);

      const background = context.createLinearGradient(0, 0, size.width, size.height);
      background.addColorStop(0, "#041117");
      background.addColorStop(0.45, "#0b2426");
      background.addColorStop(1, "#180d10");
      context.fillStyle = background;
      context.fillRect(0, 0, size.width, size.height);

      const ritualCore = context.createRadialGradient(
        size.width * 0.5,
        size.height * 0.5,
        0,
        size.width * 0.5,
        size.height * 0.5,
        Math.max(size.width, size.height) * 0.62,
      );
      ritualCore.addColorStop(0, "rgba(248, 241, 228, 0.02)");
      ritualCore.addColorStop(0.64, "rgba(248, 241, 228, 0.01)");
      ritualCore.addColorStop(1, "rgba(248, 241, 228, 0)");
      context.fillStyle = ritualCore;
      context.fillRect(0, 0, size.width, size.height);

      const harmonicWash = context.createRadialGradient(
        size.width * 0.5,
        size.height * 0.48,
        0,
        size.width * 0.5,
        size.height * 0.48,
        Math.max(size.width, size.height) * 0.7,
      );
      harmonicWash.addColorStop(
        0,
        `hsla(${chordHue}, 92%, 68%, ${
          0.08 + state.surfaceEnergy * 0.08 + cadenceGlow * 0.04
        })`,
      );
      harmonicWash.addColorStop(
        0.58,
        `rgba(109, 209, 200, ${0.03 + state.surfaceEnergy * 0.03 + cadenceGlow * 0.02})`,
      );
      harmonicWash.addColorStop(1, "rgba(4, 17, 23, 0)");
      context.fillStyle = harmonicWash;
      context.fillRect(0, 0, size.width, size.height);

      for (let ringIndex = 1; ringIndex <= 5; ringIndex += 1) {
        context.strokeStyle = "rgba(239, 233, 221, 0.04)";
        context.lineWidth = ringIndex === 3 ? 1.2 : 1;
        context.beginPath();
        context.arc(
          size.width * 0.5,
          size.height * 0.5,
          Math.min(size.width, size.height) * (0.12 + ringIndex * 0.11),
          0,
          TAU,
        );
        context.stroke();
      }

      for (let laneIndex = 1; laneIndex <= 5; laneIndex += 1) {
        const y = (size.height / 6) * laneIndex;
        context.strokeStyle = "rgba(239, 233, 221, 0.035)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(size.width * 0.08, y);
        context.lineTo(size.width * 0.92, y);
        context.stroke();
      }

      for (let spokeIndex = 0; spokeIndex < 12; spokeIndex += 1) {
        const angle = (spokeIndex / 12) * TAU;
        context.strokeStyle = "rgba(239, 233, 221, 0.024)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(size.width * 0.5, size.height * 0.5);
        context.lineTo(
          size.width * 0.5 + Math.cos(angle) * size.width * 0.48,
          size.height * 0.5 + Math.sin(angle) * size.height * 0.48,
        );
        context.stroke();
      }

      const sweepX = size.width * barProgress;
      const sweep = context.createLinearGradient(
        sweepX - 90,
        0,
        sweepX + 90,
        0,
      );
      sweep.addColorStop(0, "rgba(255,255,255,0)");
      sweep.addColorStop(0.5, `hsla(${chordHue}, 94%, 76%, 0.14)`);
      sweep.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = sweep;
      context.fillRect(sweepX - 90, 0, 180, size.height);

      state.cadenceEvents.forEach((event) => {
        const age = now - event.bornAt;
        const progress = clamp(age / event.ttl, 0, 1);
        const bloomRadius =
          Math.min(size.width, size.height) *
          (0.12 + event.intensity * 0.16 + easeOutCubic(progress) * 0.62);
        const bloom = context.createRadialGradient(
          size.width * 0.5,
          size.height * 0.5,
          0,
          size.width * 0.5,
          size.height * 0.5,
          bloomRadius,
        );

        bloom.addColorStop(
          0,
          `hsla(${event.hue}, 96%, 86%, ${(1 - progress) * 0.12 * event.intensity})`,
        );
        bloom.addColorStop(
          0.46,
          `hsla(${event.hue}, 88%, 72%, ${(1 - progress) * 0.06 * event.intensity})`,
        );
        bloom.addColorStop(1, `hsla(${event.hue}, 82%, 68%, 0)`);
        context.fillStyle = bloom;
        context.fillRect(0, 0, size.width, size.height);

        const sigilAlpha = (1 - progress) * (0.24 + event.intensity * 0.12);
        for (let ringIndex = 0; ringIndex < 3; ringIndex += 1) {
          context.strokeStyle = `hsla(${event.hue}, 92%, 84%, ${
            sigilAlpha * (1 - ringIndex * 0.18)
          })`;
          context.lineWidth = 1.2 + ringIndex * 0.6;
          context.beginPath();
          context.arc(
            size.width * 0.5,
            size.height * 0.5,
            Math.min(size.width, size.height) *
              (0.08 + ringIndex * 0.08 + progress * 0.06),
            0,
            TAU,
          );
          context.stroke();
        }

        for (let spokeIndex = 0; spokeIndex < 8; spokeIndex += 1) {
          const angle = (spokeIndex / 8) * TAU + progress * 0.18;
          const inner = Math.min(size.width, size.height) * 0.06;
          const outer = Math.min(size.width, size.height) * (0.12 + progress * 0.06);
          context.strokeStyle = `hsla(${event.hue}, 90%, 88%, ${sigilAlpha * 0.86})`;
          context.lineWidth = 1;
          context.beginPath();
          context.moveTo(
            size.width * 0.5 + Math.cos(angle) * inner,
            size.height * 0.5 + Math.sin(angle) * inner,
          );
          context.lineTo(
            size.width * 0.5 + Math.cos(angle) * outer,
            size.height * 0.5 + Math.sin(angle) * outer,
          );
          context.stroke();
        }

        context.strokeStyle = `hsla(${event.hue}, 96%, 90%, ${sigilAlpha})`;
        context.lineWidth = 1.3;
        context.beginPath();
        for (let index = 0; index < 6; index += 1) {
          const angle = (index / 6) * TAU - Math.PI / 2 + progress * 0.12;
          const x = size.width * 0.5 + Math.cos(angle) * Math.min(size.width, size.height) * 0.145;
          const y = size.height * 0.5 + Math.sin(angle) * Math.min(size.width, size.height) * 0.145;
          if (index === 0) {
            context.moveTo(x, y);
          } else {
            context.lineTo(x, y);
          }
        }
        context.closePath();
        context.stroke();
      });
      const glyphBoost = 1 + cadenceGlow * 0.55;

      state.flashes = state.flashes.filter((flash) => now - flash.bornAt < flash.ttl);

      state.flashes.forEach((flash) => {
        const pixel = normalizedToPixels(flash.point, size);
        const age = now - flash.bornAt;
        const progress = clamp(age / flash.ttl, 0, 1);
        const flashHue = flash.response ? RESPONSE_GLYPH_HUE : flash.hue;
        const radius =
          (flash.kind === "bar" ? 24 : 12) +
          flash.strength * (flash.kind === "bar" ? 130 : 58) * easeOutCubic(progress);
        const alpha =
          (1 - progress) *
          (flash.kind === "bar" ? 0.22 : flash.kind === "touch" ? 0.28 : 0.36) *
          (1 + cadenceGlow * 0.46);
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
          flash.kind === "bar"
            ? `hsla(${flash.hue}, 92%, 78%, ${alpha * 0.22})`
            : flash.response
              ? `hsla(${flashHue}, 88%, 80%, ${alpha * 0.26})`
              : getRoleColor(flash.role, alpha * 0.24, 14, 8),
        );
        gradient.addColorStop(
          0.54,
          flash.kind === "bar"
            ? `hsla(${flash.hue}, 86%, 62%, ${alpha * 0.1})`
            : flash.response
              ? `hsla(${flashHue}, 82%, 68%, ${alpha * 0.12})`
              : getRoleColor(flash.role, alpha * 0.1, 0, 0),
        );
        gradient.addColorStop(
          1,
          flash.response
            ? `hsla(${flashHue}, 82%, 68%, 0)`
            : getRoleColor(flash.role, 0, 0, 0),
        );

        context.fillStyle = gradient;
        context.beginPath();
        context.arc(pixel.x, pixel.y, radius, 0, TAU);
        context.fill();

        drawRoleGlyph(
          context,
          flash.role,
          pixel.x,
          pixel.y,
          (flash.kind === "bar" ? 8.4 : 5.6) + flash.strength * 2.8,
          alpha * (flash.kind === "bar" ? 0.9 : 1),
          now * 0.0014,
          flash.response ? flashHue : undefined,
        );
      });

      state.loops.forEach((loop) => {
        const loopDurationMs = getBarMs(harmonic) * loop.loopBars;
        const visualHue =
          loop.dialogueKind === "response"
            ? mix(loop.hue, RESPONSE_GLYPH_HUE, 0.6)
            : loop.hue;
        const dormantPath = warpPathForLoop(loop.points, loop, barProgress * 0.22, now);

        context.save();
        context.shadowBlur = 20 + loop.energy * 18 + cadenceGlow * 10;
        context.shadowColor =
          loop.dialogueKind === "response"
            ? `hsla(${visualHue}, 84%, 74%, 0.18)`
            : getRoleColor(loop.role, 0.18, 8, 4);
        drawPolyline(
          context,
          size,
          dormantPath,
          loop.dialogueKind === "response"
            ? `hsla(${visualHue}, 78%, 70%, ${0.1 + loop.energy * 0.08})`
            : getRoleColor(loop.role, 0.08 + loop.energy * 0.08, 6, 4),
          loop.role === "pad" ? 7.4 : loop.role === "bass" ? 6.4 : 4.8,
        );
        context.restore();

        drawPolyline(
          context,
          size,
          dormantPath,
          loop.dialogueKind === "response"
            ? `hsla(${visualHue}, 82%, 78%, ${0.18 + loop.energy * 0.14})`
            : getRoleColor(loop.role, 0.18 + loop.energy * 0.12, 12, 8),
          loop.role === "percussion" ? 1.8 : 2.1,
        );

        loop.anchors.forEach((anchor, index) => {
          const note = loop.phraseNotes[index];
          if (!note) {
            return;
          }

          const nextAnchor =
            loop.anchors[Math.min(index + 1, loop.anchors.length - 1)] ?? anchor;
          drawNoteGlyph(
            loop,
            anchor.point,
            nextAnchor.point,
            false,
            note,
            barProgress * 0.2,
            now,
            chordHue,
            glyphBoost,
          );
        });

        if (now < loop.scheduledAtMs) {
          return;
        }

        const elapsed = now - loop.scheduledAtMs;
        const cycleIndex = Math.floor(elapsed / loopDurationMs);
        const cycleElapsed = elapsed - cycleIndex * loopDurationMs;
        const cycleProgress = clamp(cycleElapsed / loopDurationMs, 0, 0.9999);
        const cycleStartBar =
          getBarNumberAtTime(loop.scheduledAtMs, clockStartMsRef.current, harmonic) +
          cycleIndex * loop.loopBars;
        const cycleChord = getChordForBar(cycleStartBar, harmonic);
        const phraseToken = `${cycleStartBar}:${cycleChord}:${harmonic.tonic}:${harmonic.mode}`;

        if (loop.lastPhraseToken !== phraseToken) {
          loop.phraseNotes = buildPhraseNotes(loop, harmonic, cycleChord);
          loop.lastPhraseToken = phraseToken;
        }

        const activeStepIndex = Math.min(
          loop.noteCount - 1,
          Math.floor(cycleProgress * loop.noteCount),
        );
        const triggerToken = `${cycleIndex}:${activeStepIndex}`;
        const activeNote = loop.phraseNotes[activeStepIndex];

        if (
          activeNote &&
          activeNote.trigger &&
          loop.lastTriggeredToken !== triggerToken
        ) {
          const anchor = loop.anchors[activeStepIndex];
          const nextAnchor =
            loop.anchors[Math.min(activeStepIndex + 1, loop.anchors.length - 1)] ?? anchor;
          const flashedPoint = warpPointForRole(
            anchor.point,
            nextAnchor.point,
            loop.role,
            loop.motionSeed,
            cycleProgress + anchor.drawRatio,
            now,
          );
          const noteHue = activeNote.chordTone
            ? mix(getDialogueHue(loop, chordHue), chordHue, 0.18)
            : getDialogueHue(loop, chordHue);
          playMelodicTone({
            midi: activeNote.midi,
            hue: noteHue,
            accent: activeNote.accent,
            durationMs:
              (loopDurationMs / loop.noteCount) *
              Math.max(1, activeNote.gateSteps) *
              (activeNote.sustain ? 1.08 : 0.9),
            voice: loop.role,
          });
          pushFlash(
            flashedPoint,
            loop.role,
            noteHue,
            0.62 + activeNote.accent * 0.22,
            "note",
            loop.dialogueKind === "response",
          );
          loop.lastTriggeredToken = triggerToken;
        }

        const retracePath = warpPathForLoop(
          buildPartialPath(loop.points, cycleProgress),
          loop,
          cycleProgress,
          now,
        );
        context.save();
        context.shadowBlur = 18 + loop.energy * 18 + cadenceGlow * 12;
        context.shadowColor =
          loop.dialogueKind === "response"
            ? `hsla(${visualHue}, 88%, 80%, 0.24)`
            : getRoleColor(loop.role, 0.24, 18, 10);
        drawPolyline(
          context,
          size,
          retracePath,
          loop.dialogueKind === "response"
            ? `hsla(${visualHue}, 92%, 84%, ${0.3 + loop.energy * 0.16})`
            : getRoleColor(loop.role, 0.28 + loop.energy * 0.16, 20, 12),
          loop.role === "pad" ? 4.8 : loop.role === "bass" ? 4.2 : 3.4,
        );
        context.restore();

        const rawHead = samplePath(
          loop.points,
          pathDuration(loop.points) * cycleProgress,
        );
        const rawHeadNext = samplePath(
          loop.points,
          pathDuration(loop.points) * Math.min(1, cycleProgress + 0.04),
        );
        const head = warpPointForRole(
          rawHead,
          rawHeadNext,
          loop.role,
          loop.motionSeed,
          cycleProgress,
          now,
        );
        const headPixel = normalizedToPixels(head, size);
        const headRadius =
          loop.role === "pad" ? 34 : loop.role === "bass" ? 30 : loop.role === "echo" ? 32 : 26;
        const headGlow = context.createRadialGradient(
          headPixel.x,
          headPixel.y,
          0,
          headPixel.x,
          headPixel.y,
          headRadius,
        );
        headGlow.addColorStop(
          0,
          loop.dialogueKind === "response"
            ? `hsla(${visualHue}, 90%, 84%, 0.44)`
            : getRoleColor(loop.role, 0.42, 18, 8),
        );
        headGlow.addColorStop(
          0.56,
          loop.dialogueKind === "response"
            ? `hsla(${visualHue}, 82%, 72%, 0.18)`
            : getRoleColor(loop.role, 0.16, 6, 2),
        );
        headGlow.addColorStop(
          1,
          loop.dialogueKind === "response"
            ? `hsla(${visualHue}, 82%, 68%, 0)`
            : getRoleColor(loop.role, 0, 0, 0),
        );
        context.fillStyle = headGlow;
        context.beginPath();
        context.arc(headPixel.x, headPixel.y, headRadius, 0, TAU);
        context.fill();

        drawRoleGlyph(
          context,
          loop.role,
          headPixel.x,
          headPixel.y,
          6.2 + (activeNote?.accent ?? 0.4) * 3.2,
          0.88,
          now * 0.0016,
          loop.dialogueKind === "response" ? visualHue : undefined,
        );

        loop.anchors.forEach((anchor, index) => {
          const note = loop.phraseNotes[index];
          if (!note) {
            return;
          }

          const nextAnchor =
            loop.anchors[Math.min(index + 1, loop.anchors.length - 1)] ?? anchor;
          drawNoteGlyph(
            loop,
            anchor.point,
            nextAnchor.point,
            index === activeStepIndex,
            note,
            cycleProgress,
            now,
            chordHue,
            glyphBoost,
          );
        });
      });

      for (const touch of state.activeTouches.values()) {
        const liveProgress = clamp((now - touch.bornAt) / 1200, 0, 1);
        context.save();
        context.shadowBlur = 16 + liveProgress * 12;
        context.shadowColor = `hsla(${touch.hue}, 100%, 78%, 0.2)`;
        drawPolyline(
          context,
          size,
          touch.points,
          `hsla(${touch.hue}, 94%, 80%, 0.4)`,
          3 + liveProgress * 2.2,
        );
        context.restore();

        const head = touch.points.at(-1);
        if (head) {
          const pixel = normalizedToPixels(head, size);
          context.fillStyle = `hsla(${touch.hue}, 100%, 88%, 0.78)`;
          context.beginPath();
          context.arc(pixel.x, pixel.y, 5.4, 0, TAU);
          context.fill();
        }
      }

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
    const pointValue = makeSurfacePoint(event, surface, now);
    const previewRole =
      nextRoleOverrideRef.current === "auto" ? null : nextRoleOverrideRef.current;
    const hue = previewRole
      ? getLoopHue(previewRole)
      : chooseHue(pointValue, simulationRef.current.loops.length);

    simulationRef.current.activeTouches.set(event.pointerId, {
      pointerId: event.pointerId,
      bornAt: now,
      lastSampleAt: now,
      hue,
      previewRole,
      points: [pointValue],
      travel: 0,
    });
    lastInteractionAtRef.current = now;
    syncActiveCount();
    pushFlash(pointValue, previewRole ?? "lead", hue, 0.62, "touch");
    playMelodicTone({
      midi: getPreviewMidi(pointValue, now, previewRole),
      hue,
      accent: 0.44,
      durationMs: getBeatMs(harmonicStateRef.current) * 0.34,
      voice: previewRole ?? "touch",
    });
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
    const pointValue = makeSurfacePoint(event, surface, now);
    const lastPoint = touch.points.at(-1);
    if (!lastPoint) {
      touch.points.push(pointValue);
      return;
    }

    const gap = distance(lastPoint, pointValue);
    if (gap < 0.003 && now - touch.lastSampleAt < 16) {
      return;
    }

    touch.travel += gap;
    touch.lastSampleAt = now;
    touch.points.push(pointValue);
    if (touch.points.length > MAX_POINTS_PER_GESTURE) {
      touch.points.shift();
    }

    lastInteractionAtRef.current = now;
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
    simulationRef.current.loops = [];
    simulationRef.current.flashes = [];
    simulationRef.current.cadenceEvents = [];
    simulationRef.current.recentGestures = [];
    simulationRef.current.surfaceEnergy = 0.16;
    lastInteractionAtRef.current = performance.now();
    syncMemory();
    syncActiveCount();
  };

  const toggleMuted = async () => {
    await ensureAudio();
    soundRef.current.muted = !soundRef.current.muted;
    setIsMuted(soundRef.current.muted);
  };

  const toggleCallResponse = () => {
    const nextValue = !callResponseEnabledRef.current;
    callResponseEnabledRef.current = nextValue;
    setCallResponseEnabled(nextValue);
    lastInteractionAtRef.current = performance.now();
  };

  const selectProgression = (index: number) => {
    const option = PROGRESSION_OPTIONS[index];
    const nextState = {
      ...harmonicStateRef.current,
      progression: option.progression,
    };

    harmonicStateRef.current = nextState;
    setHarmonicState(nextState);
    setProgressionIndex(index);
    lastInteractionAtRef.current = performance.now();
  };

  const selectNextRoleOverride = (value: VoiceRoleOverride) => {
    nextRoleOverrideRef.current = value;
    setNextRoleOverride(value);
    lastInteractionAtRef.current = performance.now();
  };

  const stopSurfaceGesture = (event: { stopPropagation: () => void }) => {
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
              {Array.from({ length: MAX_LOOPS }).map((_, index) => {
                const chip = memory[index];
                return (
                  <span
                    className="memory-strip__chip"
                    key={chip ? chip.id : `empty-${index}`}
                    style={
                      chip
                        ? ({
                            "--chip-hue": `${chip.hue}`,
                            "--chip-scale": `${0.9 + index * 0.02}`,
                          } as CSSProperties)
                        : undefined
                    }
                    data-filled={Boolean(chip)}
                  />
                );
              })}
            </div>

            <div className="surface-cockpit__readout">
              <p>Choir x{memory.length}</p>
              <p>{ensembleLabel}</p>
            </div>
          </div>

          <div className="surface-hud" aria-live="polite">
            <p>
              <span className="surface-hud__label">Key</span>
              <span className="surface-hud__value">{keyLabel}</span>
            </p>
            <p>
              <span className="surface-hud__label">Chord</span>
              <span className="surface-hud__value">{currentChord}</span>
            </p>
            <p>
              <span className="surface-hud__label">Bar</span>
              <span className="surface-hud__value">{harmonicState.currentBar}</span>
            </p>
          </div>

          {!captureMode ? (
            <>
              <div
                className="surface-progression-strip"
                onClick={stopSurfaceGesture}
                onPointerCancel={stopSurfaceGesture}
                onPointerDown={stopSurfaceGesture}
                onPointerMove={stopSurfaceGesture}
                onPointerUp={stopSurfaceGesture}
              >
                {PROGRESSION_OPTIONS.map((option, index) => (
                  <button
                    key={option.id}
                    className={`surface-mini-chip${
                      progressionIndex === index ? " surface-mini-chip--active" : ""
                    }`}
                    type="button"
                    onClick={() => selectProgression(index)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div
                className="surface-role-palette"
                onClick={stopSurfaceGesture}
                onPointerCancel={stopSurfaceGesture}
                onPointerDown={stopSurfaceGesture}
                onPointerMove={stopSurfaceGesture}
                onPointerUp={stopSurfaceGesture}
              >
                <button
                  className={`surface-role-chip${
                    nextRoleOverride === "auto" ? " surface-role-chip--active" : ""
                  }`}
                  type="button"
                  onClick={() => selectNextRoleOverride("auto")}
                >
                  <span className="surface-role-chip__glyph">Auto</span>
                </button>

                {VOICE_ROLE_ORDER.map((role) => (
                  <button
                    key={role}
                    className={`surface-role-chip${
                      nextRoleOverride === role ? " surface-role-chip--active" : ""
                    }`}
                    type="button"
                    onClick={() => selectNextRoleOverride(role)}
                    title={`Next contour: ${formatVoiceRoleLabel(role)}`}
                    style={
                      {
                        "--role-hue": `${getLoopHue(role)}`,
                      } as CSSProperties
                    }
                  >
                    <span className="surface-role-chip__glyph">
                      {getVoiceRoleGlyphLabel(role)}
                    </span>
                    <span className="surface-role-chip__label">
                      {formatVoiceRoleLabel(role)}
                    </span>
                  </button>
                ))}
              </div>

              <div
                className="surface-controls"
                onClick={stopSurfaceGesture}
                onPointerCancel={stopSurfaceGesture}
                onPointerDown={stopSurfaceGesture}
                onPointerMove={stopSurfaceGesture}
                onPointerUp={stopSurfaceGesture}
              >
                <button className="surface-tool" type="button" onClick={toggleCallResponse}>
                  {callResponseEnabled ? "Answer on" : "Answer off"}
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
            </>
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
