import {
  RESPONSE_GLYPH_HUE,
  TAU,
  VOICE_ROLE_STYLES,
  type ContourLoop,
  type FusionSignature,
  type NormalizedPoint,
  type SurfaceSize,
  type VoiceRole,
} from "../surface/model";
import { clamp, mix, mixHue, normalizedToPixels, point } from "../surface/contour";

export const drawPolyline = (
  context: CanvasRenderingContext2D,
  size: SurfaceSize,
  points: NormalizedPoint[],
  strokeStyle: string,
  lineWidth: number,
) => {
  if (points.length < 2) {
    return;
  }

  context.beginPath();

  points.forEach((pointValue, index) => {
    const pixel = normalizedToPixels(pointValue, size);
    if (index === 0) {
      context.moveTo(pixel.x, pixel.y);
    } else {
      context.lineTo(pixel.x, pixel.y);
    }
  });

  context.strokeStyle = strokeStyle;
  context.lineWidth = lineWidth;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.stroke();
};

export const getRoleColor = (
  role: VoiceRole,
  alpha: number,
  lightnessOffset = 0,
  saturationOffset = 0,
) => {
  const palette = VOICE_ROLE_STYLES[role].palette;

  return `hsla(${palette.hue}, ${clamp(
    palette.saturation + saturationOffset,
    0,
    100,
  )}%, ${clamp(palette.lightness + lightnessOffset, 0, 100)}%, ${alpha})`;
};

export const getDialogueHue = (loop: ContourLoop, chordHue?: number) =>
  loop.dialogueKind === "response"
    ? mix(RESPONSE_GLYPH_HUE, chordHue ?? RESPONSE_GLYPH_HUE, 0.16)
    : loop.hue;

export const drawRoleGlyph = (
  context: CanvasRenderingContext2D,
  role: VoiceRole,
  x: number,
  y: number,
  size: number,
  alpha: number,
  rotation = 0,
  hueOverride?: number,
  outlineOnly = false,
) => {
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.strokeStyle =
    hueOverride === undefined
      ? getRoleColor(role, alpha, 18, role === "percussion" ? -100 : 8)
      : `hsla(${hueOverride}, ${role === "percussion" ? 10 : 88}%, 84%, ${alpha})`;
  context.fillStyle =
    hueOverride === undefined
      ? getRoleColor(role, alpha * 0.42, 12, role === "percussion" ? -100 : 2)
      : `hsla(${hueOverride}, ${role === "percussion" ? 10 : 82}%, 72%, ${alpha * 0.42})`;
  context.lineWidth = 1.25;
  context.lineCap = "round";
  context.lineJoin = "round";

  switch (VOICE_ROLE_STYLES[role].glyph) {
    case "circle":
      context.beginPath();
      context.arc(0, 0, size * 0.72, 0, TAU);
      if (!outlineOnly) {
        context.fill();
      }
      context.stroke();
      break;
    case "square":
      context.beginPath();
      context.rect(-size * 0.62, -size * 0.62, size * 1.24, size * 1.24);
      if (!outlineOnly) {
        context.fill();
      }
      context.stroke();
      break;
    case "diamond":
      context.beginPath();
      context.moveTo(0, -size * 0.78);
      context.lineTo(size * 0.78, 0);
      context.lineTo(0, size * 0.78);
      context.lineTo(-size * 0.78, 0);
      context.closePath();
      if (!outlineOnly) {
        context.fill();
      }
      context.stroke();
      break;
    case "wave":
      context.fillStyle = "transparent";
      context.beginPath();
      context.moveTo(-size, 0);
      context.quadraticCurveTo(-size * 0.5, -size * 0.7, 0, 0);
      context.quadraticCurveTo(size * 0.5, size * 0.7, size, 0);
      context.stroke();
      break;
    case "star":
      context.beginPath();
      for (let index = 0; index < 8; index += 1) {
        const angle = (index / 8) * TAU;
        const radius = index % 2 === 0 ? size : size * 0.42;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;

        if (index === 0) {
          context.moveTo(px, py);
        } else {
          context.lineTo(px, py);
        }
      }
      context.closePath();
      if (!outlineOnly) {
        context.fill();
      }
      context.stroke();
      break;
  }

  context.restore();
};

export const drawFusionGlyph = (
  context: CanvasRenderingContext2D,
  signature: FusionSignature,
  x: number,
  y: number,
  size: number,
  alpha: number,
  rotation = 0,
  pulse = 0,
) => {
  const blendedHue = mixHue(signature.hues[0], signature.hues[1], 0.5);
  const orbit = size * 0.42;

  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.strokeStyle = `hsla(${blendedHue}, 96%, 84%, ${alpha * 0.82})`;
  context.fillStyle = `hsla(${blendedHue}, 96%, 78%, ${alpha * 0.18})`;
  context.lineWidth = 1.25;
  context.beginPath();
  context.arc(0, 0, size * (0.92 + pulse * 0.08), 0, TAU);
  context.fill();
  context.stroke();

  drawRoleGlyph(
    context,
    signature.roles[0],
    -orbit,
    0,
    size * 0.7,
    alpha * 0.78,
    rotation * 0.35,
    mixHue(signature.hues[0], blendedHue, 0.18),
  );
  drawRoleGlyph(
    context,
    signature.roles[1],
    orbit,
    0,
    size * 0.7,
    alpha * 0.78,
    -rotation * 0.35,
    mixHue(signature.hues[1], blendedHue, 0.18),
  );

  context.strokeStyle = `hsla(${blendedHue}, 98%, 90%, ${alpha * 0.72})`;
  context.fillStyle = `hsla(${blendedHue}, 98%, 90%, ${alpha * 0.72})`;

  switch (signature.timbre) {
    case "shimmer":
      context.lineWidth = 1.1;
      for (let index = 0; index < 6; index += 1) {
        const angle = (index / 6) * TAU;
        const inner = size * 0.34;
        const outer = size * (0.88 + pulse * 0.08);
        context.beginPath();
        context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
        context.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
        context.stroke();
      }
      break;
    case "arp":
      for (let index = 0; index < 3; index += 1) {
        const px = -size * 0.46 + index * size * 0.44;
        const py = size * 0.42 - index * size * 0.3;
        context.beginPath();
        context.arc(px, py, size * 0.12 + (2 - index) * 0.2, 0, TAU);
        context.fill();
      }
      break;
    case "harmonic-echo":
      context.lineWidth = 1;
      for (let index = 0; index < 2; index += 1) {
        const radius = size * (0.58 + index * 0.22 + pulse * 0.04);
        context.beginPath();
        context.arc(0, 0, radius, Math.PI * 0.16, Math.PI * 0.84);
        context.stroke();
        context.beginPath();
        context.arc(0, 0, radius, Math.PI * 1.16, Math.PI * 1.84);
        context.stroke();
      }
      break;
  }

  context.restore();
};

export const warpPointForRole = (
  pointValue: NormalizedPoint,
  nextPoint: NormalizedPoint,
  role: VoiceRole,
  motionSeed: number,
  progress: number,
  now: number,
) => {
  const dx = nextPoint.x - pointValue.x;
  const dy = nextPoint.y - pointValue.y;
  const magnitude = Math.hypot(dx, dy) || 1;
  const tangentX = dx / magnitude;
  const tangentY = dy / magnitude;
  const perpX = -tangentY;
  const perpY = tangentX;
  const phase = now * 0.0014 + motionSeed + progress * TAU;
  let offsetX = 0;
  let offsetY = 0;

  switch (VOICE_ROLE_STYLES[role].motion) {
    case "breathe":
      offsetX = perpX * Math.sin(phase * 0.7) * 0.012;
      offsetY = perpY * Math.sin(phase * 0.7) * 0.012;
      break;
    case "weight":
      offsetY = 0.012 + Math.sin(phase * 0.5) * 0.006;
      offsetX = tangentX * 0.004 * Math.sin(phase);
      break;
    case "spark":
      offsetX =
        tangentX * 0.008 * Math.sin(phase * 1.8) +
        perpX * 0.004 * Math.cos(phase * 2.1);
      offsetY =
        tangentY * 0.008 * Math.sin(phase * 1.8) +
        perpY * 0.004 * Math.cos(phase * 2.1);
      break;
    case "pulse":
      offsetX = perpX * 0.006 * Math.sign(Math.sin(phase * 2.8));
      offsetY = perpY * 0.006 * Math.sign(Math.sin(phase * 2.8));
      break;
    case "orbit":
      offsetX =
        perpX * Math.sin(phase * 1.1) * 0.018 +
        tangentX * Math.cos(phase * 0.8) * 0.004;
      offsetY =
        perpY * Math.sin(phase * 1.1) * 0.018 +
        tangentY * Math.cos(phase * 0.8) * 0.004;
      break;
  }

  return point(
    clamp(pointValue.x + offsetX, 0.04, 0.96),
    clamp(pointValue.y + offsetY, 0.05, 0.95),
    pointValue.t,
  );
};

