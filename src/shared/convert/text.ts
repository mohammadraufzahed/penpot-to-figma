import type { PenpotShape, PenpotTextContent, PenpotTextSpan } from '../penpot';

export interface TextRun {
  start: number;
  end: number;
  span: PenpotTextSpan;
}

export interface ParsedText {
  text: string;
  runs: TextRun[];
  paragraphs: Array<{ start: number; end: number; align?: string }>;
}

function flattenSpans(content: PenpotTextContent | undefined): { text: string; runs: TextRun[]; paragraphs: Array<{ start: number; end: number; align?: string }> } {
  const textParts: string[] = [];
  const runs: TextRun[] = [];
  const paragraphs: Array<{ start: number; end: number; align?: string }> = [];

  const paragraphSets = content?.children ?? [];
  let offset = 0;
  let first = true;

  for (const set of paragraphSets) {
    const paragraphsInSet = (set as { children?: unknown[] }).children ?? [];
    for (const para of paragraphsInSet) {
      const p = para as PenpotTextSpan & { type?: string; children?: PenpotTextSpan[] };
      if (!first) {
        textParts.push('\n');
        offset += 1;
      }
      first = false;
      const paraStart = offset;
      const spans = p.children ?? [p];
      for (const span of spans) {
        const value = span.text ?? '';
        const start = offset;
        textParts.push(value);
        offset += value.length;
        runs.push({ start, end: offset, span });
      }
      paragraphs.push({ start: paraStart, end: offset, align: p.textAlign });
    }
  }

  return { text: textParts.join(''), runs, paragraphs };
}

/** Extract plain text + style runs from a Penpot text shape. */
export function parseTextShape(shape: PenpotShape): ParsedText {
  const content = shape.content as PenpotTextContent | undefined;
  if (content && typeof content === 'object' && content.type === 'root') {
    const { text, runs, paragraphs } = flattenSpans(content);
    return { text, runs, paragraphs };
  }
  // Fallback: characters field or raw string content.
  const raw = typeof shape.content === 'string' ? shape.content : shape.characters ?? '';
  return { text: raw, runs: [], paragraphs: [] };
}

/** Penpot lineHeight is a unitless multiplier string (e.g. "1.171875"). */
export function parseLineHeight(value: unknown): { unit: 'PERCENT' | 'AUTO'; value: number } | null {
  if (value === undefined || value === null) return null;
  const num = typeof value === 'string' ? parseFloat(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(num)) return null;
  if (num <= 0) return { unit: 'AUTO', value: 0 };
  return { unit: 'PERCENT', value: num * 100 };
}

/** Penpot letterSpacing may be px or %; returns Figma LetterSpacing. */
export function parseLetterSpacing(value: unknown): { unit: 'PIXELS' | 'PERCENT'; value: number } | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.endsWith('%')) {
      const num = parseFloat(trimmed);
      return Number.isFinite(num) ? { unit: 'PERCENT', value: num } : null;
    }
    const num = parseFloat(trimmed);
    return Number.isFinite(num) ? { unit: 'PIXELS', value: num } : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { unit: 'PIXELS', value };
  }
  return null;
}

export function parseFontSize(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const num = typeof value === 'string' ? parseFloat(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(num) && num > 0 ? num : null;
}

export function parseFontWeight(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const named: Record<string, number> = {
      thin: 100,
      extralight: 200,
      ultralight: 200,
      light: 300,
      normal: 400,
      regular: 400,
      medium: 500,
      semibold: 600,
      demibold: 600,
      bold: 700,
      extrabold: 800,
      ultrabold: 800,
      black: 900,
      heavy: 900
    };
    const lower = value.toLowerCase();
    if (named[lower] !== undefined) return named[lower] ?? null;
    const num = parseInt(value, 10);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

export function normalizeFontStyle(style: unknown): 'normal' | 'italic' {
  return style === 'italic' ? 'italic' : 'normal';
}

export function normalizeTextCase(transform: unknown): 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE' {
  switch (String(transform ?? 'none')) {
    case 'uppercase':
      return 'UPPER';
    case 'lowercase':
      return 'LOWER';
    case 'capitalize':
      return 'TITLE';
    default:
      return 'ORIGINAL';
  }
}

export function normalizeTextDecoration(decoration: unknown): 'NONE' | 'UNDERLINE' | 'STRIKETHROUGH' {
  const value = String(decoration ?? 'none');
  if (value.includes('underline')) return 'UNDERLINE';
  if (value.includes('line-through') || value.includes('strikethrough')) return 'STRIKETHROUGH';
  return 'NONE';
}

export function normalizeTextAlign(align: unknown): 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED' {
  switch (String(align ?? 'left')) {
    case 'center':
      return 'CENTER';
    case 'right':
      return 'RIGHT';
    case 'justify':
      return 'JUSTIFIED';
    default:
      return 'LEFT';
  }
}
