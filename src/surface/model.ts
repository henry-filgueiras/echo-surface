export type NormalizedPoint = {
  x: number;
  y: number;
  t: number;
};

export type ActiveTouch = {
  pointerId: number;
  bornAt: number;
  lastSampleAt: number;
  hue: number;
  previewRole: VoiceRole | null;
  points: NormalizedPoint[];
  travel: number;
  /** true when this pointer is consumed by a two-finger pinch gesture */
  isPinch: boolean;
};

export type HarmonicState = {
  tonic: string;
  mode: "major" | "minor";
  progression: string[];
  currentBar: number;
  barsPerChord: number;
  bpm: number;
};

export type SurfaceSize = {
  width: number;
  height: number;
};

export type VoiceRole = "pad" | "bass" | "lead" | "percussion" | "echo";

export type RolePalette = {
  hue: number;
  saturation: number;
  lightness: number;
};

export type RoleMotion = "breathe" | "weight" | "spark" | "pulse" | "orbit";

export type VoiceRoleStyle = {
  glyph: "circle" | "square" | "star" | "diamond" | "wave";
  palette: RolePalette;
  motion: RoleMotion;
};

export type VoiceLane = {
  center: number;
  spread: number;
  strength: number;
  flow: number;
  overlay?: boolean;
};

export type ProgressionOption = {
  id: string;
  label: string;
  progression: string[];
};

export type RecentGesture = {
  timestamp: number;
  centroid: NormalizedPoint;
  durationMs: number;
  travel: number;
  tapLike: boolean;
  circularity: number;
  zigzag: number;
};

export type GestureSummary = {
  centroid: NormalizedPoint;
  durationMs: number;
  travel: number;
  xSpan: number;
  ySpan: number;
  smoothness: number;
  zigzag: number;
  circularity: number;
  tapLike: boolean;
  nearbyTapCount: number;
  reversalRatio: number;
  loopiness: number;
  forwardBias: number;
};

export type ContourAnchor = {
  stepIndex: number;
  drawRatio: number;
  point: NormalizedPoint;
  movement: number;
  sustain: boolean;
  leap: boolean;
  accent: boolean;
  emphasis: number;
};

export type PhraseNote = {
  stepIndex: number;
  kind: "note" | "sustain" | "rest";
  midi: number;
  trigger: boolean;
  gateSteps: number;
  chordTone: boolean;
  accent: number;
  sustain: boolean;
  leap: boolean;
  movement: number;
};

export type RhythmSignature = {
  anchorRatios: number[];
  onsetRatios: number[];
  density: number;
  quarterPulse: number;
  syncopation: number;
};

export type RhythmAttractionField = {
  strength: number;
  density: number;
  quarterPulse: number;
  syncopation: number;
  anchorTemplate: number[];
  onsetTargets: number[];
};

export type ContourLoop = {
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
  rhythmField?: RhythmAttractionField;
  circularity: number;
  loopiness: number;
  reversalRatio: number;
  forwardBias: number;
  /** ID of the scope this loop was created inside, null = root */
  scopeId: ScopeId | null;
};

export type PlaybackFlash = {
  id: number;
  bornAt: number;
  ttl: number;
  point: NormalizedPoint;
  role: VoiceRole;
  response: boolean;
  hue: number;
  strength: number;
  kind: "touch" | "note" | "bar";
  fusion?: FusionSignature;
};

export type CadenceEvent = {
  id: number;
  bornAt: number;
  ttl: number;
  barNumber: number;
  hue: number;
  intensity: number;
};

export type FusionTimbre = "shimmer" | "arp" | "harmonic-echo";

export type FusionSignature = {
  roles: [VoiceRole, VoiceRole];
  hues: [number, number];
  timbre: FusionTimbre;
};

export type FusionVoice = {
  id: number;
  bornAt: number;
  ttl: number;
  pairKey: string;
  point: NormalizedPoint;
  sourcePoints: [NormalizedPoint, NormalizedPoint];
  midiRoot: number;
  strength: number;
  motionSeed: number;
  lastTriggeredToken: string;
  signature: FusionSignature;
};

export type AudioEngine = {
  context: AudioContext | null;
  compressor: DynamicsCompressorNode | null;
  master: GainNode | null;
  fxSend: GainNode | null;
  noiseBuffer: AudioBuffer | null;
  muted: boolean;
  masterLevel: number;
};

export type SimulationState = {
  activeTouches: Map<number, ActiveTouch>;
  loops: ContourLoop[];
  flashes: PlaybackFlash[];
  recentGestures: RecentGesture[];
  cadenceEvents: CadenceEvent[];
  fusionVoices: FusionVoice[];
  surfaceEnergy: number;
};

export type MemoryChip = {
  id: number;
  hue: number;
  role: VoiceRole;
};

export type ActiveLoopSnapshot = {
  loop: ContourLoop;
  head: NormalizedPoint;
  retracePath: NormalizedPoint[];
  midi: number;
  noteAccent: number;
};

export type ToneVoice = VoiceRole | "touch" | "bar";
export type VoiceRoleOverride = VoiceRole | "auto";

export type SurfacePreset = "seed" | "trace" | "hold";

export type EchoSurfaceProps = {
  preset?: SurfacePreset;
  captureMode?: boolean;
};

export const MAX_LOOPS = 12;
export const MAX_ACTIVE_FLASHES = 56;
export const MAX_POINTS_PER_GESTURE = 120;
export const TAU = Math.PI * 2;
export const SURFACE_PRESETS: SurfacePreset[] = ["seed", "trace", "hold"];
export const LOOP_BARS = 1;
export const BEATS_PER_BAR = 4;
export const IDLE_PAD_AFTER_MS = 1200;
export const CADENCE_BAR_INTERVAL = 8;
export const CADENCE_TTL_MS = 2400;
export const MAX_FUSION_VOICES = 8;
export const FUSION_HEAD_DISTANCE = 0.11;
export const FUSION_PATH_DISTANCE = 0.12;
export const FUSION_OVERLAP_THRESHOLD = 0.58;
export const FUSION_COOLDOWN_BEATS = 1.5;
export const RHYTHM_TEMPLATE_RESOLUTION = 12;
export const RHYTHM_PROXIMITY_THRESHOLD = 0.24;
export const RHYTHM_ACTIVITY_LOOKAHEAD_BEATS = 0.5;
export const LOWER_SILENCE_LANE_THRESHOLD = 0.84;
export const NOTE_RANGE_MIN = 48;
export const NOTE_RANGE_MAX = 88;
export const QUARTER_NOTE_RATIOS = [0.25, 0.5, 0.75];
export const OFFBEAT_RATIOS = [0.125, 0.375, 0.625, 0.875];
export const NOTE_NAMES = [
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
export const VOICE_ROLE_STYLES: Record<VoiceRole, VoiceRoleStyle> = {
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
export const VOICE_ROLE_ORDER: VoiceRole[] = [
  "pad",
  "bass",
  "lead",
  "percussion",
  "echo",
];
export const VOICE_SWIM_LANE_ORDER: VoiceRole[] = [
  "percussion",
  "lead",
  "pad",
  "bass",
  "echo",
];
export const VOICE_ROLE_LANES: Record<VoiceRole, VoiceLane> = {
  bass: {
    center: 0.78,
    spread: 0.16,
    strength: 0.2,
    flow: 0.018,
  },
  pad: {
    center: 0.58,
    spread: 0.16,
    strength: 0.18,
    flow: 0.016,
  },
  lead: {
    center: 0.26,
    spread: 0.14,
    strength: 0.19,
    flow: 0.022,
  },
  percussion: {
    center: 0.14,
    spread: 0.11,
    strength: 0.16,
    flow: 0.013,
  },
  echo: {
    center: 0.44,
    spread: 0.3,
    strength: 0.08,
    flow: 0.012,
    overlay: true,
  },
};
export const RESPONSE_GLYPH_HUE = 184;
export const RESPONSE_ROLE_MAP: Record<VoiceRole, VoiceRole[]> = {
  pad: ["lead", "echo"],
  bass: ["pad", "echo"],
  lead: ["echo", "pad"],
  percussion: ["echo", "bass"],
  echo: ["lead", "pad"],
};
export const PROGRESSION_OPTIONS: ProgressionOption[] = [
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
// ---------------------------------------------------------------------------
// Scene morphing: macro musical sections
// ---------------------------------------------------------------------------

export type SceneName = "verse" | "chorus" | "bridge" | "drop";

export type SceneConfig = {
  /** Chord-tone landing preference index (0=root, 1=3rd, 2=5th) */
  harmonicLandingTone: number;
  /** Probability that a response / dialogue voice is spawned (0–1) */
  voiceWeight: number;
  /** Hue rotation applied to the harmonic colour wash (degrees) */
  hueShift: number;
  /** Saturation delta applied to the harmonic colour wash (percentage points) */
  saturationBoost: number;
  /** Lightness delta applied to the harmonic colour wash (percentage points) */
  brightnessBoost: number;
  /** Multiplier for cadence-event intensity */
  cadenceIntensity: number;
  /**
   * Rest-score threshold offset.  Positive = lower the bar for rests (more space).
   * Negative = raise the bar (more notes, denser).
   */
  restBias: number;
  /** Default number of bars before auto-advancing to the next scene */
  defaultBars: number;
};

export const SCENE_CONFIGS: Record<SceneName, SceneConfig> = {
  verse: {
    harmonicLandingTone: 0,   // root – settled, reflective
    voiceWeight: 0.56,
    hueShift: 0,
    saturationBoost: 0,
    brightnessBoost: 0,
    cadenceIntensity: 0.82,
    restBias: 0.08,            // slightly more spacious
    defaultBars: 8,
  },
  chorus: {
    harmonicLandingTone: 1,   // 3rd – lifted, open
    voiceWeight: 0.88,
    hueShift: 28,
    saturationBoost: 18,
    brightnessBoost: 10,
    cadenceIntensity: 1.28,
    restBias: -0.18,           // denser, fewer rests
    defaultBars: 8,
  },
  bridge: {
    harmonicLandingTone: 2,   // 5th – suspended tension
    voiceWeight: 0.30,
    hueShift: 148,
    saturationBoost: -14,
    brightnessBoost: -6,
    cadenceIntensity: 0.58,
    restBias: 0.26,            // sparse, much breathing room
    defaultBars: 8,
  },
  drop: {
    harmonicLandingTone: 0,   // root – powerful, grounded
    voiceWeight: 1.0,
    hueShift: 56,
    saturationBoost: 28,
    brightnessBoost: 18,
    cadenceIntensity: 1.88,
    restBias: -0.32,           // maximum density
    defaultBars: 8,
  },
};

/** Linear progression through sections; wraps continuously */
export const SCENE_SEQUENCE: SceneName[] = [
  "verse",
  "chorus",
  "verse",
  "bridge",
  "chorus",
  "drop",
];

/** Minimum bars before an early-energy trigger can fire */
export const SCENE_EARLY_TRIGGER_MIN_BARS = 2;
/** surfaceEnergy threshold that can cause an early scene jump */
export const SCENE_EARLY_TRIGGER_ENERGY = 0.72;
/** Minimum active roles required for an early scene jump */
export const SCENE_EARLY_TRIGGER_MIN_ROLES = 3;
/** Recent gesture window for density check (in bars) */
export const SCENE_EARLY_TRIGGER_GESTURE_WINDOW_BARS = 2;
/** Minimum recent gestures in that window for early trigger */
export const SCENE_EARLY_TRIGGER_MIN_GESTURES = 3;

// ---------------------------------------------------------------------------
// Scope / hierarchical composition space
// ---------------------------------------------------------------------------

export type ScopeId = number;

/** Optional per-scope overrides that shadow the global harmonic context */
export type ScopeOverrides = Partial<{
  tonic: string;
  mode: "major" | "minor";
  bpm: number;
  progressionId: string; // references PROGRESSION_OPTIONS id
  scene: SceneName;
}>;

/** A softly bounded elliptical musical world */
export type ScopeRecord = {
  id: ScopeId;
  parentId: ScopeId | null;
  childIds: ScopeId[];
  /** Ellipse centre in normalised 0-1 surface space */
  cx: number;
  cy: number;
  /** Semi-axes in normalised 0-1 surface space */
  rx: number;
  ry: number;
  hue: number;
  label: string;
  overrides: ScopeOverrides;
  /** IDs of ContourLoops whose centroid fell inside this scope */
  loopIds: number[];
  bornAt: number;
};

/** Camera / semantic-zoom state – all in normalised 0-1 world space */
export type CameraState = {
  /** World-space centre point of the viewport */
  viewCx: number;
  viewCy: number;
  zoom: number; // 1 = full canvas
  /** Smooth-interpolation targets */
  targetViewCx: number;
  targetViewCy: number;
  targetZoom: number;
  /** Which scope (if any) the camera is currently focused inside */
  focusScopeId: ScopeId | null;
};

/** Tracks an in-progress two-pointer pinch gesture */
export type PinchTracker = {
  id0: number;
  id1: number;
  lastDist: number; // normalised screen distance
  lastMidX: number; // normalised screen midpoint
  lastMidY: number;
} | null;

// Scope gesture detection thresholds
export const SCOPE_GESTURE_MIN_CIRCULARITY = 0.70;
export const SCOPE_GESTURE_MIN_LOOPINESS = 0.62;
export const SCOPE_GESTURE_MIN_TRAVEL = 0.46;
export const SCOPE_GESTURE_CLOSE_THRESHOLD = 0.18; // first↔last point distance
export const SCOPE_GESTURE_MIN_DURATION_MS = 900;
export const SCOPE_MIN_RADIUS = 0.07;
export const SCOPE_MAX_ZOOM = 8;
export const SCOPE_ZOOM_ENTER_MARGIN = 0.22; // extra space around scope when entering
export const SCOPE_ZOOM_LERP_SPEED = 0.072;

export const SCOPE_LABEL_POOL = [
  "grove", "ring", "hollow", "veil",
  "basin", "crown", "field", "bloom",
  "pocket", "vortex", "arc", "haven",
  "well", "orbit", "glyph", "echo",
];

export const MODE_INTERVALS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
} as const;
export const DEFAULT_HARMONIC_STATE: HarmonicState = {
  tonic: "C",
  mode: "major",
  progression: ["I", "IV", "V", "I"],
  currentBar: 1,
  barsPerChord: 2,
  bpm: 100,
};

export const isSurfacePreset = (value: string | null): value is SurfacePreset =>
  value !== null && SURFACE_PRESETS.includes(value as SurfacePreset);

export const getLoopHue = (role: VoiceRole) => {
  const palette = VOICE_ROLE_STYLES[role].palette;
  return palette.hue;
};

export const formatVoiceRoleLabel = (role: VoiceRole) => {
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

export const getVoiceRoleGlyphLabel = (role: VoiceRole) => {
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
