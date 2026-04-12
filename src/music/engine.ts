import {
  BEATS_PER_BAR,
  FUSION_PATH_DISTANCE,
  LOOP_BARS,
  LOWER_SILENCE_LANE_THRESHOLD,
  MODE_INTERVALS,
  NOTE_NAMES,
  NOTE_RANGE_MAX,
  NOTE_RANGE_MIN,
  OFFBEAT_RATIOS,
  QUARTER_NOTE_RATIOS,
  RHYTHM_ACTIVITY_LOOKAHEAD_BEATS,
  RHYTHM_PROXIMITY_THRESHOLD,
  RHYTHM_TEMPLATE_RESOLUTION,
  TAU,
  type ContourAnchor,
  type ContourLoop,
  type FusionTimbre,
  type FusionVoice,
  type GestureSummary,
  type HarmonicState,
  type NormalizedPoint,
  type PhraseNote,
  type RhythmAttractionField,
  type RhythmSignature,
  type ScopeId,
  type SurfacePreset,
  type VoiceRole,
  getLoopHue,
} from "../surface/model";
import {
  analyzeContour,
  averagePoint,
  clamp,
  distance,
  getAnchorStepDuration,
  getActiveAnchorStepIndex,
  getAnchorTimelineDuration,
  getGestureTravel,
  mix,
  modulo,
  pathDuration,
  point,
  resamplePath,
} from "../surface/contour";
import { summarizeGesture } from "../interaction/grammar";

export const midiToFrequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export const noteNameToPitchClass = (note: string) =>
  NOTE_NAMES.indexOf(note.toUpperCase() as (typeof NOTE_NAMES)[number]);

export const getBeatMs = (harmonicState: HarmonicState) => 60000 / harmonicState.bpm;

export const getBarMs = (harmonicState: HarmonicState) =>
  getBeatMs(harmonicState) * BEATS_PER_BAR;

export const getBarIndexAtTime = (
  timeMs: number,
  clockStartMs: number,
  harmonicState: HarmonicState,
) => Math.max(0, Math.floor((timeMs - clockStartMs) / getBarMs(harmonicState)));

export const getBarNumberAtTime = (
  timeMs: number,
  clockStartMs: number,
  harmonicState: HarmonicState,
) => getBarIndexAtTime(timeMs, clockStartMs, harmonicState) + 1;

export const getBarProgressAtTime = (
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

export const getChordIndexForBar = (barNumber: number, harmonicState: HarmonicState) =>
  Math.floor((Math.max(barNumber, 1) - 1) / harmonicState.barsPerChord) %
  harmonicState.progression.length;

export const getChordForBar = (barNumber: number, harmonicState: HarmonicState) =>
  harmonicState.progression[getChordIndexForBar(barNumber, harmonicState)];

export const getScalePitchClasses = (harmonicState: HarmonicState) => {
  const tonicPitchClass = Math.max(0, noteNameToPitchClass(harmonicState.tonic));

  return MODE_INTERVALS[harmonicState.mode].map((interval) =>
    modulo(tonicPitchClass + interval, 12),
  );
};

export const romanToDegree = (roman: string) => {
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

export const getChordPitchClasses = (
  harmonicState: HarmonicState,
  chordSymbol: string,
) => {
  const scalePitchClasses = getScalePitchClasses(harmonicState);
  const degree = romanToDegree(chordSymbol);

  return [0, 2, 4].map(
    (offset) => scalePitchClasses[(degree + offset) % scalePitchClasses.length],
  );
};

export const buildExtendedScaleMidis = (
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

export const findNearestValueIndex = (values: number[], target: number) => {
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

export const findNearestChordToneIndex = (
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

export const findNearestPreferredChordToneIndex = (
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

export const resampleNumberSeries = (values: number[], count: number) => {
  if (count <= 0) {
    return [];
  }

  if (values.length === 0) {
    return Array.from({ length: count }, (_, index) =>
      index / Math.max(count - 1, 1),
    );
  }

  if (values.length === 1) {
    return Array.from({ length: count }, () => values[0]);
  }

  return Array.from({ length: count }, (_, index) => {
    const amount = (index / Math.max(count - 1, 1)) * (values.length - 1);
    const startIndex = Math.floor(amount);
    const endIndex = Math.min(startIndex + 1, values.length - 1);
    const blend = amount - startIndex;

    return mix(values[startIndex], values[endIndex], blend);
  });
};

export const getNearestNumber = (values: number[], target: number) => {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((best, current) =>
    Math.abs(current - target) < Math.abs(best - target) ? current : best,
  );
};

export const collapseWeightedRatios = (
  entries: Array<{ ratio: number; weight: number }>,
  minGap: number,
) => {
  const sorted = [...entries].sort((left, right) => left.ratio - right.ratio);
  const collapsed: Array<{ ratio: number; weight: number }> = [];

  sorted.forEach((entry) => {
    const previous = collapsed.at(-1);

    if (previous && Math.abs(entry.ratio - previous.ratio) <= minGap) {
      const totalWeight = previous.weight + entry.weight;
      previous.ratio =
        (previous.ratio * previous.weight + entry.ratio * entry.weight) /
        Math.max(totalWeight, 0.0001);
      previous.weight = totalWeight;
      return;
    }

    collapsed.push({ ...entry });
  });

  return collapsed;
};

export const getGridAlignmentScore = (
  ratios: number[],
  grid: number[],
  tolerance = 0.12,
) => {
  if (ratios.length === 0 || grid.length === 0) {
    return 0;
  }

  return (
    ratios.reduce((total, ratio) => {
      const target = getNearestNumber(grid, ratio) ?? ratio;
      return total + (1 - clamp(Math.abs(target - ratio) / tolerance, 0, 1));
    }, 0) / ratios.length
  );
};

export const getAnchorRatios = (anchors: ContourAnchor[]) => {
  const duration = getAnchorTimelineDuration(anchors);

  return anchors.map((anchor, index) => {
    if (index === 0) {
      return 0;
    }

    if (index === anchors.length - 1) {
      return 1;
    }

    return clamp(anchor.point.t / duration, 0, 1);
  });
};

export const buildRhythmSignature = (
  anchors: ContourAnchor[],
  phraseNotes: PhraseNote[],
): RhythmSignature => {
  const anchorRatios = getAnchorRatios(anchors);
  const triggerRatios = anchorRatios.filter(
    (_, index) => phraseNotes[index]?.trigger,
  );
  const fallbackRatios = anchorRatios.filter((_, index) => anchors[index]?.accent);
  const onsetRatios = collapseWeightedRatios(
    (triggerRatios.length > 0 ? triggerRatios : fallbackRatios).map((ratio) => ({
      ratio,
      weight: 1,
    })),
    0.04,
  ).map(({ ratio }) => ratio);
  const quarterPulse = getGridAlignmentScore(
    onsetRatios,
    [0, ...QUARTER_NOTE_RATIOS, 1],
    0.1,
  );
  const syncopation =
    getGridAlignmentScore(onsetRatios, OFFBEAT_RATIOS, 0.08) *
    clamp(1 - quarterPulse * 0.35, 0, 1);

  return {
    anchorRatios,
    onsetRatios,
    density: onsetRatios.length / Math.max(anchors.length, 1),
    quarterPulse,
    syncopation,
  };
};

export const getAverageNearestPathDistance = (
  firstPath: NormalizedPoint[],
  secondPath: NormalizedPoint[],
) => {
  if (firstPath.length === 0 || secondPath.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  const sampleCount = Math.max(
    6,
    Math.min(12, Math.max(firstPath.length, secondPath.length)),
  );
  const sampledFirst = resamplePath(firstPath, sampleCount);
  const sampledSecond = resamplePath(secondPath, sampleCount);

  return (
    sampledFirst.reduce((total, current) => {
      const nearestDistance = sampledSecond.reduce(
        (best, candidate) => Math.min(best, distance(current, candidate)),
        Number.POSITIVE_INFINITY,
      );

      return total + nearestDistance;
    }, 0) / sampleCount
  );
};

export const buildRhythmAttractionField = ({
  points,
  loops,
  harmonicState,
  clockStartMs,
  referenceTimeMs,
}: {
  points: NormalizedPoint[];
  loops: ContourLoop[];
  harmonicState: HarmonicState;
  clockStartMs: number;
  referenceTimeMs: number;
}) => {
  if (points.length < 2 || loops.length === 0) {
    return undefined;
  }

  const activeCutoff =
    referenceTimeMs +
    getBeatMs(harmonicState) * RHYTHM_ACTIVITY_LOOKAHEAD_BEATS;
  const centroid = averagePoint(points);
  const nearbySignatures = loops
    .filter((loop) => loop.scheduledAtMs <= activeCutoff)
    .map((loop) => {
      const centroidDistance = distance(centroid, averagePoint(loop.points));
      const pathDistance = getAverageNearestPathDistance(points, loop.points);
      const overlap = getPathOverlapScore(points, loop.points);
      const weight = clamp(
        (1 - centroidDistance / 0.32) * 0.42 +
          (1 - pathDistance / 0.2) * 0.36 +
          overlap * 0.22,
        0,
        1,
      );

      if (weight < RHYTHM_PROXIMITY_THRESHOLD) {
        return null;
      }

      const referenceBar = getBarNumberAtTime(
        Math.max(referenceTimeMs, loop.scheduledAtMs),
        clockStartMs,
        harmonicState,
      );
      const chordSymbol = getChordForBar(referenceBar, harmonicState);
      const phraseNotes =
        loop.phraseNotes.length > 0
          ? loop.phraseNotes
          : buildPhraseNotes(loop, harmonicState, chordSymbol);

      return {
        loopId: loop.id,
        weight,
        signature: buildRhythmSignature(loop.anchors, phraseNotes),
      };
    })
    .filter(
      (
        item,
      ): item is {
        loopId: number;
        weight: number;
        signature: RhythmSignature;
      } => item !== null,
    )
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 4);

  if (nearbySignatures.length === 0) {
    return undefined;
  }

  const totalWeight = nearbySignatures.reduce(
    (total, current) => total + current.weight,
    0,
  );
  const anchorTemplate = Array.from(
    { length: RHYTHM_TEMPLATE_RESOLUTION },
    (_, index) =>
      nearbySignatures.reduce((total, current) => {
        const template = resampleNumberSeries(
          current.signature.anchorRatios,
          RHYTHM_TEMPLATE_RESOLUTION,
        );
        return total + template[index] * current.weight;
      }, 0) / Math.max(totalWeight, 0.0001),
  );
  const onsetTargets = collapseWeightedRatios(
    nearbySignatures.flatMap((current) =>
      current.signature.onsetRatios.map((ratio) => ({
        ratio,
        weight:
          current.weight * (0.86 + current.signature.syncopation * 0.14),
      })),
    ),
    0.05,
  )
    .filter(
      (entry) =>
        entry.weight >= totalWeight * 0.16 ||
        entry.ratio <= 0.02 ||
        entry.ratio >= 0.98,
    )
    .map(({ ratio }) => ratio);

  return {
    strength: clamp(totalWeight / nearbySignatures.length, 0, 1),
    density:
      nearbySignatures.reduce(
        (total, current) => total + current.signature.density * current.weight,
        0,
      ) / Math.max(totalWeight, 0.0001),
    quarterPulse:
      nearbySignatures.reduce(
        (total, current) =>
          total + current.signature.quarterPulse * current.weight,
        0,
      ) / Math.max(totalWeight, 0.0001),
    syncopation:
      nearbySignatures.reduce(
        (total, current) =>
          total + current.signature.syncopation * current.weight,
        0,
      ) / Math.max(totalWeight, 0.0001),
    anchorTemplate,
    onsetTargets,
  };
};

export const applyRhythmAttractionToTimeline = (
  points: NormalizedPoint[],
  rhythmField?: RhythmAttractionField,
) => {
  if (!rhythmField || rhythmField.strength < 0.12 || points.length < 3) {
    return points;
  }

  const duration = Math.max(pathDuration(points), 1);
  const baseRatios = points.map((current, index, values) => {
    if (index === 0) {
      return 0;
    }

    if (index === values.length - 1) {
      return 1;
    }

    return clamp(current.t / duration, 0, 1);
  });
  const templateRatios = resampleNumberSeries(
    rhythmField.anchorTemplate,
    points.length,
  );
  const onsetTargets = rhythmField.onsetTargets.filter(
    (ratio) => ratio > 0.04 && ratio < 0.96,
  );
  const desiredRatios = baseRatios.map((baseRatio, index, values) => {
    if (index === 0) {
      return 0;
    }

    if (index === values.length - 1) {
      return 1;
    }

    const amount = index / Math.max(values.length - 1, 1);
    const centerEnvelope = Math.sin(amount * Math.PI);
    let ratio = mix(
      baseRatio,
      templateRatios[index] ?? baseRatio,
      rhythmField.strength * (0.1 + centerEnvelope * 0.18),
    );
    const onsetTarget = getNearestNumber(onsetTargets, ratio);

    if (onsetTarget !== null) {
      const onsetAffinity = 1 - clamp(Math.abs(onsetTarget - baseRatio) / 0.18, 0, 1);
      ratio = mix(
        ratio,
        onsetTarget,
        rhythmField.strength * onsetAffinity * (0.06 + centerEnvelope * 0.08),
      );
    }

    if (rhythmField.quarterPulse > 0.48) {
      const quarterTarget = getNearestNumber(QUARTER_NOTE_RATIOS, ratio);

      if (quarterTarget !== null) {
        const quarterPull =
          clamp((rhythmField.quarterPulse - 0.48) / 0.52, 0, 1) *
          rhythmField.strength;
        ratio = mix(
          ratio,
          quarterTarget,
          quarterPull * (0.03 + centerEnvelope * 0.05),
        );
      }
    }

    return ratio;
  });
  const adjustedRatios = [...desiredRatios];
  const lastIndex = adjustedRatios.length - 1;
  const minGap = (1 / Math.max(points.length - 1, 1)) * 0.2;

  adjustedRatios[0] = 0;
  adjustedRatios[lastIndex] = 1;

  for (let index = 1; index < lastIndex; index += 1) {
    const maxRatio = 1 - minGap * (lastIndex - index);
    adjustedRatios[index] = clamp(
      adjustedRatios[index],
      adjustedRatios[index - 1] + minGap,
      maxRatio,
    );
  }

  for (let index = lastIndex - 1; index > 0; index -= 1) {
    adjustedRatios[index] = clamp(
      adjustedRatios[index],
      adjustedRatios[index - 1] + minGap,
      adjustedRatios[index + 1] - minGap,
    );
  }

  return points.map((current, index) =>
    point(current.x, current.y, adjustedRatios[index] * duration),
  );
};

export const getRhythmTimingAffinity = (
  ratio: number,
  rhythmField?: RhythmAttractionField,
) => {
  if (!rhythmField || rhythmField.strength < 0.08) {
    return 0;
  }

  const onsetTarget = getNearestNumber(
    rhythmField.onsetTargets.filter((value) => value > 0.04 && value < 0.96),
    ratio,
  );
  const onsetAffinity =
    onsetTarget === null
      ? 0
      : 1 - clamp(Math.abs(onsetTarget - ratio) / 0.16, 0, 1);
  const quarterTarget = getNearestNumber(QUARTER_NOTE_RATIOS, ratio);
  const quarterAffinity =
    quarterTarget === null
      ? 0
      : (1 - clamp(Math.abs(quarterTarget - ratio) / 0.14, 0, 1)) *
        rhythmField.quarterPulse;
  const offbeatTarget = getNearestNumber(OFFBEAT_RATIOS, ratio);
  const offbeatAffinity =
    offbeatTarget === null
      ? 0
      : (1 - clamp(Math.abs(offbeatTarget - ratio) / 0.1, 0, 1)) *
        rhythmField.syncopation;

  return clamp(
    onsetAffinity * 0.62 + quarterAffinity * 0.22 + offbeatAffinity * 0.2,
    0,
    1,
  );
};

export const applyRhythmFieldToPhraseNotes = (
  loop: ContourLoop,
  notes: PhraseNote[],
) => {
  if (!loop.rhythmField || loop.rhythmField.strength < 0.12 || notes.length < 3) {
    return;
  }

  const rhythmField = loop.rhythmField;
  const anchorRatios = getAnchorRatios(loop.anchors);

  notes.forEach((note, index) => {
    if (note.kind === "rest") {
      return;
    }

    const timingAffinity = getRhythmTimingAffinity(
      anchorRatios[index] ?? 0,
      rhythmField,
    );
    note.accent = clamp(
      note.accent + timingAffinity * rhythmField.strength * 0.08,
      0.2,
      1,
    );
  });

  const currentTriggerCount = notes.filter((note) => note.trigger).length;
  const targetTriggerCount = clamp(
    Math.round(
      mix(
        currentTriggerCount,
        rhythmField.density * notes.length,
        rhythmField.strength * 0.42,
      ),
    ),
    1,
    notes.length,
  );
  const adjustmentBudget = Math.min(
    2,
    Math.max(0, Math.round(Math.abs(targetTriggerCount - currentTriggerCount))),
  );

  if (adjustmentBudget === 0) {
    return;
  }

  if (targetTriggerCount > currentTriggerCount) {
    const promoteCandidates = notes
      .map((note, index) => {
        if (index === 0 || index === notes.length - 1 || note.trigger) {
          return null;
        }

        const anchor = loop.anchors[index];
        const timingAffinity = getRhythmTimingAffinity(
          anchorRatios[index] ?? 0,
          rhythmField,
        );
        const score =
          timingAffinity * 0.72 +
          anchor.emphasis * 0.2 +
          (note.kind === "sustain" ? 0.08 : 0) -
          (note.kind === "rest" ? 0.08 : 0);

        if (score < 0.58) {
          return null;
        }

        return { index, score };
      })
      .filter((value): value is { index: number; score: number } => value !== null)
      .sort((left, right) => right.score - left.score)
      .slice(0, adjustmentBudget);

    promoteCandidates.forEach(({ index }) => {
      const note = notes[index];
      note.kind = "note";
      note.trigger = true;
      note.sustain = false;
      note.gateSteps =
        loop.role === "pad" || loop.role === "bass" || loop.role === "echo"
          ? 2
          : 1;
      note.accent = clamp(note.accent + rhythmField.strength * 0.14, 0.2, 1);
    });

    return;
  }

  const demoteCandidates = notes
    .map((note, index) => {
      if (index === 0 || index === notes.length - 1 || !note.trigger) {
        return null;
      }

      const anchor = loop.anchors[index];

      if (anchor.accent || anchor.leap) {
        return null;
      }

      const timingAffinity = getRhythmTimingAffinity(
        anchorRatios[index] ?? 0,
        rhythmField,
      );
      const score =
        (1 - timingAffinity) * 0.7 +
        (note.kind === "note" ? 0.08 : 0) -
        anchor.emphasis * 0.26;

      if (score < 0.48) {
        return null;
      }

      return { index, score };
    })
    .filter((value): value is { index: number; score: number } => value !== null)
    .sort((left, right) => right.score - left.score)
    .slice(0, adjustmentBudget);

  demoteCandidates.forEach(({ index }) => {
    const note = notes[index];
    const anchor = loop.anchors[index];
    note.trigger = false;
    note.kind =
      loop.role === "percussion"
        ? "rest"
        : anchor.sustain || loop.role === "pad" || loop.role === "bass"
          ? "sustain"
          : "rest";
    note.sustain = note.kind === "sustain";
    note.gateSteps = 1;
    note.accent = clamp(note.accent - 0.08, 0.2, 1);
  });
};

export const buildPhraseNotes = (
  loop: ContourLoop,
  harmonicState: HarmonicState,
  chordSymbol: string,
  /** From scene config: preferred chord-tone index (0=root, 1=3rd, 2=5th) */
  sceneLandingTone = 0,
  /** From scene config: positive = more rests, negative = denser */
  sceneRestBias = 0,
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
        // Blend loop's own landingBias with the scene's harmonic landing tone
        const effectiveLandingTone =
          loop.dialogueKind === "response"
            ? loop.landingBias
            : sceneLandingTone;
        const chordIndex = findNearestPreferredChordToneIndex(
          scaleMidis,
          scaleMidis[rawIndex],
          chordPitchClasses,
          effectiveLandingTone,
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
      const effectiveFinalTone =
        loop.dialogueKind === "response" ? loop.landingBias : sceneLandingTone;
      scaleIndex = findNearestPreferredChordToneIndex(
        scaleMidis,
        scaleMidis[scaleIndex],
        chordPitchClasses,
        effectiveFinalTone,
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
      kind: trigger ? "note" : loop.role === "percussion" ? "rest" : "sustain",
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

  const averageStepDuration =
    loop.anchors.length > 1
      ? loop.anchors.slice(1).reduce((total, anchor, index) => {
          const previous = loop.anchors[index];
          return total + Math.max(anchor.point.t - previous.point.t, 0);
        }, 0) / (loop.anchors.length - 1)
      : 1;

  for (let index = 1; index < notes.length; index += 1) {
    const previousAnchor = loop.anchors[index - 1];
    const currentAnchor = loop.anchors[index];
    const deltaX = Math.abs(currentAnchor.point.x - previousAnchor.point.x);
    const deltaY = Math.abs(currentAnchor.point.y - previousAnchor.point.y);
    const stepDuration = Math.max(currentAnchor.point.t - previousAnchor.point.t, 0);
    const durationRatio = stepDuration / Math.max(averageStepDuration, 1);
    const flatHorizontalScore =
      currentAnchor.sustain && deltaX > 0.014
        ? clamp(deltaX / Math.max(deltaX + deltaY * 3, 0.001), 0, 1) *
          clamp((durationRatio - 0.72) / 0.9, 0, 1)
        : 0;
    const gapRestScore = clamp((durationRatio - 1.32) / 1.12, 0, 1);
    const lowerSilenceScore = clamp(
      (currentAnchor.point.y - LOWER_SILENCE_LANE_THRESHOLD) / 0.12,
      0,
      1,
    );
    const restScore =
      gapRestScore * 0.72 +
      flatHorizontalScore * 0.34 +
      lowerSilenceScore * (currentAnchor.sustain ? 0.24 : 0.12) +
      (loop.role === "bass" ? 0.06 : 0);
    const sustainScore =
      (currentAnchor.sustain ? 0.5 : 0) +
      flatHorizontalScore * 0.4 +
      (loop.role === "pad" || loop.role === "bass" || loop.role === "echo" ? 0.16 : 0) +
      clamp((durationRatio - 0.86) / 1.4, 0, 1) * 0.12;

    // sceneRestBias: positive = lower threshold (easier to become a rest / more space)
    //               negative = raise threshold (denser, fewer rests)
    const sceneAdjustedRestThreshold = 0.56 - sceneRestBias;
    if (
      loop.role !== "percussion" &&
      index < notes.length - 1 &&
      !currentAnchor.accent &&
      !currentAnchor.leap &&
      restScore > sceneAdjustedRestThreshold
    ) {
      notes[index].kind = "rest";
      notes[index].trigger = false;
      notes[index].gateSteps = 1;
      notes[index].sustain = false;
      continue;
    }

    if (
      loop.role !== "percussion" &&
      !notes[index].trigger &&
      (sustainScore > 0.56 || currentAnchor.sustain)
    ) {
      notes[index].kind = "sustain";
      notes[index].trigger = false;
      notes[index].sustain = true;
      continue;
    }

    if (!notes[index].trigger) {
      notes[index].kind = "rest";
      notes[index].sustain = false;
    }
  }

  const ornamentAmount = clamp((loop.reversalRatio - 0.16) / 0.56, 0, 1);
  if (ornamentAmount > 0 && loop.role !== "bass") {
    for (let index = 1; index < notes.length - 1; index += 1) {
      if (notes[index].kind === "rest") {
        continue;
      }

      if (index % 2 === 0) {
        continue;
      }

      notes[index].trigger =
        loop.role === "pad" ? notes[index].trigger || loop.anchors[index].accent : true;
      notes[index].kind = notes[index].trigger ? "note" : notes[index].kind;
      notes[index].accent = clamp(notes[index].accent + ornamentAmount * 0.12, 0.2, 1);

      if (loop.role !== "pad") {
        notes[index].gateSteps = 1;
      }

      if (loop.role === "lead" || loop.role === "echo") {
        const ornamentDirection = index % 4 === 1 ? 1 : -1;
        const ornamentIndex = findNearestValueIndex(scaleMidis, notes[index].midi);
        notes[index].midi =
          scaleMidis[clamp(ornamentIndex + ornamentDirection, 0, scaleMidis.length - 1)];
        notes[index].chordTone = chordPitchClasses.includes(modulo(notes[index].midi, 12));
      }
    }
  }

  const shimmerAmount = clamp((Math.max(loop.loopiness, loop.circularity) - 0.52) / 0.48, 0, 1);
  if (shimmerAmount > 0 && (loop.role === "lead" || loop.role === "echo")) {
    for (let index = 1; index < notes.length - 1; index += 1) {
      if (notes[index].kind === "rest") {
        continue;
      }

      const previousMidi = notes[index - 1]?.midi ?? notes[index].midi;
      const nearPivot = Math.abs(notes[index].midi - previousMidi) <= 2;

      if (!nearPivot && loop.role !== "echo") {
        continue;
      }

      const trillDirection = index % 2 === 0 ? 1 : -1;
      const baseIndex = findNearestValueIndex(scaleMidis, previousMidi);
      notes[index].kind = "note";
      notes[index].trigger = true;
      notes[index].gateSteps = 1;
      notes[index].accent = clamp(notes[index].accent + shimmerAmount * 0.08, 0.2, 1);
      notes[index].midi =
        scaleMidis[clamp(baseIndex + trillDirection, 0, scaleMidis.length - 1)];
      notes[index].chordTone = chordPitchClasses.includes(modulo(notes[index].midi, 12));
    }
  }

  const echoSustain = loop.role === "echo" ? clamp((loop.circularity - 0.6) / 0.4, 0, 1) : 0;
  if (echoSustain > 0) {
    notes.forEach((note, index) => {
      if (note.kind === "rest") {
        return;
      }

      note.gateSteps = Math.max(
        note.gateSteps,
        2 + Math.round(echoSustain * 2) - (index % 2 === 1 ? 1 : 0),
      );
      note.sustain = true;
      note.accent = clamp(note.accent + echoSustain * 0.05, 0.2, 1);
    });
  }

  applyRhythmFieldToPhraseNotes(loop, notes);

  if (notes[0]) {
    notes[0].kind = "note";
    notes[0].trigger = true;
  }

  let lastSoundingIndex: number | null = null;
  notes.forEach((note, index) => {
    if (note.kind === "rest") {
      note.trigger = false;
      note.gateSteps = 1;
      note.sustain = false;
      lastSoundingIndex = null;
      return;
    }

    if (note.kind === "sustain") {
      if (lastSoundingIndex === null) {
        note.kind = "note";
        note.trigger = true;
        lastSoundingIndex = index;
        return;
      }

      note.trigger = false;
      note.midi = notes[lastSoundingIndex].midi;
      note.chordTone = notes[lastSoundingIndex].chordTone;
      note.gateSteps = 1;
      note.sustain = true;
      notes[lastSoundingIndex].gateSteps += 1;
      return;
    }

    note.kind = "note";
    note.trigger = true;
    lastSoundingIndex = index;
  });

  return notes;
};

export const createLoopRecord = ({
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
  harmonicLandingBias,
  rhythmField,
  summary,
  scopeId = null,
  motifId,
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
  harmonicLandingBias?: number;
  rhythmField?: RhythmAttractionField;
  summary?: GestureSummary;
  scopeId?: ScopeId | null;
  motifId?: number;
}): ContourLoop => {
  const contour = analyzeContour(points);
  const gestureSummary =
    summary ?? summarizeGesture(points, Math.max(pathDuration(points), 1), []);

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
    harmonicLandingBias,
    rhythmField,
    circularity: gestureSummary.circularity,
    loopiness: gestureSummary.loopiness,
    reversalRatio: gestureSummary.reversalRatio,
    forwardBias: gestureSummary.forwardBias,
    motifId,
    scopeId,
  };
};

export const getCurrentChordHue = (harmonicState: HarmonicState, chordSymbol: string) => {
  const tonicPitchClass = Math.max(0, noteNameToPitchClass(harmonicState.tonic));
  const chordRootPitchClass =
    getChordPitchClasses(harmonicState, chordSymbol)[0] ?? tonicPitchClass;

  return 20 + modulo(chordRootPitchClass * 27 + tonicPitchClass * 11, 220);
};

export const getFusionTimbre = (
  firstRole: VoiceRole,
  secondRole: VoiceRole,
): FusionTimbre => {
  const roles = [firstRole, secondRole];

  if (roles.includes("echo")) {
    return "harmonic-echo";
  }

  if (roles.includes("lead") || roles.includes("percussion")) {
    return "arp";
  }

  return "shimmer";
};

export const getFusionPulseCount = (timbre: FusionTimbre) => {
  switch (timbre) {
    case "arp":
      return 7;
    case "harmonic-echo":
      return 4;
    case "shimmer":
    default:
      return 5;
  }
};

export const getFusionPulseDurationMs = (
  timbre: FusionTimbre,
  harmonicState: HarmonicState,
) => {
  const beatMs = getBeatMs(harmonicState);

  switch (timbre) {
    case "arp":
      return beatMs * 0.32;
    case "harmonic-echo":
      return beatMs * 0.74;
    case "shimmer":
    default:
      return beatMs * 0.5;
  }
};

export const getFusionPairKey = (firstLoopId: number, secondLoopId: number) =>
  [firstLoopId, secondLoopId].sort((left, right) => left - right).join(":");

export const getPathOverlapScore = (
  firstPath: NormalizedPoint[],
  secondPath: NormalizedPoint[],
) => {
  if (firstPath.length === 0 || secondPath.length === 0) {
    return 0;
  }

  const sampleCount = Math.max(
    6,
    Math.min(12, Math.max(firstPath.length, secondPath.length)),
  );
  const sampledFirst = resamplePath(firstPath, sampleCount);
  const sampledSecond = resamplePath(secondPath, sampleCount);
  let nearCount = 0;
  let totalNearestDistance = 0;

  sampledFirst.forEach((current) => {
    const nearestDistance = sampledSecond.reduce(
      (best, candidate) => Math.min(best, distance(current, candidate)),
      Number.POSITIVE_INFINITY,
    );

    totalNearestDistance += nearestDistance;
    if (nearestDistance <= FUSION_PATH_DISTANCE) {
      nearCount += 1;
    }
  });

  const averageDistance = totalNearestDistance / sampleCount;
  return clamp(
    (1 - averageDistance / 0.18) * 0.44 + (nearCount / sampleCount) * 0.56,
    0,
    1,
  );
};

export const getFusionMidi = (
  fusion: FusionVoice,
  pulseIndex: number,
  harmonicState: HarmonicState,
  chordSymbol: string,
) => {
  const scale = buildExtendedScaleMidis(harmonicState, 42, 96);
  const chordPitchClasses = getChordPitchClasses(harmonicState, chordSymbol);
  const base = clamp(fusion.midiRoot, 44, 88);

  switch (fusion.signature.timbre) {
    case "arp": {
      const targets = [0, 4, 7, 12, 7, 4, 14];
      return scale[
        findNearestChordToneIndex(
          scale,
          base + targets[pulseIndex % targets.length],
          chordPitchClasses,
        )
      ];
    }
    case "harmonic-echo": {
      const targets = [0, 7, 12, 7];
      const preferredTone = pulseIndex % 4 === 2 ? 1 : pulseIndex % 2 === 0 ? 0 : 2;
      return scale[
        findNearestPreferredChordToneIndex(
          scale,
          base + targets[pulseIndex % targets.length],
          chordPitchClasses,
          preferredTone,
        )
      ];
    }
    case "shimmer":
    default: {
      const targets = [12, 7, 14, 9, 16];
      return scale[
        findNearestChordToneIndex(
          scale,
          base + targets[pulseIndex % targets.length],
          chordPitchClasses,
        )
      ];
    }
  }
};

export const createPresetState = (
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
      fusionVoices: [],
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
      fusionVoices: [],
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
    fusionVoices: [],
  };
};
