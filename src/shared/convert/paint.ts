import type { PenpotFill, PenpotGradient, PenpotStroke } from '../penpot';
import { parseHexColor } from './color';
import { IDENTITY, applyToPoint, invert, multiply, rotation, scale, translation, type Mat3 } from './matrix';

export interface FigmaGradientStop {
  position: number;
  color: { r: number; g: number; b: number };
  opacity?: number;
}

export type FigmaPaint =
  | { type: 'SOLID'; color: { r: number; g: number; b: number }; opacity?: number; visible?: boolean }
  | {
      type: 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL';
      gradientTransform: Mat3;
      gradientStops: FigmaGradientStop[];
      opacity?: number;
      visible?: boolean;
    }
  | {
      type: 'IMAGE';
      imageHash: string;
      scaleMode: 'FILL' | 'FIT' | 'CROP' | 'TILE';
      opacity?: number;
      visible?: boolean;
    };

function stopsFromGradient(gradient: PenpotGradient, opacity: number): FigmaGradientStop[] {
  return (gradient.stops ?? []).map(stop => {
    const color = parseHexColor(stop.color);
    return {
      position: Math.min(1, Math.max(0, stop.offset ?? 0)),
      color: color ? { r: color.r, g: color.g, b: color.b } : { r: 0, g: 0, b: 0 },
      opacity: (stop.opacity ?? 1) * opacity
    };
  });
}

/**
 * Penpot → Figma gradientTransform.
 *
 * Figma's gradientTransform maps node-local coordinates into a normalized
 * gradient space: linear gradients run from (0, 0.5) to (1, 0.5), radial
 * gradients are centered at (0.5, 0.5) with the edge at (1, 0.5).
 * (Verified against penpot-exporter-figma-plugin's calculateLinearGradient,
 * which inverts fill.gradientTransform and applies it to those normalized
 * points to recover Penpot's node-local start/end.)
 */
export function gradientTransform(
  kind: 'linear' | 'radial',
  startX: number,
  startY: number,
  endX: number,
  endY: number
): { transform: Mat3; ok: boolean } {
  const dx = endX - startX;
  const dy = endY - startY;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) {
    return { transform: IDENTITY, ok: false };
  }

  if (kind === 'linear') {
    const theta = Math.atan2(dy, dx);
    // G = T(0, 0.5) ∘ Scale(1/len) ∘ Rot(-theta) ∘ T(-start)
    const g = multiply(
      translation(0, 0.5),
      multiply(scale(1 / len, 1 / len), multiply(rotation((-theta * 180) / Math.PI), translation(-startX, -startY)))
    );
    return { transform: g, ok: true };
  }

  // radial: center -> (0.5, 0.5), distance(start, end) -> 0.5 along the axis
  const theta = Math.atan2(dy, dx);
  const radius = len;
  if (radius < 1e-9) {
    return { transform: IDENTITY, ok: false };
  }
  const g = multiply(
    translation(0.5, 0.5),
    multiply(scale(0.5 / radius, 0.5 / radius), multiply(rotation((-theta * 180) / Math.PI), translation(-startX, -startY)))
  );
  return { transform: g, ok: true };
}

/** Sanity check helper (used by tests): apply transform to a point. */
export function applyGradientTransform(t: Mat3, x: number, y: number): { x: number; y: number } {
  return applyToPoint(t, x, y);
}

export function gradientToPaint(gradient: PenpotGradient, opacity: number): FigmaPaint | null {
  const stops = stopsFromGradient(gradient, opacity);
  if (stops.length === 0) return null;
  const { transform, ok } = gradientTransform(
    gradient.type === 'radial' ? 'radial' : 'linear',
    gradient.startX ?? 0,
    gradient.startY ?? 0,
    gradient.endX ?? 1,
    gradient.endY ?? 0
  );
  void ok;
  return {
    type: gradient.type === 'radial' ? 'GRADIENT_RADIAL' : 'GRADIENT_LINEAR',
    gradientTransform: transform,
    gradientStops: stops,
    opacity: 1,
    visible: true
  };
}

/**
 * Convert a Penpot fill to a Figma paint.
 * Image fills require a resolved imageHash (handled by the importer).
 */
export function fillToPaint(fill: PenpotFill, opacity: number, imageHash?: string | null): FigmaPaint | null {
  const fillOpacity = (fill.fillOpacity ?? 1) * opacity;

  if (fill.fillColorGradient) {
    return gradientToPaint(fill.fillColorGradient, fillOpacity);
  }

  if (fill.fillImage) {
    if (!imageHash) return null;
    return {
      type: 'IMAGE',
      imageHash,
      scaleMode: 'FILL',
      opacity: fillOpacity,
      visible: true
    };
  }

  if (fill.fillColor) {
    const color = parseHexColor(fill.fillColor);
    if (!color) return null;
    return {
      type: 'SOLID',
      color: { r: color.r, g: color.g, b: color.b },
      opacity: fillOpacity * color.a,
      visible: true
    };
  }

  return null;
}

export function strokeToPaint(stroke: PenpotStroke, opacity: number, imageHash?: string | null): FigmaPaint | null {
  const strokeOpacity = (stroke.strokeOpacity ?? 1) * opacity;

  if (stroke.strokeColorGradient) {
    return gradientToPaint(stroke.strokeColorGradient, strokeOpacity);
  }

  if (stroke.strokeImage) {
    if (!imageHash) return null;
    return { type: 'IMAGE', imageHash, scaleMode: 'FILL', opacity: strokeOpacity, visible: true };
  }

  if (stroke.strokeColor) {
    const color = parseHexColor(stroke.strokeColor);
    if (!color) return null;
    return {
      type: 'SOLID',
      color: { r: color.r, g: color.g, b: color.b },
      opacity: strokeOpacity * color.a,
      visible: true
    };
  }

  return null;
}

export function isMarkerCap(cap: unknown): boolean {
  return typeof cap === 'string' && cap.includes('marker') || cap === 'line-arrow' || cap === 'triangle-arrow';
}
