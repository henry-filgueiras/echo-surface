import {
  MOTIF_CONTOUR_SAMPLE_COUNT,
  MOTIF_PROMOTION_SIGHTINGS,
  type ContourLoop,
  type HarmonicState,
  type MemoryChip,
  type MotifHarmonicTendencies,
  type MotifRecord,
  type MotifRhythmSkeleton,
  type MotifSigil,
  type NormalizedPoint,
  type ScopeId,
  type ScopeRecord,
  type SessionMemorySummary,
  type VoiceRole,
} from "../surface/model";
import {
  clamp,
  getGestureBounds,
  mix,
  modulo,
  pathDuration,
  point,
  resamplePath,
} from "../surface/contour";
import { buildPhraseNotes, buildRhythmSignature, getChordPitchClasses } from "../music/engine";

export type MotifSnapshot = {
  scopeId: ScopeId | null;
  activeRoles: VoiceRole[];
  density: number;
  loopIds: number[];
};

const ROLE_NOUNS: Record<VoiceRole, string> = {
  pad: "choir",
  bass: "root",
  lead: "flare",
  percussion: "strike",
  echo: "veil",
};

const normalizeContour = (points: NormalizedPoint[]) => {
  const sampled = resamplePath(points, MOTIF_CONTOUR_SAMPLE_COUNT);
  const bounds = getGestureBounds(sampled);
  const centerX = (bounds.minX + bounds.maxX) * 0.5;
  const centerY = (bounds.minY + bounds.maxY) * 0.5;
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 0.06);
  const duration = Math.max(pathDuration(sampled), 1);

  return sampled.map((current) =>
    point(
      clamp((current.x - centerX) / span + 0.5, 0, 1),
      clamp((current.y - centerY) / span + 0.5, 0, 1),
      clamp(current.t / duration, 0, 1),
    ),
  );
};

const getContourSimilarity = (
  firstContour: NormalizedPoint[],
  secondContour: NormalizedPoint[],
) => {
  const sampleCount = Math.max(
    MOTIF_CONTOUR_SAMPLE_COUNT,
    firstContour.length,
    secondContour.length,
  );
  const first = resamplePath(firstContour, sampleCount);
  const second = resamplePath(secondContour, sampleCount);
  const averageDistance =
    first.reduce((total, current, index) => {
      const candidate = second[index] ?? second.at(-1) ?? current;
      return (
        total +
        Math.hypot(current.x - candidate.x, current.y - candidate.y) * 0.86 +
        Math.abs(current.t - candidate.t) * 0.14
      );
    }, 0) / sampleCount;

  return clamp(1 - averageDistance / 0.44, 0, 1);
};

const getAverageRatioDistance = (first: number[], second: number[]) => {
  if (first.length === 0 && second.length === 0) {
    return 0;
  }

  if (first.length === 0 || second.length === 0) {
    return 1;
  }

  return (
    first.reduce((total, current) => {
      const nearest = second.reduce(
        (best, candidate) => Math.min(best, Math.abs(candidate - current)),
        Number.POSITIVE_INFINITY,
      );
      return total + nearest;
    }, 0) / first.length
  );
};

const getRhythmSimilarity = (
  first: MotifRhythmSkeleton,
  second: MotifRhythmSkeleton,
) => {
  const onsetDistance = getAverageRatioDistance(first.onsetRatios, second.onsetRatios);
  const anchorDistance = getAverageRatioDistance(first.anchorRatios, second.anchorRatios);
  const densityDistance = Math.abs(first.density - second.density);
  const quarterDistance = Math.abs(first.quarterPulse - second.quarterPulse);
  const syncDistance = Math.abs(first.syncopation - second.syncopation);
  const combinedDistance =
    onsetDistance * 0.36 +
    anchorDistance * 0.14 +
    densityDistance * 0.2 +
    quarterDistance * 0.12 +
    syncDistance * 0.18;

  return clamp(1 - combinedDistance / 0.72, 0, 1);
};

const getRoleCompatibility = (role: VoiceRole, preferredRole: VoiceRole) => {
  if (role === preferredRole) {
    return 1;
  }

  if (
    (role === "lead" && preferredRole === "echo") ||
    (role === "echo" && preferredRole === "lead") ||
    (role === "pad" && preferredRole === "echo") ||
    (role === "echo" && preferredRole === "pad")
  ) {
    return 0.82;
  }

  if (
    (role === "pad" && preferredRole === "bass") ||
    (role === "bass" && preferredRole === "pad")
  ) {
    return 0.78;
  }

  return 0.64;
};

const getContourDescriptor = (
  loop: ContourLoop,
  rhythmSkeleton: MotifRhythmSkeleton,
) => {
  const start = loop.points[0];
  const end = loop.points.at(-1) ?? start;
  const middle = loop.points[Math.floor(loop.points.length * 0.5)] ?? end;

  if (loop.circularity > 0.74) {
    return "orbit";
  }

  if (loop.loopiness > 0.64) {
    return "coil";
  }

  if (loop.reversalRatio > 0.54) {
    return "braid";
  }

  if (middle.y < Math.min(start?.y ?? 0.5, end.y) - 0.08) {
    return "arch";
  }

  if (middle.y > Math.max(start?.y ?? 0.5, end.y) + 0.08) {
    return "bowl";
  }

  if (end.y < (start?.y ?? end.y) - 0.08) {
    return "lift";
  }

  if (end.y > (start?.y ?? end.y) + 0.08) {
    return "fall";
  }

  if (rhythmSkeleton.syncopation > 0.48) {
    return "spark";
  }

  if (rhythmSkeleton.density > 0.58) {
    return "pulse";
  }

  return "thread";
};

const toTitleCase = (value: string) =>
  value.slice(0, 1).toUpperCase() + value.slice(1).toLowerCase();

const buildMotifName = ({
  loop,
  rhythmSkeleton,
  existingNames,
}: {
  loop: ContourLoop;
  rhythmSkeleton: MotifRhythmSkeleton;
  existingNames: string[];
}) => {
  const descriptor = getContourDescriptor(loop, rhythmSkeleton);
  const baseName = `${toTitleCase(descriptor)} ${toTitleCase(ROLE_NOUNS[loop.role])}`;
  let suffix = 2;
  let name = baseName;

  while (existingNames.includes(name)) {
    name = `${baseName} ${suffix}`;
    suffix += 1;
  }

  return name;
};

const buildMotifHarmonicTendencies = ({
  loop,
  harmonicState,
  chordSymbol,
}: {
  loop: ContourLoop;
  harmonicState: HarmonicState;
  chordSymbol: string;
}): MotifHarmonicTendencies => {
  const phraseNotes =
    loop.phraseNotes.length > 0
      ? loop.phraseNotes
      : buildPhraseNotes(loop, harmonicState, chordSymbol);
  const chordPitchClasses = getChordPitchClasses(harmonicState, chordSymbol);
  const soundingNotes = phraseNotes.filter((note) => note.kind !== "rest");
  const landingNote = soundingNotes.at(-1) ?? phraseNotes.at(-1);
  const landingPitchClass = landingNote ? modulo(landingNote.midi, 12) : chordPitchClasses[0];
  const landingToneIndex = Math.max(
    0,
    chordPitchClasses.findIndex((pitchClass) => pitchClass === landingPitchClass),
  );
  const registerCenter =
    soundingNotes.length > 0
      ? soundingNotes.reduce((total, note) => total + note.midi, 0) / soundingNotes.length
      : loop.desiredRegisterMidi;
  const chordToneBias =
    soundingNotes.length > 0
      ? soundingNotes.filter((note) => note.chordTone).length / soundingNotes.length
      : 0.5;

  return {
    landingTone: clamp(Math.round(landingToneIndex), 0, 2) as 0 | 1 | 2,
    modeAffinity: harmonicState.mode,
    registerCenter,
    chordToneBias,
  };
};

const buildLoopRhythmSkeleton = ({
  loop,
  harmonicState,
  chordSymbol,
}: {
  loop: ContourLoop;
  harmonicState: HarmonicState;
  chordSymbol: string;
}): MotifRhythmSkeleton => {
  const phraseNotes =
    loop.phraseNotes.length > 0
      ? loop.phraseNotes
      : buildPhraseNotes(loop, harmonicState, chordSymbol);
  const rhythmSignature = buildRhythmSignature(loop.anchors, phraseNotes);

  return {
    anchorRatios: rhythmSignature.anchorRatios,
    onsetRatios: rhythmSignature.onsetRatios,
    density: rhythmSignature.density,
    quarterPulse: rhythmSignature.quarterPulse,
    syncopation: rhythmSignature.syncopation,
  };
};

const buildMotifSigil = ({
  loop,
  rhythmSkeleton,
  harmonicTendencies,
}: {
  loop: ContourLoop;
  rhythmSkeleton: MotifRhythmSkeleton;
  harmonicTendencies: MotifHarmonicTendencies;
}): MotifSigil => ({
  polygonSides: clamp(4 + Math.round(loop.circularity * 3), 4, 8),
  ringCount: clamp(1 + Math.round(loop.loopiness * 2), 1, 3),
  spokeCount: clamp(3 + rhythmSkeleton.onsetRatios.length, 3, 9),
  rotation: modulo(
    (loop.forwardBias + 1) * 70 +
      harmonicTendencies.landingTone * 48 +
      (harmonicTendencies.modeAffinity === "minor" ? 18 : 0),
    360,
  ),
  wave: clamp(loop.loopiness * 0.58 + rhythmSkeleton.syncopation * 0.42, 0, 1),
});

export const buildMotifFromLoop = ({
  id,
  loop,
  harmonicState,
  chordSymbol,
  now,
  existingNames,
}: {
  id: number;
  loop: ContourLoop;
  harmonicState: HarmonicState;
  chordSymbol: string;
  now: number;
  existingNames: string[];
}): MotifRecord => {
  const rhythmSkeleton = buildLoopRhythmSkeleton({
    loop,
    harmonicState,
    chordSymbol,
  });
  const harmonicTendencies = buildMotifHarmonicTendencies({
    loop,
    harmonicState,
    chordSymbol,
  });
  const descriptor = getContourDescriptor(loop, rhythmSkeleton);

  return {
    id,
    name: buildMotifName({ loop, rhythmSkeleton, existingNames }),
    familyKey: [
      descriptor,
      loop.role,
      harmonicTendencies.landingTone,
      Math.round(rhythmSkeleton.density * 10),
    ].join(":"),
    homeScopeId: loop.scopeId,
    hue: loop.hue,
    preferredRole: loop.role,
    canonicalContour: normalizeContour(loop.points),
    contourDurationMs: Math.max(pathDuration(loop.points), 360),
    harmonicTendencies,
    rhythmSkeleton,
    canonicalSigil: buildMotifSigil({ loop, rhythmSkeleton, harmonicTendencies }),
    sightings: 1,
    awakenCount: 0,
    promoted: false,
    bornAt: now,
    lastSeenAt: now,
    lastAwakenedAt: null,
    loopIds: [loop.id],
  };
};

export const findMotifMatch = ({
  motifs,
  loop,
  harmonicState,
  chordSymbol,
}: {
  motifs: MotifRecord[];
  loop: ContourLoop;
  harmonicState: HarmonicState;
  chordSymbol: string;
}): { motifId: number; score: number } | null => {
  const candidateContour = normalizeContour(loop.points);
  const candidateRhythm = buildLoopRhythmSkeleton({ loop, harmonicState, chordSymbol });

  let bestMatch: { motifId: number; score: number } | null = null;

  motifs.forEach((motif) => {
    if (motif.homeScopeId !== loop.scopeId) {
      return;
    }

    const contourSimilarity = getContourSimilarity(
      candidateContour,
      motif.canonicalContour,
    );
    const rhythmSimilarity = getRhythmSimilarity(
      candidateRhythm,
      motif.rhythmSkeleton,
    );
    const roleCompatibility = getRoleCompatibility(loop.role, motif.preferredRole);
    const score =
      contourSimilarity * 0.62 +
      rhythmSimilarity * 0.24 +
      roleCompatibility * 0.14;

    if (score < 0.7) {
      return;
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { motifId: motif.id, score };
    }
  });

  return bestMatch;
};

export const mergeLoopIntoMotif = ({
  motif,
  loop,
  harmonicState,
  chordSymbol,
  now,
}: {
  motif: MotifRecord;
  loop: ContourLoop;
  harmonicState: HarmonicState;
  chordSymbol: string;
  now: number;
}): MotifRecord => {
  const nextSightings = motif.sightings + 1;
  const weight = motif.sightings / nextSightings;
  const inverseWeight = 1 / nextSightings;
  const incomingContour = normalizeContour(loop.points);
  const mergedContour = resamplePath(motif.canonicalContour, MOTIF_CONTOUR_SAMPLE_COUNT).map(
    (current, index) => {
      const incoming = incomingContour[index] ?? incomingContour.at(-1) ?? current;
      return point(
        mix(current.x, incoming.x, inverseWeight),
        mix(current.y, incoming.y, inverseWeight),
        mix(current.t, incoming.t, inverseWeight),
      );
    },
  );
  const incomingRhythm = buildLoopRhythmSkeleton({
    loop,
    harmonicState,
    chordSymbol,
  });
  const incomingHarmonics = buildMotifHarmonicTendencies({
    loop,
    harmonicState,
    chordSymbol,
  });
  const harmonicTendencies: MotifHarmonicTendencies = {
    landingTone: clamp(
      Math.round(
        motif.harmonicTendencies.landingTone * weight +
          incomingHarmonics.landingTone * inverseWeight,
      ),
      0,
      2,
    ) as 0 | 1 | 2,
    modeAffinity:
      motif.harmonicTendencies.modeAffinity === incomingHarmonics.modeAffinity
        ? motif.harmonicTendencies.modeAffinity
        : motif.promoted
          ? motif.harmonicTendencies.modeAffinity
          : incomingHarmonics.modeAffinity,
    registerCenter: mix(
      motif.harmonicTendencies.registerCenter,
      incomingHarmonics.registerCenter,
      inverseWeight,
    ),
    chordToneBias: mix(
      motif.harmonicTendencies.chordToneBias,
      incomingHarmonics.chordToneBias,
      inverseWeight,
    ),
  };
  const rhythmSkeleton: MotifRhythmSkeleton = {
    anchorRatios: resamplePath(
      motif.rhythmSkeleton.anchorRatios.map((ratio, index) => point(ratio, 0, index)),
      incomingRhythm.anchorRatios.length,
    ).map((current, index) =>
      mix(current.x, incomingRhythm.anchorRatios[index] ?? current.x, inverseWeight),
    ),
    onsetRatios:
      motif.rhythmSkeleton.onsetRatios.length >= incomingRhythm.onsetRatios.length
        ? motif.rhythmSkeleton.onsetRatios.map((ratio, index) =>
            mix(ratio, incomingRhythm.onsetRatios[index] ?? ratio, inverseWeight),
          )
        : incomingRhythm.onsetRatios.map((ratio, index) =>
            mix(motif.rhythmSkeleton.onsetRatios[index] ?? ratio, ratio, inverseWeight),
          ),
    density: mix(motif.rhythmSkeleton.density, incomingRhythm.density, inverseWeight),
    quarterPulse: mix(
      motif.rhythmSkeleton.quarterPulse,
      incomingRhythm.quarterPulse,
      inverseWeight,
    ),
    syncopation: mix(
      motif.rhythmSkeleton.syncopation,
      incomingRhythm.syncopation,
      inverseWeight,
    ),
  };
  const preferredRole =
    getRoleCompatibility(loop.role, motif.preferredRole) >= 0.86
      ? motif.preferredRole
      : motif.sightings === 1
        ? loop.role
        : motif.preferredRole;
  const updatedMotif: MotifRecord = {
    ...motif,
    preferredRole,
    hue: mix(motif.hue, loop.hue, inverseWeight),
    canonicalContour: mergedContour,
    contourDurationMs: mix(
      motif.contourDurationMs,
      Math.max(pathDuration(loop.points), 360),
      inverseWeight,
    ),
    harmonicTendencies,
    rhythmSkeleton,
    canonicalSigil: buildMotifSigil({
      loop: { ...loop, role: preferredRole },
      rhythmSkeleton,
      harmonicTendencies,
    }),
    sightings: nextSightings,
    promoted: motif.promoted || nextSightings >= MOTIF_PROMOTION_SIGHTINGS,
    lastSeenAt: now,
    loopIds: [...motif.loopIds, loop.id].slice(-12),
  };

  return updatedMotif;
};

export const materializeMotifContour = ({
  motif,
  center,
  span,
  scope,
}: {
  motif: MotifRecord;
  center: { x: number; y: number };
  span: number;
  scope?: ScopeRecord | null;
}) =>
  motif.canonicalContour.map((current) => {
    let x = center.x + (current.x - 0.5) * span;
    let y = center.y + (current.y - 0.5) * span;

    if (scope) {
      const dx = (x - scope.cx) / Math.max(scope.rx * 0.84, 0.001);
      const dy = (y - scope.cy) / Math.max(scope.ry * 0.84, 0.001);
      const ellipse = Math.hypot(dx, dy);

      if (ellipse > 1) {
        x = scope.cx + (dx / ellipse) * scope.rx * 0.84;
        y = scope.cy + (dy / ellipse) * scope.ry * 0.84;
      }
    }

    return point(x, y, current.t * motif.contourDurationMs);
  });

export const getPromotedMotifs = (motifs: MotifRecord[]) =>
  motifs
    .filter((motif) => motif.promoted)
    .sort((left, right) => right.lastSeenAt - left.lastSeenAt);

export const getPromotedMotifsForScope = (
  motifs: MotifRecord[],
  scopeId: ScopeId | null,
) =>
  getPromotedMotifs(motifs).filter((motif) => motif.homeScopeId === scopeId);

export const projectMemoryChips = ({
  motifs,
  loops,
}: {
  motifs: MotifRecord[];
  loops: ContourLoop[];
}): MemoryChip[] => {
  const awakenedMotifIds = new Set(
    loops
      .map((loop) => loop.motifId)
      .filter((motifId): motifId is number => motifId !== undefined),
  );

  return [...motifs]
    .sort((left, right) => {
      if (left.promoted !== right.promoted) {
        return Number(right.promoted) - Number(left.promoted);
      }

      return right.lastSeenAt - left.lastSeenAt;
    })
    .map((motif) => ({
      id: motif.id,
      hue: motif.hue,
      role: motif.preferredRole,
      state: !motif.promoted
        ? "candidate"
        : awakenedMotifIds.has(motif.id)
          ? "awake"
          : "dormant",
    }));
};

export const buildSessionMemorySummary = ({
  motifs,
  loops,
}: {
  motifs: MotifRecord[];
  loops: ContourLoop[];
}): SessionMemorySummary => {
  const promotedMotifs = motifs.filter((motif) => motif.promoted);
  const awakenedMotifIds = new Set(
    loops
      .map((loop) => loop.motifId)
      .filter((motifId): motifId is number => motifId !== undefined),
  );
  const names = [...promotedMotifs]
    .sort((left, right) => {
      if (awakenedMotifIds.has(left.id) !== awakenedMotifIds.has(right.id)) {
        return Number(awakenedMotifIds.has(right.id)) - Number(awakenedMotifIds.has(left.id));
      }

      return right.lastSeenAt - left.lastSeenAt;
    })
    .slice(0, 4)
    .map((motif) => motif.name);

  return {
    motifCount: promotedMotifs.length,
    candidateCount: motifs.length - promotedMotifs.length,
    awakenedCount: promotedMotifs.filter((motif) => awakenedMotifIds.has(motif.id)).length,
    names,
    roles: [...new Set(promotedMotifs.map((motif) => motif.preferredRole))],
  };
};

export const getScopeActiveRoles = ({
  loops,
  now,
  scopeId,
  effectiveBpm,
}: {
  loops: ContourLoop[];
  now: number;
  scopeId: ScopeId;
  effectiveBpm: number;
}): VoiceRole[] =>
  [...new Set(
    loops
      .filter(
        (loop) =>
          loop.scopeId === scopeId &&
          now >= loop.scheduledAtMs &&
          now - loop.scheduledAtMs < loop.loopBars * (60000 / effectiveBpm) * 4 * 6,
      )
      .map((loop) => loop.role),
  )];

export const getScopeMotifDensity = (loops: ContourLoop[]) => {
  if (loops.length === 0) {
    return 0;
  }

  return clamp(
    loops.reduce((sum, loop) => {
      const noteCount = loop.phraseNotes.filter((note) => note.kind === "note").length;
      return sum + noteCount / Math.max(loop.phraseNotes.length, 1);
    }, 0) / loops.length,
    0,
    1,
  );
};

export const buildMotifSnapshot = ({
  loops,
  now,
  scopeId,
  effectiveBpm,
}: {
  loops: ContourLoop[];
  now: number;
  scopeId: ScopeId | null;
  effectiveBpm: number;
}): MotifSnapshot => {
  const scopeLoops = loops.filter((loop) => loop.scopeId === scopeId);

  return {
    scopeId,
    activeRoles:
      scopeId === null
        ? []
        : getScopeActiveRoles({ loops, now, scopeId, effectiveBpm }),
    density: getScopeMotifDensity(scopeLoops),
    loopIds: scopeLoops.map((loop) => loop.id),
  };
};
