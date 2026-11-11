import type { PenpotPathSegment } from '../penpot';

export type PathCommand = 'moveTo' | 'lineTo' | 'curveTo' | 'close';

export interface NormalizedSegment {
  command: PathCommand;
  x?: number;
  y?: number;
  c1x?: number;
  c1y?: number;
  c2x?: number;
  c2y?: number;
}

function normalizeCommand(command: string): PathCommand | null {
  switch (command) {
    case 'moveTo':
    case 'move-to':
      return 'moveTo';
    case 'lineTo':
    case 'line-to':
      return 'lineTo';
    case 'curveTo':
    case 'curve-to':
      return 'curveTo';
    case 'closePath':
    case 'close-path':
      return 'close';
    default:
      return null;
  }
}

/** Normalize Penpot path content (segments array) into a flat segment list. */
export function normalizePathSegments(content: unknown): NormalizedSegment[] {
  if (!Array.isArray(content)) return [];
  const result: NormalizedSegment[] = [];
  for (const raw of content) {
    if (!raw || typeof raw !== 'object') continue;
    const seg = raw as { command?: string; params?: Record<string, unknown> };
    const command = normalizeCommand(String(seg.command ?? ''));
    if (!command) continue;
    const p = seg.params ?? {};
    const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
    result.push({
      command,
      x: num(p.x),
      y: num(p.y),
      c1x: num(p.c1x),
      c1y: num(p.c1y),
      c2x: num(p.c2x),
      c2y: num(p.c2y)
    });
  }
  return result;
}

/** Convert normalized segments to an SVG path `d` string. */
export function segmentsToSvgPath(segments: NormalizedSegment[]): string {
  const parts: string[] = [];
  for (const seg of segments) {
    switch (seg.command) {
      case 'moveTo':
        parts.push(`M ${seg.x ?? 0} ${seg.y ?? 0}`);
        break;
      case 'lineTo':
        parts.push(`L ${seg.x ?? 0} ${seg.y ?? 0}`);
        break;
      case 'curveTo':
        parts.push(
          `C ${seg.c1x ?? 0} ${seg.c1y ?? 0} ${seg.c2x ?? 0} ${seg.c2y ?? 0} ${seg.x ?? 0} ${seg.y ?? 0}`
        );
        break;
      case 'close':
        parts.push('Z');
        break;
    }
  }
  return parts.join(' ');
}

/**
 * Figma VectorPath data is an SVG path string subset (M/L/C/Q/Z),
 * see https://developers.figma.com/docs/plugins/api/VectorPath
 */
export function segmentsToVectorPaths(
  segments: NormalizedSegment[],
  fillRule: 'evenodd' | 'nonzero' = 'nonzero'
): Array<{ windingRule: 'NONZERO' | 'EVENODD'; data: string }> {
  if (segments.length === 0) return [];
  return [
    {
      windingRule: fillRule === 'evenodd' ? 'EVENODD' : 'NONZERO',
      data: segmentsToSvgPath(segments)
    }
  ];
}
