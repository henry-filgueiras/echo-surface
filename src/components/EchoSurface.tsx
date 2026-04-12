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
  hue: number;
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
};

type PlaybackFlash = {
  id: number;
  bornAt: number;
  ttl: number;
  point: NormalizedPoint;
  hue: number;
  strength: number;
  kind: "touch" | "note" | "bar";
};

type AudioEngine = {
  context: AudioContext | null;
  compressor: DynamicsCompressorNode | null;
  master: GainNode | null;
  fxSend: GainNode | null;
  muted: boolean;
  masterLevel: number;
};

type SimulationState = {
  activeTouches: Map<number, ActiveTouch>;
  loops: ContourLoop[];
  flashes: PlaybackFlash[];
  surfaceEnergy: number;
};

type MemoryChip = {
  id: number;
  hue: number;
};

type ToneVoice = "lead" | "touch" | "bar";

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

const buildPhraseNotes = (
  loop: ContourLoop,
  harmonicState: HarmonicState,
  chordSymbol: string,
) => {
  const scaleMidis = buildExtendedScaleMidis(harmonicState);
  const chordPitchClasses = getChordPitchClasses(harmonicState, chordSymbol);
  const firstAnchor = loop.anchors[0];
  const startTarget = loop.desiredRegisterMidi + (0.5 - firstAnchor.point.y) * 4;
  let scaleIndex = findNearestChordToneIndex(
    scaleMidis,
    startTarget,
    chordPitchClasses,
  );

  const notes = loop.anchors.map((anchor, index) => {
    if (index > 0) {
      const rawIndex = clamp(
        scaleIndex + anchor.movement,
        0,
        scaleMidis.length - 1,
      );
      const wantsStability =
        anchor.accent ||
        anchor.sustain ||
        index === loop.anchors.length - 1 ||
        anchor.emphasis > 0.62;

      if (wantsStability) {
        const chordIndex = findNearestChordToneIndex(
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
      scaleIndex = findNearestChordToneIndex(
        scaleMidis,
        scaleMidis[scaleIndex],
        chordPitchClasses,
      );
    }

    const midi = scaleMidis[scaleIndex];
    const phraseNote: PhraseNote = {
      stepIndex: anchor.stepIndex,
      midi,
      trigger: true,
      gateSteps: 1,
      chordTone: chordPitchClasses.includes(modulo(midi, 12)),
      accent: clamp(
        0.28 + anchor.emphasis * 0.54 + (anchor.leap ? 0.12 : 0),
        0.2,
        1,
      ),
      sustain: anchor.sustain,
      leap: anchor.leap,
      movement: anchor.movement,
    };

    return phraseNote;
  });

  for (let index = 1; index < notes.length; index += 1) {
    if (loop.anchors[index].sustain && notes[index].midi === notes[index - 1].midi) {
      notes[index].trigger = false;
      notes[index - 1].gateSteps += 1;
    }
  }

  return notes;
};

const createLoopRecord = ({
  id,
  bornAt,
  hue,
  energy,
  points,
  scheduledAtMs,
  synthetic,
}: {
  id: number;
  bornAt: number;
  hue: number;
  energy: number;
  points: NormalizedPoint[];
  scheduledAtMs: number;
  synthetic: boolean;
}): ContourLoop => {
  const contour = analyzeContour(points);

  return {
    id,
    bornAt,
    hue,
    energy,
    points: coerceContourPoints(points),
    anchors: contour.anchors,
    noteCount: contour.noteCount,
    desiredRegisterMidi: contour.desiredRegisterMidi,
    loopBars: LOOP_BARS,
    scheduledAtMs,
    lastTriggeredToken: "",
    lastPhraseToken: "",
    phraseNotes: [],
    synthetic,
  };
};

const getCurrentChordHue = (harmonicState: HarmonicState, chordSymbol: string) => {
  const tonicPitchClass = Math.max(0, noteNameToPitchClass(harmonicState.tonic));
  const chordRootPitchClass =
    getChordPitchClasses(harmonicState, chordSymbol)[0] ?? tonicPitchClass;

  return 20 + modulo(chordRootPitchClass * 27 + tonicPitchClass * 11, 220);
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
    points: NormalizedPoint[],
    hue: number,
    barOffset: number,
    phase: number,
    energy: number,
  ) =>
    createLoopRecord({
      id: nextLoopId++,
      bornAt: now - 2200 + phase,
      hue,
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
          [
            point(0.16, 0.63, 0),
            point(0.28, 0.53, 160),
            point(0.44, 0.4, 340),
            point(0.64, 0.46, 620),
            point(0.83, 0.32, 880),
          ],
          34,
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
          hue: 34,
          strength: 0.82,
          kind: "note" as const,
        },
      ],
    };
  }

  if (preset === "trace") {
    return {
      loops: [
        makeLoop(
          [
            point(0.12, 0.7, 0),
            point(0.26, 0.56, 180),
            point(0.42, 0.37, 360),
            point(0.61, 0.29, 580),
            point(0.84, 0.41, 860),
          ],
          172,
          2,
          0,
          0.92,
        ),
        makeLoop(
          [
            point(0.18, 0.25, 0),
            point(0.34, 0.36, 180),
            point(0.49, 0.52, 380),
            point(0.66, 0.64, 620),
            point(0.86, 0.57, 880),
          ],
          28,
          1,
          140,
          0.84,
        ),
      ],
      flashes: [],
    };
  }

  return {
    loops: [
      makeLoop(
        [
          point(0.14, 0.56, 0),
          point(0.3, 0.46, 170),
          point(0.46, 0.46, 370),
          point(0.66, 0.45, 620),
          point(0.85, 0.29, 920),
        ],
        122,
        1,
        0,
        0.96,
      ),
      makeLoop(
        [
          point(0.18, 0.74, 0),
          point(0.34, 0.7, 170),
          point(0.46, 0.71, 340),
          point(0.61, 0.72, 580),
          point(0.83, 0.69, 860),
        ],
        74,
        0,
        180,
        0.74,
      ),
    ],
    flashes: [],
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
    muted: false,
    masterLevel: 0.2,
  });
  const simulationRef = useRef<SimulationState>({
    activeTouches: new Map(),
    loops: [],
    flashes: [],
    surfaceEnergy: 0.18,
  });
  const harmonicStateRef = useRef<HarmonicState>(DEFAULT_HARMONIC_STATE);
  const clockStartMsRef = useRef(performance.now());
  const lastBarTriggerRef = useRef(0);
  const lastInteractionAtRef = useRef(performance.now());
  const flashIdRef = useRef(0);
  const loopIdRef = useRef(0);
  const [harmonicState, setHarmonicState] = useState(DEFAULT_HARMONIC_STATE);
  const [memory, setMemory] = useState<MemoryChip[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const currentChord = useMemo(
    () => getChordForBar(harmonicState.currentBar, harmonicState),
    [harmonicState],
  );
  const keyLabel = `${harmonicState.tonic} ${harmonicState.mode}`;
  const progressionLabel = harmonicState.progression.join(" • ");
  const whisperLabel =
    activeCount > 0
      ? "shape the phrase left to right • rise climbs • flat holds • drops fall"
      : "draw a contour left to right and let the harmony reframe it";

  const syncMemory = () => {
    setMemory(
      simulationRef.current.loops.map((loop) => ({
        id: loop.id,
        hue: loop.hue,
      })),
    );
  };

  const syncActiveCount = () => {
    setActiveCount(simulationRef.current.activeTouches.size);
  };

  const pushFlash = (
    pointValue: NormalizedPoint,
    hue: number,
    strength: number,
    kind: PlaybackFlash["kind"],
  ) => {
    simulationRef.current.flashes.push({
      id: flashIdRef.current++,
      bornAt: performance.now(),
      ttl: kind === "bar" ? 1200 : 920,
      point: pointValue,
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
    }

    if (engine.context.state === "suspended") {
      await engine.context.resume();
    }
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

    primary.type = isBar ? "triangle" : "sawtooth";
    secondary.type = isBar ? "sine" : "triangle";
    sub.type = "sine";

    primary.detune.value = isTouch ? -3 : -7;
    secondary.detune.value = isTouch ? 3 : 7;

    primary.frequency.setValueAtTime(frequency, now);
    secondary.frequency.setValueAtTime(frequency * (isBar ? 1.5 : 1.003), now);
    sub.frequency.setValueAtTime(frequency * (isBar ? 0.5 : 0.5), now);

    filter.type = isBar ? "lowpass" : "bandpass";
    filter.Q.value = isBar ? 1.1 : 2.4;
    filter.frequency.setValueAtTime(
      (isBar ? 420 : 820) + accent * 1400 + brightness * 500,
      now,
    );
    filter.frequency.exponentialRampToValueAtTime(
      isBar ? 180 : 260,
      now + duration,
    );

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(
      (isBar ? 0.055 : isTouch ? 0.045 : 0.072) + accent * 0.06,
      now + (isBar ? 0.04 : 0.018),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    send.gain.value = isBar ? 0.08 : 0.16;

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

  const getPreviewMidi = (pointValue: NormalizedPoint, timeMs: number) => {
    const harmonic = harmonicStateRef.current;
    const barNumber = getBarNumberAtTime(timeMs, clockStartMsRef.current, harmonic);
    const chordSymbol = getChordForBar(barNumber, harmonic);
    const scale = buildExtendedScaleMidis(harmonic);
    const chordPitchClasses = getChordPitchClasses(harmonic, chordSymbol);
    const target = clamp(Math.round(78 - pointValue.y * 24), 56, 84);

    return scale[findNearestChordToneIndex(scale, target, chordPitchClasses)];
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
    const contourPoints = coerceContourPoints(relativePoints);
    const now = performance.now();
    const harmonic = harmonicStateRef.current;
    const currentBarIndex = getBarIndexAtTime(now, clockStartMsRef.current, harmonic);
    const nextBarStartMs =
      clockStartMsRef.current + (currentBarIndex + 1) * getBarMs(harmonic);
    const energy = clamp(0.42 + touch.travel * 1.4, 0.42, 1.2);
    const endPoint = contourPoints.at(-1) ?? averagePoint(contourPoints);

    simulationRef.current.loops = [
      ...simulationRef.current.loops,
      createLoopRecord({
        id: loopIdRef.current++,
        bornAt: now,
        hue: touch.hue,
        energy,
        points: contourPoints,
        scheduledAtMs: nextBarStartMs,
        synthetic: false,
      }),
    ].slice(-MAX_LOOPS);

    simulationRef.current.surfaceEnergy = clamp(
      simulationRef.current.surfaceEnergy + 0.1 + energy * 0.08,
      0.14,
      1.2,
    );
    lastInteractionAtRef.current = now;

    pushFlash(endPoint, touch.hue, 0.84, "touch");
    playMelodicTone({
      midi: getPreviewMidi(endPoint, now),
      hue: touch.hue,
      accent: 0.76,
      durationMs: getBeatMs(harmonic) * 0.72,
      voice: "touch",
    });

    syncMemory();
  };

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
      pointValue: NormalizedPoint,
      nextPoint: NormalizedPoint,
      hue: number,
      active: boolean,
      note: PhraseNote,
    ) => {
      const size = sizeRef.current;
      const pixel = normalizedToPixels(pointValue, size);
      const nextPixel = normalizedToPixels(nextPoint, size);
      const angle = Math.atan2(nextPixel.y - pixel.y, nextPixel.x - pixel.x);
      const glow = active ? 1 : 0.36;
      const scale = 0.84 + note.accent * 0.42 + (active ? 0.28 : 0);

      context.save();
      context.translate(pixel.x, pixel.y);
      context.rotate(angle);
      context.globalCompositeOperation = "lighter";

      const halo = context.createRadialGradient(0, 0, 0, 0, 0, 16 * scale);
      halo.addColorStop(0, `hsla(${hue}, 100%, 84%, ${0.24 * glow})`);
      halo.addColorStop(0.58, `hsla(${hue}, 92%, 66%, ${0.12 * glow})`);
      halo.addColorStop(1, `hsla(${hue}, 92%, 60%, 0)`);
      context.fillStyle = halo;
      context.beginPath();
      context.arc(0, 0, 16 * scale, 0, TAU);
      context.fill();

      context.fillStyle = `hsla(${hue}, 100%, 92%, ${0.68 + glow * 0.18})`;
      context.beginPath();
      context.ellipse(0, 0, 6 * scale, 4.6 * scale, -0.4, 0, TAU);
      context.fill();

      if (!note.sustain) {
        context.strokeStyle = `hsla(${hue}, 100%, 94%, ${0.58 + glow * 0.22})`;
        context.lineWidth = 1.3;
        context.beginPath();
        context.moveTo(4.5 * scale, -1.5 * scale);
        context.lineTo(4.5 * scale, -15 * scale);
        context.stroke();
      } else {
        context.strokeStyle = `hsla(${hue}, 94%, 86%, ${0.42 + glow * 0.16})`;
        context.lineWidth = 1.1;
        context.beginPath();
        context.moveTo(-8 * scale, 0);
        context.lineTo(8 * scale, 0);
        context.stroke();
      }

      if (note.chordTone) {
        context.strokeStyle = `hsla(${hue}, 100%, 96%, ${0.56 + glow * 0.2})`;
        context.lineWidth = 1;
        context.beginPath();
        context.arc(0, 0, 8.5 * scale, 0, TAU);
        context.stroke();
      }

      context.restore();
    };

    const frame = (now: number) => {
      const size = sizeRef.current;
      const state = simulationRef.current;
      const harmonic = harmonicStateRef.current;
      const barNumber = getBarNumberAtTime(now, clockStartMsRef.current, harmonic);
      const chordSymbol = getChordForBar(barNumber, harmonic);
      const chordHue = getCurrentChordHue(harmonic, chordSymbol);
      const barProgress = getBarProgressAtTime(now, clockStartMsRef.current, harmonic);

      if (barNumber !== harmonic.currentBar) {
        harmonic.currentBar = barNumber;
        setHarmonicState({ ...harmonic });
      }

      if (lastBarTriggerRef.current !== barNumber) {
        lastBarTriggerRef.current = barNumber;
        playChordPad(chordSymbol, barNumber);
        pushFlash(point(0.5, 0.5, now), chordHue, 0.74, "bar");
      }

      const idleAge = now - lastInteractionAtRef.current;
      state.surfaceEnergy = mix(
        state.surfaceEnergy,
        clamp(
          0.16 +
            state.loops.length * 0.05 +
            state.activeTouches.size * 0.16 +
            (idleAge < IDLE_PAD_AFTER_MS ? 0.08 : 0),
          0.16,
          1,
        ),
        0.04,
      );

      context.clearRect(0, 0, size.width, size.height);

      const background = context.createLinearGradient(0, 0, size.width, size.height);
      background.addColorStop(0, "#041117");
      background.addColorStop(0.45, "#0b2426");
      background.addColorStop(1, "#180d10");
      context.fillStyle = background;
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
        `hsla(${chordHue}, 92%, 68%, ${0.08 + state.surfaceEnergy * 0.08})`,
      );
      harmonicWash.addColorStop(
        0.58,
        `rgba(109, 209, 200, ${0.03 + state.surfaceEnergy * 0.03})`,
      );
      harmonicWash.addColorStop(1, "rgba(4, 17, 23, 0)");
      context.fillStyle = harmonicWash;
      context.fillRect(0, 0, size.width, size.height);

      for (let laneIndex = 1; laneIndex <= 6; laneIndex += 1) {
        const y = (size.height / 7) * laneIndex;
        context.strokeStyle = "rgba(239, 233, 221, 0.05)";
        context.lineWidth = laneIndex === 3 || laneIndex === 4 ? 1.1 : 1;
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(size.width, y);
        context.stroke();
      }

      for (let barGuide = 0; barGuide <= 8; barGuide += 1) {
        const x = (size.width / 8) * barGuide;
        context.strokeStyle = "rgba(239, 233, 221, 0.03)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, size.height);
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

      state.flashes = state.flashes.filter((flash) => now - flash.bornAt < flash.ttl);

      state.flashes.forEach((flash) => {
        const pixel = normalizedToPixels(flash.point, size);
        const age = now - flash.bornAt;
        const progress = clamp(age / flash.ttl, 0, 1);
        const radius =
          (flash.kind === "bar" ? 24 : 12) +
          flash.strength * (flash.kind === "bar" ? 130 : 58) * easeOutCubic(progress);
        const alpha =
          (1 - progress) *
          (flash.kind === "bar" ? 0.22 : flash.kind === "touch" ? 0.28 : 0.36);
        const gradient = context.createRadialGradient(
          pixel.x,
          pixel.y,
          0,
          pixel.x,
          pixel.y,
          radius,
        );

        gradient.addColorStop(0, `hsla(${flash.hue}, 100%, 82%, ${alpha * 0.24})`);
        gradient.addColorStop(0.54, `hsla(${flash.hue}, 92%, 62%, ${alpha * 0.1})`);
        gradient.addColorStop(1, `hsla(${flash.hue}, 92%, 60%, 0)`);

        context.fillStyle = gradient;
        context.beginPath();
        context.arc(pixel.x, pixel.y, radius, 0, TAU);
        context.fill();
      });

      state.loops.forEach((loop) => {
        const loopDurationMs = getBarMs(harmonic) * loop.loopBars;

        context.save();
        context.shadowBlur = 18 + loop.energy * 18;
        context.shadowColor = `hsla(${loop.hue}, 92%, 72%, 0.16)`;
        drawPolyline(
          context,
          size,
          loop.points,
          `hsla(${loop.hue}, 88%, 74%, ${0.08 + loop.energy * 0.08})`,
          5.6,
        );
        context.restore();

        drawPolyline(
          context,
          size,
          loop.points,
          `hsla(${loop.hue}, 88%, 72%, ${0.18 + loop.energy * 0.12})`,
          2.1,
        );

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
          const noteHue = activeNote.chordTone
            ? mix(loop.hue, chordHue, 0.34)
            : loop.hue;
          playMelodicTone({
            midi: activeNote.midi,
            hue: noteHue,
            accent: activeNote.accent,
            durationMs:
              (loopDurationMs / loop.noteCount) *
              Math.max(1, activeNote.gateSteps) *
              (activeNote.sustain ? 1.08 : 0.9),
            voice: "lead",
          });
          pushFlash(anchor.point, noteHue, 0.62 + activeNote.accent * 0.22, "note");
          loop.lastTriggeredToken = triggerToken;
        }

        const retracePath = buildPartialPath(loop.points, cycleProgress);
        context.save();
        context.shadowBlur = 16 + loop.energy * 16;
        context.shadowColor = `hsla(${mix(loop.hue, chordHue, 0.18)}, 96%, 78%, 0.24)`;
        drawPolyline(
          context,
          size,
          retracePath,
          `hsla(${mix(loop.hue, chordHue, 0.18)}, 100%, 86%, ${
            0.28 + loop.energy * 0.16
          })`,
          3.4,
        );
        context.restore();

        const head = samplePath(
          loop.points,
          pathDuration(loop.points) * cycleProgress,
        );
        const headPixel = normalizedToPixels(head, size);
        const headGlow = context.createRadialGradient(
          headPixel.x,
          headPixel.y,
          0,
          headPixel.x,
          headPixel.y,
          28,
        );
        headGlow.addColorStop(0, `hsla(${mix(loop.hue, chordHue, 0.3)}, 100%, 86%, 0.48)`);
        headGlow.addColorStop(0.56, `hsla(${mix(loop.hue, chordHue, 0.3)}, 92%, 64%, 0.16)`);
        headGlow.addColorStop(1, `hsla(${mix(loop.hue, chordHue, 0.3)}, 92%, 60%, 0)`);
        context.fillStyle = headGlow;
        context.beginPath();
        context.arc(headPixel.x, headPixel.y, 28, 0, TAU);
        context.fill();

        loop.anchors.forEach((anchor, index) => {
          const note = loop.phraseNotes[index];
          if (!note) {
            return;
          }

          const nextAnchor =
            loop.anchors[Math.min(index + 1, loop.anchors.length - 1)] ?? anchor;
          drawNoteGlyph(
            anchor.point,
            nextAnchor.point,
            note.chordTone ? mix(loop.hue, chordHue, 0.28) : loop.hue,
            index === activeStepIndex,
            note,
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
          `hsla(${touch.hue}, 94%, 80%, 0.48)`,
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
    const hue = chooseHue(pointValue, simulationRef.current.loops.length);

    simulationRef.current.activeTouches.set(event.pointerId, {
      pointerId: event.pointerId,
      bornAt: now,
      lastSampleAt: now,
      hue,
      points: [pointValue],
      travel: 0,
    });
    lastInteractionAtRef.current = now;
    syncActiveCount();
    pushFlash(pointValue, hue, 0.62, "touch");
    playMelodicTone({
      midi: getPreviewMidi(pointValue, now),
      hue,
      accent: 0.44,
      durationMs: getBeatMs(harmonicStateRef.current) * 0.34,
      voice: "touch",
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
              <p>LOOPS x{memory.length}</p>
              <p>BPM {harmonicState.bpm}</p>
              <p>PROG {progressionLabel}</p>
              <p>THESIS contour + harmony</p>
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
            <div
              className="surface-controls"
              onClick={stopSurfaceGesture}
              onPointerCancel={stopSurfaceGesture}
              onPointerDown={stopSurfaceGesture}
              onPointerMove={stopSurfaceGesture}
              onPointerUp={stopSurfaceGesture}
            >
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
