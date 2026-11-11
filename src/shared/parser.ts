import JSZip from 'jszip';
import type {
  PenpotColorAsset,
  PenpotComponentAsset,
  PenpotDocument,
  PenpotFileData,
  PenpotFileMedia,
  PenpotFileMeta,
  PenpotManifest,
  PenpotMediaEntry,
  PenpotPageMeta,
  PenpotShape,
  PenpotTokensFile,
  PenpotTypographyAsset,
  Uuid
} from './penpot';

export const ROOT_FRAME_ID = '00000000-0000-0000-0000-000000000000';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);

function isImageExtension(ext: string): boolean {
  return IMAGE_EXTENSIONS.has(ext.toLowerCase());
}

function contentTypeFromExtension(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

async function readJson<T>(zip: JSZip, path: string): Promise<T | null> {
  const file = zip.file(path);
  if (!file) return null;
  const text = await file.async('string');
  return JSON.parse(text) as T;
}

async function readBytes(zip: JSZip, path: string): Promise<Uint8Array | null> {
  const file = zip.file(path);
  if (!file) return null;
  return file.async('uint8array');
}

/**
 * Parse a `.penpot` (v3 ZIP) file into a PenpotDocument.
 * Works in the browser (UI iframe) and in Node (tests).
 */
export async function parsePenpotFile(data: ArrayBuffer | Uint8Array | Blob): Promise<PenpotDocument> {
  const zip = await JSZip.loadAsync(data);

  const manifest = await readJson<PenpotManifest>(zip, 'manifest.json');
  if (!manifest || manifest.type !== 'penpot/export-files') {
    throw new Error('Not a Penpot .penpot file (missing or invalid manifest.json)');
  }

  const media = new Map<string, PenpotMediaEntry>();

  // --- objects/ : binary storage objects + metadata ---
  const objectMeta = new Map<string, { contentType?: string }>();
  for (const [path] of Object.entries(zip.files)) {
    const match = /^objects\/([^/]+)\.json$/.exec(path);
    if (match) {
      const meta = await readJson<{ contentType?: string; 'content-type'?: string }>(zip, path);
      if (meta) {
        objectMeta.set(match[1] as string, {
          contentType: meta.contentType ?? meta['content-type']
        });
      }
    }
  }

  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    const match = /^objects\/([^/]+)\.([A-Za-z0-9]+)$/.exec(path);
    if (!match || match[2]?.toLowerCase() === 'json') continue;
    const uuid = match[1] as string;
    const ext = (match[2] as string).toLowerCase();
    if (!isImageExtension(ext)) continue;
    const bytes = await readBytes(zip, path);
    if (!bytes) continue;
    const meta = objectMeta.get(uuid);
    const contentType = meta?.contentType ?? contentTypeFromExtension(ext);
    const entry: PenpotMediaEntry = {
      ids: [uuid],
      bytes,
      contentType,
      name: uuid
    };
    media.set(uuid, entry);
  }

  const files: PenpotFileData[] = [];

  for (const manifestFile of manifest.files ?? []) {
    const fileId = manifestFile.id;
    const base = `files/${fileId}`;
    const meta = (await readJson<PenpotFileMeta>(zip, `${base}.json`)) ?? {
      id: fileId,
      name: manifestFile.name
    };

    // --- pages & shapes ---
    const pages: PenpotPageMeta[] = [];
    const shapes = new Map<Uuid, Map<Uuid, PenpotShape>>();
    const pageRootIds = new Map<Uuid, Uuid>();

    const pagePaths: string[] = [];
    for (const path of Object.keys(zip.files)) {
      const m = new RegExp(`^${base}/pages/([^/]+)\\.json$`).exec(path);
      if (m) pagePaths.push(m[1] as string);
    }

    for (const pageId of pagePaths) {
      const pageMeta = await readJson<PenpotPageMeta>(zip, `${base}/pages/${pageId}.json`);
      if (pageMeta) pages.push(pageMeta);

      const shapeMap = new Map<Uuid, PenpotShape>();
      const shapePrefix = `${base}/pages/${pageId}/`;
      for (const path of Object.keys(zip.files)) {
        if (!path.startsWith(shapePrefix)) continue;
        const rest = path.slice(shapePrefix.length);
        if (rest.includes('/')) continue; // skip thumbnails etc.
        if (!rest.endsWith('.json')) continue;
        const shape = await readJson<PenpotShape>(zip, path);
        if (shape && shape.id) {
          shapeMap.set(shape.id, shape);
        }
      }
      shapes.set(pageId, shapeMap);
      if (shapeMap.has(ROOT_FRAME_ID)) {
        pageRootIds.set(pageId, ROOT_FRAME_ID);
      } else {
        // Fall back to the first frame-type shape as root.
        for (const [id, shape] of shapeMap) {
          if (shape.type === 'frame') {
            pageRootIds.set(pageId, id);
            break;
          }
        }
      }
    }

    pages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

    // --- libraries ---
    const components = new Map<Uuid, PenpotComponentAsset>();
    for (const path of Object.keys(zip.files)) {
      const m = new RegExp(`^${base}/components/([^/]+)\\.json$`).exec(path);
      if (m) {
        const component = await readJson<PenpotComponentAsset>(zip, path);
        if (component?.id) components.set(component.id, component);
      }
    }

    const colors = new Map<Uuid, PenpotColorAsset>();
    for (const path of Object.keys(zip.files)) {
      const m = new RegExp(`^${base}/colors/([^/]+)\\.json$`).exec(path);
      if (m) {
        const color = await readJson<PenpotColorAsset>(zip, path);
        if (color?.id) colors.set(color.id, color);
      }
    }

    const typographies = new Map<Uuid, PenpotTypographyAsset>();
    for (const path of Object.keys(zip.files)) {
      const m = new RegExp(`^${base}/typographies/([^/]+)\\.json$`).exec(path);
      if (m) {
        const typography = await readJson<PenpotTypographyAsset>(zip, path);
        if (typography?.id) typographies.set(typography.id, typography);
      }
    }

    const tokens = await readJson<PenpotTokensFile>(zip, `${base}/tokens.json`);

    // --- file media ---
    const fileMedia = new Map<string, PenpotFileMedia>();
    for (const path of Object.keys(zip.files)) {
      const m = new RegExp(`^${base}/media/([^/]+)\\.json$`).exec(path);
      if (m) {
        const mediaRef = await readJson<PenpotFileMedia>(zip, path);
        if (mediaRef?.id) fileMedia.set(mediaRef.id, mediaRef);
      }
    }

    // Link file-media entries to storage objects and index bytes under both ids.
    for (const fileMediaEntry of fileMedia.values()) {
      const storageId = fileMediaEntry.mediaId;
      const storageEntry = storageId ? media.get(storageId) : undefined;
      if (storageEntry) {
        // Index the bytes under the file-media id too, so fillImage.id resolves
        // regardless of which id Penpot stored in the fill.
        media.set(fileMediaEntry.id, {
          ...storageEntry,
          ids: [...storageEntry.ids, fileMediaEntry.id],
          name: fileMediaEntry.name ?? storageEntry.name
        });
        fileMediaEntry.type = String(fileMediaEntry.mtype ?? storageEntry.contentType);
      }
    }

    files.push({
      meta,
      pages,
      shapes,
      pageRootIds,
      components,
      colors,
      typographies,
      tokens: tokens ?? undefined,
      media: fileMedia
    });
  }

  return { manifest, files, media };
}
