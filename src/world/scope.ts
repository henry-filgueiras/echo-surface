import {
  type CameraState,
  type HarmonicState,
  type SceneName,
  type ScopeId,
  type ScopeRecord,
  type SurfaceSize,
  PROGRESSION_OPTIONS,
} from "../surface/model";

/** Return the innermost (smallest-area) scope whose ellipse contains (x, y) */
export const findScopeAt = (
  x: number,
  y: number,
  scopes: ScopeRecord[],
): ScopeRecord | null => {
  const containing = scopes.filter((s) => {
    const dx = (x - s.cx) / Math.max(s.rx, 0.001);
    const dy = (y - s.cy) / Math.max(s.ry, 0.001);
    return dx * dx + dy * dy <= 1;
  });
  if (containing.length === 0) return null;
  return containing.reduce((best, s) =>
    s.rx * s.ry < best.rx * best.ry ? s : best,
  );
};

/** Walk up the scope tree and merge overrides (inner wins) into a resolved
 *  harmonic context + scene name.  All values default to root-level state. */
export const resolveEffectiveScopeContext = (
  scopeId: ScopeId | null,
  scopes: ScopeRecord[],
  baseHarmonic: HarmonicState,
  baseScene: SceneName,
): { harmonic: HarmonicState; scene: SceneName } => {
  const chain: ScopeRecord[] = [];
  let currentId: ScopeId | null = scopeId;
  while (currentId !== null) {
    const scope = scopes.find((s) => s.id === currentId);
    if (!scope) break;
    chain.unshift(scope); // root → leaf order
    currentId = scope.parentId;
  }

  let harmonic = { ...baseHarmonic };
  let scene = baseScene;

  for (const scope of chain) {
    const ov = scope.overrides;
    if (ov.tonic !== undefined) harmonic = { ...harmonic, tonic: ov.tonic };
    if (ov.mode !== undefined) harmonic = { ...harmonic, mode: ov.mode };
    if (ov.bpm !== undefined) harmonic = { ...harmonic, bpm: ov.bpm };
    if (ov.progressionId !== undefined) {
      const prog = PROGRESSION_OPTIONS.find((p) => p.id === ov.progressionId);
      if (prog) harmonic = { ...harmonic, progression: prog.progression };
    }
    if (ov.scene !== undefined) scene = ov.scene;
  }

  return { harmonic, scene };
};

/**
 * Convert normalised screen coordinates (0-1 relative to canvas element) into
 * normalised world coordinates, accounting for the camera transform.
 *
 * Inverse of the canvas context transform applied in frame():
 *   screenX = (worldX - viewCx) * zoom * W + W/2
 *   → worldX = (screenX - W/2) / (zoom * W) + viewCx
 *          = (screenNormX - 0.5) / zoom + viewCx
 */
export const screenToWorld = (
  screenNormX: number,
  screenNormY: number,
  camera: CameraState,
): [number, number] => [
  (screenNormX - 0.5) / camera.zoom + camera.viewCx,
  (screenNormY - 0.5) / camera.zoom + camera.viewCy,
];

export const worldToScreenPixels = (
  worldX: number,
  worldY: number,
  camera: CameraState,
  size: SurfaceSize,
): [number, number] => [
  (worldX - camera.viewCx) * camera.zoom * size.width + size.width * 0.5,
  (worldY - camera.viewCy) * camera.zoom * size.height + size.height * 0.5,
];
