import {
  TAU,
  VOICE_ROLE_STYLES,
  type MotifRhythmSkeleton,
  type MotifSigil,
  type SceneName,
  type VoiceRole,
} from "../surface/model";
import { easeInOutSine, easeOutCubic } from "../surface/contour";
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
