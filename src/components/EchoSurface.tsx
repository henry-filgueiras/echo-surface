import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  CADENCE_BAR_INTERVAL,
  CADENCE_TTL_MS,
  BEATS_PER_BAR,
  DEFAULT_HARMONIC_STATE,
  FUSION_COOLDOWN_BEATS,
  FUSION_HEAD_DISTANCE,
  FUSION_OVERLAP_THRESHOLD,
  IDLE_PAD_AFTER_MS,
  MAX_ACTIVE_FLASHES,
  MAX_FUSION_VOICES,
  MAX_LOOPS,
  MAX_POINTS_PER_GESTURE,
  MOTIF_DRAG_THRESHOLD_PX,
  MOTIF_MAX_SATELLITES_PER_RING,
  PROGRESSION_OPTIONS,
  SCENE_CONFIGS,
  SCENE_EARLY_TRIGGER_ENERGY,
  SCENE_EARLY_TRIGGER_GESTURE_WINDOW_BARS,
  SCENE_EARLY_TRIGGER_MIN_BARS,
  SCENE_EARLY_TRIGGER_MIN_GESTURES,
  SCENE_EARLY_TRIGGER_MIN_ROLES,
  SCENE_SEQUENCE,
  CLOCK_LATCH_RADIUS,
  POLYGON_HALO_MIN_TRAVEL_FRAC,
  POLYGON_HALO_RADIUS_MOUSE,
  POLYGON_HALO_RADIUS_TOUCH,
  POLYGON_MIN_DURATION_MS,
  POLYGON_SIDE_ROLE,
  SCOPE_GESTURE_CLOSE_THRESHOLD,
  SCOPE_GESTURE_MIN_CIRCULARITY,
  SCOPE_GESTURE_MIN_DURATION_MS,
  SCOPE_GESTURE_MIN_LOOPINESS,
  SCOPE_GESTURE_MIN_TRAVEL,
  SCOPE_LABEL_POOL,
  SCOPE_MAX_ZOOM,
  SCOPE_MIN_RADIUS,
  SCOPE_ZOOM_ENTER_MARGIN,
  SCOPE_ZOOM_LERP_SPEED,
  SURFACE_PRESETS,
  TAU,
  TIDE_TRAVEL_MS,
  TIDE_TTL_MS,
  RESPONSE_GLYPH_HUE,
  VOICE_ROLE_LANES,
  VOICE_ROLE_ORDER,
  VOICE_SWIM_LANE_ORDER,
  type ActiveLoopSnapshot,
  type ActiveTouch,
  type AudioEngine,
  type CameraState,
  type CadenceEvent,
  type ContourLoop,
  type EchoSurfaceProps,
  type FusionSignature,
  type FusionTimbre,
  type GestureSummary,
  type HarmonicState,
  type MemoryChip,
  type MotifDragState,
  type MotifRecord,
  type NormalizedPoint,
  type PhraseNote,
  type PinchTracker,
  type PlaybackFlash,
  type BindingMode,
  type ClockLatch,
  type FilamentPulse,
  type PolygonSpec,
  type RenderedMotifSatellite,
  type ResonanceFilament,
  type SceneName,
  type ScopeId,
  type ScopeRecord,
  type SessionMemorySummary,
  type SimulationState,
  type SurfacePreset,
  type SurfaceSize,
  type TideWave,
  type ToneVoice,
  type VoiceRole,
  type VoiceRoleOverride,
  formatVoiceRoleLabel,
  getLoopHue,
  getVoiceRoleGlyphLabel,
  isSurfacePreset,
} from "../surface/model";
import {
  averagePoint,
  buildPartialPath,
  clamp,
  distance,
  easeInOutSine,
  easeOutCubic,
  getActiveAnchorStepIndex,
  getAnchorStepDuration,
  getAnchorTimelineDuration,
  getGestureBounds,
  lerp,
  mix,
  mixHue,
  modulo,
  normalizedToPixels,
  pathDuration,
  point,
  samplePath,
} from "../surface/contour";
import { computeResonanceGhost } from "../surface/resonanceGhost";
import {
  applyGestureFieldToPath,
  buildPolygonAnchors,
  buildPolygonPath,
  buildResponsePoints,
  chooseHue,
  detectPolygon,
  detectTideGesture,
  getResponseRole,
  inferVoiceRole,
  makeSurfacePoint,
  shapePointsForRole,
  summarizeGesture,
} from "../interaction/grammar";
import {
  buildPhraseNotes,
  buildRhythmAttractionField,
  applyRhythmAttractionToTimeline,
  createLoopRecord,
  createPresetState,
  getBarIndexAtTime,
  getBarMs,
  getBarNumberAtTime,
  getBarProgressAtTime,
  getChordForBar,
  getChordPitchClasses,
  getCurrentChordHue,
  getFusionMidi,
  getFusionPairKey,
  getFusionPulseCount,
  getFusionPulseDurationMs,
  getFusionTimbre,
  getPathOverlapScore,
  getBeatMs,
  buildExtendedScaleMidis,
  findNearestChordToneIndex,
  findNearestPreferredChordToneIndex,
  midiToFrequency,
} from "../music/engine";
import {
  computeTideInterferenceNodes,
  drawClockInfluenceHaloPx,
  drawFilamentPreview,
  drawMotifSigil,
  drawPolygonLoopSigil,
  drawResonanceFilament,
  drawScopeSigil,
  drawTasteCurrents,
  drawTideInterferenceBloom,
  drawTideWavefront,
  getTideInterferenceMod,
  getTideModulation,
  SIGIL_ZOOM_FADE,
  SIGIL_ZOOM_FULL,
  type TideInterferenceNode,
} from "../rendering/emitters";
import {
  DEFAULT_TASTE_PROFILE,
  ensureTasteCurrentField,
  realizeContourWithTaste,
  resolveEffectiveTasteProfile,
} from "../music/taste";
import {
  drawFusionGlyph,
  drawPolyline,
  drawRoleGlyph,
  getDialogueHue,
  getRoleColor,
  warpPointForRole,
} from "../rendering/glyphs";
import {
  resolveEffectiveScopeContext,
  findScopeAt,
  screenToWorld,
  worldToScreenPixels,
} from "../world/scope";
import {
  buildMotifFromLoop,
  buildSessionMemorySummary,
  findMotifMatch,
  getPromotedMotifsForScope,
  getScopeActiveRoles,
  getScopeMotifDensity,
  materializeMotifContour,
  mergeLoopIntoMotif,
  projectMemoryChips,
} from "../emergence/memory";

export { isSurfacePreset, type SurfacePreset } from "../surface/model";

// ---------------------------------------------------------------------------
// Interaction state machine
// ---------------------------------------------------------------------------
// The surface enforces a strict mode separation:
//   idle        — no pointers active
//   musical     — exactly one pointer drawing a voice gesture
//   camera      — exactly two pointers driving pinch-zoom / pan
//   motif-drag  — one pointer dragging a dormant motif sigil
//
// Rules:
//   • A single finger can ONLY produce musical interaction (or motif drag).
//   • Two fingers ALWAYS mean camera. The moment a second pointer goes down,
//     any in-progress musical gesture is discarded.
//   • There is no state in which the same gesture drives both camera and voice.
// ---------------------------------------------------------------------------
type FilamentDragState = {
  pointerId: number;
  fromLoopId: number;
  currentWorldX: number;
  currentWorldY: number;
};

/** Ephemeral visual tether shown at the moment a contour latches to a polygon clock. */
type LatchTether = {
  id: number;
  bornAt: number;
  /** Total display lifetime in ms */
  ttl: number;
  /** World-normalised coords of the new contour's centroid (latch receiver) */
  fromWorldX: number;
  fromWorldY: number;
  /** World-normalised coords of the polygon beacon centre (clock source) */
  toWorldX: number;
  toWorldY: number;
  contourHue: number;
  beaconHue: number;
};

type GestureMode =
  | { kind: "idle" }
  | { kind: "musical"; pointerId: number }
  | { kind: "motif-drag"; pointerId: number }
  | { kind: "filament-drag"; pointerId: number }
  | {
      kind: "camera";
      id0: number; // first pointer
      id1: number; // second pointer
      // Screen-normalised (0-1) positions, updated on every move event
      screen0X: number;
      screen0Y: number;
      screen1X: number;
      screen1Y: number;
      // Pinch anchor: world point under the centroid at gesture start (fixed)
      anchorWorldX: number;
      anchorWorldY: number;
      // Reference values for absolute zoom-ratio computation (no drift)
      initialZoom: number;
      initialDist: number; // screen-space hypotenuse at start
    }
  | {
      // Radial shape palette summoned by long-press on empty canvas.
      // Finger stays down; releasing over a wedge stamps the canonical shape.
      kind: "palette-open";
      pointerId: number;
      anchorWorldX: number;  // world-space coords of the long-press point
      anchorWorldY: number;
      anchorScreenX: number; // CSS-pixel coords on the canvas element
      anchorScreenY: number;
      openedAt: number;      // performance.now() when palette became visible
      hoveredSides: number | null; // which wedge the finger is currently over
    };

// ---------------------------------------------------------------------------
// Radial shape palette — module-level constants and drawing
// ---------------------------------------------------------------------------
const LONG_PRESS_MS = 480;
const LONG_PRESS_MOVE_CANCEL_PX = 14;

const PALETTE_INNER_R = 30;
const PALETTE_OUTER_R = 90;
const PALETTE_GLYPH_R = 13;
const PALETTE_BREATH_HZ = 1.25;
const PALETTE_INNER_DEAD_ZONE_PX = 32;

// Wedge centers in radians (cardinal directions)
const PALETTE_WEDGE_DEFS: ReadonlyArray<{ sides: number; angle: number }> = [
  { sides: 3, angle: -Math.PI / 2 }, // triangle  — north
  { sides: 4, angle: 0 },            // square    — east
  { sides: 5, angle: Math.PI / 2 },  // pentagon  — south
  { sides: 6, angle: Math.PI },      // hexagon   — west
];

// Role hues matching VOICE_ROLE_STYLES / POLYGON_SIDE_ROLE
const PALETTE_SHAPE_HUE: Record<number, { hue: number; sat: number; lit: number }> = {
  3: { hue: 0,   sat: 0,  lit: 92 }, // percussion — white/silver
  4: { hue: 0,   sat: 0,  lit: 92 }, // percussion — white/silver
  5: { hue: 44,  sat: 95, lit: 68 }, // lead       — amber
  6: { hue: 248, sat: 88, lit: 70 }, // pad        — violet
};

/**
 * Draw the radial shape palette in CSS-pixel screen space.
 * Must be called OUTSIDE the camera-transform save/restore block.
 */
function drawShapePalette(
  ctx: CanvasRenderingContext2D,
  cx: number,         // screen-pixel centre (CSS px)
  cy: number,
  hoveredSides: number | null,
  openedAt: number,
  now: number,
): void {
  const age = Math.min(now - openedAt, 280);
  const arrivalT = age / 280;
  // ease-out-cubic arrival scale
  const arrival = 1 - Math.pow(1 - arrivalT, 3);

  const breath = 0.5 + 0.5 * Math.sin(now * (Math.PI * 2 * PALETTE_BREATH_HZ / 1000));
  const breathScale = 1 + breath * 0.04;

  ctx.save();
  ctx.globalAlpha = arrival;
  ctx.translate(cx, cy);
  ctx.scale(breathScale, breathScale);

  // ── Ambient outer halo ───────────────────────────────────────────────────
  const haloGrad = ctx.createRadialGradient(0, 0, PALETTE_INNER_R, 0, 0, PALETTE_OUTER_R + 28);
  haloGrad.addColorStop(0,   "hsla(210, 65%, 72%, 0.07)");
  haloGrad.addColorStop(0.5, "hsla(210, 55%, 65%, 0.04)");
  haloGrad.addColorStop(1,   "hsla(210, 55%, 65%, 0)");
  ctx.beginPath();
  ctx.arc(0, 0, PALETTE_OUTER_R + 28, 0, Math.PI * 2);
  ctx.fillStyle = haloGrad;
  ctx.fill();

  // ── Wedges ───────────────────────────────────────────────────────────────
  const GAP = 0.075; // radians gap between wedge edges
  const wedgeSpan = Math.PI / 2 - GAP;

  for (const wedge of PALETTE_WEDGE_DEFS) {
    const isHov = wedge.sides === hoveredSides;
    const hi = PALETTE_SHAPE_HUE[wedge.sides] ?? { hue: 200, sat: 70, lit: 70 };
    const startA = wedge.angle - wedgeSpan / 2;
    const endA   = wedge.angle + wedgeSpan / 2;
    const litBoost = isHov ? 16 : 0;

    // Annular sector (outer arc → inner arc reversed)
    ctx.beginPath();
    ctx.arc(0, 0, PALETTE_OUTER_R, startA, endA);
    ctx.arc(0, 0, PALETTE_INNER_R, endA, startA, true);
    ctx.closePath();

    // Radial gradient fill — glows inward
    const fillAlpha = isHov ? 0.76 : 0.36;
    const grad = ctx.createRadialGradient(0, 0, PALETTE_INNER_R, 0, 0, PALETTE_OUTER_R);
    grad.addColorStop(0, `hsla(${hi.hue}, ${hi.sat}%, ${hi.lit + litBoost}%, ${fillAlpha * 0.95})`);
    grad.addColorStop(1, `hsla(${hi.hue}, ${hi.sat}%, ${hi.lit + litBoost}%, ${fillAlpha * 0.22})`);
    ctx.fillStyle = grad;
    ctx.fill();

    // Border
    ctx.strokeStyle = `hsla(${hi.hue}, ${hi.sat}%, ${hi.lit + 22}%, ${isHov ? 0.88 : 0.38})`;
    ctx.lineWidth = isHov ? 1.6 : 0.9;
    if (isHov) {
      ctx.shadowColor  = `hsla(${hi.hue}, 90%, 82%, 0.7)`;
      ctx.shadowBlur   = 14;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // ── Glyph: canonical polygon at wedge midpoint ────────────────────────
    const glyphMidR = (PALETTE_INNER_R + PALETTE_OUTER_R) * 0.50;
    const gcx = Math.cos(wedge.angle) * glyphMidR;
    const gcy = Math.sin(wedge.angle) * glyphMidR;
    const pr  = PALETTE_GLYPH_R + (isHov ? 2.5 : 0);

    ctx.beginPath();
    for (let i = 0; i <= wedge.sides; i++) {
      const a  = -Math.PI / 2 + (i / wedge.sides) * Math.PI * 2;
      const px = gcx + Math.cos(a) * pr;
      const py = gcy + Math.sin(a) * pr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = `hsla(${hi.hue}, ${hi.sat}%, ${isHov ? 100 : 88}%, ${isHov ? 0.96 : 0.72})`;
    ctx.lineWidth   = isHov ? 2.1 : 1.3;
    if (isHov) {
      ctx.shadowColor = `hsla(${hi.hue}, 90%, 92%, 0.9)`;
      ctx.shadowBlur  = 10;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // ── N label (subtle, near outer rim) ────────────────────────────────
    const lblR = PALETTE_OUTER_R - 11;
    const lx   = Math.cos(wedge.angle) * lblR;
    const ly   = Math.sin(wedge.angle) * lblR;
    ctx.fillStyle = `hsla(${hi.hue}, 40%, 90%, ${isHov ? 0.72 : 0.32})`;
    ctx.font      = `${isHov ? 11 : 9}px 'Courier New', monospace`;
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${wedge.sides}`, lx, ly);
  }

  // ── Center eye ───────────────────────────────────────────────────────────
  const eyeGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, PALETTE_INNER_R);
  eyeGrad.addColorStop(0, `hsla(210, 65%, 82%, ${0.20 + breath * 0.13})`);
  eyeGrad.addColorStop(1, "hsla(210, 60%, 65%, 0)");
  ctx.beginPath();
  ctx.arc(0, 0, PALETTE_INNER_R - 2, 0, Math.PI * 2);
  ctx.fillStyle = eyeGrad;
  ctx.fill();

  // Tiny bright dot at exact anchor
  ctx.beginPath();
  ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = `hsla(210, 70%, 92%, ${0.45 + breath * 0.28})`;
  ctx.fill();

  ctx.restore();
}

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
    fusionVoices: [],
    filaments: [],
    surfaceEnergy: 0.18,
    tideWaves: [],
  });
  const harmonicStateRef = useRef<HarmonicState>(DEFAULT_HARMONIC_STATE);
  const clockStartMsRef = useRef(performance.now());
  const lastBarTriggerRef = useRef(0);
  const lastInteractionAtRef = useRef(performance.now());
  const flashIdRef = useRef(0);
  const loopIdRef = useRef(0);
  const cadenceIdRef = useRef(0);
  const fusionIdRef = useRef(0);
  const tideIdRef = useRef(0);
  const fusionCooldownRef = useRef(new Map<string, number>());
  const nextRoleOverrideRef = useRef<VoiceRoleOverride>("auto");
  const callResponseEnabledRef = useRef(true);
  // Scene morph state
  const sceneSeqIndexRef = useRef(0);
  const sceneNameRef = useRef<SceneName>("verse");
  const sceneStartBarRef = useRef(1);
  // Scope / hierarchical composition space
  const scopeIdCounterRef = useRef(0);
  const scopesRef = useRef<ScopeRecord[]>([]);
  const motifIdRef = useRef(0);
  const motifsRef = useRef<MotifRecord[]>([]);
  const motifSatellitesRef = useRef<RenderedMotifSatellite[]>([]);
  const motifDragRef = useRef<MotifDragState | null>(null);
  const filamentDragRef = useRef<FilamentDragState | null>(null);
  const filamentIdRef = useRef(0);
  // Tracks last seen activeStepIndex per loop, for pulse edge-detection
  const filamentStepTrackerRef = useRef<Map<number, number>>(new Map());
  // Ephemeral latch tethers drawn at contour-creation time (clock latching)
  const latchTethersRef = useRef<LatchTether[]>([]);
  const cameraRef = useRef<CameraState>({
    viewCx: 0.5, viewCy: 0.5, zoom: 1,
    targetViewCx: 0.5, targetViewCy: 0.5, targetZoom: 1,
    focusScopeId: null,
  });
  const pinchRef = useRef<PinchTracker>(null); // kept for type compat, logic lives in gestureModeRef
  const gestureModeRef = useRef<GestureMode>({ kind: "idle" });
  // Long-press → radial shape palette
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressAnchorRef = useRef<{
    worldX: number; worldY: number;
    screenX: number; screenY: number;
    pointerId: number; startedAt: number;
  } | null>(null);
  const [harmonicState, setHarmonicState] = useState(DEFAULT_HARMONIC_STATE);
  const [memory, setMemory] = useState<MemoryChip[]>([]);
  const [sessionMemory, setSessionMemory] = useState<SessionMemorySummary>({
    motifCount: 0,
    candidateCount: 0,
    awakenedCount: 0,
    names: [],
    roles: [],
  });
  const [activeCount, setActiveCount] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [progressionIndex, setProgressionIndex] = useState(0);
  const [nextRoleOverride, setNextRoleOverride] =
    useState<VoiceRoleOverride>("auto");
  const [callResponseEnabled, setCallResponseEnabled] = useState(true);
  const [currentScene, setCurrentScene] = useState<SceneName>("verse");
  const [scopes, setScopes] = useState<ScopeRecord[]>([]);
  const [focusScopeId, setFocusScopeId] = useState<ScopeId | null>(null);

  const currentChord = useMemo(
    () => getChordForBar(harmonicState.currentBar, harmonicState),
    [harmonicState],
  );
  const keyLabel = `${harmonicState.tonic} ${harmonicState.mode}`;
  const ensembleLabel =
    sessionMemory.motifCount === 0
      ? sessionMemory.candidateCount > 0
        ? "listening for contour kinship"
        : "motifs form from repeated phrases"
      : sessionMemory.names.length > 0
        ? sessionMemory.names.join(" • ")
        : "shared phrases orbit the field";
  const whisperLabel =
    activeCount > 0
      ? "soft lanes keep the choir legible • pauses bloom into rests • lower hold bass • mid-low drag pad • upper zigzag lead • top taps percussion"
      : sessionMemory.motifCount > 0
        ? callResponseEnabled
          ? "tap a dormant sigil to re-summon memory • drag it into another scope to reinterpret it • awakened motifs can answer back"
          : "tap a dormant sigil to re-summon memory • drag it into another scope to reinterpret it"
        : nextRoleOverride === "auto"
        ? callResponseEnabled
          ? "draw into the field • or long-press to summon a shape • leave breathing gaps for silence • the surface will answer"
          : "draw into the field • or long-press to summon a shape • leave breathing gaps for rests • overlap for fusion"
        : `next contour sealed as ${formatVoiceRoleLabel(nextRoleOverride)}`;

  const syncMemory = () => {
    setMemory(
      projectMemoryChips({
        motifs: motifsRef.current,
        loops: simulationRef.current.loops,
      }),
    );
    setSessionMemory(
      buildSessionMemorySummary({
        motifs: motifsRef.current,
        loops: simulationRef.current.loops,
      }),
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
    fusion?: FusionSignature,
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
      fusion,
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

  const playFusionTone = ({
    midi,
    hue,
    accent,
    durationMs,
    timbre,
  }: {
    midi: number;
    hue: number;
    accent: number;
    durationMs: number;
    timbre: FusionTimbre;
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
    const duration = clamp(durationMs / 1000, 0.16, 1.6);
    const frequency = midiToFrequency(midi);
    const primary = context.createOscillator();
    const secondary = context.createOscillator();
    const air = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const send = context.createGain();
    const brightness = hue / 220;

    primary.type = timbre === "arp" ? "square" : "triangle";
    secondary.type = timbre === "harmonic-echo" ? "sine" : "triangle";
    air.type = "sine";

    primary.frequency.setValueAtTime(frequency, now);
    secondary.frequency.setValueAtTime(
      frequency *
        (timbre === "arp" ? 1.5 : timbre === "harmonic-echo" ? 1.25 : 2.01),
      now,
    );
    air.frequency.setValueAtTime(
      frequency *
        (timbre === "arp" ? 2.02 : timbre === "harmonic-echo" ? 0.5 : 2.5),
      now,
    );

    primary.detune.value = timbre === "arp" ? -4 : -2;
    secondary.detune.value = timbre === "harmonic-echo" ? 5 : 8;
    air.detune.value = timbre === "shimmer" ? 14 : 2;

    filter.type = timbre === "arp" ? "bandpass" : "lowpass";
    filter.Q.value =
      timbre === "arp" ? 4.4 : timbre === "harmonic-echo" ? 1.8 : 2.8;
    filter.frequency.setValueAtTime(
      (timbre === "arp" ? 1600 : timbre === "harmonic-echo" ? 920 : 1300) +
        accent * 1600 +
        brightness * 640,
      now,
    );
    filter.frequency.exponentialRampToValueAtTime(
      timbre === "harmonic-echo" ? 360 : timbre === "arp" ? 760 : 520,
      now + duration,
    );

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(
      (timbre === "arp" ? 0.036 : timbre === "harmonic-echo" ? 0.03 : 0.033) +
        accent * 0.052,
      now + (timbre === "arp" ? 0.016 : 0.05),
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + duration * (timbre === "arp" ? 0.8 : 1),
    );

    send.gain.value =
      timbre === "harmonic-echo" ? 0.42 : timbre === "shimmer" ? 0.3 : 0.2;

    primary.connect(filter);
    secondary.connect(filter);
    air.connect(filter);
    filter.connect(gain);
    gain.connect(engine.compressor);
    gain.connect(send);
    send.connect(engine.fxSend);

    primary.start(now);
    secondary.start(now);
    air.start(now);
    primary.stop(now + duration + 0.08);
    secondary.stop(now + duration + 0.08);
    air.stop(now + duration + 0.08);

    if (timbre !== "arp") {
      triggerNoiseBurst("echo", 0.08 + accent * 0.1, hue);
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

  const triggerFusionVoice = (
    firstSnapshot: ActiveLoopSnapshot,
    secondSnapshot: ActiveLoopSnapshot,
    overlapScore: number,
    now: number,
  ) => {
    const [leftSnapshot, rightSnapshot] =
      firstSnapshot.loop.id <= secondSnapshot.loop.id
        ? [firstSnapshot, secondSnapshot]
        : [secondSnapshot, firstSnapshot];
    const pairKey = getFusionPairKey(
      leftSnapshot.loop.id,
      rightSnapshot.loop.id,
    );
    const harmonic = harmonicStateRef.current;
    const existing = simulationRef.current.fusionVoices.find(
      (voice) => voice.pairKey === pairKey,
    );
    const overlapPoint = point(
      (leftSnapshot.head.x + rightSnapshot.head.x) * 0.5,
      (leftSnapshot.head.y + rightSnapshot.head.y) * 0.5,
      now,
    );
    const signature: FusionSignature = {
      roles: [leftSnapshot.loop.role, rightSnapshot.loop.role],
      hues: [leftSnapshot.loop.hue, rightSnapshot.loop.hue],
      timbre: getFusionTimbre(leftSnapshot.loop.role, rightSnapshot.loop.role),
    };
    const blendedHue = mixHue(signature.hues[0], signature.hues[1], 0.5);
    const headDistance = distance(leftSnapshot.head, rightSnapshot.head);
    const strength = clamp(
      overlapScore * 0.58 +
        (1 - headDistance / FUSION_HEAD_DISTANCE) * 0.24 +
        (leftSnapshot.noteAccent + rightSnapshot.noteAccent) * 0.14,
      0.48,
      1.14,
    );
    const midiRoot = clamp(
      Math.round((leftSnapshot.midi + rightSnapshot.midi) * 0.5),
      42,
      90,
    );

    if (existing) {
      existing.bornAt = now - existing.ttl * 0.18;
      existing.point = overlapPoint;
      existing.sourcePoints = [
        leftSnapshot.head,
        rightSnapshot.head,
      ] as [NormalizedPoint, NormalizedPoint];
      existing.midiRoot = midiRoot;
      existing.strength = mix(existing.strength, strength, 0.4);
      existing.signature = signature;
      return;
    }

    const cooldownMs = getBeatMs(harmonic) * FUSION_COOLDOWN_BEATS;
    const lastSpawnAt = fusionCooldownRef.current.get(pairKey) ?? -cooldownMs * 2;
    if (now - lastSpawnAt < cooldownMs) {
      return;
    }

    const ttl =
      getBeatMs(harmonic) *
      (signature.timbre === "arp"
        ? 2.35
        : signature.timbre === "harmonic-echo"
          ? 3.4
          : 2.9);

    simulationRef.current.fusionVoices = [
      ...simulationRef.current.fusionVoices,
      {
        id: fusionIdRef.current++,
        bornAt: now,
        ttl,
        pairKey,
        point: overlapPoint,
        sourcePoints: [
          leftSnapshot.head,
          rightSnapshot.head,
        ] as [NormalizedPoint, NormalizedPoint],
        midiRoot,
        strength,
        motionSeed: Math.random() * TAU,
        lastTriggeredToken: "",
        signature,
      },
    ].slice(-MAX_FUSION_VOICES);

    simulationRef.current.surfaceEnergy = clamp(
      simulationRef.current.surfaceEnergy + 0.08 + strength * 0.06,
      0.18,
      1.22,
    );
    fusionCooldownRef.current.set(pairKey, now);
    pushFlash(
      overlapPoint,
      leftSnapshot.loop.role,
      blendedHue,
      0.78 + strength * 0.16,
      "note",
      false,
      signature,
    );
  };

  const getPreviewMidi = (
    pointValue: NormalizedPoint,
    timeMs: number,
    roleHint?: VoiceRole | null,
    harmonicOverride?: HarmonicState,
  ) => {
    const harmonic = harmonicOverride ?? harmonicStateRef.current;
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

  const registerLoopInMotifMemory = ({
    loop,
    harmonic,
    chordSymbol,
    now,
  }: {
    loop: ContourLoop;
    harmonic: HarmonicState;
    chordSymbol: string;
    now: number;
  }) => {
    if (loop.dialogueKind !== "source" || loop.answerToLoopId !== undefined) {
      return loop;
    }

    const match: { motifId: number; score: number } | null = findMotifMatch({
      motifs: motifsRef.current,
      loop,
      harmonicState: harmonic,
      chordSymbol,
    });

    if (match) {
      motifsRef.current = motifsRef.current.map((motif) =>
        motif.id === match.motifId
          ? mergeLoopIntoMotif({
              motif,
              loop,
              harmonicState: harmonic,
              chordSymbol,
              now,
            })
          : motif,
      );

      return {
        ...loop,
        motifId: match.motifId,
      };
    }

    const nextMotif = buildMotifFromLoop({
      id: motifIdRef.current++,
      loop,
      harmonicState: harmonic,
      chordSymbol,
      now,
      existingNames: motifsRef.current.map((motif) => motif.name),
    });
    motifsRef.current = [...motifsRef.current, nextMotif];

    return {
      ...loop,
      motifId: nextMotif.id,
    };
  };

  const awakenMotif = async ({
    motifId,
    targetScopeId,
    center,
  }: {
    motifId: number;
    targetScopeId: ScopeId | null;
    center?: { x: number; y: number };
  }) => {
    const motif = motifsRef.current.find((candidate) => candidate.id === motifId);
    if (!motif) {
      return;
    }

    await ensureAudio();

    const scope =
      targetScopeId === null
        ? null
        : scopesRef.current.find((candidate) => candidate.id === targetScopeId) ?? null;
    const { harmonic: effectiveHarmonic } = resolveEffectiveScopeContext(
      targetScopeId,
      scopesRef.current,
      harmonicStateRef.current,
      sceneNameRef.current,
    );
    const spawnCenter = center ?? {
      x: scope?.cx ?? 0.5,
      y: scope?.cy ?? 0.5,
    };
    const clampedCenter = {
      x: clamp(spawnCenter.x, 0.08, 0.92),
      y: clamp(spawnCenter.y, 0.08, 0.92),
    };
    const span = scope
      ? Math.min(scope.rx, scope.ry) * 1.18
      : motif.preferredRole === "bass"
        ? 0.24
        : motif.preferredRole === "pad"
          ? 0.2
          : 0.16;
    const motifPoints = materializeMotifContour({
      motif,
      center: clampedCenter,
      span,
      scope,
    });
    const rhythmField = buildRhythmAttractionField({
      points: motifPoints,
      loops: simulationRef.current.loops,
      harmonicState: effectiveHarmonic,
      clockStartMs: clockStartMsRef.current,
      referenceTimeMs: performance.now(),
    });
    const rhythmLockedPoints = applyRhythmAttractionToTimeline(motifPoints, rhythmField);
    const motifSummary = summarizeGesture(
      rhythmLockedPoints,
      Math.max(pathDuration(rhythmLockedPoints), 1),
      simulationRef.current.recentGestures,
    );
    const now = performance.now();
    const currentBarIndex = getBarIndexAtTime(
      now,
      clockStartMsRef.current,
      effectiveHarmonic,
    );
    const nextBarStartMs =
      clockStartMsRef.current + (currentBarIndex + 1) * getBarMs(effectiveHarmonic);

    const awakenedLoop = createLoopRecord({
      id: loopIdRef.current++,
      bornAt: now,
      role: motif.preferredRole,
      hue: motif.hue,
      energy: 0.74 + motif.harmonicTendencies.chordToneBias * 0.22,
      points: rhythmLockedPoints,
      scheduledAtMs: nextBarStartMs,
      synthetic: true,
      clusterSize: motif.sightings,
      landingBias: motif.harmonicTendencies.landingTone,
      harmonicLandingBias: motif.harmonicTendencies.landingTone,
      rhythmField,
      summary: motifSummary,
      scopeId: targetScopeId,
      motifId,
    });
    const responseLoop =
      callResponseEnabledRef.current && motif.preferredRole !== "percussion"
        ? createResponseLoop(awakenedLoop, loopIdRef.current + Math.round(now))
        : undefined;

    simulationRef.current.loops = [
      ...simulationRef.current.loops,
      awakenedLoop,
      ...(responseLoop ? [responseLoop] : []),
    ].slice(-MAX_LOOPS);

    if (scope) {
      scope.loopIds.push(awakenedLoop.id);
    }

    motifsRef.current = motifsRef.current.map((candidate) =>
      candidate.id === motifId
        ? {
            ...candidate,
            awakenCount: candidate.awakenCount + 1,
            lastAwakenedAt: now,
            lastSeenAt: now,
            loopIds: [...candidate.loopIds, awakenedLoop.id].slice(-12),
          }
        : candidate,
    );

    simulationRef.current.surfaceEnergy = clamp(
      simulationRef.current.surfaceEnergy + 0.1 + motif.rhythmSkeleton.density * 0.08,
      0.18,
      1.2,
    );
    lastInteractionAtRef.current = now;
    const endPoint = rhythmLockedPoints.at(-1) ?? averagePoint(rhythmLockedPoints);

    pushFlash(endPoint, motif.preferredRole, motif.hue, 0.9, "touch");
    playMelodicTone({
      midi: getPreviewMidi(endPoint, now, motif.preferredRole, effectiveHarmonic),
      hue: motif.hue,
      accent: 0.72,
      durationMs: getBeatMs(effectiveHarmonic) * 0.8,
      voice: motif.preferredRole,
    });

    syncMemory();
  };

  // ---------------------------------------------------------------------------
  // Scope management
  // ---------------------------------------------------------------------------

  const spawnScope = (
    rawPoints: NormalizedPoint[],
    summary: GestureSummary,
  ) => {
    const bounds = getGestureBounds(rawPoints);
    const cx = (bounds.minX + bounds.maxX) * 0.5;
    const cy = (bounds.minY + bounds.maxY) * 0.5;
    const rx = Math.max((bounds.maxX - bounds.minX) * 0.5, SCOPE_MIN_RADIUS);
    const ry = Math.max((bounds.maxY - bounds.minY) * 0.5, SCOPE_MIN_RADIUS);

    const parentScope = findScopeAt(cx, cy, scopesRef.current);
    // Hue derived from position + current count, distinct from voice hues
    const hue = modulo(cx * 200 + cy * 130 + scopeIdCounterRef.current * 61, 360);
    const labelIndex = scopeIdCounterRef.current % SCOPE_LABEL_POOL.length;
    const label = SCOPE_LABEL_POOL[labelIndex];

    const newScope: ScopeRecord = {
      id: scopeIdCounterRef.current++,
      parentId: parentScope?.id ?? null,
      childIds: [],
      cx, cy, rx, ry,
      hue,
      label,
      overrides: {},
      loopIds: [],
      bornAt: performance.now(),
    };

    if (parentScope) {
      parentScope.childIds.push(newScope.id);
    }

    const nextScopes = [...scopesRef.current, newScope];
    scopesRef.current = nextScopes;
    setScopes(nextScopes);

    // Brief impact flash at scope center
    pushFlash(point(cx, cy, performance.now()), "echo", hue, 1.1, "bar");
  };

  // ---------------------------------------------------------------------------
  // Clock beacon detection — proximity search for active polygon loops
  // ---------------------------------------------------------------------------
  /**
   * Returns the nearest active polygon ContourLoop within CLOCK_LATCH_RADIUS
   * of (cx, cy), or null when no beacon is close enough.
   * Only active (scheduledAtMs already reached) polygons are considered.
   */
  const findClockBeacon = (
    cx: number,
    cy: number,
    loops: ContourLoop[],
    now: number,
  ): ContourLoop | null => {
    let nearest: ContourLoop | null = null;
    let nearestDist = CLOCK_LATCH_RADIUS;
    for (const loop of loops) {
      if (!loop.polygonSpec || now < loop.scheduledAtMs) continue;
      const dx = cx - loop.polygonSpec.cx;
      const dy = cy - loop.polygonSpec.cy;
      const d = Math.hypot(dx, dy);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = loop;
      }
    }
    return nearest;
  };

  // ---------------------------------------------------------------------------
  // Polygon loop spawner
  // Creates a ContourLoop whose path and anchors are regularized to an n-gon.
  // The polygon spec is kept on the loop so rendering can use the sigil mode.
  // ---------------------------------------------------------------------------
  const spawnPolygonLoop = (
    rawPoints: NormalizedPoint[],
    spec: PolygonSpec,
  ) => {
    const now = performance.now();
    const size = sizeRef.current;

    const role: VoiceRole = POLYGON_SIDE_ROLE[spec.sides] ?? "lead";
    const roleHue = getLoopHue(role);

    // Regularized polygon path (closed N-gon)
    const polygonPath = buildPolygonPath(spec, size.width, size.height);

    // Resolve scope context from polygon centre
    const scopeForGesture = findScopeAt(spec.cx, spec.cy, scopesRef.current);
    const { harmonic: effectiveHarmonic, scene: effectiveScene } =
      resolveEffectiveScopeContext(
        scopeForGesture?.id ?? null,
        scopesRef.current,
        harmonicStateRef.current,
        sceneNameRef.current,
      );

    const currentBarIndex = getBarIndexAtTime(
      now, clockStartMsRef.current, effectiveHarmonic,
    );
    const nextBarStartMs =
      clockStartMsRef.current +
      (currentBarIndex + 1) * getBarMs(effectiveHarmonic);

    const energy = 0.84;

    let loop = createLoopRecord({
      id: loopIdRef.current++,
      bornAt: now,
      role,
      hue: roleHue,
      dialogueKind: "source",
      energy,
      points: polygonPath,
      scheduledAtMs: nextBarStartMs,
      synthetic: false,
      clusterSize: 1,
      scopeId: scopeForGesture?.id ?? null,
    });

    // Override anchors with evenly-spaced vertex anchors and attach polygon spec
    loop.anchors = buildPolygonAnchors(spec, size.width, size.height);
    loop.noteCount = spec.sides;
    loop.desiredRegisterMidi = clamp(Math.round(77 - spec.cy * 22), 54, 84);
    loop.polygonSpec = spec;
    // Each polygon is a genuine N-beat clock: triangle = 3 beats, square = 4,
    // pentagon = 5, hexagon = 6.  loopBars is stored as a fraction of a 4/4 bar.
    loop.loopBars = spec.sides / BEATS_PER_BAR;

    loop = registerLoopInMotifMemory({
      loop,
      harmonic: effectiveHarmonic,
      chordSymbol: getChordForBar(
        getBarNumberAtTime(nextBarStartMs, clockStartMsRef.current, effectiveHarmonic),
        effectiveHarmonic,
      ),
      now,
    });

    if (scopeForGesture) {
      scopeForGesture.loopIds.push(loop.id);
    }

    simulationRef.current.loops = [
      ...simulationRef.current.loops,
      loop,
    ].slice(-MAX_LOOPS);

    simulationRef.current.recentGestures = [
      ...simulationRef.current.recentGestures,
      {
        timestamp: now,
        centroid: { x: spec.cx, y: spec.cy, t: now },
        durationMs: 800,
        travel: spec.rFraction * TAU,
        tapLike: false,
        circularity: 0.88,
        zigzag: 0.04,
      },
    ].slice(-18);

    simulationRef.current.surfaceEnergy = clamp(
      simulationRef.current.surfaceEnergy + 0.14 + energy * 0.06,
      0.14,
      1.2,
    );
    lastInteractionAtRef.current = now;

    // Ritual impact flash at polygon centre
    pushFlash(
      point(spec.cx, spec.cy, now),
      role,
      roleHue,
      1.1,
      "bar",
    );

    syncMemory();
  };

  /**
   * Stamp a canonical N-gon centered at the given world-space anchor.
   * Called when the user releases over a wedge in the radial shape palette.
   * The resulting loop fully participates in the existing system:
   * rhythmic loop roles, phase bindings, resonance filaments, motif memory,
   * and scope harmonic reinterpretation.
   */
  const stampShapeFromPalette = (
    sides: number,
    anchorWorldX: number,
    anchorWorldY: number,
  ) => {
    // Stamp radius: 10 % of the shorter canvas dimension (good default size)
    const rFraction = 0.10;
    // All shapes spawned vertex-up (pointing north)
    const rotation = -Math.PI / 2;
    const spec: PolygonSpec = { sides, cx: anchorWorldX, cy: anchorWorldY, rFraction, rotation };
    spawnPolygonLoop([], spec);
  };

  const enterScope = (scopeId: ScopeId) => {
    const scope = scopesRef.current.find((s) => s.id === scopeId);
    if (!scope) return;

    const margin = SCOPE_ZOOM_ENTER_MARGIN;
    const targetZoom = 1 / (Math.max(scope.rx, scope.ry) * 2 + margin);
    const clampedZoom = clamp(targetZoom, 1, SCOPE_MAX_ZOOM);

    cameraRef.current.targetViewCx = scope.cx;
    cameraRef.current.targetViewCy = scope.cy;
    cameraRef.current.targetZoom = clampedZoom;
    cameraRef.current.focusScopeId = scopeId;
    setFocusScopeId(scopeId);
  };

  const exitScope = () => {
    const cam = cameraRef.current;
    const current = scopesRef.current.find((s) => s.id === cam.focusScopeId);

    if (current?.parentId !== null && current?.parentId !== undefined) {
      enterScope(current.parentId);
    } else {
      // Return to root view
      cam.targetViewCx = 0.5;
      cam.targetViewCy = 0.5;
      cam.targetZoom = 1;
      cam.focusScopeId = null;
      setFocusScopeId(null);
    }
  };

  // ---------------------------------------------------------------------------

  const createResponseLoop = (sourceLoop: ContourLoop, seed: number) => {
    const { harmonic } = resolveEffectiveScopeContext(
      sourceLoop.scopeId,
      scopesRef.current,
      harmonicStateRef.current,
      sceneNameRef.current,
    );
    const responseRole = getResponseRole(sourceLoop.role, seed);
    const baseResponsePoints = buildResponsePoints(
      sourceLoop.points,
      responseRole,
      seed,
    );
    const responseScheduledAtMs =
      sourceLoop.scheduledAtMs +
      getBarMs(harmonic) +
      getBeatMs(harmonic) * (0.16 + modulo(seed, 3) * 0.07);
    const responseField = buildRhythmAttractionField({
      points: baseResponsePoints,
      loops: [...simulationRef.current.loops, sourceLoop],
      harmonicState: harmonic,
      clockStartMs: clockStartMsRef.current,
      referenceTimeMs: responseScheduledAtMs,
    });
    const responsePoints = applyRhythmAttractionToTimeline(
      baseResponsePoints,
      responseField,
    );
    const responseSummary = summarizeGesture(
      responsePoints,
      Math.max(pathDuration(responsePoints), 1),
      [],
    );
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
      rhythmField: responseField,
      summary: responseSummary,
      scopeId: sourceLoop.scopeId,
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

    // ---- Polygon + Scope creation gesture detection ----
    // Both require a minimum point count and no explicit role seal.
    if (touch.points.length >= 4 && !touch.previewRole) {
      const firstWorld = touch.points[0];
      const lastWorld = touch.points[touch.points.length - 1];
      const closureDistance = distance(firstWorld, lastWorld);

      // Polygon check first — cornered closed shapes snap to a rhythmic n-gon
      if (
        touch.points.length >= 6 &&
        gestureDurationMs >= POLYGON_MIN_DURATION_MS
      ) {
        const polygonSpec = detectPolygon(
          relativePoints,
          sizeRef.current.width,
          sizeRef.current.height,
        );
        if (polygonSpec) {
          spawnPolygonLoop(touch.points, polygonSpec);
          return;
        }
      }

      // Scope check — smooth, slow, circular draw → spawn a new musical scope
      if (gestureDurationMs >= SCOPE_GESTURE_MIN_DURATION_MS) {
        const summary = summarizeGesture(relativePoints, gestureDurationMs, []);
        if (
          summary.circularity >= SCOPE_GESTURE_MIN_CIRCULARITY &&
          summary.loopiness >= SCOPE_GESTURE_MIN_LOOPINESS &&
          summary.travel >= SCOPE_GESTURE_MIN_TRAVEL &&
          closureDistance <= SCOPE_GESTURE_CLOSE_THRESHOLD
        ) {
          spawnScope(touch.points, summary);
          return; // do not create a voice phrase
        }
      }
    }
    // ---- end polygon / scope gesture ----

    const inferred = inferVoiceRole(
      relativePoints,
      gestureDurationMs,
      simulationRef.current.recentGestures,
    );

    // ---- Tide gesture detection (Phase 1) ----
    // Large open sweeping gestures (not explicitly role-sealed) spawn a
    // traveling wavefront instead of a musical voice.  The tide is a
    // conduction-only layer — no phrase notes are created.
    if (!touch.previewRole) {
      const tideInfo = detectTideGesture(
        inferred.summary,
        gestureDurationMs,
        relativePoints,
      );
      if (tideInfo) {
        const wave: TideWave = {
          id: tideIdRef.current++,
          bornAt: now,
          ttl: TIDE_TTL_MS,
          flavor: tideInfo.flavor,
          dirX: tideInfo.dirX,
          dirY: tideInfo.dirY,
          originX: tideInfo.originX,
          originY: tideInfo.originY,
          travelSpan: tideInfo.travelSpan,
          travelMs: TIDE_TRAVEL_MS,
          hue: tideInfo.hue,
        };
        simulationRef.current.tideWaves.push(wave);
        // Keep at most 3 concurrent tide waves to avoid visual overload
        if (simulationRef.current.tideWaves.length > 3) {
          simulationRef.current.tideWaves.splice(
            0,
            simulationRef.current.tideWaves.length - 3,
          );
        }
        return;
      }
    }
    // ---- end tide gesture ----

    const role = touch.previewRole ?? inferred.role;
    const contourPoints = shapePointsForRole(
      role,
      relativePoints,
      inferred.summary,
    );

    // Resolve effective harmonic context from innermost scope
    const gestureCentroid = inferred.summary.centroid;
    const scopeForGesture = findScopeAt(
      gestureCentroid.x, gestureCentroid.y, scopesRef.current,
    );
    const { harmonic: effectiveHarmonic, scene: effectiveScene } = resolveEffectiveScopeContext(
      scopeForGesture?.id ?? null,
      scopesRef.current,
      harmonicStateRef.current,
      sceneNameRef.current,
    );

    const harmonic = effectiveHarmonic;
    const currentBarIndex = getBarIndexAtTime(now, clockStartMsRef.current, harmonic);
    const nextBarStartMs =
      clockStartMsRef.current + (currentBarIndex + 1) * getBarMs(harmonic);
    const scheduledBarNumber = getBarNumberAtTime(
      nextBarStartMs,
      clockStartMsRef.current,
      harmonic,
    );
    const scheduledChord = getChordForBar(scheduledBarNumber, harmonic);
    const rhythmField = buildRhythmAttractionField({
      points: contourPoints,
      loops: simulationRef.current.loops,
      harmonicState: harmonic,
      clockStartMs: clockStartMsRef.current,
      referenceTimeMs: now,
    });
    const rhythmLockedPoints = applyRhythmAttractionToTimeline(
      contourPoints,
      rhythmField,
    );
    const energy = clamp(0.42 + touch.travel * 1.4, 0.42, 1.2);
    const endPoint = rhythmLockedPoints.at(-1) ?? averagePoint(rhythmLockedPoints);
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

    let sourceLoop = createLoopRecord({
      id: loopIdRef.current++,
      bornAt: now,
      role,
      hue: roleHue,
      dialogueKind: "source",
      energy,
      points: rhythmLockedPoints,
      scheduledAtMs: nextBarStartMs,
      synthetic: false,
      clusterSize: inferred.summary.nearbyTapCount + 1,
      rhythmField,
      summary: inferred.summary,
      scopeId: scopeForGesture?.id ?? null,
    });
    sourceLoop = registerLoopInMotifMemory({
      loop: sourceLoop,
      harmonic,
      chordSymbol: scheduledChord,
      now,
    });
    // Register this loop inside its scope
    if (scopeForGesture) {
      scopeForGesture.loopIds.push(sourceLoop.id);
    }

    // ── Clock latching: adopt timing from nearest polygon clock beacon ─────
    // Look for the nearest active polygon loop within CLOCK_LATCH_RADIUS.
    // If found, the contour inherits the beacon's N-beat cycle duration and
    // phase-aligns its scheduledAtMs to the beacon's next cycle boundary.
    // This latch is sticky — never changed after creation.
    {
      const beacon = findClockBeacon(
        gestureCentroid.x, gestureCentroid.y,
        simulationRef.current.loops, now,
      );
      if (beacon?.polygonSpec) {
        const bSpec = beacon.polygonSpec;
        // Resolve the beacon's own harmonic context for correct BPM
        const beaconCtx = resolveEffectiveScopeContext(
          beacon.scopeId, scopesRef.current,
          harmonicStateRef.current, sceneNameRef.current,
        );
        const beaconHarmonic = beaconCtx.harmonic;
        const beaconLoopBars = bSpec.sides / BEATS_PER_BAR;
        const beaconCycleDurationMs = getBarMs(beaconHarmonic) * beaconLoopBars;

        // Phase-align: schedule the contour at the beacon's next cycle start
        const beaconElapsedMs = Math.max(0, now - beacon.scheduledAtMs);
        const beaconCycleElapsedMs = beaconElapsedMs % beaconCycleDurationMs;
        const nextBeaconCycleStartMs = now - beaconCycleElapsedMs + beaconCycleDurationMs;

        // Stamp the latch — sticky forever
        sourceLoop.loopBars = beaconLoopBars;
        sourceLoop.scheduledAtMs = nextBeaconCycleStartMs;
        sourceLoop.clockLatch = {
          sourceLoopId: beacon.id,
          sides: bSpec.sides,
          cycleDurationMs: beaconCycleDurationMs,
        } satisfies ClockLatch;

        // ── Visual: ephemeral luminous tether from contour to beacon ──────
        latchTethersRef.current.push({
          id: loopIdRef.current * 997 + Math.round(now % 10000),
          bornAt: now,
          ttl: 1600,
          fromWorldX: gestureCentroid.x,
          fromWorldY: gestureCentroid.y,
          toWorldX: bSpec.cx,
          toWorldY: bSpec.cy,
          contourHue: roleHue,
          beaconHue: beacon.hue,
        });

        // ── Visual: one bright pulse on the source shape ("teaching" beat) ─
        pushFlash(
          point(bSpec.cx, bSpec.cy, now),
          beacon.role,
          beacon.hue,
          1.4,
          "bar",
        );
      }
    }
    // ── end clock latching ─────────────────────────────────────────────────

    const sceneVoiceWeight = SCENE_CONFIGS[effectiveScene].voiceWeight;
    const responseLoop =
      callResponseEnabledRef.current &&
      role !== "percussion" &&
      Math.random() < sceneVoiceWeight
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
      midi: getPreviewMidi(endPoint, now, role, harmonic),
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
    simulationRef.current.fusionVoices = snapshot.fusionVoices;
    simulationRef.current.recentGestures = [];
    simulationRef.current.surfaceEnergy = 0.3;
    simulationRef.current.activeTouches.clear();
    loopIdRef.current = snapshot.loops.length;
    flashIdRef.current = snapshot.flashes.length;
    fusionIdRef.current = snapshot.fusionVoices.length;
    fusionCooldownRef.current.clear();
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
      const isRest = note.kind === "rest";
      const isSustain = note.kind === "sustain";
      const glow =
        (active ? (isRest ? 0.46 : 1) : isRest ? 0.14 : note.trigger ? 0.5 : 0.24) *
        glyphBoost;
      const radius =
        (isRest ? 12 : note.chordTone ? 18 : 14) +
        note.accent * (isRest ? 8 : 12) +
        (active ? (isRest ? 4 : 6) : 0) +
        (glyphBoost - 1) * (isRest ? 5 : 8);
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
        isRest
          ? loop.dialogueKind === "response"
            ? `hsla(${glyphHue}, 74%, 84%, ${0.08 * glow})`
            : getRoleColor(loop.role, 0.06 * glow, 10, -4)
          : loop.dialogueKind === "response"
            ? `hsla(${glyphHue}, 90%, 82%, ${0.26 * glow})`
            : getRoleColor(loop.role, 0.22 * glow, 16, 6),
      );
      halo.addColorStop(
        0.52,
        isRest
          ? loop.dialogueKind === "response"
            ? `hsla(${glyphHue}, 64%, 74%, ${0.04 * glow})`
            : getRoleColor(loop.role, 0.03 * glow, 0, -8)
          : loop.dialogueKind === "response"
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

      if (isRest) {
        context.save();
        context.setLineDash(active ? [6, 7] : [3, 9]);
        context.lineDashOffset = -(now * 0.01);
        drawRoleGlyph(
          context,
          loop.role,
          pixel.x,
          pixel.y,
          4 + note.accent * 1.6 + (active ? 1.4 : 0),
          0.18 + glow * 0.18,
          angle,
          loop.dialogueKind === "response" ? glyphHue : undefined,
          true,
        );
        context.restore();

        context.strokeStyle =
          loop.dialogueKind === "response"
            ? `hsla(${glyphHue}, 78%, 84%, ${0.16 + glow * 0.06})`
            : getRoleColor(loop.role, 0.12 + glow * 0.06, 10, -4);
        context.lineWidth = active ? 1.1 : 0.9;
        context.beginPath();
        context.arc(pixel.x, pixel.y, radius * 0.52, 0, TAU);
        context.stroke();
        return;
      }

      drawRoleGlyph(
        context,
        loop.role,
        pixel.x,
        pixel.y,
        (note.trigger ? 5.2 : 4) + note.accent * 2 + (active ? 2.2 : 0),
        (isSustain ? 0.26 : 0.42) + glow * (isSustain ? 0.28 : 0.42),
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

        // ---- Scene morph: check for transition on each new bar ----
        {
          const sceneCfg = SCENE_CONFIGS[sceneNameRef.current];
          const barsInScene = Math.max(barNumber - sceneStartBarRef.current, 0);

          // Early trigger: high energy + dense gestures skip ahead to chorus/drop
          const gestureWindowMs = getBarMs(harmonic) * SCENE_EARLY_TRIGGER_GESTURE_WINDOW_BARS;
          const recentGestureCount = state.recentGestures.filter(
            (g) => now - g.timestamp < gestureWindowMs,
          ).length;
          const earlyTriggerReady =
            barsInScene >= SCENE_EARLY_TRIGGER_MIN_BARS &&
            state.surfaceEnergy >= SCENE_EARLY_TRIGGER_ENERGY &&
            recentGestureCount >= SCENE_EARLY_TRIGGER_MIN_GESTURES &&
            activeRoles.size >= SCENE_EARLY_TRIGGER_MIN_ROLES;

          const defaultTransition = barsInScene >= sceneCfg.defaultBars;
          const earlyTransition =
            earlyTriggerReady &&
            !defaultTransition &&
            (sceneNameRef.current === "verse" || sceneNameRef.current === "chorus");

          if (defaultTransition || earlyTransition) {
            let nextScene: SceneName;
            if (earlyTransition && !defaultTransition) {
              // Jump directly to chorus or drop depending on current scene
              nextScene = sceneNameRef.current === "verse" ? "chorus" : "drop";
              // Advance sequence index to match so default flow stays coherent
              const jumpIndex = SCENE_SEQUENCE.lastIndexOf(nextScene);
              sceneSeqIndexRef.current = jumpIndex >= 0 ? jumpIndex : sceneSeqIndexRef.current;
            } else {
              const nextSeqIndex = (sceneSeqIndexRef.current + 1) % SCENE_SEQUENCE.length;
              sceneSeqIndexRef.current = nextSeqIndex;
              nextScene = SCENE_SEQUENCE[nextSeqIndex];
            }
            sceneNameRef.current = nextScene;
            sceneStartBarRef.current = barNumber;
            setCurrentScene(nextScene);
          }
        }
        // ---- end scene morph ----

        if (cadenceShouldTrigger) {
          const sceneCadenceMult = SCENE_CONFIGS[sceneNameRef.current].cadenceIntensity;
          triggerCadenceEvent(
            barNumber,
            clamp((0.74 + activeRoles.size * 0.12) * sceneCadenceMult, 0.62, 2.0),
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

      // ---- Camera smooth interpolation ----
      const cam = cameraRef.current;
      // Clamp target so we never zoom below 1 (no meaningful "outside world" to reveal).
      // When exiting back to root, snap view center back to 0.5,0.5.
      if (cam.targetZoom <= 1) {
        cam.targetZoom = 1;
        cam.targetViewCx = 0.5;
        cam.targetViewCy = 0.5;
      }
      cam.zoom = lerp(cam.zoom, cam.targetZoom, SCOPE_ZOOM_LERP_SPEED);
      cam.viewCx = lerp(cam.viewCx, cam.targetViewCx, SCOPE_ZOOM_LERP_SPEED);
      cam.viewCy = lerp(cam.viewCy, cam.targetViewCy, SCOPE_ZOOM_LERP_SPEED);
      // ---- end camera smooth ----

      context.clearRect(0, 0, size.width, size.height);

      // ── Screen-space background pass ─────────────────────────────────────
      // Drawn WITHOUT camera transform so fills always cover the full canvas
      // regardless of zoom level.

      // Scene colour modifiers (used in both passes)
      const activeSceneCfg = SCENE_CONFIGS[sceneNameRef.current];
      const sceneHueShift = activeSceneCfg.hueShift;
      const sceneSatBoost = activeSceneCfg.saturationBoost;
      const sceneBriBoost = activeSceneCfg.brightnessBoost;
      const sceneChordHue = modulo(chordHue + sceneHueShift, 360);

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
      const washSat = clamp(92 + sceneSatBoost, 0, 100);
      const washLit = clamp(68 + sceneBriBoost, 0, 100);
      harmonicWash.addColorStop(
        0,
        `hsla(${sceneChordHue}, ${washSat}%, ${washLit}%, ${
          0.08 + state.surfaceEnergy * 0.08 + cadenceGlow * 0.04
        })`,
      );
      harmonicWash.addColorStop(
        0.58,
        `hsla(${sceneChordHue}, ${clamp(60 + sceneSatBoost * 0.5, 0, 100)}%, 72%, ${
          0.03 + state.surfaceEnergy * 0.03 + cadenceGlow * 0.02
        })`,
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

      const flowField = context.createLinearGradient(0, 0, size.width, 0);
      flowField.addColorStop(0, "rgba(255,255,255,0)");
      flowField.addColorStop(
        0.48,
        `hsla(${sceneChordHue}, ${clamp(80 + sceneSatBoost * 0.6, 0, 100)}%, 72%, ${0.012 + state.surfaceEnergy * 0.01})`,
      );
      flowField.addColorStop(
        1,
        `hsla(${sceneChordHue}, ${clamp(88 + sceneSatBoost * 0.6, 0, 100)}%, ${clamp(78 + sceneBriBoost * 0.5, 0, 100)}%, ${0.032 + state.surfaceEnergy * 0.014})`,
      );
      context.fillStyle = flowField;
      context.fillRect(0, 0, size.width, size.height);

      VOICE_SWIM_LANE_ORDER.forEach((role) => {
        const lane = VOICE_ROLE_LANES[role];
        const centerY = size.height * lane.center;
        const radius = size.height * lane.spread;
        const band = context.createLinearGradient(0, centerY - radius, 0, centerY + radius);
        const bandAlpha =
          role === "echo"
            ? 0.024 + state.surfaceEnergy * 0.012
            : 0.036 + state.surfaceEnergy * 0.02;

        band.addColorStop(0, getRoleColor(role, 0, 6, 2));
        band.addColorStop(0.5, getRoleColor(role, bandAlpha, 8, 4));
        band.addColorStop(1, getRoleColor(role, 0, 2, 0));
        context.fillStyle = band;
        context.fillRect(
          size.width * 0.04,
          Math.max(0, centerY - radius),
          size.width * 0.92,
          Math.min(size.height, radius * 2),
        );

        context.save();
        context.strokeStyle =
          role === "echo"
            ? getRoleColor(role, 0.06, 18, 0)
            : getRoleColor(role, 0.05, 14, 6);
        context.lineWidth = role === "echo" ? 1.1 : 1;
        context.setLineDash(role === "echo" ? [16, 12] : [6, 18]);
        context.beginPath();
        for (let step = 0; step <= 24; step += 1) {
          const x = size.width * 0.08 + (size.width * 0.84 * step) / 24;
          const wave =
            Math.sin((step / 24) * Math.PI * 2 + barProgress * TAU * 1.2 + lane.center * 6) *
            (role === "echo" ? 9 : 4);
          const y = centerY + wave;
          if (step === 0) {
            context.moveTo(x, y);
          } else {
            context.lineTo(x, y);
          }
        }
        context.stroke();
        context.restore();
      });

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

      // ── World-space pass ──────────────────────────────────────────────────
      // Camera transform applied here. All coordinates inside this block are
      // in normalised 0-1 world space (multiplied by size.width / size.height).
      context.save();
      context.translate(
        size.width * (0.5 - cam.zoom * cam.viewCx),
        size.height * (0.5 - cam.zoom * cam.viewCy),
      );
      context.scale(cam.zoom, cam.zoom);

      const glyphBoost = 1 + cadenceGlow * 0.55;

      // ── Tide interference pre-compute ─────────────────────────────────────
      // Compute collision nodes from all currently active wave pairs.
      // Done once here so the result is available for the beacon-halo pass,
      // the contour-head pass, and the latch-tether pass that follow.
      const interferenceNodes: TideInterferenceNode[] = computeTideInterferenceNodes(
        state.tideWaves,
        now,
      );
      // ── end tide interference pre-compute ────────────────────────────────

      // ── Clock influence halo pre-pass ─────────────────────────────────────
      // Render the timing-field halos for all active polygon beacons FIRST so
      // they sit underneath sigils and contours.  The halos teach the user
      // where rhythm gravity lives without any explicit UI chrome.
      //
      // We also pre-compute which beacon (if any) the live stroke head is
      // currently inside, so the halo pass can apply proximity brightening and
      // the live-touch section can show a preview tether + meter glyph.
      let _nearestBeaconForProximity: ContourLoop | null = null;
      {
        const minDim = Math.min(size.width, size.height);
        const latchRadiusPx = CLOCK_LATCH_RADIUS * minDim;

        // Find the live stroke head (first active touch, if any)
        let liveHeadNormX: number | null = null;
        let liveHeadNormY: number | null = null;
        for (const touch of state.activeTouches.values()) {
          const head = touch.points.at(-1);
          if (head) {
            liveHeadNormX = head.x;
            liveHeadNormY = head.y;
            break;
          }
        }
        const isDrawing = liveHeadNormX !== null;

        // Find the nearest polygon beacon to the current stroke head
        let nearestBeaconIdForHalo: number | null = null;
        if (liveHeadNormX !== null && liveHeadNormY !== null) {
          let minDist = CLOCK_LATCH_RADIUS;
          for (const loop of state.loops) {
            if (!loop.polygonSpec || now < loop.scheduledAtMs) continue;
            const dx = liveHeadNormX - loop.polygonSpec.cx;
            const dy = liveHeadNormY - loop.polygonSpec.cy;
            const d = Math.hypot(dx, dy);
            if (d < minDist) {
              minDist = d;
              nearestBeaconIdForHalo = loop.id;
              _nearestBeaconForProximity = loop;
            }
          }
        }

        // Render one halo per active polygon loop
        for (const loop of state.loops) {
          if (!loop.polygonSpec || now < loop.scheduledAtMs) continue;
          const bSpec = loop.polygonSpec;
          const pxCx = bSpec.cx * size.width;
          const pxCy = bSpec.cy * size.height;

          // Compute cycle progress for this loop using its own harmonic context
          const bLoopCtx = resolveEffectiveScopeContext(
            loop.scopeId, scopesRef.current, harmonic, sceneNameRef.current,
          );
          const bLoopDurationMs = getBarMs(bLoopCtx.harmonic) * loop.loopBars;
          const bElapsed = Math.max(0, now - loop.scheduledAtMs);
          const bCycleProgress = clamp((bElapsed % bLoopDurationMs) / bLoopDurationMs, 0, 0.9999);

          // Tide modulation for this beacon's world position.
          // Interference collision zones amplify the halo beyond single-wave level.
          const beaconTideMod = getTideModulation(
            bSpec.cx, bSpec.cy,
            state.tideWaves,
            now,
          ) + getTideInterferenceMod(bSpec.cx, bSpec.cy, interferenceNodes) * 1.4;

          drawClockInfluenceHaloPx(
            context,
            pxCx,
            pxCy,
            loop.hue,
            bSpec.sides,
            cam.zoom,
            bCycleProgress,
            loop.id === nearestBeaconIdForHalo,
            isDrawing,
            latchRadiusPx,
            now,
            beaconTideMod,
          );
        }
      }
      // ── end clock influence halo pre-pass ─────────────────────────────────

      // ── Resonance Ghost: nearest phase-lock attractor ─────────────────────
      // Single deterministic suggestion: if two polygon clusters are close
      // to a preferred coupling distance but not yet locked, draw a faint
      // dashed ghost at the position that would seat the newer shape into
      // lock with the older one. Purely visual — nothing moves until the
      // user drags the real shape into the attractor themselves.
      {
        const ghost = computeResonanceGhost(state.loops, now);
        if (ghost) {
          const mover = state.loops.find((l) => l.id === ghost.moverLoopId);
          const ghostHue = mover?.hue ?? 210;
          const { sides, cx, cy, rFraction, rotation } = ghost.ghostSpec;
          const pxCx = cx * size.width;
          const pxCy = cy * size.height;
          const pxR = rFraction * Math.min(size.width, size.height);

          // Gentle 1.6 Hz breathing so the ghost reads as "latent, alive"
          // without competing with the rhythmic halos next to it.
          const breathe = 0.78 + 0.22 * Math.sin(now * 0.0026);
          const baseAlpha = 0.34 * breathe * Math.min(1, ghost.score);
          const lineWidth = 1.4 / cam.zoom;
          const dashLong = 6 / cam.zoom;
          const dashShort = 4 / cam.zoom;

          context.save();
          context.lineWidth = lineWidth;
          context.lineJoin = "round";

          // Outer attractor ring — softer, wider dashes.
          context.strokeStyle = `hsla(${ghostHue}, 70%, 82%, ${baseAlpha * 0.55})`;
          context.setLineDash([dashShort, dashShort * 1.6]);
          context.lineDashOffset = -(now * 0.012) / cam.zoom;
          context.beginPath();
          context.arc(pxCx, pxCy, pxR * 1.32, 0, TAU);
          context.stroke();

          // Polygon ghost outline in the mover's hue, lifted toward
          // "possibility" lightness rather than a warning tint.
          context.strokeStyle = `hsla(${ghostHue}, 78%, 86%, ${baseAlpha})`;
          context.setLineDash([dashLong, dashShort]);
          context.lineDashOffset = (now * 0.018) / cam.zoom;
          context.beginPath();
          for (let k = 0; k <= sides; k += 1) {
            const angle = rotation + (k / sides) * TAU;
            const vx = pxCx + Math.cos(angle) * pxR;
            const vy = pxCy + Math.sin(angle) * pxR;
            if (k === 0) context.moveTo(vx, vy);
            else context.lineTo(vx, vy);
          }
          context.stroke();

          // Centre pip — just enough to read the attractor point.
          context.setLineDash([]);
          context.fillStyle = `hsla(${ghostHue}, 80%, 92%, ${baseAlpha * 0.9})`;
          context.beginPath();
          context.arc(pxCx, pxCy, 1.8 / cam.zoom, 0, TAU);
          context.fill();

          context.restore();
        }
      }
      // ── end resonance ghost ───────────────────────────────────────────────

      // ── Tide wavefront rendering ───────────────────────────────────────────
      // Prune expired waves, then render each active wavefront as a luminous
      // ribbon inside the world-space camera transform.
      state.tideWaves = state.tideWaves.filter((w) => now - w.bornAt < w.ttl);
      for (const wave of state.tideWaves) {
        drawTideWavefront(context, wave, size, now, cam.zoom);
      }
      // ── Tide interference bloom rendering ─────────────────────────────────
      // Collision blooms sit above the wavefront ribbons but below note flashes.
      for (const node of interferenceNodes) {
        drawTideInterferenceBloom(context, node, size, now, cam.zoom);
      }
      // ── end tide wavefront + interference rendering ────────────────────────

      state.flashes = state.flashes.filter((flash) => now - flash.bornAt < flash.ttl);

      state.flashes.forEach((flash) => {
        const pixel = normalizedToPixels(flash.point, size);
        const age = now - flash.bornAt;
        const progress = clamp(age / flash.ttl, 0, 1);
        const flashHue = flash.fusion
          ? mixHue(flash.fusion.hues[0], flash.fusion.hues[1], 0.5)
          : flash.response
            ? RESPONSE_GLYPH_HUE
            : flash.hue;
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
            : flash.fusion
              ? `hsla(${flashHue}, 96%, 84%, ${alpha * 0.28})`
            : flash.response
              ? `hsla(${flashHue}, 88%, 80%, ${alpha * 0.26})`
              : getRoleColor(flash.role, alpha * 0.24, 14, 8),
        );
        gradient.addColorStop(
          0.54,
          flash.kind === "bar"
            ? `hsla(${flash.hue}, 86%, 62%, ${alpha * 0.1})`
            : flash.fusion
              ? `hsla(${flashHue}, 90%, 72%, ${alpha * 0.14})`
            : flash.response
              ? `hsla(${flashHue}, 82%, 68%, ${alpha * 0.12})`
              : getRoleColor(flash.role, alpha * 0.1, 0, 0),
        );
        gradient.addColorStop(
          1,
          flash.fusion
            ? `hsla(${flashHue}, 88%, 68%, 0)`
            : flash.response
            ? `hsla(${flashHue}, 82%, 68%, 0)`
            : getRoleColor(flash.role, 0, 0, 0),
        );

        context.fillStyle = gradient;
        context.beginPath();
        context.arc(pixel.x, pixel.y, radius, 0, TAU);
        context.fill();

        if (flash.fusion) {
          drawFusionGlyph(
            context,
            flash.fusion,
            pixel.x,
            pixel.y,
            (flash.kind === "bar" ? 8.8 : 6.2) + flash.strength * 3,
            alpha,
            now * 0.0015,
            1 - progress,
          );
        } else {
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
        }
      });

      const activeLoopSnapshots: ActiveLoopSnapshot[] = [];

      state.loops.forEach((loop) => {
        const loopContext = resolveEffectiveScopeContext(
          loop.scopeId,
          scopesRef.current,
          harmonic,
          sceneNameRef.current,
        );
        const loopHarmonic = loopContext.harmonic;
        const loopScene = loopContext.scene;
        const loopDurationMs = getBarMs(loopHarmonic) * loop.loopBars;
        const loopBarNumber = getBarNumberAtTime(
          now,
          clockStartMsRef.current,
          loopHarmonic,
        );
        const loopChordSymbol = getChordForBar(loopBarNumber, loopHarmonic);
        const loopChordHue = getCurrentChordHue(loopHarmonic, loopChordSymbol);
        const loopBarProgress = getBarProgressAtTime(
          now,
          clockStartMsRef.current,
          loopHarmonic,
        );
        const visualHue =
          loop.dialogueKind === "response"
            ? mix(loop.hue, RESPONSE_GLYPH_HUE, 0.6)
            : loop.hue;
        // ── Polygon loops use sigil rendering; skip warped voice-path drawing ──
        if (loop.polygonSpec) {
          if (now < loop.scheduledAtMs) {
            // Dormant state: quiet polygon sigil waits for its bar
            drawPolygonLoopSigil(
              context,
              loop.polygonSpec,
              size,
              loop.hue,
              loop.energy,
              cam.zoom,
              -1,
              0,
              cadenceGlow,
              now,
            );
            return;
          }
          // Active polygon sigil drawn further below after cycleProgress is known
        } else {
          // ── Standard voice: dormant warped path ──────────────────────────────
          const dormantPath = warpPathForLoop(
            loop.points,
            loop,
            loopBarProgress * 0.22,
            now,
          );

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
              loopBarProgress * 0.2,
              now,
              loopChordHue,
              glyphBoost,
            );
          });

          if (now < loop.scheduledAtMs) {
            return;
          }
        }

        const elapsed = now - loop.scheduledAtMs;
        const cycleIndex = Math.floor(elapsed / loopDurationMs);
        const cycleElapsed = elapsed - cycleIndex * loopDurationMs;
        const cycleProgress = clamp(cycleElapsed / loopDurationMs, 0, 0.9999);
        const cycleStartBar =
          getBarNumberAtTime(loop.scheduledAtMs, clockStartMsRef.current, loopHarmonic) +
          cycleIndex * loop.loopBars;
        const cycleChord = getChordForBar(cycleStartBar, loopHarmonic);
        const phraseToken = `${cycleStartBar}:${cycleChord}:${loopHarmonic.tonic}:${loopHarmonic.mode}:${loopScene}`;

        if (loop.lastPhraseToken !== phraseToken) {
          const phraseCfg = SCENE_CONFIGS[loopScene];
          const rawNotes = buildPhraseNotes(
            loop,
            loopHarmonic,
            cycleChord,
            loop.harmonicLandingBias ?? phraseCfg.harmonicLandingTone,
            phraseCfg.restBias,
          );

          // ── Taste Field realization pass ────────────────────────────────
          const tasteProfile = resolveEffectiveTasteProfile(
            loop.scopeId,
            scopesRef.current,
            DEFAULT_TASTE_PROFILE,
          );
          // Look up prior motif notes for repetition echo
          const priorMotif = loop.motifId !== undefined
            ? motifsRef.current.find((m) => m.id === loop.motifId)
            : null;
          const priorMotifNotes = priorMotif?.loopIds.length
            ? simulationRef.current.loops.find(
                (l) => l.id === priorMotif.loopIds[Math.max(0, priorMotif.loopIds.length - 2)],
              )?.phraseNotes ?? null
            : null;
          // How close are we to the next bar boundary?
          const barProgressAtCycleStart = getBarProgressAtTime(
            loop.scheduledAtMs + cycleIndex * loopDurationMs,
            clockStartMsRef.current,
            loopHarmonic,
          );
          const loopBoundaryProximity = 1 - barProgressAtCycleStart;

          loop.phraseNotes = realizeContourWithTaste({
            notes: rawNotes,
            anchors: loop.anchors,
            harmonicState: loopHarmonic,
            chordSymbol: cycleChord,
            tasteProfile,
            priorMotifNotes,
            loopBoundaryProximity,
          });
          loop.lastPhraseToken = phraseToken;
        }

        const anchorTimelineDuration = getAnchorTimelineDuration(loop.anchors);
        const activeStepIndex = getActiveAnchorStepIndex(loop.anchors, cycleProgress);
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
          // Polygon loops keep vertex positions crisp — no role warping at triggers
          const flashedPoint = loop.polygonSpec
            ? anchor.point
            : warpPointForRole(
                anchor.point,
                nextAnchor.point,
                loop.role,
                loop.motionSeed,
                cycleProgress + anchor.drawRatio,
                now,
              );
          const noteHue = activeNote.chordTone
            ? mix(getDialogueHue(loop, loopChordHue), loopChordHue, 0.18)
            : getDialogueHue(loop, loopChordHue);
          playMelodicTone({
            midi: activeNote.midi,
            hue: noteHue,
            accent: activeNote.accent,
            durationMs:
              loopDurationMs *
              (getAnchorStepDuration(
                loop.anchors,
                activeStepIndex,
                activeNote.gateSteps,
              ) /
                anchorTimelineDuration) *
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

        // ── Active visuals — polygon sigil or standard retrace ──────────────────
        let retracePath: NormalizedPoint[];
        let head: NormalizedPoint;

        if (loop.polygonSpec) {
          // Polygon: draw canonical sigil with live edge retrace
          drawPolygonLoopSigil(
            context,
            loop.polygonSpec,
            size,
            loop.hue,
            loop.energy,
            cam.zoom,
            cycleProgress,
            activeStepIndex,
            cadenceGlow,
            now,
          );
          // Use raw path for fusion-detection snapshot (no role warping)
          retracePath = buildPartialPath(loop.points, cycleProgress);
          head = samplePath(
            loop.points,
            pathDuration(loop.points) * cycleProgress,
          );
        } else {
          // Standard voice: retrace polyline + head glow + role glyph + note glyphs
          retracePath = warpPathForLoop(
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
          head = warpPointForRole(
            rawHead,
            rawHeadNext,
            loop.role,
            loop.motionSeed,
            cycleProgress,
            now,
          );
          const activeRest = activeNote?.kind === "rest";
          const headPixel = normalizedToPixels(head, size);

          // ── Tide modulation for this contour's playback head position ──────
          // Latched contours (and all contours) brighten when a wavefront passes.
          // Interference collision zones deliver an additional amplification boost.
          const headTideMod = getTideModulation(
            head.x, head.y,
            state.tideWaves,
            now,
          ) + getTideInterferenceMod(head.x, head.y, interferenceNodes) * 1.4;
          const tideHeadRadiusBoost = headTideMod * 0.18; // +18% radius at peak
          const tideHeadAlphaBoost  = headTideMod * 0.38; // +38% alpha at peak

          const headRadius =
            (loop.role === "pad" ? 34 : loop.role === "bass" ? 30 : loop.role === "echo" ? 32 : 26)
            * (1 + tideHeadRadiusBoost);
          const baseHeadAlpha0 = activeRest ? 0.18 : 0.44;
          const baseHeadAlpha1 = activeRest ? 0.08 : 0.18;
          const headAlpha0 = Math.min(baseHeadAlpha0 + tideHeadAlphaBoost * baseHeadAlpha0, 0.92);
          const headAlpha1 = Math.min(baseHeadAlpha1 + tideHeadAlphaBoost * baseHeadAlpha1, 0.5);

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
              ? `hsla(${visualHue}, 90%, 84%, ${headAlpha0})`
              : getRoleColor(loop.role, headAlpha0, 18 + headTideMod * 8, 8 + headTideMod * 4),
          );
          headGlow.addColorStop(
            0.56,
            loop.dialogueKind === "response"
              ? `hsla(${visualHue}, 82%, 72%, ${headAlpha1})`
              : getRoleColor(loop.role, headAlpha1, 6, 2),
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

          // Tide boost also enlarges the role glyph slightly
          const glyphSizeBoost = 1 + headTideMod * 0.28;
          drawRoleGlyph(
            context,
            loop.role,
            headPixel.x,
            headPixel.y,
            (6.2 + (activeNote?.accent ?? 0.4) * 3.2) * glyphSizeBoost,
            activeRest ? 0.4 : Math.min(0.88 + headTideMod * 0.12, 1.0),
            now * 0.0016,
            loop.dialogueKind === "response" ? visualHue : undefined,
            activeRest,
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
              loopChordHue,
              glyphBoost,
            );
          });

          // ── Bonus: meter glyph for clock-latched contours ───────────────
          // A small luminous number (3 / 4 / 5 / 6) near the contour head
          // teaches the user which polygon clock this phrase has borrowed.
          if (loop.clockLatch) {
            const glyphAge   = clamp((now - loop.bornAt) / 900, 0, 1);
            // Brief pop-in then settles to a dimmer persistent state
            const popIn      = easeOutCubic(glyphAge);
            const settle     = 0.28 + 0.12 * Math.sin(now * 0.0014 + loop.motionSeed);
            const glyphAlpha = popIn * settle * (1 + cadenceGlow * 0.3);
            if (glyphAlpha > 0.02) {
              const headPx    = normalizedToPixels(head, size);
              const glyphSize = Math.max(8, 11 / cam.zoom);
              // Position: slightly above and to the right of the head
              const gx = headPx.x + 14 / cam.zoom;
              const gy = headPx.y - 14 / cam.zoom;
              context.save();
              context.globalAlpha   = glyphAlpha;
              context.font          = `bold ${glyphSize}px "Courier New", monospace`;
              context.textAlign     = "center";
              context.textBaseline  = "middle";
              context.shadowColor   = `hsla(${loop.hue}, 90%, 88%, 0.9)`;
              context.shadowBlur    = 7 / cam.zoom;
              context.fillStyle     = `hsla(${loop.hue}, 70%, 90%, 0.96)`;
              context.fillText(`${loop.clockLatch.sides}`, gx, gy);
              // Tiny ring around the digit for extra legibility
              context.beginPath();
              context.arc(gx, gy, glyphSize * 0.78, 0, TAU);
              context.strokeStyle = `hsla(${loop.hue}, 70%, 82%, ${glyphAlpha * 0.38})`;
              context.lineWidth   = 0.9 / cam.zoom;
              context.stroke();
              context.restore();
            }
          }
          // ── end meter glyph ─────────────────────────────────────────────
        }

        activeLoopSnapshots.push({
          loop,
          head,
          retracePath,
          midi:
            activeNote && activeNote.kind !== "rest"
              ? activeNote.midi
              : getPreviewMidi(head, now, loop.role, loopHarmonic),
          noteAccent: activeNote?.kind === "rest" ? 0.12 : activeNote?.accent ?? 0.54,
        });
      });

      state.fusionVoices = state.fusionVoices.filter(
        (voice) => now - voice.bornAt < voice.ttl,
      );

      for (let index = 0; index < activeLoopSnapshots.length; index += 1) {
        for (
          let partnerIndex = index + 1;
          partnerIndex < activeLoopSnapshots.length;
          partnerIndex += 1
        ) {
          const firstSnapshot = activeLoopSnapshots[index];
          const secondSnapshot = activeLoopSnapshots[partnerIndex];
          const headGap = distance(firstSnapshot.head, secondSnapshot.head);

          if (headGap > FUSION_HEAD_DISTANCE) {
            continue;
          }

          const overlapScore = getPathOverlapScore(
            firstSnapshot.retracePath,
            secondSnapshot.retracePath,
          );

          if (overlapScore < FUSION_OVERLAP_THRESHOLD) {
            continue;
          }

          triggerFusionVoice(firstSnapshot, secondSnapshot, overlapScore, now);
        }
      }

      state.fusionVoices.forEach((fusion) => {
        const age = now - fusion.bornAt;
        const progress = clamp(age / fusion.ttl, 0, 0.9999);
        const life = (1 - progress) ** 0.5;
        const centerPixel = normalizedToPixels(fusion.point, size);
        const sourcePixelA = normalizedToPixels(fusion.sourcePoints[0], size);
        const sourcePixelB = normalizedToPixels(fusion.sourcePoints[1], size);
        const blendedHue = mixHue(
          fusion.signature.hues[0],
          fusion.signature.hues[1],
          0.5,
        );
        const bridge = context.createLinearGradient(
          sourcePixelA.x,
          sourcePixelA.y,
          sourcePixelB.x,
          sourcePixelB.y,
        );
        const bridgeBend =
          Math.sin(now * 0.0024 + fusion.motionSeed) *
          (10 + fusion.strength * 14 + cadenceGlow * 8);

        bridge.addColorStop(
          0,
          `hsla(${fusion.signature.hues[0]}, 94%, 78%, ${
            life * 0.18 * fusion.strength
          })`,
        );
        bridge.addColorStop(
          0.5,
          `hsla(${blendedHue}, 98%, 84%, ${life * 0.32 * fusion.strength})`,
        );
        bridge.addColorStop(
          1,
          `hsla(${fusion.signature.hues[1]}, 94%, 78%, ${
            life * 0.18 * fusion.strength
          })`,
        );
        context.strokeStyle = bridge;
        context.lineWidth = 1.6 + fusion.strength * 1.8 + cadenceGlow * 0.8;
        context.beginPath();
        context.moveTo(sourcePixelA.x, sourcePixelA.y);
        context.quadraticCurveTo(
          centerPixel.x,
          centerPixel.y - bridgeBend,
          sourcePixelB.x,
          sourcePixelB.y,
        );
        context.stroke();

        const haloRadius =
          24 + fusion.strength * 26 + cadenceGlow * 10 + easeOutCubic(progress) * 22;
        const halo = context.createRadialGradient(
          centerPixel.x,
          centerPixel.y,
          0,
          centerPixel.x,
          centerPixel.y,
          haloRadius,
        );
        halo.addColorStop(
          0,
          `hsla(${blendedHue}, 96%, 84%, ${life * 0.18 * fusion.strength})`,
        );
        halo.addColorStop(
          0.56,
          `hsla(${blendedHue}, 90%, 72%, ${life * 0.08 * fusion.strength})`,
        );
        halo.addColorStop(1, `hsla(${blendedHue}, 88%, 68%, 0)`);
        context.fillStyle = halo;
        context.beginPath();
        context.arc(centerPixel.x, centerPixel.y, haloRadius, 0, TAU);
        context.fill();

        const pulseCount = getFusionPulseCount(fusion.signature.timbre);
        const pulseIndex = Math.min(
          pulseCount - 1,
          Math.floor(progress * pulseCount),
        );
        const pulseToken = `${pulseIndex}`;

        if (fusion.lastTriggeredToken !== pulseToken) {
          const pulseAccent = clamp(
            0.5 +
              fusion.strength * 0.2 +
              (pulseIndex === 0 ? 0.14 : 0) +
              (fusion.signature.timbre === "arp" && pulseIndex % 2 === 0 ? 0.08 : 0),
            0.48,
            1,
          );
          const pulseMidi = getFusionMidi(
            fusion,
            pulseIndex,
            harmonic,
            chordSymbol,
          );
          playFusionTone({
            midi: pulseMidi,
            hue: blendedHue,
            accent: pulseAccent,
            durationMs: getFusionPulseDurationMs(
              fusion.signature.timbre,
              harmonic,
            ),
            timbre: fusion.signature.timbre,
          });
          pushFlash(
            fusion.point,
            fusion.signature.roles[0],
            blendedHue,
            0.74 + pulseAccent * 0.18,
            "note",
            false,
            fusion.signature,
          );
          fusion.lastTriggeredToken = pulseToken;
        }

        drawFusionGlyph(
          context,
          fusion.signature,
          centerPixel.x,
          centerPixel.y,
          8 + fusion.strength * 4 + cadenceGlow * 2,
          life * (0.78 + cadenceGlow * 0.12),
          now * 0.0018 + fusion.motionSeed,
          1 - progress,
        );
      });

      // ── Resonance filaments: update pulses, render, audio coupling ───────────
      {
        const harmonic = harmonicStateRef.current;
        const beatMs = getBeatMs(harmonic);

        // Prune filaments whose constituent loops are no longer alive
        const liveLoopIds = new Set(state.loops.map((l) => l.id));
        state.filaments = state.filaments.filter(
          (f) => liveLoopIds.has(f.loopIdA) && liveLoopIds.has(f.loopIdB),
        );

        state.filaments.forEach((filament) => {
          const loopA = state.loops.find((l) => l.id === filament.loopIdA);
          const loopB = state.loops.find((l) => l.id === filament.loopIdB);
          if (!loopA?.polygonSpec || !loopB?.polygonSpec) return;

          const specA = loopA.polygonSpec;
          const specB = loopB.polygonSpec;

          // Travel time: proportional to distance between polygon centres
          const ax = specA.cx, ay = specA.cy;
          const bx = specB.cx, by = specB.cy;
          const dist = Math.hypot(bx - ax, by - ay);
          const travelMs = Math.max(beatMs * 0.5, dist * 1800);

          // Detect step edges using the loop's anchor timeline
          const durationMsA = getBarMs(harmonic) * loopA.loopBars;
          const durationMsB = getBarMs(harmonic) * loopB.loopBars;

          const cycleProgressA = loopA.scheduledAtMs <= now
            ? ((now - loopA.scheduledAtMs) % durationMsA) / durationMsA
            : -1;
          const cycleProgressB = loopB.scheduledAtMs <= now
            ? ((now - loopB.scheduledAtMs) % durationMsB) / durationMsB
            : -1;

          const stepA = cycleProgressA >= 0
            ? Math.floor(cycleProgressA * specA.sides)
            : -1;
          const stepB = cycleProgressB >= 0
            ? Math.floor(cycleProgressB * specB.sides)
            : -1;

          // Expire finished pulses
          filament.pulses = filament.pulses.filter(
            (p) => now - p.bornAt < p.ttl,
          );

          // Spawn A→B pulse on each new step of A
          if (stepA >= 0 && stepA !== filament.lastStepA) {
            filament.lastStepA = stepA;
            filament.pulses.push({
              t: 0, dir: 1, strength: 0.85 + stepA === 0 ? 0.15 : 0,
              bornAt: now, ttl: travelMs,
            });
            // call-offset mode: also trigger a resonance note at B when pulse arrives
            if (filament.mode === "call-offset") {
              const arrivalMs = now + travelMs;
              const loopBMidi = loopB.phraseNotes.length > 0
                ? loopB.phraseNotes[0].midi
                : loopA.phraseNotes.length > 0 ? loopA.phraseNotes[0].midi + 7 : 67;
              // Schedule a synthetic tone at arrival time using a small timeout
              const delay = Math.max(0, arrivalMs - performance.now());
              setTimeout(() => {
                playMelodicTone({
                  midi: loopBMidi,
                  hue: mixHue(loopA.hue, loopB.hue, 0.5),
                  accent: 0.52,
                  durationMs: beatMs * 0.38,
                  voice: loopB.role,
                });
              }, delay);
            }
          }

          // Spawn B→A pulse on each new step of B (for ratio-lock and phase-align)
          if (
            stepB >= 0 &&
            stepB !== filament.lastStepB &&
            filament.mode !== "call-offset"
          ) {
            filament.lastStepB = stepB;
            filament.pulses.push({
              t: 0, dir: -1, strength: 0.82 + stepB === 0 ? 0.15 : 0,
              bornAt: now, ttl: travelMs,
            });
          }

          // phase-align: on bar boundary sync bar phase of B to A
          if (
            filament.mode === "phase-align" &&
            stepA === 0 &&
            filament.lastStepA !== 0
          ) {
            const barMs = getBarMs(harmonic);
            const aPhaseOffset = (now - loopA.scheduledAtMs) % barMs;
            const bPhaseOffset = (now - loopB.scheduledAtMs) % barMs;
            if (Math.abs(aPhaseOffset - bPhaseOffset) > beatMs * 0.08) {
              // nudge loopB's schedule to align with loopA
              loopB.scheduledAtMs = loopA.scheduledAtMs;
            }
          }

          // Render the filament tether + pulses
          drawResonanceFilament(context, filament, loopA, loopB, size, cam.zoom, now);
        });

        // Draw filament-drag preview tether
        const fd = filamentDragRef.current;
        if (fd) {
          const fromLoop = state.loops.find((l) => l.id === fd.fromLoopId);
          if (fromLoop?.polygonSpec) {
            drawFilamentPreview(
              context,
              fromLoop.polygonSpec,
              fd.currentWorldX,
              fd.currentWorldY,
              fromLoop.hue,
              size,
              cam.zoom,
            );
          }
        }
      }
      // ── end resonance filaments ───────────────────────────────────────────────

      for (const touch of state.activeTouches.values()) {
        const liveProgress = clamp((now - touch.bornAt) / 1200, 0, 1);
        const liveDurationMs = Math.max(now - touch.bornAt, 1);
        const liveRole =
          touch.previewRole ??
          (touch.points.length >= 3
            ? inferVoiceRole(
                touch.points,
                liveDurationMs,
                simulationRef.current.recentGestures,
              ).role
            : null);
        const liveSummary = summarizeGesture(
          touch.points,
          liveDurationMs,
          simulationRef.current.recentGestures,
        );
        const liveHue = liveRole ? getLoopHue(liveRole) : touch.hue;
        const livePath =
          liveRole === null
            ? touch.points
            : applyGestureFieldToPath(liveRole, touch.points, liveSummary);
        context.save();
        context.shadowBlur = 16 + liveProgress * 12;
        context.shadowColor = `hsla(${liveHue}, 100%, 78%, 0.2)`;
        drawPolyline(
          context,
          size,
          livePath,
          `hsla(${liveHue}, 94%, 80%, 0.4)`,
          3 + liveProgress * 2.2,
        );
        context.restore();

        const head = livePath.at(-1);
        if (head) {
          const pixel = normalizedToPixels(head, size);
          context.fillStyle = `hsla(${liveHue}, 100%, 88%, 0.78)`;
          context.beginPath();
          context.arc(pixel.x, pixel.y, 5.4, 0, TAU);
          context.fill();
        }

        // ── Magnetic closure halo — visible snap ring around the start point ─
        // Draws once enough travel has accumulated and no role is pre-sealed.
        if (!touch.previewRole && touch.points.length >= 6) {
          const minDim = Math.min(size.width, size.height);
          const travelSufficient =
            touch.travel * minDim >= POLYGON_HALO_MIN_TRAVEL_FRAC * minDim;
          if (travelSufficient) {
            // Estimate pointer type from the gesture mode state — touch gets
            // the larger radius.  We default to touch-sized when ambiguous.
            const isMouseMode = gestureModeRef.current.kind !== "musical";
            const haloFrac = isMouseMode
              ? POLYGON_HALO_RADIUS_MOUSE
              : POLYGON_HALO_RADIUS_TOUCH;
            const haloR = haloFrac * minDim;

            const firstPt = touch.points[0];
            const firstPx = normalizedToPixels(firstPt, size);

            // Pulsing breath animation at 1.8 Hz
            const breathPhase = (now * 0.0018) % 1;
            const breathScale = 0.85 + 0.15 * Math.sin(breathPhase * TAU);
            const displayR = haloR * breathScale;

            // Distance from current head to start point (in pixels)
            const headPt = touch.points.at(-1)!;
            const headDx = (headPt.x - firstPt.x) * size.width;
            const headDy = (headPt.y - firstPt.y) * size.height;
            const headDistPx = Math.hypot(headDx, headDy);
            // Alpha ramps up as head approaches the halo
            const proximity = clamp(1 - headDistPx / (haloR * 3), 0, 1);
            const baseAlpha = 0.22 + proximity * 0.42;

            context.save();
            // Outer glow
            context.shadowBlur = 10;
            context.shadowColor = `hsla(${liveHue}, 86%, 76%, ${baseAlpha * 0.6})`;
            context.beginPath();
            context.arc(firstPx.x, firstPx.y, displayR, 0, TAU);
            context.strokeStyle = `hsla(${liveHue}, 88%, 82%, ${baseAlpha})`;
            context.lineWidth = 1.6;
            context.setLineDash([6, 8]);
            context.stroke();
            context.setLineDash([]);
            // Inner dot at start anchor
            context.shadowBlur = 0;
            context.beginPath();
            context.arc(firstPx.x, firstPx.y, 3.8, 0, TAU);
            context.fillStyle = `hsla(${liveHue}, 92%, 86%, ${baseAlpha * 1.2})`;
            context.fill();
            context.restore();
          }
        }
        // ── end closure halo ─────────────────────────────────────────────────

        // ── Clock proximity preview: tether + meter glyph ────────────────────
        // When the live stroke head is inside a clock beacon's latch field we
        // show a faint preview tether from the beacon to the stroke head and a
        // transient meter-glyph (3/4/5/6) floating near the head. This is
        // purely anticipatory — it disappears the moment the contour is finalised.
        const beaconForPreview = _nearestBeaconForProximity;
        if (beaconForPreview?.polygonSpec) {
          const bSpec   = beaconForPreview.polygonSpec;
          const head    = touch.points.at(-1);
          if (head) {
            const beaconPx = { x: bSpec.cx * size.width, y: bSpec.cy * size.height };
            const headPx   = normalizedToPixels(head, size);
            const dx = head.x - bSpec.cx;
            const dy = head.y - bSpec.cy;
            const normDist = Math.hypot(dx, dy);

            // Tether alpha: fades as the stroke moves deeper into the field
            // (strong near the field edge, softer near centre)
            const edgeProximity = clamp(normDist / CLOCK_LATCH_RADIUS, 0, 1);
            const tetherAlpha = 0.1 + edgeProximity * 0.42;

            // ── Preview tether line (beacon centre → stroke head) ─────────────
            context.save();
            context.globalAlpha = tetherAlpha;
            context.setLineDash([3 / cam.zoom, 6 / cam.zoom]);
            context.lineDashOffset = -(now * 0.016);
            context.lineWidth   = 1.1 / cam.zoom;
            const tetherGrad = context.createLinearGradient(
              beaconPx.x, beaconPx.y, headPx.x, headPx.y,
            );
            tetherGrad.addColorStop(0, `hsla(${beaconForPreview.hue}, 90%, 82%, 0.8)`);
            tetherGrad.addColorStop(1, `hsla(${liveHue}, 88%, 86%, 0.3)`);
            context.strokeStyle = tetherGrad;
            context.shadowBlur  = 6 / cam.zoom;
            context.shadowColor = `hsla(${beaconForPreview.hue}, 88%, 80%, 0.5)`;
            context.beginPath();
            context.moveTo(beaconPx.x, beaconPx.y);
            context.lineTo(headPx.x,   headPx.y);
            context.stroke();
            context.setLineDash([]);
            context.restore();

            // ── Meter glyph near head (3 / 4 / 5 / 6) ───────────────────────
            // Pulses gently at the beacon's cycle rate so it feels live.
            const bLoopCtxPrev = resolveEffectiveScopeContext(
              beaconForPreview.scopeId, scopesRef.current, harmonic, sceneNameRef.current,
            );
            const bLoopMsPreview = getBarMs(bLoopCtxPrev.harmonic) * beaconForPreview.loopBars;
            const bElapsedPreview = Math.max(0, now - beaconForPreview.scheduledAtMs);
            const bCyclePreview   = (bElapsedPreview % bLoopMsPreview) / bLoopMsPreview;
            const meterPulse  = 0.55 + 0.45 * Math.cos(bCyclePreview * TAU);
            const meterAlpha  = clamp((0.38 + meterPulse * 0.38) * tetherAlpha * 2.2, 0, 0.88);
            const meterSize   = Math.max(9, 13 / cam.zoom);
            // Offset glyph slightly above-right of the stroke head
            const gx = headPx.x + 18 / cam.zoom;
            const gy = headPx.y - 18 / cam.zoom;
            if (meterAlpha > 0.06) {
              context.save();
              context.globalAlpha   = meterAlpha;
              context.font          = `bold ${meterSize}px "Courier New", monospace`;
              context.textAlign     = "center";
              context.textBaseline  = "middle";
              context.shadowColor   = `hsla(${beaconForPreview.hue}, 94%, 88%, 0.9)`;
              context.shadowBlur    = 8 / cam.zoom;
              context.fillStyle     = `hsla(${beaconForPreview.hue}, 80%, 92%, 0.95)`;
              context.fillText(`${bSpec.sides}`, gx, gy);
              // Faint ring around digit
              context.beginPath();
              context.arc(gx, gy, meterSize * 0.82, 0, TAU);
              context.strokeStyle = `hsla(${beaconForPreview.hue}, 72%, 78%, ${meterAlpha * 0.44})`;
              context.lineWidth   = 0.8 / cam.zoom;
              context.stroke();
              context.restore();
            }
          }
        }
        // ── end clock proximity preview ───────────────────────────────────────
      }

      // ================================================================
      // Scope / musical-world rendering  (sigil + full-scope blend)
      // ================================================================
      //
      // sigilWeight controls the crossfade:
      //   1.0 → pure sigil glyph (full-collection / zoomed-out view)
      //   0.0 → pure full-scope rendering (zoomed into the scope)
      //
      const sigilWeight = clamp(
        1 - (cam.zoom - SIGIL_ZOOM_FULL) / (SIGIL_ZOOM_FADE - SIGIL_ZOOM_FULL),
        0,
        1,
      );
      const fullScopeWeight = 1 - sigilWeight;
      const renderedSatellites: RenderedMotifSatellite[] = [];

      const renderMotifSatellites = ({
        scopeId,
        centerX,
        centerY,
        orbitBaseRadius,
      }: {
        scopeId: ScopeId | null;
        centerX: number;
        centerY: number;
        orbitBaseRadius: number;
      }) => {
        if (sigilWeight < 0.08) {
          return;
        }

        const motifs = getPromotedMotifsForScope(motifsRef.current, scopeId);
        if (motifs.length === 0) {
          return;
        }

        motifs.forEach((motif, index) => {
          const ringIndex = Math.floor(index / MOTIF_MAX_SATELLITES_PER_RING);
          const slotIndex = index % MOTIF_MAX_SATELLITES_PER_RING;
          const slotsInRing = Math.min(
            MOTIF_MAX_SATELLITES_PER_RING,
            motifs.length - ringIndex * MOTIF_MAX_SATELLITES_PER_RING,
          );
          const baseAngle =
            (slotIndex / Math.max(slotsInRing, 1)) * TAU +
            motif.id * 0.23 +
            ringIndex * 0.31;
          const orbitAngle = baseAngle + now * 0.00006 * (ringIndex % 2 === 0 ? 1 : -1);
          const orbitRadius = orbitBaseRadius + (24 + ringIndex * 22) / cam.zoom;
          const radius =
            (7.4 +
              motif.rhythmSkeleton.density * 5.6 +
              (motif.lastAwakenedAt && now - motif.lastAwakenedAt < 4200 ? 1.8 : 0)) /
            cam.zoom;
          const x = centerX + Math.cos(orbitAngle) * orbitRadius;
          const y = centerY + Math.sin(orbitAngle) * orbitRadius;
          const isDragging = motifDragRef.current?.motifId === motif.id;
          const isAwake = simulationRef.current.loops.some((loop) => loop.motifId === motif.id);
          const alpha =
            sigilWeight *
            (isDragging ? 0.92 : isAwake ? 0.8 : 0.62) *
            (scopeId === cameraRef.current.focusScopeId ? 0.94 : 1);

          context.beginPath();
          context.moveTo(centerX, centerY);
          context.lineTo(x, y);
          context.strokeStyle = `hsla(${motif.hue}, 72%, 78%, ${alpha * 0.22})`;
          context.lineWidth = 0.8 / cam.zoom;
          context.setLineDash([3 / cam.zoom, 7 / cam.zoom]);
          context.lineDashOffset = -(now * 0.01);
          context.stroke();
          context.setLineDash([]);

          drawMotifSigil({
            ctx: context,
            cx: x,
            cy: y,
            radius,
            hue: motif.hue,
            role: motif.preferredRole,
            sigil: motif.canonicalSigil,
            rhythmSkeleton: motif.rhythmSkeleton,
            now,
            alpha,
            dormant: !isDragging,
            highlight: isAwake ? 0.26 : 0.08,
          });

          const worldX = x / size.width;
          const worldY = y / size.height;
          const [screenX, screenY] = worldToScreenPixels(worldX, worldY, cam, size);
          renderedSatellites.push({
            motifId: motif.id,
            scopeId,
            worldX,
            worldY,
            screenX,
            screenY,
            screenRadius: radius * cam.zoom * 1.22,
            alpha,
            angle: orbitAngle,
          });
        });
      };

      renderMotifSatellites({
        scopeId: null,
        centerX: size.width * 0.5,
        centerY: size.height * 0.5,
        orbitBaseRadius: Math.min(size.width, size.height) * 0.16,
      });

      for (const scope of scopesRef.current) {
        const cx = scope.cx * size.width;
        const cy = scope.cy * size.height;
        const rx = scope.rx * size.width;
        const ry = scope.ry * size.height;
        const age = now - scope.bornAt;
        const bornProg = clamp(age / 720, 0, 1);
        const isFocused = scope.id === cameraRef.current.focusScopeId;
        const maxR = Math.max(rx, ry);

        // Resolve effective musical context for this scope
        const effectiveCtx = resolveEffectiveScopeContext(
          scope.id,
          scopesRef.current,
          harmonic,
          sceneNameRef.current,
        );
        const effectiveTonic = effectiveCtx.harmonic.tonic;
        const effectiveMode = effectiveCtx.harmonic.mode;
        const effectiveBpm = effectiveCtx.harmonic.bpm;
        const effectiveScene = effectiveCtx.scene;

        // Beat phase for this scope's BPM (used by both sigil and clock emitter)
        const emitterBpm = scope.overrides.bpm ?? harmonic.bpm;
        const beatMs = 60000 / emitterBpm;
        const beatPhase = (now % beatMs) / beatMs;

        const scopeAllLoops = simulationRef.current.loops.filter(
          (loop) => loop.scopeId === scope.id,
        );
        const scopeActiveRoles = getScopeActiveRoles({
          loops: simulationRef.current.loops,
          now,
          scopeId: scope.id,
          effectiveBpm,
        });
        const motifDensity = getScopeMotifDensity(scopeAllLoops);

        context.save();

        // ── Taste currents (visible when zoomed in / focused) ──────────────
        if (bornProg > 0.3 && (1 - sigilWeight) > 0.1) {
          const tasteCurrentAlpha = clamp(
            (1 - sigilWeight) * bornProg * (isFocused ? 0.9 : 0.5),
            0,
            0.7,
          );
          if (tasteCurrentAlpha > 0.02) {
            const tasteField = ensureTasteCurrentField(
              scope,
              DEFAULT_TASTE_PROFILE,
              now,
            );
            drawTasteCurrents(
              context,
              cx,
              cy,
              rx,
              ry,
              scope.hue,
              tasteField,
              tasteCurrentAlpha,
              now,
            );
          }
        }

        // ── Sigil layer (visible when zoomed out / full-collection view) ──
        if (sigilWeight > 0.02 && bornProg > 0.1) {
          const sigilR = Math.min(maxR * 0.46, 52 / cam.zoom);
          const sigilAlpha = sigilWeight * bornProg * (isFocused ? 0.9 : 1.0);
          drawScopeSigil(
            context,
            cx,
            cy,
            sigilR,
            scope.hue,
            effectiveTonic,
            effectiveMode,
            effectiveBpm,
            effectiveScene,
            scopeActiveRoles,
            motifDensity,
            now,
            beatPhase,
            sigilAlpha,
            cadenceGlow,
          );

          // Scope label beneath the sigil (replaces the old center label)
          if (bornProg > 0.5) {
            const labelAlpha = sigilWeight * bornProg * (isFocused ? 0.80 : 0.46) * easeInOutSine(bornProg);
            const fontSize = Math.max(7, Math.min(13, sigilR * 0.48));
            context.font = `${fontSize / cam.zoom}px "Avenir Next Condensed","Franklin Gothic Medium","Arial Narrow",sans-serif`;
            context.fillStyle = `hsla(${scope.hue}, 58%, 86%, ${labelAlpha})`;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.letterSpacing = "0.22em";
            context.fillText(scope.label.toUpperCase(), cx, cy + sigilR * 1.52);
            context.letterSpacing = "";
          }

          renderMotifSatellites({
            scopeId: scope.id,
            centerX: cx,
            centerY: cy,
            orbitBaseRadius: sigilR * 1.3,
          });
        }

        // ── Full scope layer (visible when zoomed in / focused) ────────────
        if (fullScopeWeight > 0.02) {
          const fw = fullScopeWeight * bornProg;

          // 1. Soft elliptical fill: inner mist
          const scopeFill = context.createRadialGradient(cx, cy, 0, cx, cy, maxR);
          scopeFill.addColorStop(
            0,
            `hsla(${scope.hue}, 68%, 62%, ${fw * (isFocused ? 0.13 : 0.06)})`,
          );
          scopeFill.addColorStop(
            0.55,
            `hsla(${scope.hue}, 60%, 54%, ${fw * (isFocused ? 0.07 : 0.03)})`,
          );
          scopeFill.addColorStop(1, `hsla(${scope.hue}, 48%, 40%, 0)`);

          context.beginPath();
          context.ellipse(cx, cy, rx * bornProg, ry * bornProg, 0, 0, TAU);
          context.fillStyle = scopeFill;
          context.fill();

          // 2. Ellipse border: softly dashed, animated drift
          context.beginPath();
          context.ellipse(cx, cy, rx * bornProg, ry * bornProg, 0, 0, TAU);
          context.strokeStyle = `hsla(${scope.hue}, 82%, 74%, ${
            fw * (isFocused ? 0.72 : 0.34)
          })`;
          context.lineWidth = isFocused ? 1.6 / cam.zoom : 1.0 / cam.zoom;
          context.setLineDash([5 / cam.zoom, 10 / cam.zoom]);
          context.lineDashOffset = -(now * 0.011);
          context.stroke();
          context.setLineDash([]);

          // 3. Clock emitter: concentric beat rings radiating from scope centre
          const numRings = isFocused ? 4 : 3;
          for (let ring = 0; ring < numRings; ring++) {
            const ringPhase = modulo(beatPhase - ring / numRings, 1);
            const ringRadius = maxR * (0.05 + ringPhase * 0.68);
            const ringAlpha = easeOutCubic(1 - ringPhase) * fw * (isFocused ? 0.44 : 0.20);
            if (ringAlpha < 0.02) continue;
            context.beginPath();
            context.arc(cx, cy, ringRadius, 0, TAU);
            context.strokeStyle = `hsla(${scope.hue}, 90%, 82%, ${ringAlpha})`;
            context.lineWidth = (1 + (1 - ringPhase) * 1.2) / cam.zoom;
            context.stroke();
          }

          // 4. Label at scope centre (only in full-scope mode)
          if (bornProg > 0.5) {
            const labelAlpha = fw * (isFocused ? 0.78 : 0.42) * easeInOutSine(bornProg);
            const fontSize = Math.max(8, Math.min(15, maxR * 0.055));
            context.font = `${fontSize / cam.zoom}px "Avenir Next Condensed","Franklin Gothic Medium","Arial Narrow",sans-serif`;
            context.fillStyle = `hsla(${scope.hue}, 60%, 88%, ${labelAlpha})`;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.letterSpacing = "0.18em";
            context.fillText(scope.label.toUpperCase(), cx, cy);
            context.letterSpacing = "";
          }

          // 5. Focus ring: bright pulse around the focused scope
          if (isFocused) {
            const pulseAmt = 0.5 + 0.5 * Math.sin(now * 0.0022);
            context.beginPath();
            context.ellipse(cx, cy, rx + 6 / cam.zoom, ry + 6 / cam.zoom, 0, 0, TAU);
            context.strokeStyle = `hsla(${scope.hue}, 100%, 88%, ${(0.24 + pulseAmt * 0.18) * fullScopeWeight})`;
            context.lineWidth = 2 / cam.zoom;
            context.stroke();
          }
        }

        context.restore();
      }

      motifSatellitesRef.current = renderedSatellites;

      if (motifDragRef.current) {
        const drag = motifDragRef.current;
        const motif = motifsRef.current.find((candidate) => candidate.id === drag.motifId);
        if (motif) {
          const homeScope =
            drag.homeScopeId === null
              ? null
              : scopesRef.current.find((candidate) => candidate.id === drag.homeScopeId) ?? null;
          const homeX = (homeScope?.cx ?? 0.5) * size.width;
          const homeY = (homeScope?.cy ?? 0.5) * size.height;
          const dragX = drag.currentWorldX * size.width;
          const dragY = drag.currentWorldY * size.height;

          context.beginPath();
          context.moveTo(homeX, homeY);
          context.lineTo(dragX, dragY);
          context.strokeStyle = `hsla(${motif.hue}, 88%, 82%, ${0.34 * sigilWeight})`;
          context.lineWidth = 1.2 / cam.zoom;
          context.setLineDash([6 / cam.zoom, 9 / cam.zoom]);
          context.lineDashOffset = -(now * 0.016);
          context.stroke();
          context.setLineDash([]);

          const targetScope =
            findScopeAt(drag.currentWorldX, drag.currentWorldY, scopesRef.current) ??
            homeScope;
          const previewSpan = targetScope
            ? Math.min(targetScope.rx, targetScope.ry) * 1.08
            : motif.preferredRole === "bass"
              ? 0.24
              : 0.18;
          const previewPoints = materializeMotifContour({
            motif,
            center: { x: drag.currentWorldX, y: drag.currentWorldY },
            span: previewSpan,
            scope: targetScope,
          });

          drawPolyline(
            context,
            size,
            previewPoints,
            `hsla(${motif.hue}, 92%, 84%, ${0.22 + sigilWeight * 0.18})`,
            2.2 / cam.zoom,
          );

          drawMotifSigil({
            ctx: context,
            cx: dragX,
            cy: dragY,
            radius: 10 / cam.zoom,
            hue: motif.hue,
            role: motif.preferredRole,
            sigil: motif.canonicalSigil,
            rhythmSkeleton: motif.rhythmSkeleton,
            now,
            alpha: 0.96,
            dormant: false,
            highlight: 0.42,
          });
        }
      }
      // ================================================================
      // end scope rendering
      // ================================================================

      // ── Clock-latch tether rendering ────────────────────────────────────
      // Ephemeral glowing tethers drawn for ~1.6 s after a contour latches
      // onto a nearby polygon clock beacon.  Drawn last so they float above
      // all sigils / contours.
      latchTethersRef.current = latchTethersRef.current.filter(
        (t) => now - t.bornAt < t.ttl,
      );
      for (const tether of latchTethersRef.current) {
        const age     = now - tether.bornAt;
        const progress = clamp(age / tether.ttl, 0, 1);
        // Envelope: fast rise (first 10 %), long decay
        const rise  = Math.min(age / (tether.ttl * 0.10), 1);
        // Tide modulation: boost tether visibility if a wavefront covers it
        const tetherMidX = (tether.fromWorldX + tether.toWorldX) * 0.5;
        const tetherMidY = (tether.fromWorldY + tether.toWorldY) * 0.5;
        const tetherTideMod = getTideModulation(tetherMidX, tetherMidY, state.tideWaves, now)
          + getTideInterferenceMod(tetherMidX, tetherMidY, interferenceNodes) * 1.4;
        const alpha = (rise * (1 - progress) ** 1.4 * 0.78) * (1 + tetherTideMod * 0.6);
        if (alpha < 0.01) continue;

        const fromPx = {
          x: tether.fromWorldX * size.width,
          y: tether.fromWorldY * size.height,
        };
        const toPx = {
          x: tether.toWorldX * size.width,
          y: tether.toWorldY * size.height,
        };

        // ── Outer glow halo along the line ──────────────────────────────
        context.save();
        context.globalAlpha = alpha * 0.45;
        context.lineWidth   = 6 / cam.zoom;
        context.strokeStyle = `hsla(${tether.beaconHue}, 82%, 76%, 0.4)`;
        context.shadowColor = `hsla(${tether.beaconHue}, 90%, 84%, 0.8)`;
        context.shadowBlur  = 14 / cam.zoom;
        context.beginPath();
        context.moveTo(fromPx.x, fromPx.y);
        context.lineTo(toPx.x, toPx.y);
        context.stroke();
        context.restore();

        // ── Dashed inner tether ──────────────────────────────────────────
        const dashLen = 4 / cam.zoom;
        const gapLen  = 7 / cam.zoom;
        context.save();
        context.globalAlpha   = alpha;
        context.setLineDash([dashLen, gapLen]);
        context.lineDashOffset = -(now * 0.022);
        context.lineWidth      = 1.5 / cam.zoom;
        const tetherGrad = context.createLinearGradient(
          fromPx.x, fromPx.y, toPx.x, toPx.y,
        );
        tetherGrad.addColorStop(0, `hsla(${tether.contourHue}, 88%, 78%, 0.7)`);
        tetherGrad.addColorStop(1, `hsla(${tether.beaconHue},  92%, 86%, 0.95)`);
        context.strokeStyle    = tetherGrad;
        context.shadowColor    = `hsla(${tether.beaconHue}, 88%, 86%, 0.6)`;
        context.shadowBlur     = 5 / cam.zoom;
        context.beginPath();
        context.moveTo(fromPx.x, fromPx.y);
        context.lineTo(toPx.x, toPx.y);
        context.stroke();
        context.setLineDash([]);
        context.restore();

        // ── Travelling pulse: bright comet beacon → contour ─────────────
        // Pulse completes in the first 65 % of the tether lifetime
        const pulseT = clamp(progress / 0.65, 0, 1);
        const pulsePx = {
          x: lerp(toPx.x, fromPx.x, pulseT),
          y: lerp(toPx.y, fromPx.y, pulseT),
        };
        const pulseAlpha = (1 - pulseT) * alpha * 1.3;
        if (pulseAlpha > 0.02) {
          context.save();
          context.globalAlpha = clamp(pulseAlpha, 0, 1);
          // Comet tail
          const tailCount = 5;
          for (let ti = 0; ti < tailCount; ti += 1) {
            const tailT   = pulseT - (ti + 1) * 0.04;
            if (tailT < 0) continue;
            const tailPx  = {
              x: lerp(toPx.x, fromPx.x, tailT),
              y: lerp(toPx.y, fromPx.y, tailT),
            };
            const tailAlpha = ((tailCount - ti) / tailCount) * pulseAlpha * 0.5;
            context.beginPath();
            context.arc(tailPx.x, tailPx.y, (2.5 - ti * 0.3) / cam.zoom, 0, TAU);
            context.fillStyle = `hsla(${tether.beaconHue}, 90%, 88%, ${tailAlpha})`;
            context.fill();
          }
          // Pulse head
          context.beginPath();
          context.arc(pulsePx.x, pulsePx.y, 4 / cam.zoom, 0, TAU);
          context.fillStyle  = `hsla(${tether.beaconHue}, 96%, 94%, 0.95)`;
          context.shadowColor = `hsla(${tether.beaconHue}, 100%, 96%, 1)`;
          context.shadowBlur  = 10 / cam.zoom;
          context.fill();
          context.restore();
        }
      }
      // ── end latch tether rendering ──────────────────────────────────────

      // Close camera transform
      context.restore();

      // ── Screen-space overlays (outside camera transform) ─────────────────
      // These draw in CSS-pixel coordinates on top of the world canvas.

      // Radial shape palette (palette-open state)
      const paletteMode = gestureModeRef.current;
      if (paletteMode.kind === "palette-open") {
        drawShapePalette(
          context,
          paletteMode.anchorScreenX,
          paletteMode.anchorScreenY,
          paletteMode.hoveredSides,
          paletteMode.openedAt,
          now,
        );
      }

      // Long-press progress ring (pending palette state)
      const lpAnchor = longPressAnchorRef.current;
      const lpMode   = gestureModeRef.current;
      if (
        lpAnchor !== null &&
        longPressTimerRef.current !== null &&
        lpMode.kind === "musical" &&
        (lpMode as Extract<GestureMode, { kind: "musical" }>).pointerId === lpAnchor.pointerId
      ) {
        const elapsed  = now - lpAnchor.startedAt;
        const progress = Math.min(elapsed / LONG_PRESS_MS, 1);
        const ringR    = 16 + progress * 14;
        const alpha    = 0.22 + progress * 0.44;
        context.save();
        context.beginPath();
        context.arc(lpAnchor.screenX, lpAnchor.screenY, ringR, 0, Math.PI * 2);
        context.strokeStyle = `hsla(210, 70%, 78%, ${alpha})`;
        context.lineWidth   = 1.5;
        context.setLineDash([5, 5]);
        context.lineDashOffset = -(now * 0.014);
        context.stroke();
        context.setLineDash([]);
        context.restore();
      }

      animationFrameRef.current = window.requestAnimationFrame(frame);
    };

    animationFrameRef.current = window.requestAnimationFrame(frame);

    // Wheel zoom – passive:false so we can preventDefault
    surface.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      observer.disconnect();
      surface.removeEventListener("wheel", handleWheel);
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

  const getMotifHit = (screenX: number, screenY: number) =>
    [...motifSatellitesRef.current]
      .reverse()
      .find((satellite) => {
        if (satellite.alpha < 0.08) {
          return false;
        }

        return (
          Math.hypot(screenX - satellite.screenX, screenY - satellite.screenY) <=
          satellite.screenRadius
        );
      });

  // -------------------------------------------------------------------------
  // helpers used by the state-machine touch handlers
  // -------------------------------------------------------------------------

  /**
   * Returns the active polygon ContourLoop under the given screen coords, if any.
   * Uses world-space hit detection with a 1.4x radius margin.
   */
  const getPolygonLoopHit = (screenX: number, screenY: number): ContourLoop | null => {
    const cam = cameraRef.current;
    const size = sizeRef.current;
    const worldNormX = (screenX / size.width - 0.5) / cam.zoom + cam.viewCx;
    const worldNormY = (screenY / size.height - 0.5) / cam.zoom + cam.viewCy;
    const worldPxX = worldNormX * size.width;
    const worldPxY = worldNormY * size.height;
    const minDim = Math.min(size.width, size.height);
    const now = performance.now();
    for (const loop of simulationRef.current.loops) {
      if (!loop.polygonSpec || now < loop.scheduledAtMs) continue;
      const spec = loop.polygonSpec;
      const pxCx = spec.cx * size.width;
      const pxCy = spec.cy * size.height;
      const pxR  = spec.rFraction * minDim;
      if (Math.hypot(worldPxX - pxCx, worldPxY - pxCy) <= pxR * 1.4) {
        return loop;
      }
    }
    return null;
  };

  /**
   * Returns the filament whose arc midpoint is within ~20px of the given screen coords.
   * Used to cycle binding mode on tap.
   */
  const getFilamentHit = (screenX: number, screenY: number): ResonanceFilament | null => {
    const cam = cameraRef.current;
    const size = sizeRef.current;
    const worldNormX = (screenX / size.width - 0.5) / cam.zoom + cam.viewCx;
    const worldNormY = (screenY / size.height - 0.5) / cam.zoom + cam.viewCy;
    const worldPxX = worldNormX * size.width;
    const worldPxY = worldNormY * size.height;
    const hitRadius = 22 / cam.zoom; // world-space pixels
    for (const fil of simulationRef.current.filaments) {
      const loopA = simulationRef.current.loops.find((l) => l.id === fil.loopIdA);
      const loopB = simulationRef.current.loops.find((l) => l.id === fil.loopIdB);
      if (!loopA?.polygonSpec || !loopB?.polygonSpec) continue;
      const ax = loopA.polygonSpec.cx * size.width;
      const ay = loopA.polygonSpec.cy * size.height;
      const bx = loopB.polygonSpec.cx * size.width;
      const by = loopB.polygonSpec.cy * size.height;
      const midX = (ax + bx) * 0.5;
      const midY = (ay + by) * 0.5;
      if (Math.hypot(worldPxX - midX, worldPxY - midY) <= hitRadius) {
        return fil;
      }
    }
    return null;
  };

  /** Compute screen-normalised coords for a pointer event relative to the surface element */
  const getScreenNorm = (event: ReactPointerEvent<HTMLDivElement>, bounds: DOMRect) => ({
    sx: (event.clientX - bounds.left) / bounds.width,
    sy: (event.clientY - bounds.top) / bounds.height,
  });

  /**
   * Initialise two-finger camera mode.
   * id0 / s0* refer to the first finger already active; id1 / s1* to the new one.
   * The pinch anchor is computed using the TARGET camera state so rapid wheel/pinch
   * sequences accumulate correctly without drift.
   */
  const beginCameraMode = (
    id0: number, s0x: number, s0y: number,
    id1: number, s1x: number, s1y: number,
  ) => {
    const cam = cameraRef.current;
    const midX = (s0x + s1x) * 0.5;
    const midY = (s0y + s1y) * 0.5;
    // Use target values so anchor is stable even during a mid-lerp camera
    const anchorWorldX = (midX - 0.5) / cam.targetZoom + cam.targetViewCx;
    const anchorWorldY = (midY - 0.5) / cam.targetZoom + cam.targetViewCy;
    const initialDist = Math.hypot(s1x - s0x, s1y - s0y);

    gestureModeRef.current = {
      kind: "camera",
      id0, screen0X: s0x, screen0Y: s0y,
      id1, screen1X: s1x, screen1Y: s1y,
      anchorWorldX, anchorWorldY,
      initialZoom: cam.targetZoom,
      initialDist: Math.max(initialDist, 0.001),
    };
  };

  const beginTouch = async (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const surface = surfaceRef.current;
    if (!surface) return;

    const bounds = surface.getBoundingClientRect();
    const { sx: screenNormX, sy: screenNormY } = getScreenNorm(event, bounds);
    const screenX = event.clientX - bounds.left;
    const screenY = event.clientY - bounds.top;
    const mode = gestureModeRef.current;

    // ---- idle → motif-drag or filament-drag or musical ----
    if (mode.kind === "idle") {
      const motifHit = getMotifHit(screenX, screenY);
      if (motifHit) {
        surface.setPointerCapture(event.pointerId);
        motifDragRef.current = {
          pointerId: event.pointerId,
          motifId: motifHit.motifId,
          homeScopeId: motifHit.scopeId,
          anchorAngle: motifHit.angle,
          startScreenX: screenX,
          startScreenY: screenY,
          currentWorldX: motifHit.worldX,
          currentWorldY: motifHit.worldY,
          currentScreenX: screenX,
          currentScreenY: screenY,
          dragging: false,
        };
        gestureModeRef.current = { kind: "motif-drag", pointerId: event.pointerId };
        lastInteractionAtRef.current = performance.now();
        return;
      }

      // Tap on a filament midpoint → cycle its binding mode
      const filamentHit = getFilamentHit(screenX, screenY);
      if (filamentHit) {
        const modes: BindingMode[] = ["ratio-lock", "phase-align", "call-offset"];
        const next = modes[(modes.indexOf(filamentHit.mode) + 1) % modes.length];
        filamentHit.mode = next;
        lastInteractionAtRef.current = performance.now();
        return;
      }

      // Polygon sigil → begin filament drag (connect two polygons)
      const polygonHit = getPolygonLoopHit(screenX, screenY);
      if (polygonHit) {
        const cam = cameraRef.current;
        const size = sizeRef.current;
        const worldNormX = (screenX / size.width - 0.5) / cam.zoom + cam.viewCx;
        const worldNormY = (screenY / size.height - 0.5) / cam.zoom + cam.viewCy;
        surface.setPointerCapture(event.pointerId);
        filamentDragRef.current = {
          pointerId: event.pointerId,
          fromLoopId: polygonHit.id,
          currentWorldX: worldNormX,
          currentWorldY: worldNormY,
        };
        gestureModeRef.current = { kind: "filament-drag", pointerId: event.pointerId };
        lastInteractionAtRef.current = performance.now();
        return;
      }

      // Start a single-finger musical gesture
      surface.setPointerCapture(event.pointerId);
      await ensureAudio();

      const now = performance.now();
      const pointValue = makeSurfacePoint(event, surface, now, cameraRef.current);
      const previewScope = findScopeAt(pointValue.x, pointValue.y, scopesRef.current);
      const { harmonic: previewHarmonic } = resolveEffectiveScopeContext(
        previewScope?.id ?? null,
        scopesRef.current,
        harmonicStateRef.current,
        sceneNameRef.current,
      );
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
      gestureModeRef.current = { kind: "musical", pointerId: event.pointerId };
      lastInteractionAtRef.current = now;
      syncActiveCount();
      pushFlash(pointValue, previewRole ?? "lead", hue, 0.62, "touch");
      playMelodicTone({
        midi: getPreviewMidi(pointValue, now, previewRole, previewHarmonic),
        hue,
        accent: 0.44,
        durationMs: getBeatMs(previewHarmonic) * 0.34,
        voice: previewRole ?? "touch",
      });

      // ── Long-press → radial shape palette ──────────────────────────────────
      // After LONG_PRESS_MS of stillness the musical gesture is abandoned and
      // the radial shape palette blooms at the anchor point instead.
      const lpCam = cameraRef.current;
      longPressAnchorRef.current = {
        worldX:    (screenNormX - 0.5) / lpCam.zoom + lpCam.viewCx,
        worldY:    (screenNormY - 0.5) / lpCam.zoom + lpCam.viewCy,
        screenX,
        screenY,
        pointerId: event.pointerId,
        startedAt: now,
      };
      const capturedLPId = event.pointerId;
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        const currentMode = gestureModeRef.current;
        if (currentMode.kind !== "musical" || currentMode.pointerId !== capturedLPId) {
          longPressAnchorRef.current = null;
          return;
        }
        const anchor = longPressAnchorRef.current;
        if (!anchor || anchor.pointerId !== capturedLPId) return;

        // Abandon the in-progress musical gesture (no voice emits)
        simulationRef.current.activeTouches.delete(capturedLPId);
        syncActiveCount();

        // Open the palette
        gestureModeRef.current = {
          kind: "palette-open",
          pointerId:     capturedLPId,
          anchorWorldX:  anchor.worldX,
          anchorWorldY:  anchor.worldY,
          anchorScreenX: anchor.screenX,
          anchorScreenY: anchor.screenY,
          openedAt:      performance.now(),
          hoveredSides:  null,
        };
        longPressAnchorRef.current = null;

        // Soft crystalline summon tone
        playMelodicTone({ midi: 72, hue: 210, accent: 0.22, durationMs: 340, voice: "echo" });
      }, LONG_PRESS_MS);

      return;
    }

    // ---- musical + second finger → discard musical gesture, enter camera ----
    if (mode.kind === "musical") {
      const cam = cameraRef.current;
      // Recover first finger's last screen-normalised position from its stored world coord
      const firstTouch = simulationRef.current.activeTouches.get(mode.pointerId);
      let s0x = 0.5;
      let s0y = 0.5;
      if (firstTouch && firstTouch.points.length > 0) {
        const lp = firstTouch.points[firstTouch.points.length - 1];
        // Invert the camera transform: screenNorm = (worldX - viewCx) * zoom + 0.5
        s0x = clamp((lp.x - cam.viewCx) * cam.zoom + 0.5, 0, 1);
        s0y = clamp((lp.y - cam.viewCy) * cam.zoom + 0.5, 0, 1);
      }

      // Discard the musical gesture — do NOT call finalizeTouch (no voice should emit)
      if (longPressTimerRef.current !== null) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
        longPressAnchorRef.current = null;
      }
      simulationRef.current.activeTouches.delete(mode.pointerId);
      syncActiveCount();
      // Keep pointer capture on id0 so its move/up events still arrive

      surface.setPointerCapture(event.pointerId);
      beginCameraMode(mode.pointerId, s0x, s0y, event.pointerId, screenNormX, screenNormY);
      lastInteractionAtRef.current = performance.now();
      return;
    }

    // All other modes (camera, motif-drag): ignore additional fingers
  };

  const moveTouch = (event: ReactPointerEvent<HTMLDivElement>) => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const bounds = surface.getBoundingClientRect();
    const mode = gestureModeRef.current;

    // ---- palette-open: track which wedge the finger is hovering ----
    if (mode.kind === "palette-open" && mode.pointerId === event.pointerId) {
      const dx = event.clientX - bounds.left - mode.anchorScreenX;
      const dy = event.clientY - bounds.top  - mode.anchorScreenY;
      const dist = Math.hypot(dx, dy);

      let hoveredSides: number | null = null;
      if (dist > PALETTE_INNER_DEAD_ZONE_PX) {
        const angle = Math.atan2(dy, dx);
        let best = PALETTE_WEDGE_DEFS[0];
        let bestDiff = Infinity;
        for (const w of PALETTE_WEDGE_DEFS) {
          let diff = Math.abs(angle - w.angle);
          if (diff > Math.PI) diff = Math.PI * 2 - diff;
          if (diff < bestDiff) { bestDiff = diff; best = w; }
        }
        // Accept only if the angle falls within a wedge span (90° / 2 + small margin)
        if (bestDiff <= Math.PI / 4 + 0.06) hoveredSides = best.sides;
      }

      gestureModeRef.current = { ...mode, hoveredSides };
      lastInteractionAtRef.current = performance.now();
      return;
    }

    // ---- motif-drag ----
    if (mode.kind === "motif-drag" && mode.pointerId === event.pointerId) {
      const motifDrag = motifDragRef.current;
      if (!motifDrag) return;
      const { sx: screenNormX, sy: screenNormY } = getScreenNorm(event, bounds);
      const [worldX, worldY] = screenToWorld(screenNormX, screenNormY, cameraRef.current);
      const screenX = event.clientX - bounds.left;
      const screenY = event.clientY - bounds.top;
      motifDrag.currentWorldX = worldX;
      motifDrag.currentWorldY = worldY;
      motifDrag.currentScreenX = screenX;
      motifDrag.currentScreenY = screenY;
      if (
        !motifDrag.dragging &&
        Math.hypot(screenX - motifDrag.startScreenX, screenY - motifDrag.startScreenY) >=
          MOTIF_DRAG_THRESHOLD_PX
      ) {
        motifDrag.dragging = true;
      }
      lastInteractionAtRef.current = performance.now();
      return;
    }

    // ---- filament-drag ----
    if (mode.kind === "filament-drag" && mode.pointerId === event.pointerId) {
      const fd = filamentDragRef.current;
      if (!fd) return;
      const { sx: screenNormX, sy: screenNormY } = getScreenNorm(event, bounds);
      const [worldX, worldY] = screenToWorld(screenNormX, screenNormY, cameraRef.current);
      fd.currentWorldX = worldX;
      fd.currentWorldY = worldY;
      lastInteractionAtRef.current = performance.now();
      return;
    }

    // ---- musical (single-finger) ----
    if (mode.kind === "musical" && mode.pointerId === event.pointerId) {
      const touch = simulationRef.current.activeTouches.get(event.pointerId);
      if (!touch) return;

      const now = performance.now();
      const pointValue = makeSurfacePoint(event, surface, now, cameraRef.current);
      const lastPoint = touch.points.at(-1);

      if (!lastPoint) {
        touch.points.push(pointValue);
        return;
      }

      const gap = distance(lastPoint, pointValue);
      if (gap < 0.003 && now - touch.lastSampleAt < 16) return;

      touch.travel += gap;
      touch.lastSampleAt = now;
      touch.points.push(pointValue);
      if (touch.points.length > MAX_POINTS_PER_GESTURE) {
        touch.points.shift();
      }
      lastInteractionAtRef.current = now;

      // ── Cancel long-press timer if the finger has moved far enough ────────
      if (longPressTimerRef.current !== null) {
        const lpAnchor = longPressAnchorRef.current;
        if (lpAnchor && lpAnchor.pointerId === event.pointerId) {
          const mdx = event.clientX - bounds.left - lpAnchor.screenX;
          const mdy = event.clientY - bounds.top  - lpAnchor.screenY;
          if (Math.hypot(mdx, mdy) > LONG_PRESS_MOVE_CANCEL_PX) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
            longPressAnchorRef.current = null;
          }
        }
      }

      // ── Magnetic closure halo — auto-close when stroke nears the start ──────
      // Only activates once enough travel has accumulated to rule out short
      // gestures.  Pointer type determines the halo radius: touch gets a much
      // larger snap zone than mouse/pen.
      if (
        touch.points.length >= 6 &&
        !touch.previewRole &&
        now - touch.bornAt >= POLYGON_MIN_DURATION_MS
      ) {
        const minDim = Math.min(sizeRef.current.width, sizeRef.current.height);
        const haloFrac =
          event.pointerType === "touch"
            ? POLYGON_HALO_RADIUS_TOUCH
            : POLYGON_HALO_RADIUS_MOUSE;
        const haloDistNorm = haloFrac * minDim
          / Math.max(sizeRef.current.width, sizeRef.current.height);

        const firstPt = touch.points[0];
        const travelSufficient =
          touch.travel * Math.min(sizeRef.current.width, sizeRef.current.height)
          >= POLYGON_HALO_MIN_TRAVEL_FRAC * minDim;

        if (
          travelSufficient &&
          distance(pointValue, firstPt) <= haloDistNorm
        ) {
          // Snap the last point to the first point for clean closure, then
          // trigger finalizeTouch so detectPolygon runs on the closed path.
          touch.points[touch.points.length - 1] = { ...firstPt, t: pointValue.t };
          finalizeTouch(event.pointerId);
          gestureModeRef.current = { kind: "idle" };
          if (surface.hasPointerCapture(event.pointerId)) {
            surface.releasePointerCapture(event.pointerId);
          }
          return;
        }
      }
      // ── end magnetic closure ─────────────────────────────────────────────────
      return;
    }

    // ---- camera (two-finger pinch/pan) ----
    if (mode.kind === "camera") {
      const isFirst = event.pointerId === mode.id0;
      const isSecond = event.pointerId === mode.id1;
      if (!isFirst && !isSecond) return;

      const { sx, sy } = getScreenNorm(event, bounds);

      // Update the moving finger's screen position in the mode record
      const updated: GestureMode =
        isFirst
          ? { ...mode, screen0X: sx, screen0Y: sy }
          : { ...mode, screen1X: sx, screen1Y: sy };
      gestureModeRef.current = updated;
      const cam = updated as Extract<GestureMode, { kind: "camera" }>;

      // ---- Zoom: absolute ratio from pinch-start distance (no delta drift) ----
      const currentDist = Math.hypot(
        cam.screen1X - cam.screen0X,
        cam.screen1Y - cam.screen0Y,
      );
      const newZoom = clamp(
        cam.initialZoom * (currentDist / cam.initialDist),
        1,
        SCOPE_MAX_ZOOM,
      );

      // ---- Pan + anchor lock ----
      // Keep the anchor world-point exactly under the live centroid.
      // Formula: viewCx = anchorWorld - (centroidScreen - 0.5) / newZoom
      const midX = (cam.screen0X + cam.screen1X) * 0.5;
      const midY = (cam.screen0Y + cam.screen1Y) * 0.5;
      const camera = cameraRef.current;
      camera.targetZoom = newZoom;
      camera.targetViewCx = clamp(cam.anchorWorldX - (midX - 0.5) / newZoom, 0.05, 0.95);
      camera.targetViewCy = clamp(cam.anchorWorldY - (midY - 0.5) / newZoom, 0.05, 0.95);

      // ---- Scope enter / exit ----
      if (newZoom < 1.12 && camera.focusScopeId !== null) {
        exitScope();
      } else if (newZoom > 1.4 && camera.focusScopeId === null) {
        // The anchor world point is always under the centroid — use it to find nearby scope
        const nearest = findScopeAt(cam.anchorWorldX, cam.anchorWorldY, scopesRef.current);
        if (nearest) enterScope(nearest.id);
      }

      lastInteractionAtRef.current = performance.now();
    }
  };

  const releaseCapture = (surface: HTMLDivElement, pointerId: number) => {
    if (surface.hasPointerCapture(pointerId)) {
      surface.releasePointerCapture(pointerId);
    }
  };

  const endTouch = (event: ReactPointerEvent<HTMLDivElement>) => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const mode = gestureModeRef.current;

    // ---- motif-drag ends ----
    if (mode.kind === "motif-drag" && mode.pointerId === event.pointerId) {
      const drag = motifDragRef.current;
      if (drag) {
        const homeScope =
          drag.homeScopeId === null
            ? null
            : scopesRef.current.find((scope) => scope.id === drag.homeScopeId) ?? null;
        const releaseScope = findScopeAt(
          drag.currentWorldX,
          drag.currentWorldY,
          scopesRef.current,
        );
        const targetScope = drag.dragging ? releaseScope : homeScope;
        const center = drag.dragging
          ? { x: drag.currentWorldX, y: drag.currentWorldY }
          : targetScope
            ? {
                x: targetScope.cx + Math.cos(drag.anchorAngle) * targetScope.rx * 0.34,
                y: targetScope.cy + Math.sin(drag.anchorAngle) * targetScope.ry * 0.34,
              }
            : {
                x: 0.5 + Math.cos(drag.anchorAngle) * 0.12,
                y: 0.5 + Math.sin(drag.anchorAngle) * 0.12,
              };
        motifDragRef.current = null;
        void awakenMotif({
          motifId: drag.motifId,
          targetScopeId: targetScope?.id ?? null,
          center,
        });
      }
      gestureModeRef.current = { kind: "idle" };
      releaseCapture(surface, event.pointerId);
      return;
    }

    // ---- filament-drag ends: create filament if released over another polygon ----
    if (mode.kind === "filament-drag" && mode.pointerId === event.pointerId) {
      const fd = filamentDragRef.current;
      if (fd) {
        const bounds = surface.getBoundingClientRect();
        const screenX = event.clientX - bounds.left;
        const screenY = event.clientY - bounds.top;
        const targetLoop = getPolygonLoopHit(screenX, screenY);
        if (targetLoop && targetLoop.id !== fd.fromLoopId) {
          const sim = simulationRef.current;
          const pairKey = [fd.fromLoopId, targetLoop.id].sort().join("-");
          const alreadyExists = sim.filaments.some(
            (f) =>
              (f.loopIdA === fd.fromLoopId && f.loopIdB === targetLoop.id) ||
              (f.loopIdA === targetLoop.id && f.loopIdB === fd.fromLoopId),
          );
          if (!alreadyExists) {
            sim.filaments.push({
              id: ++filamentIdRef.current,
              loopIdA: fd.fromLoopId,
              loopIdB: targetLoop.id,
              mode: "ratio-lock",
              bornAt: performance.now(),
              lastStepA: -1,
              lastStepB: -1,
              pulses: [],
            });
            // phase-align: snap both loops to the same bar phase
            const loopA = sim.loops.find((l) => l.id === fd.fromLoopId);
            const loopB = sim.loops.find((l) => l.id === targetLoop.id);
            if (loopA && loopB) {
              const now = performance.now();
              const phaseRef = loopA.scheduledAtMs;
              const barMs = getBarMs(harmonicStateRef.current);
              // Align loopB phase to loopA
              const offset = ((now - phaseRef) % barMs + barMs) % barMs;
              loopB.scheduledAtMs = now - offset + barMs;
            }
          }
          void pairKey; // used above for alreadyExists check clarity
        }
        filamentDragRef.current = null;
      }
      gestureModeRef.current = { kind: "idle" };
      releaseCapture(surface, event.pointerId);
      return;
    }

    // ---- palette-open: releasing over a wedge stamps the shape ----
    if (mode.kind === "palette-open" && mode.pointerId === event.pointerId) {
      if (mode.hoveredSides !== null) {
        stampShapeFromPalette(mode.hoveredSides, mode.anchorWorldX, mode.anchorWorldY);
      }
      gestureModeRef.current = { kind: "idle" };
      releaseCapture(surface, event.pointerId);
      return;
    }

    // ---- musical gesture ends → finalize into voice ----
    if (mode.kind === "musical" && mode.pointerId === event.pointerId) {
      // Cancel any pending long-press timer
      if (longPressTimerRef.current !== null) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
        longPressAnchorRef.current = null;
      }
      finalizeTouch(event.pointerId);
      gestureModeRef.current = { kind: "idle" };
      releaseCapture(surface, event.pointerId);
      return;
    }

    // ---- camera: either finger lifting ends the gesture ----
    if (
      mode.kind === "camera" &&
      (event.pointerId === mode.id0 || event.pointerId === mode.id1)
    ) {
      // Release both captures; the non-lifting finger's pointerUp will arrive next
      // and be gracefully ignored since we're already idle.
      releaseCapture(surface, mode.id0);
      releaseCapture(surface, mode.id1);
      gestureModeRef.current = { kind: "idle" };
      lastInteractionAtRef.current = performance.now();
      return;
    }
  };

  const cancelTouch = (event: ReactPointerEvent<HTMLDivElement>) => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const mode = gestureModeRef.current;

    if (mode.kind === "motif-drag" && mode.pointerId === event.pointerId) {
      motifDragRef.current = null;
      gestureModeRef.current = { kind: "idle" };
      releaseCapture(surface, event.pointerId);
      return;
    }

    if (mode.kind === "filament-drag" && mode.pointerId === event.pointerId) {
      filamentDragRef.current = null;
      gestureModeRef.current = { kind: "idle" };
      releaseCapture(surface, event.pointerId);
      return;
    }

    if (mode.kind === "palette-open" && mode.pointerId === event.pointerId) {
      gestureModeRef.current = { kind: "idle" };
      releaseCapture(surface, event.pointerId);
      return;
    }

    if (mode.kind === "musical" && mode.pointerId === event.pointerId) {
      // Cancel any pending long-press timer
      if (longPressTimerRef.current !== null) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
        longPressAnchorRef.current = null;
      }
      // On cancel, discard the gesture (don't create a voice from a cancelled touch)
      simulationRef.current.activeTouches.delete(event.pointerId);
      syncActiveCount();
      gestureModeRef.current = { kind: "idle" };
      releaseCapture(surface, event.pointerId);
      return;
    }

    if (
      mode.kind === "camera" &&
      (event.pointerId === mode.id0 || event.pointerId === mode.id1)
    ) {
      releaseCapture(surface, mode.id0);
      releaseCapture(surface, mode.id1);
      gestureModeRef.current = { kind: "idle" };
      return;
    }
  };

  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    const surface = surfaceRef.current;
    if (!surface) return;

    const cam = cameraRef.current;
    const bounds = surface.getBoundingClientRect();
    const screenNormX = (event.clientX - bounds.left) / bounds.width;
    const screenNormY = (event.clientY - bounds.top) / bounds.height;

    // Compute zoom using TARGET values so rapid wheel events accumulate correctly
    // without drifting against the lerp-lagged actual zoom.
    const zoomDelta = event.deltaY < 0 ? 1.12 : 0.9;
    const newZoom = clamp(cam.targetZoom * zoomDelta, 1, SCOPE_MAX_ZOOM);

    // Anchor: the world point under the cursor must remain fixed after zoom.
    // Use TARGET view state as the reference so consecutive fast wheel events
    // chain correctly (each event anchors from the previous event's target, not
    // from the still-lerping actual camera).
    //   anchorWorld = (screenNorm - 0.5) / targetZoom + targetViewCx
    //   newTargetViewCx = anchorWorld - (screenNorm - 0.5) / newZoom  ← rearranged
    const anchorWorldX = (screenNormX - 0.5) / cam.targetZoom + cam.targetViewCx;
    const anchorWorldY = (screenNormY - 0.5) / cam.targetZoom + cam.targetViewCy;
    cam.targetViewCx = clamp(anchorWorldX - (screenNormX - 0.5) / newZoom, 0.05, 0.95);
    cam.targetViewCy = clamp(anchorWorldY - (screenNormY - 0.5) / newZoom, 0.05, 0.95);
    cam.targetZoom = newZoom;

    if (newZoom < 1.12 && cam.focusScopeId !== null) {
      exitScope();
    } else if (newZoom > 1.4 && cam.focusScopeId === null) {
      // Use cursor world position for scope detection
      const nearest = findScopeAt(anchorWorldX, anchorWorldY, scopesRef.current);
      if (nearest) enterScope(nearest.id);
    }
  };

  const clearSurface = () => {
    simulationRef.current.activeTouches.clear();
    simulationRef.current.loops = [];
    simulationRef.current.flashes = [];
    simulationRef.current.cadenceEvents = [];
    simulationRef.current.fusionVoices = [];
    simulationRef.current.recentGestures = [];
    simulationRef.current.surfaceEnergy = 0.16;
    fusionCooldownRef.current.clear();
    motifDragRef.current = null;
    gestureModeRef.current = { kind: "idle" };
    pinchRef.current = null;
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
                    data-state={chip?.state ?? "empty"}
                  />
                );
              })}
            </div>

            <div className="surface-cockpit__readout">
              <p>Session motifs x{sessionMemory.motifCount}</p>
              <p>{ensembleLabel}</p>
            </div>
            <div className="surface-cockpit__badge">
              {sessionMemory.awakenedCount > 0
                ? `awake x${sessionMemory.awakenedCount}`
                : sessionMemory.candidateCount > 0
                  ? `forming x${sessionMemory.candidateCount}`
                  : "listening"}
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

          <div className={`surface-scene-label surface-scene-label--${currentScene}`} aria-live="polite">
            {currentScene}
          </div>

          {focusScopeId !== null && (() => {
            const focusedScope = scopes.find(s => s.id === focusScopeId);
            return focusedScope ? (
              <div
                className="surface-scope-breadcrumb"
                aria-live="polite"
                onClick={stopSurfaceGesture}
                onPointerDown={stopSurfaceGesture}
                onPointerUp={stopSurfaceGesture}
                onPointerMove={stopSurfaceGesture}
              >
                <span className="surface-scope-breadcrumb__back" onClick={exitScope}>↑</span>
                <span
                  className="surface-scope-breadcrumb__name"
                  style={{ color: `hsl(${focusedScope.hue}, 70%, 72%)` }}
                >
                  {focusedScope.label}
                </span>
              </div>
            ) : null;
          })()}

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
