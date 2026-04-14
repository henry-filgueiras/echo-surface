/**
 * taste.ts — Taste Field: stylistic realization pass
 *
 * Sits between raw contour analysis and final note playback.
 * Transforms a PhraseNote[] according to a TasteProfile, preserving
 * the original gesture identity while adding musical opinion.
 *
 * Pipeline position:
 *   analyzeContour → buildPhraseNotes → realizeContourWithTaste → playback
 *
 * Invariant: the output phrase must feel like the same gesture —
 * same number of steps, same directional motion, only more opinionated
 * about voice leading, cadence, repetition, and rhythmic placement.
 */

import {
  type ContourAnchor,
  type ContourLoop,
  type HarmonicState,
  type PhraseNote,
  type ScopeRecord,
  type TasteCurrentField,
  type TasteCurrentSample,
  type TasteProfile,
  MODE_INTERVALS,
  NOTE_RANGE_MAX,
  NOTE_RANGE_MIN,
} from "../surface/model";
import {
  clamp,
  lerp,
  modulo,
} from "../surface/contour";
import {
  buildExtendedScaleMidis,
  findNearestChordToneIndex,
  findNearestValueIndex,
  getChordPitchClasses,
  getScalePitchClasses,
} from "./engine";

// ---------------------------------------------------------------------------
// Default & helpers
// ---------------------------------------------------------------------------

export const DEFAULT_TASTE_PROFILE: TasteProfile = {
  leapBias: 0.5,
  repetitionBias: 0.18,
  syncopationBias: 0.22,
  tensionBias: 0.20,
  cadenceBias: 0.72,
  contourSmoothness: 0.28,
};

/**
 * Resolve the effective taste profile for a loop, walking the scope chain.
 * Innermost scope with a tasteProfile wins; falls back to defaultProfile.
 */
export const resolveEffectiveTasteProfile = (
  scopeId: number | null,
  scopes: ScopeRecord[],
  defaultProfile: TasteProfile = DEFAULT_TASTE_PROFILE,
): TasteProfile => {
  // Walk from scopeId up toward root; collect chain
  const chain: ScopeRecord[] = [];
  let currentId: number | null = scopeId;
  while (currentId !== null) {
    const scope = scopes.find((s) => s.id === currentId);
    if (!scope) break;
    chain.push(scope); // innermost first
    currentId = scope.parentId;
  }
  // Innermost scope with a tasteProfile wins
  for (const scope of chain) {
    if (scope.tasteProfile !== undefined) {
      return scope.tasteProfile;
    }
  }
  return defaultProfile;
};

// ---------------------------------------------------------------------------
// Motif echo: controlled repetition of a prior phrase fragment
// ---------------------------------------------------------------------------

/**
 * Given the current notes and a prior motif's notes, return a new note array
 * where some notes are bent toward the prior motif's pitch at that step,
 * weighted by repetitionBias and note emphasis.
 *
 * Preserves key correctness: the echoed pitch must still be in the scale.
 */
const applyRepetitionEcho = (
  notes: PhraseNote[],
  anchors: ContourAnchor[],
  priorMotifNotes: PhraseNote[] | null,
  scaleMidis: number[],
  chordPitchClasses: number[],
  repetitionBias: number,
): PhraseNote[] => {
  if (!priorMotifNotes || priorMotifNotes.length === 0 || repetitionBias < 0.05) {
    return notes;
  }

  return notes.map((note, index) => {
    if (note.kind !== "note") return note;

    // Map current step index to prior motif proportionally
    const priorRatio = index / Math.max(notes.length - 1, 1);
    const priorIndex = Math.round(priorRatio * (priorMotifNotes.length - 1));
    const priorNote = priorMotifNotes[Math.min(priorIndex, priorMotifNotes.length - 1)];

    if (!priorNote || priorNote.kind !== "note") return note;

    const anchor = anchors[index];
    if (!anchor) return note;

    // Strong-beat notes are more likely to echo; leaps are kept as-is
    const leapPenalty = anchor.leap ? 0.6 : 0;
    const echoChance = repetitionBias * (1 - leapPenalty) * (anchor.accent ? 1.2 : 0.7);
    // Deterministic pseudo-random per step (avoids nondeterminism on hot path)
    const dice = modulo(index * 0.6180339887 + note.midi * 0.3, 1.0);

    if (dice > echoChance) return note;

    // Snap prior midi to nearest scale note to preserve key correctness
    const snappedIndex = findNearestValueIndex(scaleMidis, priorNote.midi);
    const snappedMidi = scaleMidis[snappedIndex];

    // Only echo if the pitch is reasonably close (within an octave)
    if (Math.abs(snappedMidi - note.midi) > 12) return note;

    return { ...note, midi: snappedMidi };
  });
};

// ---------------------------------------------------------------------------
// Step-wise voice leading: reduce leaps according to leapBias
// ---------------------------------------------------------------------------

/**
 * For each note that was marked as a leap, probabilistically replace the leap
 * with a stepwise move (nearest scale neighbor in the correct direction).
 *
 * leapBias = 1.0 → all leaps preserved as-is
 * leapBias = 0.0 → all leaps smoothed to steps
 */
const applyVoiceLeadingSmooth = (
  notes: PhraseNote[],
  scaleMidis: number[],
  leapBias: number,
): PhraseNote[] => {
  if (leapBias >= 0.99) return notes;

  let prevMidi = notes[0]?.midi ?? 60;

  return notes.map((note, index) => {
    if (index === 0) {
      prevMidi = note.midi;
      return note;
    }

    if (note.kind !== "note" || !note.leap) {
      prevMidi = note.kind === "note" ? note.midi : prevMidi;
      return note;
    }

    // Deterministic pseudo-random: use step + midi to decide
    const dice = modulo((index + 1) * 0.7071 + note.midi * 0.1618, 1.0);
    const smoothThreshold = 1.0 - leapBias; // higher bias → lower threshold → less smoothing

    if (dice > smoothThreshold) {
      prevMidi = note.midi;
      return note; // keep leap
    }

    // Find nearest scale neighbor in the direction of the leap
    const direction = note.midi > prevMidi ? 1 : -1;
    const prevIdx = findNearestValueIndex(scaleMidis, prevMidi);
    const stepIdx = clamp(prevIdx + direction, 0, scaleMidis.length - 1);
    const stepMidi = scaleMidis[stepIdx];

    prevMidi = stepMidi;
    return { ...note, midi: stepMidi, leap: false };
  });
};

// ---------------------------------------------------------------------------
// Cadence bias: pull phrase-end notes toward chord tones on strong beats
// ---------------------------------------------------------------------------

/**
 * Near the end of the loop cycle (last 25% of steps), bias notes toward
 * chord tones proportional to cadenceBias.  The very last note is always
 * snapped if cadenceBias > 0.5.
 */
const applyCadenceBias = (
  notes: PhraseNote[],
  anchors: ContourAnchor[],
  scaleMidis: number[],
  chordPitchClasses: number[],
  cadenceBias: number,
): PhraseNote[] => {
  if (cadenceBias < 0.05) return notes;

  const n = notes.length;
  const cadenceZoneStart = Math.floor(n * 0.72);

  return notes.map((note, index) => {
    if (note.kind !== "note") return note;

    const isFinalNote = index === n - 1;
    const inCadenceZone = index >= cadenceZoneStart;

    if (!inCadenceZone && !isFinalNote) return note;

    // Progress within cadence zone: 0 at start, 1 at end
    const zoneProgress =
      n - cadenceZoneStart <= 0
        ? 1
        : (index - cadenceZoneStart) / (n - 1 - cadenceZoneStart);
    const snapStrength = isFinalNote
      ? cadenceBias
      : cadenceBias * zoneProgress * 0.6;

    const dice = modulo(index * 0.3819 + note.midi * 0.2357, 1.0);
    if (dice > snapStrength && !isFinalNote) return note;

    const chordToneIndex = findNearestChordToneIndex(
      scaleMidis,
      note.midi,
      chordPitchClasses,
    );
    const chordMidi = scaleMidis[chordToneIndex];

    // Only snap if chord tone is very close (2 semitones) or final note
    if (!isFinalNote && Math.abs(chordMidi - note.midi) > 2) return note;

    return { ...note, midi: chordMidi, chordTone: true };
  });
};

// ---------------------------------------------------------------------------
// Syncopation bias: shift trigger pattern toward off-beats
// ---------------------------------------------------------------------------

/**
 * Probabilistically flip trigger=false → trigger=true for off-beat steps,
 * and trigger=true → trigger=false for strong-beat steps.
 *
 * Very light touch — preserves existing rhythmic intent at low bias values.
 */
const applySyncopationBias = (
  notes: PhraseNote[],
  anchors: ContourAnchor[],
  syncopationBias: number,
): PhraseNote[] => {
  if (syncopationBias < 0.05) return notes;

  const n = notes.length;
  // Quarter-note subdivisions within the phrase
  const quarterBeat = Math.max(1, Math.floor(n / 4));

  return notes.map((note, index) => {
    if (note.kind !== "note") return note;

    const onBeat = index % quarterBeat === 0;
    const anchor = anchors[index];
    if (!anchor) return note;

    // Don't syncopate very emphatic notes
    if (anchor.emphasis > 0.7) return note;

    const dice = modulo(index * 0.5176 + note.midi * 0.4142, 1.0);
    const biasStrength = syncopationBias * 0.5; // gentle ceiling

    if (onBeat && note.trigger && dice < biasStrength) {
      // Suppress strong-beat trigger → syncopate
      return { ...note, trigger: false };
    }

    if (!onBeat && !note.trigger && dice < biasStrength * 0.6) {
      // Promote off-beat → syncopated onset
      return { ...note, trigger: true };
    }

    return note;
  });
};

// ---------------------------------------------------------------------------
// Tension bias: prefer non-chord tones on weak beats
// ---------------------------------------------------------------------------

/**
 * On weak-beat, non-accented steps: push notes slightly away from the
 * nearest chord tone if tensionBias is high.
 *
 * Stays in scale; chromatic notes are never introduced.
 */
const applyTensionBias = (
  notes: PhraseNote[],
  anchors: ContourAnchor[],
  scaleMidis: number[],
  chordPitchClasses: number[],
  tensionBias: number,
): PhraseNote[] => {
  if (tensionBias < 0.05) return notes;

  return notes.map((note, index) => {
    if (note.kind !== "note" || note.chordTone) return note;

    const anchor = anchors[index];
    // Only apply on non-accented, non-leap, non-final notes
    if (!anchor || anchor.accent || anchor.leap || index === notes.length - 1) return note;

    const dice = modulo(index * 0.4142 + note.midi * 0.618, 1.0);
    if (dice > tensionBias * 0.4) return note; // very conservative

    // Find nearest non-chord-tone scale neighbor
    const currentIdx = findNearestValueIndex(scaleMidis, note.midi);
    const searchRange = [-2, -1, 1, 2];

    for (const offset of searchRange) {
      const candidateIdx = clamp(currentIdx + offset, 0, scaleMidis.length - 1);
      const candidateMidi = scaleMidis[candidateIdx];
      if (!chordPitchClasses.includes(modulo(candidateMidi, 12))) {
        // Preserve direction of movement by preferring notes in the right direction
        const upward = note.movement > 0;
        const candidate_is_up = candidateMidi > note.midi;
        if ((upward && candidate_is_up) || (!upward && !candidate_is_up) || offset === 1 || offset === -1) {
          return { ...note, midi: candidateMidi, chordTone: false };
        }
      }
    }

    return note;
  });
};

// ---------------------------------------------------------------------------
// Contour smoothness: pre-quantize MIDI smoothing
// ---------------------------------------------------------------------------

/**
 * Smooth the MIDI pitch sequence by blending each note toward its
 * neighbors' average, preserving direction intent.
 *
 * This runs on raw float MIDI values and re-quantizes back to the scale.
 */
const applyContourSmoothing = (
  notes: PhraseNote[],
  scaleMidis: number[],
  contourSmoothness: number,
): PhraseNote[] => {
  if (contourSmoothness < 0.05 || notes.length < 3) return notes;

  // Extract float MIDI sequence
  const midis = notes.map((n) => n.midi);

  // Smooth: one pass of neighbor averaging
  const smoothed = midis.map((midi, index) => {
    if (index === 0 || index === midis.length - 1) return midi;
    const prev = midis[index - 1];
    const next = midis[index + 1];
    const avg = (prev + next) / 2;
    return lerp(midi, avg, contourSmoothness * 0.5);
  });

  // Re-quantize to scale
  return notes.map((note, index) => {
    if (note.kind !== "note") return note;
    const quantIdx = findNearestValueIndex(scaleMidis, smoothed[index]);
    const quantMidi = scaleMidis[quantIdx];
    // Preserve directional intent: don't cross zero-crossing of movement
    if (note.movement !== 0) {
      const originalDirection = Math.sign(note.movement);
      const smoothDirection = Math.sign(quantMidi - (notes[Math.max(0, index - 1)]?.midi ?? quantMidi));
      if (smoothDirection !== 0 && smoothDirection !== originalDirection) {
        return note; // refuse the smooth if it reverses direction
      }
    }
    return { ...note, midi: quantMidi };
  });
};

// ---------------------------------------------------------------------------
// Main realization pass
// ---------------------------------------------------------------------------

export type TasteRealizationContext = {
  /** Raw phrase notes from buildPhraseNotes */
  notes: PhraseNote[];
  /** Corresponding contour anchors */
  anchors: ContourAnchor[];
  /** Active harmonic context */
  harmonicState: HarmonicState;
  /** The chord symbol active during this loop cycle */
  chordSymbol: string;
  /** Resolved taste profile (already walked scope chain) */
  tasteProfile: TasteProfile;
  /**
   * Notes from the most recently seen related motif, used for repetition echo.
   * Pass null if no prior motif is available.
   */
  priorMotifNotes: PhraseNote[] | null;
  /**
   * Ratio [0, 1] of how close this loop boundary is to the next strong beat.
   * 0 = we are at a boundary, 1 = far from boundary.
   * Used to modulate cadenceBias strength.
   */
  loopBoundaryProximity: number;
};

/**
 * The core Taste Field realization step.
 *
 * Applies all taste biases in a defined order:
 *   1. Contour smoothing (pre-quantize curve)
 *   2. Voice leading smoothing (leap reduction)
 *   3. Repetition echo (motif memory)
 *   4. Syncopation shift (rhythmic placement)
 *   5. Tension injection (non-chord tone preference on weak beats)
 *   6. Cadence resolution (phrase-end snap)
 *
 * Returns a new PhraseNote[] that:
 * - Has the same length as input
 * - Has the same note/sustain/rest distribution
 * - Preserves directional contour identity
 * - Respects key correctness (all pitches remain in scale)
 */
export const realizeContourWithTaste = (
  ctx: TasteRealizationContext,
): PhraseNote[] => {
  const { notes, anchors, harmonicState, chordSymbol, tasteProfile, priorMotifNotes } = ctx;

  if (notes.length === 0) return notes;

  const scaleMidis = buildExtendedScaleMidis(harmonicState);
  const chordPitchClasses = getChordPitchClasses(harmonicState, chordSymbol);

  // Step 1: Contour smoothing — softens sharp local pitch changes
  let realized = applyContourSmoothing(notes, scaleMidis, tasteProfile.contourSmoothness);

  // Step 2: Voice leading — convert leaps to steps where bias allows
  realized = applyVoiceLeadingSmooth(realized, scaleMidis, tasteProfile.leapBias);

  // Step 3: Repetition echo — borrow pitches from prior motif
  realized = applyRepetitionEcho(
    realized,
    anchors,
    priorMotifNotes,
    scaleMidis,
    chordPitchClasses,
    tasteProfile.repetitionBias,
  );

  // Step 4: Syncopation shift — adjust trigger placement
  realized = applySyncopationBias(realized, anchors, tasteProfile.syncopationBias);

  // Step 5: Tension injection — non-chord tones on weak beats
  realized = applyTensionBias(
    realized,
    anchors,
    scaleMidis,
    chordPitchClasses,
    tasteProfile.tensionBias,
  );

  // Step 6: Cadence resolution — phrase-end pull toward chord tone
  const effectiveCadenceBias =
    tasteProfile.cadenceBias * (1 - ctx.loopBoundaryProximity * 0.4);
  realized = applyCadenceBias(
    realized,
    anchors,
    scaleMidis,
    chordPitchClasses,
    effectiveCadenceBias,
  );

  return realized;
};

// ---------------------------------------------------------------------------
// Taste current vector field baking
// ---------------------------------------------------------------------------

/**
 * Bake a taste current vector field from a TasteProfile.
 *
 * The field is a grid of (resolution × resolution) samples covering the
 * scope's normalised interior [0,1]×[0,1].
 *
 * Each bias contributes a flow component:
 *   - cadenceBias    → rightward pull (toward phrase end)
 *   - leapBias       → vertical energy (high = wild vertical jumps)
 *   - syncopationBias → diagonal offset currents
 *   - tensionBias    → outward radial push from center (harmonic tension)
 *   - repetitionBias → slow circular eddies
 *   - contourSmoothness → convergent flow toward horizontal (smoothing)
 */
export const bakeTasteCurrentField = (
  profile: TasteProfile,
  resolution = 7,
  now = 0,
): TasteCurrentField => {
  const samples: TasteCurrentSample[] = [];

  for (let row = 0; row < resolution; row++) {
    for (let col = 0; col < resolution; col++) {
      const x = col / Math.max(resolution - 1, 1);
      const y = row / Math.max(resolution - 1, 1);

      // Base cadence current: rightward pull weighted by cadenceBias
      let dx = profile.cadenceBias * 0.6;
      let dy = 0;

      // Leap current: vertical excitation scaled by leapBias
      dy += (profile.leapBias - 0.5) * (y - 0.5) * 0.8;

      // Syncopation: diagonal shimmer
      const synDiag = Math.sin((x + y) * Math.PI * 2 + now * 0.0004) * profile.syncopationBias * 0.5;
      dx += synDiag;
      dy += synDiag * 0.4;

      // Tension: radial push from center
      const cx = x - 0.5;
      const cy2 = y - 0.5;
      const radialDist = Math.hypot(cx, cy2);
      if (radialDist > 0.01) {
        const radialStrength = profile.tensionBias * 0.4;
        dx += (cx / radialDist) * radialStrength;
        dy += (cy2 / radialDist) * radialStrength;
      }

      // Repetition: slow eddy (curl field)
      const eddyAngle = Math.atan2(y - 0.5, x - 0.5) + now * 0.0003;
      dx += Math.cos(eddyAngle + Math.PI / 2) * profile.repetitionBias * 0.3;
      dy += Math.sin(eddyAngle + Math.PI / 2) * profile.repetitionBias * 0.3;

      // Smoothness: convergent toward y=0.5 horizontal axis
      dy += (0.5 - y) * profile.contourSmoothness * 0.3;

      const strength = Math.min(1, Math.hypot(dx, dy));

      samples.push({ x, y, dx, dy, strength });
    }
  }

  return { samples, resolution, bakedAt: now };
};

/**
 * Get or refresh the taste current field on a scope.
 * Mutates the scope's tasteCurrentField in place.
 */
export const ensureTasteCurrentField = (
  scope: { tasteProfile?: TasteProfile; tasteCurrentField?: TasteCurrentField },
  defaultProfile: TasteProfile,
  now: number,
  refreshIntervalMs = 8000,
): TasteCurrentField => {
  const profile = scope.tasteProfile ?? defaultProfile;
  const existing = scope.tasteCurrentField;

  if (existing && now - existing.bakedAt < refreshIntervalMs) {
    return existing;
  }

  const field = bakeTasteCurrentField(profile, 7, now);
  scope.tasteCurrentField = field;
  return field;
};
