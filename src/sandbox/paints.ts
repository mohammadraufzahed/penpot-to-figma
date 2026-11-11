import type { PenpotBlur, PenpotFill, PenpotShape, PenpotShadow, PenpotStroke } from '../shared/penpot';
import type { PenpotDocument } from '../shared/penpot';
import { fillToPaint, strokeToPaint } from '../shared/convert/paint';
import { parseHexColor, penpotColorValue } from '../shared/convert/color';
import type { WarningCollector } from '../shared/convert/warnings';

export type ImageResolver = (imageId: string) => string | null;

function shadowColorToRgba(color: PenpotShadow['color']): { r: number; g: number; b: number; a: number } | null {
  if (!color) return null;
  const { hex, opacity } = penpotColorValue(color);
  const parsed = parseHexColor(hex);
  if (!parsed) return null;
  return { r: parsed.r, g: parsed.g, b: parsed.b, a: parsed.a * (opacity ?? 1) };
}

/** Apply Penpot fills to a Figma node (SOLID/GRADIENT/IMAGE). */
export function applyFills(node: SceneNode & { fills?: Paint[] }, fills: PenpotFill[] | undefined, opacity: number, resolveImage: ImageResolver, warnings: WarningCollector, shape?: PenpotShape): void {
  if (!fills || fills.length === 0) {
    node.fills = [];
    return;
  }
  const paints: Paint[] = [];
  for (const fill of fills) {
    let imageHash: string | null = null;
    if (fill.fillImage) {
      imageHash = resolveImage(fill.fillImage.id);
      if (!imageHash) {
        warnings.add(`Image fill not found for shape "${shape?.name ?? shape?.id}"`, shape);
        continue;
      }
    }
    const paint = fillToPaint(fill, opacity, imageHash) as Paint | null;
    if (paint) paints.push(paint);
  }
  node.fills = paints;
}

export function applyStrokes(node: SceneNode & { strokes?: Paint[] }, strokes: PenpotStroke[] | undefined, opacity: number, resolveImage: ImageResolver, warnings: WarningCollector, shape?: PenpotShape): void {
  if (!strokes || strokes.length === 0) {
    node.strokes = [];
    return;
  }
  const paints: Paint[] = [];
  for (const stroke of strokes) {
    let imageHash: string | null = null;
    if (stroke.strokeImage) {
      imageHash = resolveImage(stroke.strokeImage.id);
      if (!imageHash) {
        warnings.add(`Image stroke not found for shape "${shape?.name ?? shape?.id}"`, shape);
        continue;
      }
    }
    const paint = strokeToPaint(stroke, opacity, imageHash) as Paint | null;
    if (paint) paints.push(paint);
  }
  node.strokes = paints;

  const stroke = strokes.find(s => s.strokeWidth !== undefined && s.strokeWidth > 0) ?? strokes[0];
  if (stroke) {
    if ('strokeWeight' in node) {
      (node as GeometryMixin).strokeWeight = stroke.strokeWidth ?? 1;
    }
    if ('strokeAlign' in node) {
      const alignMap: Record<string, 'CENTER' | 'INSIDE' | 'OUTSIDE'> = {
        center: 'CENTER',
        inner: 'INSIDE',
        outer: 'OUTSIDE'
      };
      (node as GeometryMixin).strokeAlign = alignMap[stroke.strokeAlignment ?? 'center'] ?? 'CENTER';
    }
    if ('strokeCap' in node) {
      const capMap: Record<string, StrokeCap> = {
        round: 'ROUND',
        square: 'SQUARE',
        'line-arrow': 'ARROW_LINES',
        'triangle-arrow': 'ARROW_EQUILATERAL'
      };
      const cap = capMap[String(stroke.strokeCapEnd ?? '')];
      if (cap) (node as GeometryMixin).strokeCap = cap;
    }
    if ('dashPattern' in node) {
      const target = node as unknown as { dashPattern?: number[] };
      if (stroke.strokeStyle === 'dashed' || stroke.strokeStyle === 'dotted') {
        const dash = stroke.strokeDash ?? 4;
        const gap = stroke.strokeGap ?? dash;
        target.dashPattern = [dash, gap];
      } else {
        target.dashPattern = [];
      }
    }
  }
}

export function applyEffects(node: SceneNode, shadow: PenpotShadow[] | undefined, blur: PenpotBlur[] | PenpotBlur | undefined, warnings: WarningCollector, shape?: PenpotShape): void {
  const effects: Effect[] = [];

  if (Array.isArray(shadow)) {
    for (const s of shadow) {
      if (s.hidden) continue;
      const color = shadowColorToRgba(s.color);
      if (!color) continue;
      effects.push({
        type: s.style === 'inner-shadow' ? 'INNER_SHADOW' : 'DROP_SHADOW',
        color,
        offset: { x: s.offsetX ?? 0, y: s.offsetY ?? 0 },
        radius: s.blur ?? 0,
        spread: s.spread ?? 0,
        visible: true,
        blendMode: 'NORMAL'
      } as Effect);
    }
  }

  const blurList = Array.isArray(blur) ? blur : blur ? [blur] : [];
  for (const b of blurList) {
    if (b.hidden) continue;
    effects.push({
      type: b.type === 'background-blur' ? 'BACKGROUND_BLUR' : 'LAYER_BLUR',
      radius: b.value ?? 0,
      visible: true
    } as Effect);
  }

  if ('effects' in node) {
    (node as unknown as { effects: Effect[] }).effects = effects;
  }
}

export function applyOpacity(node: SceneNode, shape: PenpotShape, opacity: number): void {
  const combined = opacity * (shape.opacity ?? 1);
  if ('opacity' in node && Math.abs(combined - 1) > 1e-6) {
    (node as unknown as { opacity: number }).opacity = combined;
  }
}

export function applyBlendMode(node: SceneNode, blendMode: string | undefined, opacity: number): void {
  void opacity;
  if (!blendMode || !('blendMode' in node)) return;
  const map: Record<string, BlendMode> = {
    normal: 'NORMAL',
    'pass-through': 'PASS_THROUGH',
    multiply: 'MULTIPLY',
    screen: 'SCREEN',
    overlay: 'OVERLAY',
    'darken-only': 'DARKEN',
    lighten: 'LIGHTEN',
    'color-dodge': 'COLOR_DODGE',
    'color-burn': 'COLOR_BURN',
    'hard-light': 'HARD_LIGHT',
    'soft-light': 'SOFT_LIGHT',
    difference: 'DIFFERENCE',
    exclusion: 'EXCLUSION',
    hue: 'HUE',
    saturation: 'SATURATION',
    color: 'COLOR',
    luminosity: 'LUMINOSITY'
  };
  const mapped = map[blendMode.toLowerCase()];
  if (mapped) (node as BlendMixin).blendMode = mapped;
}

/** Pre-register all media images with Figma, returning id → hash map. */
export async function registerImages(doc: PenpotDocument): Promise<Map<string, string>> {
  const hashById = new Map<string, string>();
  for (const entry of doc.media.values()) {
    if (!entry.contentType.startsWith('image/')) continue;
    if (entry.contentType === 'image/webp' || entry.contentType === 'image/svg+xml') {
      // SVG/WebP handled by UI conversion or skipped with warning elsewhere.
    }
    try {
      const image = figma.createImage(entry.bytes);
      for (const id of entry.ids) {
        hashById.set(id, image.hash);
      }
    } catch {
      // Unsupported format (e.g. WebP); UI layer converts to PNG beforehand.
    }
  }
  return hashById;
}
