import {
  TAU,
  TIDE_ATTACK_ZONE,
  TIDE_MODULATION_ZONE,
  TIDE_TRAVEL_MS,
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
  type TideWave,
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

/**
 * Draws the persistent clock influence zone for an active polygon beacon.
 *
 * A faint circular timing-field centred on the polygon, with radius equal to
 * CLOCK_LATCH_RADIUS (converted to pixel space by the caller).  The halo:
 *   - Has a very faint interior radial glow tinted by the beacon's role hue
 *   - Has a slowly drifting dashed perimeter ring that breathes at a gentle rate
 *   - Flashes brighter on the downbeat (cycleProgress ≈ 0)
 *   - Brightens when a live stroke enters the field (isNearest && isDrawing)
 *   - Dims slightly when a live stroke is in a different beacon's field
 *
 * All coordinates are in canvas pixel space (after the camera transform).
 * @param latchRadiusPx   CLOCK_LATCH_RADIUS × Math.min(size.width, size.height)
 */
export const drawClockInfluenceHaloPx = (
  ctx: CanvasRenderingContext2D,
  pxCx: number,
  pxCy: number,
  hue: number,
  sides: number,
  zoom: number,
  cycleProgress: number,
  isNearest: boolean,
  isDrawing: boolean,
  latchRadiusPx: number,
  now: number,
  /** Optional tide modulation [0-1] — boosts halo brightness and dilates radius. */
  tideMod: number = 0,
): void => {
  // ── Downbeat brightness — perimeter brightens at the start of each cycle ──
  // cycleProgress = 0 is the downbeat.  We use a sharp decay so only the
  // first ~10 % of the cycle gets the bright flash.
  const rawDownbeatFlash = Math.pow(Math.max(0, 1 - cycleProgress / 0.12), 2.2);
  // Tide boosts the downbeat flash and keeps it elevated through its trail
  const downbeatFlash = rawDownbeatFlash + tideMod * 0.55;

  // ── Tide dilation — halo radius expands slightly when a wave passes ─────────
  const tidalLatchRadius = latchRadiusPx * (1 + tideMod * 0.10);

  // ── Slow breath — makes the field feel alive between downbeats ─────────────
  // Each beacon gets a unique phase via sides-based seed so they don't pulse
  // in lockstep when multiple halos overlap.
  const breathHz = 0.55 + sides * 0.04;
  const breathPhase = now * breathHz * 0.001 * TAU + sides * 1.37;
  const breathMod   = 0.55 + 0.45 * Math.sin(breathPhase);

  // ── Proximity boost — halo brightens when a live stroke is inside the field ─
  const proximityBoost = isNearest && isDrawing ? 0.68 : 0.0;
  const dimFactor      = isDrawing && !isNearest ? 0.42 : 1.0;

  // ── Interior radial glow (very faint wash that fills the field) ───────────
  const glowAlpha = (
    0.038 + downbeatFlash * 0.05 + breathMod * 0.012 +
    proximityBoost * 0.04 + tideMod * 0.05
  ) * dimFactor;
  if (glowAlpha > 0.005) {
    ctx.save();
    const innerGrad = ctx.createRadialGradient(pxCx, pxCy, 0, pxCx, pxCy, tidalLatchRadius);
    innerGrad.addColorStop(0.0,  `hsla(${hue}, 72%, 72%, ${glowAlpha * 0.55})`);
    innerGrad.addColorStop(0.55, `hsla(${hue}, 68%, 66%, ${glowAlpha * 0.28})`);
    innerGrad.addColorStop(1.0,  `hsla(${hue}, 62%, 60%, 0)`);
    ctx.fillStyle = glowAlpha > 0.005 ? innerGrad : "transparent";
    ctx.beginPath();
    ctx.arc(pxCx, pxCy, tidalLatchRadius, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // ── Perimeter ring ──────────────────────────────────────────────────────────
  // Base opacity is very low; it lifts on downbeat, proximity entry, and tide.
  const ringBaseAlpha = 0.08 + breathMod * 0.05 + tideMod * 0.18;
  const ringAlpha     = (ringBaseAlpha + downbeatFlash * 0.44 + proximityBoost * 0.52) * dimFactor;
  const ringWidth     = (
    (isNearest && isDrawing ? 1.6 : 1.1) + downbeatFlash * 1.2 + tideMod * 0.8
  ) / zoom;

  if (ringAlpha > 0.01) {
    ctx.save();
    ctx.globalAlpha  = clamp(ringAlpha, 0, 1);
    ctx.lineWidth    = ringWidth;
    ctx.shadowBlur   = (isNearest && isDrawing ? 18 : 8 + downbeatFlash * 14 + tideMod * 16) / zoom;
    ctx.shadowColor  = `hsla(${hue}, 88%, 78%, ${0.5 + downbeatFlash * 0.45 + tideMod * 0.3})`;
    ctx.strokeStyle  = `hsla(${hue}, ${72 + downbeatFlash * 18}%, ${68 + downbeatFlash * 14 + tideMod * 10}%, 1)`;
    // Subtle dashes — evenly matched so it feels like a frequency ring, not a UI dash
    const dashLen = Math.max(6, tidalLatchRadius * 0.13) / zoom;
    const gapLen  = dashLen * (1.6 - breathMod * 0.5);
    ctx.setLineDash([dashLen, gapLen]);
    // Slow rotation — the ring drifts very gently around the beacon;
    // tide briefly accelerates the rotation
    ctx.lineDashOffset = -(now * (0.009 + tideMod * 0.018) + sides * 22);
    ctx.beginPath();
    ctx.arc(pxCx, pxCy, tidalLatchRadius, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ── Secondary soft inner ring at ~60 % radius — reinforces the field centre ─
  const innerRingAlpha = (0.04 + downbeatFlash * 0.18 + proximityBoost * 0.22 + tideMod * 0.14) * dimFactor;
  if (innerRingAlpha > 0.01) {
    ctx.save();
    ctx.globalAlpha = clamp(innerRingAlpha, 0, 1);
    ctx.lineWidth   = 0.7 / zoom;
    ctx.strokeStyle = `hsla(${hue}, 68%, 70%, 1)`;
    ctx.setLineDash([3 / zoom, 6 / zoom]);
    ctx.lineDashOffset = now * 0.006 + sides * 11;
    ctx.beginPath();
    ctx.arc(pxCx, pxCy, tidalLatchRadius * 0.6, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
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

// ---------------------------------------------------------------------------
// Tide wavefront rendering — Phase 1 conduction layer
// ---------------------------------------------------------------------------

/**
 * Returns a modulation strength [0-1] for a given normalised-world point
 * based on all currently active tide waves.
 *
 * The modulation peaks when the wavefront passes over the point (offset ≈ 0)
 * and decays smoothly into the trail zone behind the front.
 */
export const getTideModulation = (
  worldX: number,
  worldY: number,
  waves: TideWave[],
  now: number,
): number => {
  let maxMod = 0;
  for (const wave of waves) {
    const elapsed = now - wave.bornAt;
    if (elapsed <= 0 || elapsed >= wave.ttl) continue;
    const travelProgress = clamp(elapsed / wave.travelMs, 0, 2.2);
    const ageAlpha = clamp(1 - elapsed / wave.ttl, 0, 1);

    // Front position in normalised world coords
    const frontX = wave.originX + wave.dirX * wave.travelSpan * travelProgress;
    const frontY = wave.originY + wave.dirY * wave.travelSpan * travelProgress;

    // Signed offset along the wave direction:
    //   positive = point is behind the front (in the trail)
    //   negative = point is ahead of the front (not yet touched)
    const dx = worldX - frontX;
    const dy = worldY - frontY;
    const offset = -(dx * wave.dirX + dy * wave.dirY);

    // Modulation profile: rise in attack zone, peak at front, decay in trail
    let mod = 0;
    if (offset > -TIDE_ATTACK_ZONE && offset < TIDE_MODULATION_ZONE) {
      const raw = offset < 0
        ? clamp((offset + TIDE_ATTACK_ZONE) / TIDE_ATTACK_ZONE, 0, 1)
        : clamp(1 - offset / TIDE_MODULATION_ZONE, 0, 1);
      mod = easeOutCubic(raw) * ageAlpha;
    }
    if (mod > maxMod) maxMod = mod;
  }
  return maxMod;
};

/**
 * Draw a single tide wavefront as a luminous moving ribbon.
 * Must be called INSIDE the world-space camera transform.
 *
 * Visual anatomy:
 *   • Broad soft trail (behind front): gentle glow that decays rearward
 *   • Bright leading edge: crisp luminous line at the wavefront
 *   • Particle shimmer: small bright motes scattered near the front
 */
export const drawTideWavefront = (
  ctx: CanvasRenderingContext2D,
  wave: TideWave,
  size: SurfaceSize,
  now: number,
  zoom: number,
): void => {
  const elapsed = now - wave.bornAt;
  if (elapsed <= 0 || elapsed >= wave.ttl) return;

  const travelProgress = clamp(elapsed / TIDE_TRAVEL_MS, 0, 2.2);
  const ageAlpha   = clamp(1 - elapsed / wave.ttl, 0, 1);
  const attackAlpha = clamp(elapsed / 110, 0, 1);
  const baseAlpha  = ageAlpha * attackAlpha;
  if (baseAlpha < 0.008) return;

  const W = size.width;
  const H = size.height;
  const isHorizontal = Math.abs(wave.dirX) > 0.5;

  // Front position in pixels
  const frontNormX = wave.originX + wave.dirX * wave.travelSpan * travelProgress;
  const frontNormY = wave.originY + wave.dirY * wave.travelSpan * travelProgress;
  const frontPxX   = frontNormX * W;
  const frontPxY   = frontNormY * H;

  // Ribbon breathing animation
  const breathe = 1 + 0.05 * Math.sin(now * 0.0052 + wave.id * 1.73);

  ctx.save();

  // ── Main glow ribbon ──────────────────────────────────────────────────────
  //
  // For a rightward-travelling ribbon (rush, dirX=1):
  //   - Trail stretches leftward from the front
  //   - A thin edge-slop extends rightward (anti-aliasing)
  //
  // The gradient is oriented along the travel axis and maps:
  //   [trail end] → transparent  →  bright at front  →  [slop] → transparent
  //
  const trailPx   = 88 * breathe;
  const edgeSlopPx = 10;
  const totalPx    = trailPx + edgeSlopPx;

  if (isHorizontal) {
    // rect extends from trail-end to just past the front
    const rushDir = wave.dirX > 0;
    const rectX = rushDir ? (frontPxX - trailPx) : (frontPxX - edgeSlopPx);
    const rectW = totalPx;
    // Fraction of rect width at which the front sits
    const frontFrac = rushDir ? (trailPx / totalPx) : (edgeSlopPx / totalPx);

    const grad = ctx.createLinearGradient(rectX, 0, rectX + rectW, 0);
    if (rushDir) {
      // L→R: transparent trail on left, bright front near right
      grad.addColorStop(0,             `hsla(${wave.hue}, 90%, 82%, 0)`);
      grad.addColorStop(frontFrac * 0.40, `hsla(${wave.hue}, 88%, 84%, ${baseAlpha * 0.05})`);
      grad.addColorStop(frontFrac * 0.75, `hsla(${wave.hue}, 92%, 88%, ${baseAlpha * 0.20})`);
      grad.addColorStop(frontFrac * 0.94, `hsla(${wave.hue}, 95%, 94%, ${baseAlpha * 0.46})`);
      grad.addColorStop(frontFrac,        `hsla(${wave.hue}, 96%, 96%, ${baseAlpha * 0.56})`);
      grad.addColorStop(1,             `hsla(${wave.hue}, 90%, 82%, 0)`);
    } else {
      // R→L: bright front near left, transparent trail on right
      grad.addColorStop(0,             `hsla(${wave.hue}, 90%, 82%, 0)`);
      grad.addColorStop(frontFrac,        `hsla(${wave.hue}, 96%, 96%, ${baseAlpha * 0.56})`);
      grad.addColorStop(frontFrac + (1 - frontFrac) * 0.06, `hsla(${wave.hue}, 95%, 94%, ${baseAlpha * 0.46})`);
      grad.addColorStop(frontFrac + (1 - frontFrac) * 0.28, `hsla(${wave.hue}, 92%, 88%, ${baseAlpha * 0.20})`);
      grad.addColorStop(frontFrac + (1 - frontFrac) * 0.64, `hsla(${wave.hue}, 88%, 84%, ${baseAlpha * 0.05})`);
      grad.addColorStop(1,             `hsla(${wave.hue}, 90%, 82%, 0)`);
    }

    ctx.save();
    ctx.shadowBlur  = 20 / zoom;
    ctx.shadowColor = `hsla(${wave.hue}, 88%, 88%, ${baseAlpha * 0.45})`;
    ctx.fillStyle   = grad;
    ctx.fillRect(rectX, 0, rectW, H);
    ctx.restore();

    // Bright leading edge line
    ctx.save();
    ctx.globalAlpha  = clamp(baseAlpha * 0.72, 0, 1);
    ctx.lineWidth    = (1.4 + breathe * 0.6) / zoom;
    ctx.strokeStyle  = `hsla(${wave.hue}, 96%, 98%, 0.92)`;
    ctx.shadowBlur   = 14 / zoom;
    ctx.shadowColor  = `hsla(${wave.hue}, 94%, 92%, 0.8)`;
    ctx.beginPath();
    ctx.moveTo(frontPxX, 0);
    ctx.lineTo(frontPxX, H);
    ctx.stroke();
    ctx.restore();

  } else {
    // Vertical ribbon (swell / ebb)
    const swellDir = wave.dirY < 0; // swell = upward = dirY < 0
    const rectY = swellDir ? (frontPxY - edgeSlopPx) : (frontPxY - trailPx);
    const rectH = totalPx;
    const frontFrac = swellDir ? (edgeSlopPx / totalPx) : (trailPx / totalPx);

    const grad = ctx.createLinearGradient(0, rectY, 0, rectY + rectH);
    if (!swellDir) {
      // T→B (ebb): transparent trail on top, bright front near bottom
      grad.addColorStop(0,             `hsla(${wave.hue}, 90%, 82%, 0)`);
      grad.addColorStop(frontFrac * 0.40, `hsla(${wave.hue}, 88%, 84%, ${baseAlpha * 0.05})`);
      grad.addColorStop(frontFrac * 0.75, `hsla(${wave.hue}, 92%, 88%, ${baseAlpha * 0.20})`);
      grad.addColorStop(frontFrac * 0.94, `hsla(${wave.hue}, 95%, 94%, ${baseAlpha * 0.46})`);
      grad.addColorStop(frontFrac,        `hsla(${wave.hue}, 96%, 96%, ${baseAlpha * 0.56})`);
      grad.addColorStop(1,             `hsla(${wave.hue}, 90%, 82%, 0)`);
    } else {
      // B→T (swell): bright front near top, transparent trail below
      grad.addColorStop(0,             `hsla(${wave.hue}, 90%, 82%, 0)`);
      grad.addColorStop(frontFrac,        `hsla(${wave.hue}, 96%, 96%, ${baseAlpha * 0.56})`);
      grad.addColorStop(frontFrac + (1 - frontFrac) * 0.06, `hsla(${wave.hue}, 95%, 94%, ${baseAlpha * 0.46})`);
      grad.addColorStop(frontFrac + (1 - frontFrac) * 0.28, `hsla(${wave.hue}, 92%, 88%, ${baseAlpha * 0.20})`);
      grad.addColorStop(frontFrac + (1 - frontFrac) * 0.64, `hsla(${wave.hue}, 88%, 84%, ${baseAlpha * 0.05})`);
      grad.addColorStop(1,             `hsla(${wave.hue}, 90%, 82%, 0)`);
    }

    ctx.save();
    ctx.shadowBlur  = 20 / zoom;
    ctx.shadowColor = `hsla(${wave.hue}, 88%, 88%, ${baseAlpha * 0.45})`;
    ctx.fillStyle   = grad;
    ctx.fillRect(0, rectY, W, rectH);
    ctx.restore();

    // Bright leading edge line
    ctx.save();
    ctx.globalAlpha  = clamp(baseAlpha * 0.72, 0, 1);
    ctx.lineWidth    = (1.4 + breathe * 0.6) / zoom;
    ctx.strokeStyle  = `hsla(${wave.hue}, 96%, 98%, 0.92)`;
    ctx.shadowBlur   = 14 / zoom;
    ctx.shadowColor  = `hsla(${wave.hue}, 94%, 92%, 0.8)`;
    ctx.beginPath();
    ctx.moveTo(0, frontPxY);
    ctx.lineTo(W, frontPxY);
    ctx.stroke();
    ctx.restore();
  }

  // ── Particle shimmer — scattered motes near the leading edge ─────────────
  // Uses deterministic per-wave per-particle seeds so the pattern is stable.
  const nParticles = 14;
  for (let i = 0; i < nParticles; i++) {
    // Deterministic hash from wave ID + particle index
    const hashA = (wave.id * 1777 + i * 137) & 0xFFFF;
    const hashB = (wave.id * 2311 + i * 97)  & 0xFFFF;
    const hashC = (wave.id * 3019 + i * 211) & 0xFFFF;
    const INV   = 1 / 65536;

    // Position along the leading-edge line (0-1 of canvas W or H)
    const alongFrac = (hashA * INV) % 1;
    // Distance behind the front (always trailing, never ahead)
    const backOff   = (5 + 30 * (hashB * INV)) * ((wave.dirX > 0 || wave.dirY > 0) ? 1 : 1);
    // Individual twinkle phase
    const twinkleSpeed = 0.0007 + 0.0006 * (hashC * INV);
    const twinkle  = Math.sin((now * twinkleSpeed + i * 0.142) * TAU * 0.5 + 1) * 0.5 + 0.5;
    const pAlpha   = twinkle * baseAlpha * 0.62;
    if (pAlpha < 0.015) continue;

    let px: number;
    let py: number;
    if (isHorizontal) {
      py = alongFrac * H;
      px = frontPxX + (wave.dirX > 0 ? -backOff : backOff);
    } else {
      px = alongFrac * W;
      py = frontPxY + (wave.dirY > 0 ? -backOff : backOff);
    }

    const pR = (0.9 + 2.0 * (hashB * INV)) / zoom;
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, pR, 0, TAU);
    ctx.fillStyle   = `hsla(${wave.hue + 15}, 100%, 98%, ${pAlpha})`;
    ctx.shadowBlur  = pR * 4.5;
    ctx.shadowColor = `hsla(${wave.hue}, 90%, 92%, ${pAlpha * 0.45})`;
    ctx.fill();
    ctx.restore();
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
