/** Minimal 2D affine matrix helpers (Penpot/Figma transform math). */

export interface Mat3 {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY: Mat3 = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function multiply(m1: Mat3, m2: Mat3): Mat3 {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f
  };
}

export function invert(m: Mat3): Mat3 | null {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  return {
    a: m.d * inv,
    b: -m.b * inv,
    c: -m.c * inv,
    d: m.a * inv,
    e: (m.c * m.f - m.d * m.e) * inv,
    f: (m.b * m.e - m.a * m.f) * inv
  };
}

export function applyToPoint(m: Mat3, x: number, y: number): { x: number; y: number } {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

export function translation(tx: number, ty: number): Mat3 {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

export function scale(sx: number, sy: number): Mat3 {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}

export function rotation(deg: number): Mat3 {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

export function isIdentity(m: Mat3, epsilon = 1e-6): boolean {
  return (
    Math.abs(m.a - 1) < epsilon &&
    Math.abs(m.b) < epsilon &&
    Math.abs(m.c) < epsilon &&
    Math.abs(m.d - 1) < epsilon &&
    Math.abs(m.e) < epsilon &&
    Math.abs(m.f) < epsilon
  );
}

/** Parse a Penpot transform (object {a..f} or array [a,b,c,d,e,f]). */
export function parseMatrix(input: unknown): Mat3 {
  if (Array.isArray(input) && input.length >= 6) {
    const [a, b, c, d, e, f] = input as number[];
    return { a, b, c, d, e, f };
  }
  if (input && typeof input === 'object') {
    const o = input as Record<string, unknown>;
    const a = Number(o.a ?? 1);
    const b = Number(o.b ?? 0);
    const c = Number(o.c ?? 0);
    const d = Number(o.d ?? 1);
    const e = Number(o.e ?? 0);
    const f = Number(o.f ?? 0);
    if ([a, b, c, d, e, f].every(Number.isFinite)) return { a, b, c, d, e, f };
  }
  return IDENTITY;
}

/**
 * Decompose a similarity transform (rotation + uniform scale + optional flip)
 * into Figma-friendly rotation/flip values. Returns null when the matrix is
 * not a similarity transform (shear/perspective), in which case the caller
 * should use the raw matrix.
 */
export function decomposeSimilarity(m: Mat3): { rotation: number; flipX: boolean; flipY: boolean; scaleX: number; scaleY: number } | null {
  const { a, b, c, d } = m;
  // Columns are the images of the basis vectors.
  const scaleX = Math.hypot(a, b);
  const scaleY = Math.hypot(c, d);
  if (scaleX < 1e-9 || scaleY < 1e-9) return null;
  // Check orthogonality: dot product of columns ~ 0.
  const dot = (a * c + b * d) / (scaleX * scaleY);
  if (Math.abs(dot) > 1e-3) return null;
  const rotation = (Math.atan2(b, a) * 180) / Math.PI;
  const flipX = a * d - b * c < 0 && Math.abs(scaleX - scaleY) < 1e-6 ? true : false;
  // Simpler: determinant sign tells us about flips.
  const det = a * d - b * c;
  return {
    rotation,
    flipX: det < 0,
    flipY: false,
    scaleX,
    scaleY
  };
}
