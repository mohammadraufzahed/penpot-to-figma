import type { PenpotShape, PenpotTextSpan } from '../shared/penpot';
import { parseTextShape, parseLineHeight, parseLetterSpacing, parseFontSize, parseFontWeight, normalizeFontStyle, normalizeTextCase, normalizeTextDecoration, normalizeTextAlign } from '../shared/convert/text';
import { fillToPaint } from '../shared/convert/paint';
import type { ImageResolver } from './paints';
import type { ShapeContext } from './shapes';
import type { WarningCollector } from '../shared/convert/warnings';

const FALLBACK_FONT: FontName = { family: 'Inter', style: 'Regular' };
const loadedFonts = new Map<string, FontName>();

function fontKey(family: string, style: string): string {
  return `${family}|${style}`;
}

async function resolveFont(family: string | undefined, weight: string | number | undefined, style: string | undefined, warnings: WarningCollector, shape: PenpotShape): Promise<FontName> {
  const fontFamily = family ?? 'Inter';
  const fontWeight = parseFontWeight(weight) ?? 400;
  const fontStyle = normalizeFontStyle(style);

  // Map weight+style to a Figma font style name.
  const styleName = fontStyle === 'italic' ? 'Italic' : weightToStyleName(fontWeight);
  const key = fontKey(fontFamily, styleName);
  const cached = loadedFonts.get(key);
  if (cached) return cached;

  const candidates: FontName[] = [
    { family: fontFamily, style: styleName },
    { family: fontFamily, style: fontStyle === 'italic' ? 'Italic' : 'Regular' },
    { family: fontFamily, style: 'Regular' },
    FALLBACK_FONT
  ];

  for (const candidate of candidates) {
    try {
      await figma.loadFontAsync(candidate);
      loadedFonts.set(key, candidate);
      return candidate;
    } catch {
      // try next
    }
  }

  warnings.add(`Font "${fontFamily}" (${styleName}) not available; using Inter Regular`, shape);
  try {
    await figma.loadFontAsync(FALLBACK_FONT);
  } catch {
    // last resort; Figma always has Inter in most files
  }
  loadedFonts.set(key, FALLBACK_FONT);
  return FALLBACK_FONT;
}

function weightToStyleName(weight: number): string {
  if (weight <= 100) return 'Thin';
  if (weight <= 200) return 'ExtraLight';
  if (weight <= 300) return 'Light';
  if (weight <= 400) return 'Regular';
  if (weight <= 500) return 'Medium';
  if (weight <= 600) return 'SemiBold';
  if (weight <= 700) return 'Bold';
  if (weight <= 800) return 'ExtraBold';
  return 'Black';
}

function spanFont(span: PenpotTextSpan): { family?: string; weight?: string | number; style?: string } {
  return {
    family: span.fontFamily,
    weight: span.fontWeight,
    style: span.fontStyle
  };
}

/** Create a Figma TextNode from a Penpot text shape. */
export async function createTextNode(shape: PenpotShape, ctx: ShapeContext): Promise<TextNode> {
  const parsed = parseTextShape(shape);
  const node = figma.createText();
  node.name = shape.name ?? 'Text';

  // Font must be loaded before setting characters.
  const firstSpan = parsed.runs[0]?.span ?? ({} as PenpotTextSpan);
  const baseFont = await resolveFont(firstSpan.fontFamily, firstSpan.fontWeight, firstSpan.fontStyle, ctx.warnings, shape);
  node.fontName = baseFont;

  // Grow type → auto-resize.
  if (shape.growType === 'auto-width') node.textAutoResize = 'WIDTH_AND_HEIGHT';
  else if (shape.growType === 'auto-height') node.textAutoResize = 'HEIGHT';
  else node.textAutoResize = 'NONE';

  node.characters = parsed.text;

  // Base paragraph properties from shape-level defaults.
  const defaultSize = parseFontSize(firstSpan.fontSize ?? shape.fontSize);
  if (defaultSize) node.fontSize = defaultSize;

  const lineHeight = parseLineHeight(firstSpan.lineHeight ?? shape.lineHeight);
  if (lineHeight) node.lineHeight = lineHeight;

  const letterSpacing = parseLetterSpacing(firstSpan.letterSpacing ?? shape.letterSpacing);
  if (letterSpacing) node.letterSpacing = letterSpacing;

  node.textAlignHorizontal = normalizeTextAlign(firstSpan.textAlign ?? shape.textAlign);

  // Apply per-span styles.
  for (const run of parsed.runs) {
    const span = run.span;
    const { start, end } = run;
    if (end <= start) continue;

    try {
      const font = await resolveFont(span.fontFamily, span.fontWeight, span.fontStyle, ctx.warnings, shape);
      node.setRangeFontName(start, end, font);
    } catch {
      // keep base font
    }

    const size = parseFontSize(span.fontSize);
    if (size) node.setRangeFontSize(start, end, size);

    const lh = parseLineHeight(span.lineHeight);
    if (lh) node.setRangeLineHeight(start, end, lh);

    const ls = parseLetterSpacing(span.letterSpacing);
    if (ls) node.setRangeLetterSpacing(start, end, ls);

    node.setRangeTextCase(start, end, normalizeTextCase(span.textTransform));
    node.setRangeTextDecoration(start, end, normalizeTextDecoration(span.textDecoration));

    if (span.fills && span.fills.length > 0) {
      const paints: Paint[] = [];
      for (const fill of span.fills) {
        const imageHash = fill.fillImage ? ctx.resolveImage(fill.fillImage.id) : null;
        const paint = fillToPaint(fill, 1, imageHash) as Paint | null;
        if (paint) paints.push(paint);
      }
      if (paints.length > 0) node.setRangeFills(start, end, paints);
    }
  }

  return node;
}

/** Attach text-specific helpers used by the importer. */
export function __setImageResolverForTests(resolve: ImageResolver): void {
  void resolve;
}
