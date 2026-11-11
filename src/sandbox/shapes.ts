import type { PenpotShape } from '../shared/penpot';
import { normalizePathSegments, segmentsToVectorPaths, segmentsToSvgPath } from '../shared/convert/path';
import { shapeGeometry } from '../shared/convert/transform';
import type { WarningCollector } from '../shared/convert/warnings';
import type { ImageResolver } from './paints';
import { applyBlendMode, applyEffects, applyFills, applyOpacity, applyStrokes } from './paints';

export interface ShapeContext {
  resolveImage: ImageResolver;
  warnings: WarningCollector;
  parentOpacity: number;
}

function svgEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function colorToCss(color: string | undefined, opacity: number): string {
  if (!color) return `rgba(0,0,0,${opacity})`;
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

/** Build a minimal SVG string for path/bool shapes (used for boolean ops & fallback). */
export function shapeToSvg(shape: PenpotShape): string | null {
  const segments = normalizePathSegments(shape.content);
  if (segments.length === 0) return null;
  const d = segmentsToSvgPath(segments);
  const fill = shape.fills?.find(f => f.fillColor)?.fillColor;
  const fillOpacity = shape.fills?.[0]?.fillOpacity ?? 1;
  const stroke = shape.strokes?.[0]?.strokeColor;
  const strokeWidth = shape.strokes?.[0]?.strokeWidth ?? 0;
  const width = shape.width ?? 100;
  const height = shape.height ?? 100;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<path d="${svgEscape(d)}" fill="${colorToCss(fill, fillOpacity)}" fill-rule="${shape.svgAttrs?.fillRule ?? 'nonzero'}"` +
    (stroke && strokeWidth > 0 ? ` stroke="${colorToCss(stroke, shape.strokes?.[0]?.strokeOpacity ?? 1)}" stroke-width="${strokeWidth}"` : '') +
    ` /></svg>`
  );
}

/** Create a VectorNode from Penpot path content segments. */
export function createVectorFromShape(shape: PenpotShape): VectorNode | null {
  const segments = normalizePathSegments(shape.content);
  if (segments.length === 0) return null;
  const hasFill = (shape.fills?.length ?? 0) > 0;
  const vectorPaths = segmentsToVectorPaths(segments, shape.svgAttrs?.fillRule === 'evenodd' ? 'evenodd' : 'nonzero');
  if (!hasFill) {
    // Open path: no fill.
    vectorPaths.forEach(p => {
      (p as { windingRule: 'NONZERO' | 'EVENODD' | 'NONE' }).windingRule = 'NONE';
    });
  }
  const node = figma.createVector();
  node.vectorPaths = vectorPaths as VectorPath[];
  return node;
}

/** Create an ellipse node approximating a Penpot circle. */
export function createCircleNode(shape: PenpotShape): EllipseNode {
  return figma.createEllipse();
}

/** Create a rectangle node with per-corner radii. */
export function createRectNode(shape: PenpotShape): RectangleNode {
  const rect = figma.createRectangle();
  const r1 = shape.r1 ?? 0;
  const r2 = shape.r2 ?? r1;
  const r3 = shape.r3 ?? r1;
  const r4 = shape.r4 ?? r2;
  // Penpot corner order: top-left, top-right, bottom-right, bottom-left.
  rect.topLeftRadius = r1;
  rect.topRightRadius = r2;
  rect.bottomRightRadius = r3;
  rect.bottomLeftRadius = r4;
  return rect;
}

export function applyGeometry(node: SceneNode, shape: PenpotShape): void {
  const geo = shapeGeometry(shape);
  if (node.type !== 'FRAME' && node.type !== 'GROUP' && node.type !== 'INSTANCE') {
    // Position handled by parent via x/y on the node itself for absolute children.
  }
  if ('x' in node) {
    (node as LayoutMixin).x = geo.x;
    (node as LayoutMixin).y = geo.y;
  }
  const resizable = node as unknown as { resize?: (w: number, h: number) => void };
  if (typeof resizable.resize === 'function' && node.type !== 'TEXT') {
    try {
      resizable.resize(Math.max(0, geo.width), Math.max(0, geo.height));
    } catch {
      // Some node types manage size differently; ignore.
    }
  }
  if (geo.rotation !== undefined && 'rotation' in node) {
    (node as LayoutMixin).rotation = geo.rotation;
  }
  if (geo.relativeTransform && 'relativeTransform' in node) {
    try {
      (node as SceneNode).relativeTransform = geo.relativeTransform as unknown as Transform;
    } catch {
      // Ignore unsupported transforms.
    }
  }
  if ('constraints' in node) {
    const horizontal = shape.constraintsH === 'leftright' || shape.constraintsH === 'scale' ? 'SCALE' : shape.constraintsH === 'center' ? 'CENTER' : shape.constraintsH === 'right' ? 'MAX' : 'MIN';
    const vertical = shape.constraintsV === 'topbottom' || shape.constraintsV === 'scale' ? 'SCALE' : shape.constraintsV === 'center' ? 'CENTER' : shape.constraintsV === 'bottom' ? 'MAX' : 'MIN';
    (node as ConstraintMixin).constraints = { horizontal, vertical } as Constraints;
  }
}

/** Main entry: create a Figma node for a Penpot shape. */
export async function createNodeForShape(shape: PenpotShape, ctx: ShapeContext, parent: BaseNode & ChildrenMixin): Promise<SceneNode | null> {
  if (shape.hidden) return null;
  const opacity = ctx.parentOpacity;

  let node: SceneNode | null = null;

  switch (shape.type) {
    case 'frame': {
      const frame = figma.createFrame();
      frame.name = shape.name ?? 'Frame';
      applyLayout(frame, shape);
      node = frame;
      break;
    }
    case 'group': {
      // Figma has no empty-group creation; use a fill-less frame as container.
      const group = figma.createFrame();
      group.name = shape.name ?? 'Group';
      group.fills = [];
      group.clipsContent = false;
      node = group;
      break;
    }
    case 'rect': {
      node = createRectNode(shape);
      node.name = shape.name ?? 'Rectangle';
      break;
    }
    case 'circle': {
      node = createCircleNode(shape);
      node.name = shape.name ?? 'Ellipse';
      break;
    }
    case 'path': {
      const vector = createVectorFromShape(shape);
      if (vector) {
        vector.name = shape.name ?? 'Path';
        node = vector;
      } else {
        ctx.warnings.add(`Path shape "${shape.name ?? shape.id}" has no usable path data`, shape);
        node = figma.createFrame();
        node.name = `${shape.name ?? 'Path'} (empty)`;
      }
      break;
    }
    case 'bool': {
      const svg = shapeToSvg(shape);
      if (svg) {
        try {
          const svgNode = figma.createNodeFromSvg(svg);
          svgNode.name = shape.name ?? 'Boolean';
          node = svgNode;
          ctx.warnings.add(`Boolean shape "${shape.name ?? shape.id}" imported via SVG approximation`, shape);
        } catch {
          ctx.warnings.add(`Boolean shape "${shape.name ?? shape.id}" could not be imported`, shape);
          node = figma.createFrame();
          node.name = `${shape.name ?? 'Boolean'} (unsupported)`;
        }
      } else {
        ctx.warnings.add(`Boolean shape "${shape.name ?? shape.id}" has no path data`, shape);
        node = figma.createFrame();
        node.name = `${shape.name ?? 'Boolean'} (empty)`;
      }
      break;
    }
    case 'svg-raw': {
      const raw = typeof shape.content === 'string' ? shape.content : (shape.content as Record<string, unknown>)?.svg;
      const svgString = typeof raw === 'string' ? raw : null;
      if (svgString) {
        try {
          const svgNode = figma.createNodeFromSvg(svgString);
          svgNode.name = shape.name ?? 'SVG';
          node = svgNode;
        } catch {
          ctx.warnings.add(`SVG shape "${shape.name ?? shape.id}" could not be parsed`, shape);
          node = figma.createFrame();
          node.name = `${shape.name ?? 'SVG'} (unsupported)`;
        }
      } else {
        ctx.warnings.add(`SVG shape "${shape.name ?? shape.id}" has no SVG content`, shape);
        node = figma.createFrame();
        node.name = `${shape.name ?? 'SVG'} (empty)`;
      }
      break;
    }
    case 'image': {
      const imageRef = shape.fills?.find(f => f.fillImage)?.fillImage;
      const hash = imageRef ? ctx.resolveImage(imageRef.id) : null;
      if (hash) {
        const rect = figma.createRectangle();
        rect.name = shape.name ?? 'Image';
        const imagePaint: ImagePaint = { type: 'IMAGE', imageHash: hash, scaleMode: 'FILL' };
        rect.fills = [imagePaint];
        node = rect;
      } else {
        ctx.warnings.add(`Image shape "${shape.name ?? shape.id}" has no resolvable image`, shape);
        node = figma.createFrame();
        node.name = `${shape.name ?? 'Image'} (missing)`;
      }
      break;
    }
    case 'text': {
      const { createTextNode } = await import('./text');
      node = await createTextNode(shape, ctx);
      break;
    }
    case 'instance': {
      // Instances handled by the importer via component map; fallback frame.
      const frame = figma.createFrame();
      frame.name = shape.name ?? 'Instance';
      node = frame;
      ctx.warnings.add(`Instance shape "${shape.name ?? shape.id}" imported as plain frame (component linking unavailable)`, shape);
      break;
    }
    case 'component': {
      // Component main instances are handled by libraries phase.
      const frame = figma.createFrame();
      frame.name = shape.name ?? 'Component';
      node = frame;
      break;
    }
    default: {
      const frame = figma.createFrame();
      frame.name = shape.name ?? 'Unknown';
      node = frame;
      ctx.warnings.add(`Unsupported shape type "${shape.type}" for "${shape.name ?? shape.id}"`, shape);
      break;
    }
  }

  if (!node) return null;

  applyGeometry(node, shape);
  if ('fills' in node) {
    applyFills(node as SceneNode & { fills: Paint[] }, shape.fills, opacity, ctx.resolveImage, ctx.warnings, shape);
  }
  if ('strokes' in node) {
    applyStrokes(node as SceneNode & { strokes: Paint[] }, shape.strokes, opacity, ctx.resolveImage, ctx.warnings, shape);
  }
  applyEffects(node, shape.shadow, shape.blur as PenpotShape['blur'], ctx.warnings, shape);
  applyOpacity(node, shape, opacity);
  applyBlendMode(node, shape.blendMode, opacity);

  if (parent && 'appendChild' in parent) {
    try {
      (parent as ChildrenMixin).appendChild(node);
    } catch (err) {
      ctx.warnings.add(`Failed to append "${shape.name ?? shape.id}": ${String(err)}`, shape);
    }
  }

  return node;
}

function applyLayout(frame: FrameNode, shape: PenpotShape): void {
  if (shape.layout !== 'flex') return;
  const dir = shape.layoutFlexDir;
  frame.layoutMode = dir === 'row' ? 'HORIZONTAL' : 'VERTICAL';
  const padding = shape.layoutPadding;
  if (padding) {
    frame.paddingTop = padding.p1 ?? 0;
    frame.paddingRight = padding.p2 ?? 0;
    frame.paddingBottom = padding.p3 ?? 0;
    frame.paddingLeft = padding.p4 ?? 0;
  }
  const gap = shape.layoutGap;
  if (gap) {
    frame.itemSpacing = gap.rowGap ?? gap.columnGap ?? 0;
  }
  const justifyMap: Record<string, 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN'> = {
    start: 'MIN',
    center: 'CENTER',
    end: 'MAX',
    'space-between': 'SPACE_BETWEEN',
    space_between: 'SPACE_BETWEEN'
  };
  const alignMap: Record<string, 'MIN' | 'CENTER' | 'MAX'> = {
    start: 'MIN',
    center: 'CENTER',
    end: 'MAX'
  };
  const justify = justifyMap[String(shape.layoutJustifyContent ?? '').toLowerCase()];
  if (justify) frame.primaryAxisAlignItems = justify;
  const align = alignMap[String(shape.layoutAlignItems ?? '').toLowerCase()];
  if (align) frame.counterAxisAlignItems = align;
  frame.fills = [];
}
