import type { ContourLoop, MemoryChip, ScopeId, VoiceRole } from "../surface/model";
import { clamp } from "../surface/contour";

export type MotifSnapshot = {
  scopeId: ScopeId | null;
  activeRoles: VoiceRole[];
  density: number;
  loopIds: number[];
};

export const projectMemoryChips = (loops: ContourLoop[]): MemoryChip[] =>
  loops.map((loop) => ({
    id: loop.id,
    hue: loop.hue,
    role: loop.role,
  }));

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

