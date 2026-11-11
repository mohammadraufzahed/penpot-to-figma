import { describe, it, expect } from 'vitest';
import { parseHexColor, penpotColorValue } from '../src/shared/convert/color';
import { multiply, invert, applyToPoint, translation, scale, rotation, decomposeSimilarity, parseMatrix } from '../src/shared/convert/matrix';
import { normalizePathSegments, segmentsToSvgPath, segmentsToVectorPaths } from '../src/shared/convert/path';
import { gradientTransform, applyGradientTransform, fillToPaint } from '../src/shared/convert/paint';
import { parseTextShape, parseLineHeight, parseLetterSpacing, parseFontWeight, normalizeTextCase } from '../src/shared/convert/text';
import { planVariables, flattenTokensFile } from '../src/shared/convert/tokens';

describe('color', () => {
  it('parses hex colors', () => {
    expect(parseHexColor('#ff0000')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(parseHexColor('#00ff0080')?.a).toBeCloseTo(0.5, 1);
    expect(parseHexColor('#f00')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(parseHexColor('not-a-color')).toBeNull();
  });

  it('extracts penpot color values', () => {
    expect(penpotColorValue('#abc')).toEqual({ hex: '#abc', opacity: undefined });
    expect(penpotColorValue({ color: '#abc', opacity: 0.5 })).toEqual({ hex: '#abc', opacity: 0.5 });
  });
});

describe('matrix', () => {
  it('multiplies and inverts', () => {
    const t = multiply(translation(10, 20), scale(2, 3));
    const p = applyToPoint(t, 1, 1);
    expect(p.x).toBeCloseTo(12);
    expect(p.y).toBeCloseTo(23);

    const inv = invert(t);
    expect(inv).not.toBeNull();
    const back = applyToPoint(inv!, p.x, p.y);
    expect(back.x).toBeCloseTo(1);
    expect(back.y).toBeCloseTo(1);
  });

  it('parses matrix formats', () => {
    expect(parseMatrix([1, 0, 0, 1, 5, 6])).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 5, f: 6 });
    expect(parseMatrix({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    expect(parseMatrix(undefined)).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  });

  it('decomposes similarity transforms', () => {
    const rot = multiply(rotation(90), scale(2, 2));
    const d = decomposeSimilarity(rot);
    expect(d).not.toBeNull();
    expect(d!.scaleX).toBeCloseTo(2);
    expect(d!.rotation).toBeCloseTo(90);
  });
});

describe('path', () => {
  it('normalizes segments and builds SVG path', () => {
    const segments = normalizePathSegments([
      { command: 'moveTo', params: { x: 0, y: 0 } },
      { command: 'lineTo', params: { x: 10, y: 0 } },
      { command: 'curveTo', params: { c1x: 10, c1y: 10, c2x: 0, c2y: 10, x: 0, y: 10 } },
      { command: 'closePath' }
    ]);
    expect(segments).toHaveLength(4);
    expect(segmentsToSvgPath(segments)).toBe('M 0 0 L 10 0 C 10 10 0 10 0 10 Z');
  });

  it('handles kebab-case commands', () => {
    const segments = normalizePathSegments([{ command: 'move-to', params: { x: 1, y: 2 } }]);
    expect(segments[0]!.command).toBe('moveTo');
  });

  it('builds Figma vector paths', () => {
    const paths = segmentsToVectorPaths(normalizePathSegments([{ command: 'moveTo', params: { x: 0, y: 0 } }]), 'evenodd');
    expect(paths[0]!.windingRule).toBe('EVENODD');
    expect(paths[0]!.data).toContain('M 0 0');
  });
});

describe('paint/gradient', () => {
  it('maps linear gradient endpoints into normalized space', () => {
    const { transform } = gradientTransform('linear', 0, 0, 100, 0);
    const start = applyGradientTransform(transform, 0, 0);
    const end = applyGradientTransform(transform, 100, 0);
    expect(start.x).toBeCloseTo(0);
    expect(start.y).toBeCloseTo(0.5);
    expect(end.x).toBeCloseTo(1);
    expect(end.y).toBeCloseTo(0.5);
  });

  it('maps diagonal gradients', () => {
    const { transform } = gradientTransform('linear', 0, 0, 100, 100);
    const end = applyGradientTransform(transform, 100, 100);
    expect(end.x).toBeCloseTo(1);
    expect(end.y).toBeCloseTo(0.5);
  });

  it('converts solid fills', () => {
    const paint = fillToPaint({ fillColor: '#ff0000', fillOpacity: 0.5 }, 1);
    expect(paint?.type).toBe('SOLID');
    if (paint?.type === 'SOLID') {
      expect(paint.color).toEqual({ r: 1, g: 0, b: 0 });
      expect(paint.opacity).toBeCloseTo(0.5);
    }
  });

  it('converts gradients with stops', () => {
    const paint = fillToPaint({
      fillColorGradient: {
        type: 'linear',
        startX: 0, startY: 0, endX: 100, endY: 0, width: 1,
        stops: [{ color: '#000000', offset: 0 }, { color: '#ffffff', offset: 1 }]
      }
    }, 1);
    expect(paint?.type).toBe('GRADIENT_LINEAR');
    if (paint?.type === 'GRADIENT_LINEAR') {
      expect(paint.gradientStops).toHaveLength(2);
      expect(paint.gradientStops[0]!.position).toBe(0);
      expect(paint.gradientStops[1]!.position).toBe(1);
    }
  });
});

describe('text', () => {
  it('parses text content into text and runs', () => {
    const parsed = parseTextShape({
      id: 't1',
      name: 'Text',
      type: 'text',
      content: {
        type: 'root',
        children: [
          {
            type: 'paragraph-set',
            children: [
              {
                type: 'paragraph',
                children: [
                  { text: 'Hello ', fontSize: '16' },
                  { text: 'World', fontSize: '16', fontWeight: 'bold' }
                ]
              }
            ]
          }
        ]
      }
    } as never);
    expect(parsed.text).toBe('Hello World');
    expect(parsed.runs).toHaveLength(2);
    expect(parsed.runs[0]!.span.text).toBe('Hello ');
    expect(parsed.paragraphs).toHaveLength(1);
  });

  it('parses line height and letter spacing', () => {
    expect(parseLineHeight('1.5')).toEqual({ unit: 'PERCENT', value: 150 });
    expect(parseLetterSpacing('10%')).toEqual({ unit: 'PERCENT', value: 10 });
    expect(parseLetterSpacing('2')).toEqual({ unit: 'PIXELS', value: 2 });
  });

  it('parses font weight', () => {
    expect(parseFontWeight('bold')).toBe(700);
    expect(parseFontWeight('600')).toBe(600);
    expect(parseFontWeight(400)).toBe(400);
  });

  it('normalizes text case', () => {
    expect(normalizeTextCase('uppercase')).toBe('UPPER');
    expect(normalizeTextCase('none')).toBe('ORIGINAL');
  });
});

describe('tokens', () => {
  it('flattens W3C tokens', () => {
    const flat = flattenTokensFile({
      color: { primary: { $value: '#ff0000', $type: 'color' } },
      spacing: { sm: { $value: 4 } }
    });
    expect(flat).toHaveLength(2);
    expect(flat[0]!.path).toBe('color.primary');
  });

  it('resolves aliases and plans variables', () => {
    const { variables } = planVariables({
      color: {
        primary: { $value: '#3366ff', $type: 'color' },
        alias: { $value: '{color.primary}', $type: 'color' }
      },
      size: { base: { $value: 16, $type: 'dimension' } }
    });
    expect(variables).toHaveLength(3);
    const colorVar = variables.find(v => v.path === 'color.primary');
    expect(colorVar?.type).toBe('COLOR');
    const aliasVar = variables.find(v => v.path === 'color.alias');
    expect(aliasVar?.type).toBe('COLOR');
    const sizeVar = variables.find(v => v.path === 'size.base');
    expect(sizeVar?.type).toBe('FLOAT');
    expect(sizeVar?.value).toBe(16);
  });
});
