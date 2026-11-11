import type { PenpotDocument, PenpotFileData, PenpotShape } from '../shared/penpot';
import type { ImportOptions, ImportProgress, ImportStats } from '../shared/messages';
import { WarningCollector } from '../shared/convert/warnings';
import { registerImages, type ImageResolver } from './paints';
import { createNodeForShape, type ShapeContext } from './shapes';
import { createVariables, createStyles, createComponents } from './libraries';
import { applyInteractions, type PrototypeContext } from './prototype';

export interface ImportResult {
  success: boolean;
  message?: string;
  warnings: Array<{ message: string; shapeId?: string; shapeName?: string }>;
  stats: ImportStats;
}

type ProgressFn = (progress: ImportProgress) => void;

const MAX_PAGES = 50;

export async function importDocument(
  doc: PenpotDocument,
  options: ImportOptions,
  onProgress: ProgressFn = () => undefined
): Promise<ImportResult> {
  const warnings = new WarningCollector();
  const stats: ImportStats = { pages: 0, nodes: 0, textNodes: 0, images: 0, components: 0, variables: 0, warnings: 0 };

  const progress = (phase: string, current: number, total: number, message?: string) => {
    onProgress({ phase, current, total, message });
  };

  // --- 1. Register images ---
  progress('images', 0, 1, 'Registering images…');
  const hashById = await registerImages(doc);
  const imageHashes = new Set(hashById.values());
  stats.images = imageHashes.size;

  const resolveImage: ImageResolver = (id: string) => hashById.get(id) ?? null;

  // --- 2. Per-file import ---
  const nodeIdByShapeId = new Map<string, string>();
  const pageNodeIdByPageId = new Map<string, string>();
  const nodeByShapeId = new Map<string, SceneNode>();
  const prototypeCtx: PrototypeContext = { nodeIdByShapeId, pageNodeIdByPageId, nodeByShapeId, warnings };

  const createPages = options.createPages !== false;
  const currentPage = figma.currentPage;

  let pageIndex = 0;
  for (const fileData of doc.files) {
    progress('libraries', pageIndex, doc.files.length, `Importing libraries for "${fileData.meta.name}"…`);

    // Libraries phase (variables, styles, components).
    const variables = options.skipLibraries ? new Map() : await createVariables(fileData, warnings);
    stats.variables += variables.size;

    if (!options.skipLibraries) {
      await createStyles(fileData, warnings);
    }

    // --- Pages ---
    const pages = fileData.pages.slice(0, MAX_PAGES);
    if (fileData.pages.length > MAX_PAGES) {
      warnings.add(`File "${fileData.meta.name}" has ${fileData.pages.length} pages; only the first ${MAX_PAGES} were imported`);
    }

    for (const pageMeta of pages) {
      pageIndex++;
      const pageShapes = fileData.shapes.get(pageMeta.id) ?? new Map<string, PenpotShape>();
      const rootId = fileData.pageRootIds.get(pageMeta.id);
      const rootShape = rootId ? pageShapes.get(rootId) : undefined;

      const pageName = fileData.meta.name === pageMeta.name ? pageMeta.name : `${fileData.meta.name} / ${pageMeta.name}`;
      progress('pages', pageIndex, pages.length, `Importing page "${pageMeta.name}"…`);

      let targetParent: BaseNode & ChildrenMixin = currentPage;
      let pageNode: PageNode | null = null;

      if (createPages && doc.files.length + pages.length <= MAX_PAGES * 2) {
        try {
          pageNode = figma.createPage();
          pageNode.name = sanitize(pageName);
          figma.currentPage = pageNode;
          targetParent = pageNode;
          pageNodeIdByPageId.set(pageMeta.id, pageNode.id);
        } catch {
          warnings.add(`Could not create Figma page for "${pageName}"; importing into current page`);
          targetParent = currentPage;
        }
      }

      // Import page background.
      if (pageMeta.background && pageNode) {
        const bg = parseHex(pageMeta.background);
        if (bg) pageNode.backgrounds = [{ type: 'SOLID', color: { r: bg.r, g: bg.g, b: bg.b }, opacity: bg.a }];
      }

      // Build shape context.
      const ctx: ShapeContext = {
        resolveImage,
        warnings,
        parentOpacity: 1
      };

      // Import root shape (or all top-level shapes if no root).
      const importedRoots: SceneNode[] = [];
      if (rootShape) {
        const node = await createNodeForShape(rootShape, ctx, targetParent);
        if (node) {
          importedRoots.push(node);
          stats.nodes++;
          if (node.type === 'TEXT') stats.textNodes++;
          nodeIdByShapeId.set(rootShape.id, node.id);
          nodeByShapeId.set(rootShape.id, node);
        }
      } else {
        // No explicit root: import top-level shapes (those without parentId).
        for (const shape of pageShapes.values()) {
          if (shape.parentId) continue;
          const node = await createNodeForShape(shape, ctx, targetParent);
          if (node) {
            importedRoots.push(node);
            stats.nodes++;
            if (node.type === 'TEXT') stats.textNodes++;
            nodeIdByShapeId.set(shape.id, node.id);
            nodeByShapeId.set(shape.id, node);
          }
        }
      }

      // Import children recursively for root shapes.
      for (const root of importedRoots) {
        await importChildren(root, pageShapes, ctx, stats, nodeIdByShapeId, nodeByShapeId);
      }

      // Components for this page.
      if (!options.skipLibraries) {
        progress('components', pageIndex, pages.length, `Creating components for "${pageMeta.name}"…`);
        const componentMap = await createComponents(fileData, pageShapes, async (shape, parent) => {
          const node = await createNodeForShape(shape, { ...ctx, parentOpacity: 1 }, parent);
          if (node) {
            stats.nodes++;
            if (node.type === 'TEXT') stats.textNodes++;
          }
          return node;
        }, warnings);
        stats.components += componentMap.size;
      }
    }

    // Restore original page.
    try {
      figma.currentPage = currentPage;
    } catch {
      // ignore
    }
  }

  // --- Prototype interactions ---
  if (!options.skipPrototype) {
    progress('prototype', 0, 1, 'Applying prototype interactions…');
    await applyPrototypeInteractions(doc, prototypeCtx, nodeIdByShapeId, stats);
  }

  stats.warnings = warnings.warnings.length;
  progress('done', 1, 1, 'Import complete');

  return {
    success: true,
    message: `Imported ${stats.nodes} nodes across ${stats.pages} pages with ${stats.warnings} warnings`,
    warnings: warnings.warnings,
    stats
  };
}

async function importChildren(
  parentNode: SceneNode,
  pageShapes: Map<string, PenpotShape>,
  ctx: ShapeContext,
  stats: ImportStats,
  nodeIdByShapeId: Map<string, string>,
  nodeByShapeId: Map<string, SceneNode>
): Promise<void> {
  // Find children of this node. Penpot shapes reference parent via parentId;
  // the root frame's children are in its `shapes` array.
  const parentShape = [...pageShapes.values()].find(s => nodeByShapeId.get(s.id) === parentNode);
  const childIds = parentShape?.shapes ?? [];

  for (const childId of childIds) {
    const child = pageShapes.get(childId);
    if (!child) continue;
    const node = await createNodeForShape(child, ctx, parentNode as BaseNode & ChildrenMixin);
    if (!node) continue;
    stats.nodes++;
    if (node.type === 'TEXT') stats.textNodes++;
    nodeIdByShapeId.set(child.id, node.id);
    nodeByShapeId.set(child.id, node);
    await importChildren(node, pageShapes, ctx, stats, nodeIdByShapeId, nodeByShapeId);
  }
}

async function applyPrototypeInteractions(
  doc: PenpotDocument,
  ctx: PrototypeContext,
  nodeIdByShapeId: Map<string, string>,
  stats: ImportStats
): Promise<void> {
  // Second pass: walk all shapes and apply interactions to their nodes.
  for (const fileData of doc.files) {
    for (const pageShapes of fileData.shapes.values()) {
      for (const shape of pageShapes.values()) {
        if (!shape.interactions || shape.interactions.length === 0) continue;
        const figmaNodeId = nodeIdByShapeId.get(shape.id);
        if (!figmaNodeId) continue;
        const node = await figma.getNodeByIdAsync(figmaNodeId);
        if (!node || !('reactions' in node)) continue;
        await applyInteractions(node as SceneNode, shape, ctx);
      }
    }
  }
  void stats;
}

function sanitize(name: string): string {
  return name.replace(/[{}\[\]<>:"|?*]/g, '_').trim() || 'Page';
}

function parseHex(value: string): { r: number; g: number; b: number; a: number } | null {
  const hex = value.replace('#', '');
  if (hex.length !== 6 && hex.length !== 8) return null;
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}
