/** Color parsing/formatting helpers (Penpot hex → Figma RGBA 0..1). */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Parse #RGB, #RRGGBB or #RRGGBBAA into 0..1 RGBA. Returns null on failure. */
export function parseHexColor(input: string | undefined | null): Rgba | null {
  if (!input) return null;
  let hex = input.trim().replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map(ch => ch + ch)
      .join('');
  }
  if (hex.length === 4) {
    hex = hex
      .split('')
      .map(ch => ch + ch)
      .join('');
  }
  if (hex.length === 6) hex += 'ff';
  if (hex.length !== 8) return null;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const a = parseInt(hex.slice(6, 8), 16);
  if ([r, g, b, a].some(Number.isNaN)) return null;
  return { r: r / 255, g: g / 255, b: b / 255, a: a / 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) => Math.round(Math.min(255, Math.max(0, v)) ).toString(16).padStart(2, '0');
  return `#${to(r * 255)}${to(g * 255)}${to(b * 255)}`;
}

export function rgbaToFigma(color: Rgba, opacity = 1): { r: number; g: number; b: number } {
  void opacity;
  return { r: color.r, g: color.g, b: color.b };
}

/** Parse a Penpot color value that may be a hex string or a Color object. */
export function penpotColorValue(color: unknown): { hex?: string; opacity?: number } {
  if (typeof color === 'string') return { hex: color };
  if (color && typeof color === 'object') {
    const o = color as Record<string, unknown>;
    const hex = typeof o.color === 'string' ? o.color : typeof o.value === 'string' ? o.value : undefined;
    const opacity = typeof o.opacity === 'number' ? o.opacity : undefined;
    return { hex, opacity };
  }
  return {};
}
