import {
  TAU,
  VOICE_ROLE_STYLES,
  type BindingMode,
  type ContourLoop,
  type FilamentPulse,
  type MotifRhythmSkeleton,
  type MotifSigil,
  type PolygonSpec,
  type ResonanceFilament,
  type SceneName,
  type SurfaceSize,
  type VoiceRole,
} from "../surface/model";
import { clamp, easeInOutSine, easeOutCubic, lerp } from "../surface/contour";
import { noteNameToPitchClass } from "../music/engine";
import { drawRoleGlyph, getRoleColor } from "./glyphs";

export const bpmToSpokeCount = (bpm: number): number => {
  if (bpm < 75) return 3;
  if (bpm < 105) return 4;
  if (bpm < 145) return 6;
  return 8;
};

/** Draw a regular polygon centred at (cx, cy) with given radius and rotation. */
export const drawRegularPolygon = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  sides: number,
  rotation: number,
): void => {
  ctx.beginPath();
  for (let i = 0; i <= sides; i++) {
    const angle = rotation + (i / sides) * TAU;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
};

/** Draw a star polygon (pentagram or hexagram) as overlapping triangles /
 *  skip-connected vertices.  For hexagram: two overlapping triangles.
 *  For pentagram: connect every-other vertex of a pentagon. */
export const drawStarPolygon = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  points: number,     // 5 = pentagram, 6 = hexagram
  rotation: number,
): void => {
  const totalVerts = points * 2;
  ctx.beginPath();
  for (let i = 0; i <= totalVerts; i++) {
    const angle = rotation + (i / totalVerts) * TAU - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
};

/**
 * Draw the full scope sigil at world-space pixel coordinates (cx, cy).
 * `alpha` is the overall opacity multiplier (1 = fully visible sigil).
 * `beatPhase` ∈ [0,1] drives the live beat-pulse animation.
 */
export const drawScopeSigil = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,                  // sigil radius in pixels
  hue: number,                // scope hue
  tonic: string,              // effective tonic  e.g. "C", "F#"
  mode: "major" | "minor",
  bpm: number,
  scene: SceneName,
  activeRoles: VoiceRole[],
  motifDensity: number,       // 0–1
  now: number,
  beatPhase: number,          // 0–1, current position in beat cycle
  alpha: number,              // overall opacity (zoom fade)
  cadenceGlow: number,        // 0–1, boosts brightness during cadence events
): void => {
  if (alpha < 0.01) return;

  // Musical invariant → geometric parameters
  const keyIndex = noteNameToPitchClass(tonic);       // 0–11
  const keyRotation = (keyIndex / 12) * TAU;          // radial offset encodes key
  const polygonSides = mode === "major" ? 6 : 5;
  const spokeCount = bpmToSpokeCount(bpm);

  // Slow base rotation (all layers share this axis so the sigil drifts as a unit)
  const baseRot = now * 0.000022;

  // Beat pulse: sharp attack, slow decay
  const beatPulse = Math.pow(Math.max(0, 1 - beatPhase), 2.4) * 0.38;

  ctx.save();

  // ── Layer 0: Background halo ────────────────────────────────────────────
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.4);
  halo.addColorStop(0, `hsla(${hue}, 72%, 58%, ${alpha * (0.10 + beatPulse * 0.05 + cadenceGlow * 0.06)})`);
  halo.addColorStop(0.6, `hsla(${hue}, 64%, 44%, ${alpha * 0.04})`);
  halo.addColorStop(1, `hsla(${hue}, 52%, 36%, 0)`);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.4, 0, TAU);
  ctx.fillStyle = halo;
  ctx.fill();

  // ── Layer 1: Outer ring system (scene-encoded) ──────────────────────────
  const ringAlphaBase = alpha * (0.52 + cadenceGlow * 0.24 + beatPulse * 0.18);
  ctx.save();
  switch (scene) {
    case "verse": {
      // Single dashed ring — settled, spacious
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.strokeStyle = `hsla(${hue}, 78%, 76%, ${ringAlphaBase * 0.82})`;
      ctx.lineWidth = 1.0;
      ctx.setLineDash([3.5, 7]);
      ctx.lineDashOffset = -(now * 0.009);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case "chorus": {
      // Double ring — lifted, open
      for (let ri = 0; ri < 2; ri++) {
        const rr = r * (1.0 - ri * 0.22);
        const lw = ri === 0 ? 1.2 : 0.8;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, TAU);
        ctx.strokeStyle = `hsla(${hue}, 88%, 82%, ${ringAlphaBase * (0.90 - ri * 0.22)})`;
        ctx.lineWidth = lw;
        ctx.stroke();
      }
      break;
    }
    case "bridge": {
      // Broken arc ring — suspended tension
      const arcCount = 6;
      const gapFrac = 0.22;
      for (let ai = 0; ai < arcCount; ai++) {
        const startAngle = baseRot + (ai / arcCount) * TAU;
        const endAngle = startAngle + (TAU / arcCount) * (1 - gapFrac);
        ctx.beginPath();
        ctx.arc(cx, cy, r, startAngle, endAngle);
        ctx.strokeStyle = `hsla(${hue}, 62%, 68%, ${ringAlphaBase * 0.64})`;
        ctx.lineWidth = 1.0;
        ctx.stroke();
      }
      break;
    }
    case "drop": {
      // Triple concentric rings — maximum density
      for (let ri = 0; ri < 3; ri++) {
        const rr = r * (1.0 - ri * 0.18);
        const lw = 1.6 - ri * 0.3;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, TAU);
        ctx.strokeStyle = `hsla(${hue}, 96%, 86%, ${ringAlphaBase * (1.0 - ri * 0.20)})`;
        ctx.lineWidth = lw;
        ctx.stroke();
      }
      break;
    }
  }
  ctx.restore();

  // ── Layer 2: Radial spokes (BPM-encoded) ───────────────────────────────
  const spokeRot = keyRotation + baseRot * 1.4;
  const spokeAlpha = alpha * (0.34 + cadenceGlow * 0.14);
  for (let si = 0; si < spokeCount; si++) {
    const angle = spokeRot + (si / spokeCount) * TAU;
    const innerEnd = r * 0.17;
    const outerEnd = r * 0.65;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * innerEnd, cy + Math.sin(angle) * innerEnd);
    ctx.lineTo(cx + Math.cos(angle) * outerEnd, cy + Math.sin(angle) * outerEnd);
    ctx.strokeStyle = `hsla(${hue}, 70%, 78%, ${spokeAlpha})`;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // Spoke tip accent dot
    ctx.beginPath();
    ctx.arc(
      cx + Math.cos(angle) * (outerEnd + r * 0.06),
      cy + Math.sin(angle) * (outerEnd + r * 0.06),
      1.2, 0, TAU,
    );
    ctx.fillStyle = `hsla(${hue}, 82%, 86%, ${spokeAlpha * 0.9})`;
    ctx.fill();
  }

  // ── Layer 3: Primary polygon (key + mode encoded) ───────────────────────
  const polyRot = keyRotation + baseRot - Math.PI / polygonSides;
  const polyR = r * 0.70;
  ctx.save();
  drawRegularPolygon(ctx, cx, cy, polyR, polygonSides, polyRot);
  ctx.strokeStyle = `hsla(${hue}, 82%, 84%, ${alpha * (0.68 + cadenceGlow * 0.22)})`;
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.restore();

  // ── Layer 4: Inner star / sacred overlay (mode × key) ──────────────────
  const starRot = -keyRotation * 0.5 + baseRot * 0.72 + Math.PI * 0.5;
  const starOuterR = r * 0.44;
  const starInnerR = mode === "major"
    ? r * 0.22   // hexagram — tighter inner circle
    : r * 0.17;  // pentagram — more pointed
  const starPoints = mode === "major" ? 6 : 5;

  ctx.save();
  drawStarPolygon(ctx, cx, cy, starOuterR, starInnerR, starPoints, starRot);
  ctx.strokeStyle = `hsla(${hue}, 78%, 90%, ${alpha * (0.48 + cadenceGlow * 0.18)})`;
  ctx.lineWidth = 0.9;
  ctx.stroke();

  // Very faint fill on the inner star — adds depth without overpowering
  ctx.fillStyle = `hsla(${hue}, 62%, 64%, ${alpha * 0.06})`;
  ctx.fill();
  ctx.restore();

  // ── Layer 5: Voice satellites (active-roles encoded) ────────────────────
  const orbitR = r * 0.88;
  const roleOrbitSpeed = 0.00022;
  for (let vi = 0; vi < activeRoles.length; vi++) {
    const role = activeRoles[vi];
    const style = VOICE_ROLE_STYLES[role];
    const orbitAngle = (vi / activeRoles.length) * TAU
      + baseRot * 0.45
      + now * roleOrbitSpeed * (vi % 2 === 0 ? 1 : -1)
      + keyRotation * 0.3;
    const sx = cx + Math.cos(orbitAngle) * orbitR;
    const sy = cy + Math.sin(orbitAngle) * orbitR;
    const dotR = r * 0.042 + (beatPulse * r * 0.012);
    const roleHue = style.palette.hue;
    const roleAlpha = alpha * (0.72 + beatPulse * 0.18);

    ctx.save();
    switch (style.glyph) {
      case "circle": {
        ctx.beginPath();
        ctx.arc(sx, sy, dotR, 0, TAU);
        ctx.fillStyle = `hsla(${roleHue}, 80%, 74%, ${roleAlpha})`;
        ctx.fill();
        ctx.strokeStyle = `hsla(${roleHue}, 88%, 88%, ${roleAlpha * 0.7})`;
        ctx.lineWidth = 0.7;
        ctx.stroke();
        break;
      }
      case "square": {
        ctx.fillStyle = `hsla(${roleHue}, 80%, 62%, ${roleAlpha})`;
        ctx.fillRect(sx - dotR, sy - dotR, dotR * 2, dotR * 2);
        ctx.strokeStyle = `hsla(${roleHue}, 88%, 80%, ${roleAlpha * 0.7})`;
        ctx.lineWidth = 0.7;
        ctx.strokeRect(sx - dotR, sy - dotR, dotR * 2, dotR * 2);
        break;
      }
      case "star": {
        ctx.beginPath();
        for (let pi = 0; pi < 5; pi++) {
          const a = (pi / 5) * TAU - Math.PI / 2 + now * 0.0004;
          const inner = dotR * 0.45;
          const x0 = sx + Math.cos(a) * dotR;
          const y0 = sy + Math.sin(a) * dotR;
          const ai = a + Math.PI / 5;
          const x1 = sx + Math.cos(ai) * inner;
          const y1 = sy + Math.sin(ai) * inner;
          if (pi === 0) ctx.moveTo(x0, y0);
          else ctx.lineTo(x0, y0);
          ctx.lineTo(x1, y1);
        }
        ctx.closePath();
        ctx.fillStyle = `hsla(${roleHue}, 90%, 76%, ${roleAlpha})`;
        ctx.fill();
        break;
      }
      case "diamond": {
        ctx.beginPath();
        ctx.moveTo(sx, sy - dotR * 1.3);
        ctx.lineTo(sx + dotR, sy);
        ctx.lineTo(sx, sy + dotR * 1.3);
        ctx.lineTo(sx - dotR, sy);
        ctx.closePath();
        ctx.fillStyle = `hsla(${roleHue}, 0%, 92%, ${roleAlpha})`;
        ctx.fill();
        break;
      }
      case "wave": {
        // Small three-arc wave shape for echo role
        ctx.beginPath();
        for (let wi = 0; wi < 3; wi++) {
          const wx = sx - dotR + (wi / 2) * dotR * 2;
          const wy = sy + Math.sin(wi * Math.PI + now * 0.004) * dotR * 0.7;
          if (wi === 0) ctx.moveTo(wx, wy);
          else ctx.lineTo(wx, wy);
        }
        ctx.strokeStyle = `hsla(${roleHue}, 72%, 70%, ${roleAlpha})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }

  // ── Layer 6: Center eye (motif density + beat pulse) ────────────────────
  const eyeBaseR = r * (0.08 + motifDensity * 0.12);
  const eyeR = eyeBaseR * (1 + beatPulse * 0.44 + cadenceGlow * 0.22);

  // Outer eye ring
  ctx.beginPath();
  ctx.arc(cx, cy, eyeR * 1.7, 0, TAU);
  ctx.strokeStyle = `hsla(${hue}, 68%, 80%, ${alpha * (0.22 + beatPulse * 0.28)})`;
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Filled eye
  const eyeFill = ctx.createRadialGradient(cx, cy, 0, cx, cy, eyeR);
  eyeFill.addColorStop(0, `hsla(${hue}, 90%, 92%, ${alpha * (0.78 + beatPulse * 0.18 + cadenceGlow * 0.12)})`);
  eyeFill.addColorStop(0.55, `hsla(${hue}, 80%, 72%, ${alpha * (0.44 + beatPulse * 0.12)})`);
  eyeFill.addColorStop(1, `hsla(${hue}, 64%, 52%, ${alpha * 0.12})`);
  ctx.beginPath();
  ctx.arc(cx, cy, eyeR, 0, TAU);
  ctx.fillStyle = eyeFill;
  ctx.fill();

  // Pupil dot
  ctx.beginPath();
  ctx.arc(cx, cy, eyeR * 0.28, 0, TAU);
  ctx.fillStyle = `hsla(${hue}, 100%, 96%, ${alpha * (0.9 + beatPulse * 0.1)})`;
  ctx.fill();

  ctx.restore();
};

export const drawMotifSigil = ({
  ctx,
  cx,
  cy,
  radius,
  hue,
  role,
  sigil,
  rhythmSkeleton,
  now,
  alpha,
  dormant = true,
  highlight = 0,
}: {
  ctx: CanvasRenderingContext2D;
  cx: number;
  cy: number;
  radius: number;
  hue: number;
  role: VoiceRole;
  sigil: MotifSigil;
  rhythmSkeleton: MotifRhythmSkeleton;
  now: number;
  alpha: number;
  dormant?: boolean;
  highlight?: number;
}) => {
  if (alpha < 0.01) {
    return;
  }

  const pulse = dormant ? 0.12 + highlight * 0.18 : 0.26 + highlight * 0.26;
  const rotation = (sigil.rotation / 180) * Math.PI + now * 0.00022;
  const orbitRadius = radius * (1.18 + sigil.wave * 0.18);
  const glow = radius * (1.8 + highlight * 0.28);
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, glow);

  halo.addColorStop(0, `hsla(${hue}, 88%, 84%, ${alpha * (0.16 + pulse * 0.36)})`);
  halo.addColorStop(0.55, `hsla(${hue}, 72%, 64%, ${alpha * 0.08})`);
  halo.addColorStop(1, `hsla(${hue}, 72%, 64%, 0)`);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, glow, 0, TAU);
  ctx.fill();

  for (let ringIndex = 0; ringIndex < sigil.ringCount; ringIndex += 1) {
    const ringRadius = radius * (1 - ringIndex * 0.2);
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius, 0, TAU);
    ctx.strokeStyle = `hsla(${hue}, 86%, 84%, ${alpha * (0.7 - ringIndex * 0.16)})`;
    ctx.lineWidth = dormant ? 0.9 : 1.1;
    ctx.setLineDash(dormant ? [3, 6] : [5, 5]);
    ctx.lineDashOffset = -(now * 0.009) * (ringIndex % 2 === 0 ? 1 : -1);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  drawRegularPolygon(
    ctx,
    cx,
    cy,
    radius * 0.72,
    sigil.polygonSides,
    rotation - Math.PI / sigil.polygonSides,
  );
  ctx.strokeStyle = `hsla(${hue}, 92%, 88%, ${alpha * (0.74 + highlight * 0.18)})`;
  ctx.lineWidth = dormant ? 0.95 : 1.2;
  ctx.stroke();

  for (let spokeIndex = 0; spokeIndex < sigil.spokeCount; spokeIndex += 1) {
    const spokeAngle = rotation + (spokeIndex / sigil.spokeCount) * TAU;
    const inner = radius * 0.18;
    const outer = radius * 0.58;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(spokeAngle) * inner, cy + Math.sin(spokeAngle) * inner);
    ctx.lineTo(cx + Math.cos(spokeAngle) * outer, cy + Math.sin(spokeAngle) * outer);
    ctx.strokeStyle = `hsla(${hue}, 78%, 80%, ${alpha * 0.42})`;
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }

  rhythmSkeleton.onsetRatios.forEach((ratio, index) => {
    const angle = rotation + ratio * TAU;
    const dotRadius = radius * (0.09 + (index % 2 === 0 ? 0.02 : 0));
    const x = cx + Math.cos(angle) * orbitRadius;
    const y = cy + Math.sin(angle) * orbitRadius;
    ctx.beginPath();
    ctx.arc(x, y, dotRadius, 0, TAU);
    ctx.fillStyle = `hsla(${hue}, 96%, 90%, ${alpha * 0.78})`;
    ctx.fill();
    ctx.strokeStyle = getRoleColor(role, alpha * 0.3, 14, 6);
    ctx.lineWidth = 0.7;
    ctx.stroke();
  });

  drawRoleGlyph(
    ctx,
    role,
    cx,
    cy,
    radius * 0.36 + highlight * 0.6,
    alpha * (dormant ? 0.72 : 0.9),
    rotation * 0.6,
    undefined,
    dormant && highlight < 0.08,
  );

  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.15, 0, TAU);
  ctx.fillStyle = `hsla(${hue}, 100%, 94%, ${alpha * (0.78 + highlight * 0.12)})`;
  ctx.fill();
};

// Zoom threshold below which sigil is fully visible, above which full scope shows
export const SIGIL_ZOOM_FULL = 1.0;    // at this zoom and below → sigilWeight = 1
export const SIGIL_ZOOM_FADE = 2.6;    // at this zoom and above → sigilWeight = 0

// ---------------------------------------------------------------------------
// Polygon loop sigil
// ---------------------------------------------------------------------------

/**
 * Draw the canonical sigil for a snapped polygon loop.
 *
 * Layering (back → front):
 *   active-edge retrace → full polygon outline → inner polygon → spokes
 *   → vertex dots → center eye → N-label
 *
 * Called from within the world-space canvas transform block, so all coordinates
 * are in normalised-world units (multiply by size.width / size.height to get
 * canvas context pixels, as normalizedToPixels() does).
 *
 * @param cycleProgress  -1 = pre-schedule (dormant); 0-1 = active cycle progress
 * @param activeStepIndex  current anchor step (vertex index)
 * @param zoom  cam.zoom — used to keep line widths visually stable
 */
export const drawPolygonLoopSigil = (
  ctx: CanvasRenderingContext2D,
  spec: PolygonSpec,
  size: SurfaceSize,
  hue: number,
  energy: number,
  zoom: number,
  cycleProgress: number,
  activeStepIndex: number,
  cadenceGlow: number,
  now: number,
): void => {
  const { sides, cx: normCx, cy: normCy, rFraction, rotation } = spec;
  const pxCx = normCx * size.width;
  const pxCy = normCy * size.height;
  const pxR = rFraction * Math.min(size.width, size.height);

  const isActive = cycleProgress >= 0;
  const baseAlpha = isActive
    ? clamp(0.60 + energy * 0.28 + cadenceGlow * 0.16, 0.58, 1.0)
    : 0.28;

  // Very slow drift for dormant state — makes it feel alive but settled
  const rot = isActive
    ? rotation
    : rotation + now * 0.000022 * (0.5 + sides * 0.12);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([]);

  // ── Active edge retrace ────────────────────────────────────────────────────
  if (isActive) {
    ctx.shadowBlur = (16 + energy * 22 + cadenceGlow * 14) / zoom;
    ctx.shadowColor = `hsla(${hue}, 88%, 78%, 0.52)`;

    const completedEdges = Math.floor(cycleProgress * sides);
    const partialProgress = cycleProgress * sides - completedEdges;

    // Completed edges — bright, slightly thick
    for (let i = 0; i < completedEdges; i++) {
      const a1 = rot + (i / sides) * TAU;
      const a2 = rot + ((i + 1) / sides) * TAU;
      ctx.beginPath();
      ctx.moveTo(pxCx + Math.cos(a1) * pxR, pxCy + Math.sin(a1) * pxR);
      ctx.lineTo(pxCx + Math.cos(a2) * pxR, pxCy + Math.sin(a2) * pxR);
      ctx.strokeStyle = `hsla(${hue}, 84%, 82%, ${baseAlpha * 0.76})`;
      ctx.lineWidth = 2.8 / zoom;
      ctx.stroke();
    }

    // Partial (current) edge — brightest
    if (completedEdges < sides) {
      const a1 = rot + (completedEdges / sides) * TAU;
      const a2 = rot + ((completedEdges + 1) / sides) * TAU;
      const vx1 = pxCx + Math.cos(a1) * pxR;
      const vy1 = pxCy + Math.sin(a1) * pxR;
      const vx2 = pxCx + Math.cos(a2) * pxR;
      const vy2 = pxCy + Math.sin(a2) * pxR;
      ctx.beginPath();
      ctx.moveTo(vx1, vy1);
      ctx.lineTo(lerp(vx1, vx2, partialProgress), lerp(vy1, vy2, partialProgress));
      ctx.strokeStyle = `hsla(${hue}, 96%, 94%, ${clamp(baseAlpha * 1.08, 0, 1)})`;
      ctx.lineWidth = 3.6 / zoom;
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
  }

  // ── Full polygon outline ────────────────────────────────────────────────────
  ctx.shadowBlur = 0;
  drawRegularPolygon(ctx, pxCx, pxCy, pxR, sides, rot);
  ctx.strokeStyle = `hsla(${hue}, ${isActive ? 82 : 68}%, ${isActive ? 70 : 52}%, ${
    isActive ? baseAlpha * 0.52 : 0.28
  })`;
  ctx.lineWidth = (isActive ? 1.7 : 1.2) / zoom;
  ctx.stroke();

  // ── Inner polygon (rotated by π/sides for star-sigil feel) ─────────────────
  const innerR = pxR * 0.62;
  drawRegularPolygon(ctx, pxCx, pxCy, innerR, sides, rot + Math.PI / sides);
  ctx.strokeStyle = `hsla(${hue}, 70%, 58%, ${isActive ? baseAlpha * 0.36 : 0.12})`;
  ctx.lineWidth = (isActive ? 0.9 : 0.6) / zoom;
  ctx.stroke();

  // ── Spokes (center → vertices) ─────────────────────────────────────────────
  for (let i = 0; i < sides; i++) {
    const angle = rot + (i / sides) * TAU;
    ctx.beginPath();
    ctx.moveTo(pxCx, pxCy);
    ctx.lineTo(pxCx + Math.cos(angle) * pxR, pxCy + Math.sin(angle) * pxR);
    ctx.strokeStyle = `hsla(${hue}, 62%, 56%, ${isActive ? 0.22 : 0.09})`;
    ctx.lineWidth = 0.55 / zoom;
    ctx.stroke();
  }

  // ── Vertex dots ────────────────────────────────────────────────────────────
  for (let i = 0; i < sides; i++) {
    const angle = rot + (i / sides) * TAU;
    const vx = pxCx + Math.cos(angle) * pxR;
    const vy = pxCy + Math.sin(angle) * pxR;
    const isActiveVert = isActive && i === activeStepIndex % sides;
    const vRadius = (isActiveVert ? 5.8 : 3.6) / zoom;
    const vAlpha = isActiveVert ? baseAlpha : isActive ? baseAlpha * 0.44 : 0.18;

    if (isActiveVert) {
      ctx.shadowBlur = 12 / zoom;
      ctx.shadowColor = `hsla(${hue}, 94%, 88%, 0.7)`;
    }
    ctx.beginPath();
    ctx.arc(vx, vy, vRadius, 0, TAU);
    ctx.fillStyle = `hsla(${hue}, 90%, 84%, ${vAlpha})`;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // ── Center eye ─────────────────────────────────────────────────────────────
  const eyeR = (isActive ? 4.4 + energy * 2.6 + cadenceGlow * 2 : 2.8) / zoom;
  const eyeAlpha = isActive ? clamp(0.52 + cadenceGlow * 0.32, 0.5, 0.95) : 0.17;
  ctx.beginPath();
  ctx.arc(pxCx, pxCy, eyeR, 0, TAU);
  ctx.fillStyle = `hsla(${hue}, 90%, 88%, ${eyeAlpha})`;
  ctx.fill();
  ctx.strokeStyle = `hsla(${hue}, 76%, 70%, ${eyeAlpha * 0.62})`;
  ctx.lineWidth = 0.7 / zoom;
  ctx.stroke();

  // ── N-label (subtle annotation below sigil) ────────────────────────────────
  const fontSize = Math.max(7, 10) / zoom;
  ctx.font = `${fontSize}px "Avenir Next Condensed","Franklin Gothic Medium","Arial Narrow",sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = `hsla(${hue}, 80%, 82%, ${isActive ? 0.46 : 0.18})`;
  ctx.fillText(String(sides), pxCx, pxCy + pxR + 15 / zoom);

  ctx.restore();
};

// ── Bezier helpers ─────────────────────────────────────────────────────────────
const bezierPoint = (
  t: number,
  ax: number, ay: number,
  cx: number, cy: number,
  bx: number, by: number,
): [number, number] => {
  const s = 1 - t;
  return [s * s * ax + 2 * s * t * cx + t * t * bx,
          s * s * ay + 2 * s * t * cy + t * t * by];
};

const MODE_HUE: Record<BindingMode, number> = {
  "phase-align": 198,
  "ratio-lock":  46,
  "call-offset": 294,
};

/**
 * Draws a luminous tether between two polygon sigils with travelling pulses.
 * Must be called INSIDE the world-space transform (camera already applied).
 */
export const drawResonanceFilament = (
  ctx: CanvasRenderingContext2D,
  filament: ResonanceFilament,
  loopA: ContourLoop,
  loopB: ContourLoop,
  size: SurfaceSize,
  zoom: number,
  now: number,
): void => {
  const specA = loopA.polygonSpec!;
  const specB = loopB.polygonSpec!;

  const ax = specA.cx * size.width;
  const ay = specA.cy * size.height;
  const bx = specB.cx * size.width;
  const by = specB.cy * size.height;

  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const bow = len * 0.18;
  const perpX = (-dy / len) * bow;
  const perpY = (dx / len) * bow;
  const cpx = (ax + bx) * 0.5 + perpX;
  const cpy = (ay + by) * 0.5 + perpY;

  const hueA = loopA.hue;
  const hueB = loopB.hue;
  const hDiff = ((hueB - hueA + 540) % 360) - 180;
  const blendHue = (hueA + hDiff * 0.5 + 360) % 360;
  const modeHue = MODE_HUE[filament.mode];
  const age = clamp((now - filament.bornAt) / 380, 0, 1);

  ctx.save();

  // Outer glow halo
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo(cpx, cpy, bx, by);
  ctx.strokeStyle = `hsla(${blendHue}, 74%, 62%, ${0.18 * age})`;
  ctx.lineWidth = 5 / zoom;
  ctx.shadowBlur = 10 / zoom;
  ctx.shadowColor = `hsla(${blendHue}, 80%, 70%, 0.3)`;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Inner dashed tether
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo(cpx, cpy, bx, by);
  ctx.strokeStyle = `hsla(${blendHue}, 88%, 84%, ${0.48 * age})`;
  ctx.lineWidth = 1.1 / zoom;
  ctx.setLineDash([7 / zoom, 14 / zoom]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Mode label at arc midpoint
  const [mlx, mly] = bezierPoint(0.5, ax, ay, cpx, cpy, bx, by);
  const mLabel = filament.mode === "ratio-lock"
    ? `${specA.sides}:${specB.sides}`
    : filament.mode === "phase-align" ? "≡" : "↠";
  const fs = Math.max(8, 11) / zoom;
  ctx.font = `${fs}px "Avenir Next Condensed","Arial Narrow",sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowBlur = 7 / zoom;
  ctx.shadowColor = `hsla(${modeHue}, 90%, 70%, 0.6)`;
  ctx.fillStyle = `hsla(${modeHue}, 94%, 90%, ${0.78 * age})`;
  ctx.fillText(mLabel, mlx, mly - 10 / zoom);
  ctx.shadowBlur = 0;

  // Travelling pulses
  for (const pulse of filament.pulses) {
    const pAge = now - pulse.bornAt;
    const progress = clamp(pAge / pulse.ttl, 0, 1);
    const effectiveT = pulse.dir === 1 ? progress : 1 - progress;
    const fadeIn  = Math.min(pAge / 60, 1);
    const fadeOut = Math.min((pulse.ttl - pAge) / 60, 1);
    const alpha   = pulse.strength * fadeIn * fadeOut * age;
    const pulseHue = pulse.dir === 1 ? hueA : hueB;
    const [px, py] = bezierPoint(effectiveT, ax, ay, cpx, cpy, bx, by);

    // Trail
    for (let k = 1; k <= 3; k++) {
      const trailT = clamp(effectiveT - pulse.dir * k * 0.04, 0, 1);
      const [tx, ty] = bezierPoint(trailT, ax, ay, cpx, cpy, bx, by);
      ctx.beginPath();
      ctx.arc(tx, ty, (2.2 - k * 0.5) / zoom, 0, TAU);
      ctx.fillStyle = `hsla(${pulseHue}, 88%, 88%, ${alpha * 0.28 / k})`;
      ctx.fill();
    }

    // Head
    ctx.shadowBlur = 12 / zoom;
    ctx.shadowColor = `hsla(${pulseHue}, 94%, 88%, ${alpha * 0.9})`;
    ctx.beginPath();
    ctx.arc(px, py, 3.4 / zoom, 0, TAU);
    ctx.fillStyle = `hsla(${pulseHue}, 96%, 94%, ${alpha})`;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  ctx.restore();
};

/**
 * Preview tether while dragging from one polygon to another.
 * Must be called INSIDE the world-space transform.
 */
export const drawFilamentPreview = (
  ctx: CanvasRenderingContext2D,
  fromSpec: PolygonSpec,
  toWorldX: number,
  toWorldY: number,
  fromHue: number,
  size: SurfaceSize,
  zoom: number,
): void => {
  const ax = fromSpec.cx * size.width;
  const ay = fromSpec.cy * size.height;
  const bx = toWorldX * size.width;
  const by = toWorldY * size.height;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const bow = len * 0.15;
  const cpx = (ax + bx) * 0.5 + (-dy / len) * bow;
  const cpy = (ay + by) * 0.5 + (dx / len) * bow;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo(cpx, cpy, bx, by);
  ctx.strokeStyle = `hsla(${fromHue}, 80%, 78%, 0.52)`;
  ctx.lineWidth = 1.6 / zoom;
  ctx.setLineDash([6 / zoom, 10 / zoom]);
  ctx.shadowBlur = 8 / zoom;
  ctx.shadowColor = `hsla(${fromHue}, 80%, 70%, 0.4)`;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
  ctx.restore();
};
