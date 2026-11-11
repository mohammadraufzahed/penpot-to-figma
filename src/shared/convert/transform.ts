import type { PenpotShape } from '../penpot';
import { decomposeSimilarity, isIdentity, multiply, parseMatrix, translation, type Mat3 } from './matrix';

export interface FigmaGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  relativeTransform?: Mat3;
  flipX?: boolean;
  flipY?: boolean;
}

/**
 * Resolve a Penpot shape's geometry into Figma node properties.
 *
 * Penpot stores x/y/width/height in parent space plus an optional transform
 * matrix (rotation/flip/scale). We prefer the simple path (x/y + rotation)
 * and fall back to a raw relativeTransform for non-similarity matrices.
 */
export function shapeGeometry(shape: PenpotShape): FigmaGeometry {
  const x = shape.x ?? shape.selrect?.x ?? 0;
  const y = shape.y ?? shape.selrect?.y ?? 0;
  const width = shape.width ?? shape.selrect?.width ?? 0;
  const height = shape.height ?? shape.selrect?.height ?? 0;

  const matrix = parseMatrix(shape.transform);
  if (isIdentity(matrix)) {
    return { x, y, width, height, rotation: shape.rotation };
  }

  // If the matrix is a similarity transform, decompose to rotation/flip.
  const decomposed = decomposeSimilarity(matrix);
  if (decomposed) {
    return {
      x,
      y,
      width,
      height,
      rotation: shape.rotation ?? decomposed.rotation,
      flipX: decomposed.flipX,
      flipY: decomposed.flipY
    };
  }

  // Non-similarity: use the raw matrix as relativeTransform (translation
  // folded in). Figma's relativeTransform includes position, so compose
  // T(x, y) ∘ matrix.
  const relativeTransform = multiply(translation(x, y), matrix);
  return { x, y, width, height, relativeTransform };
}

export function blendModeToFigma(mode: string | undefined): string {
  if (!mode) return 'NORMAL';
  const normalized = mode.replace(/-/g, '_').toUpperCase();
  const allowed = new Set([
    'NORMAL',
    'DARKEN',
    'MULTIPLY',
    'COLOR_BURN',
    'LIGHTEN',
    'SCREEN',
    'COLOR_DODGE',
    'OVERLAY',
    'SOFT_LIGHT',
    'HARD_LIGHT',
    'DIFFERENCE',
    'EXCLUSION',
    'HUE',
    'SATURATION',
    'COLOR',
    'LUMINOSITY',
    'PASS_THROUGH'
  ]);
  return allowed.has(normalized) ? normalized : 'NORMAL';
}

export function constraintsToFigma(horizontal: string | undefined, vertical: string | undefined) {
  const hMap: Record<string, 'MIN' | 'CENTER' | 'MAX' | 'STRETCH' | 'SCALE'> = {
    left: 'MIN',
    center: 'CENTER',
    right: 'MAX',
    leftright: 'STRETCH',
    scale: 'SCALE'
  };
  const vMap: Record<string, 'MIN' | 'CENTER' | 'MAX' | 'STRETCH' | 'SCALE'> = {
    top: 'MIN',
    center: 'CENTER',
    bottom: 'MAX',
    topbottom: 'STRETCH',
    scale: 'SCALE'
  };
  return {
    horizontal: hMap[horizontal ?? ''] ?? 'MIN',
    vertical: vMap[vertical ?? ''] ?? 'MIN'
  } as { horizontal: 'MIN' | 'CENTER' | 'MAX' | 'STRETCH' | 'SCALE'; vertical: 'MIN' | 'CENTER' | 'MAX' | 'STRETCH' | 'SCALE' };
}
