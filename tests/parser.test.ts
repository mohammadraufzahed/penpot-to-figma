import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { parsePenpotFile, ROOT_FRAME_ID } from '../src/shared/parser';

const FILE_ID = '11111111-1111-1111-1111-111111111111';
const PAGE_ID = '22222222-2222-2222-2222-222222222222';
const RECT_ID = '33333333-3333-3333-3333-333333333333';
const TEXT_ID = '44444444-4444-4444-4444-444444444444';
const MEDIA_STORAGE_ID = '55555555-5555-5555-5555-555555555555';
const MEDIA_FILE_ID = '66666666-6666-6666-6666-666666666666';
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

async function buildFixture(): Promise<ArrayBuffer> {
  const zip = new JSZip();

  zip.file('manifest.json', JSON.stringify({
    type: 'penpot/export-files',
    version: 3,
    files: [{ id: FILE_ID, name: 'Test File' }]
  }));

  zip.file(`files/${FILE_ID}.json`, JSON.stringify({ id: FILE_ID, name: 'Test File' }));

  zip.file(`files/${FILE_ID}/pages/${PAGE_ID}.json`, JSON.stringify({
    id: PAGE_ID,
    name: 'Page 1',
    index: 0,
    background: '#ffffff'
  }));

  zip.file(`files/${FILE_ID}/pages/${PAGE_ID}/${ROOT_FRAME_ID}.json`, JSON.stringify({
    id: ROOT_FRAME_ID,
    name: 'Root',
    type: 'frame',
    x: 0,
    y: 0,
    width: 1000,
    height: 800,
    shapes: [RECT_ID, TEXT_ID]
  }));

  zip.file(`files/${FILE_ID}/pages/${PAGE_ID}/${RECT_ID}.json`, JSON.stringify({
    id: RECT_ID,
    name: 'Card',
    type: 'rect',
    x: 10,
    y: 20,
    width: 200,
    height: 100,
    r1: 8,
    fills: [{ fillColor: '#ff0000', fillOpacity: 1 }],
    strokes: [{ strokeColor: '#00ff00', strokeWidth: 2 }]
  }));

  zip.file(`files/${FILE_ID}/pages/${PAGE_ID}/${TEXT_ID}.json`, JSON.stringify({
    id: TEXT_ID,
    name: 'Title',
    type: 'text',
    x: 10,
    y: 140,
    width: 300,
    height: 40,
    content: {
      type: 'root',
      children: [
        {
          type: 'paragraph-set',
          children: [
            {
              type: 'paragraph',
              textAlign: 'left',
              children: [
                { text: 'Hello ', fontSize: '16', fontWeight: 'bold' },
                { text: 'World', fontSize: '16', fontWeight: 'regular', fontStyle: 'italic' }
              ]
            }
          ]
        }
      ]
    }
  }));

  // Tokens (W3C-style)
  zip.file(`files/${FILE_ID}/tokens.json`, JSON.stringify({
    color: {
      primary: { $value: '#3366ff', $type: 'color' },
      alias: { $value: '{color.primary}', $type: 'color' }
    }
  }));

  // Media: storage object + metadata + file media entry
  zip.file(`objects/${MEDIA_STORAGE_ID}.png`, PNG_BYTES);
  zip.file(`objects/${MEDIA_STORAGE_ID}.json`, JSON.stringify({ contentType: 'image/png' }));
  zip.file(`files/${FILE_ID}/media/${MEDIA_FILE_ID}.json`, JSON.stringify({
    id: MEDIA_FILE_ID,
    name: 'photo.png',
    mediaId: MEDIA_STORAGE_ID,
    mtype: 'image/png',
    width: 100,
    height: 100
  }));

  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('parsePenpotFile', () => {
  it('parses manifest, pages, shapes, tokens and media', async () => {
    const buffer = await buildFixture();
    const doc = await parsePenpotFile(buffer);

    expect(doc.manifest.type).toBe('penpot/export-files');
    expect(doc.files).toHaveLength(1);

    const file = doc.files[0]!;
    expect(file.meta.name).toBe('Test File');
    expect(file.pages).toHaveLength(1);
    expect(file.pages[0]!.name).toBe('Page 1');

    expect(file.pageRootIds.get(PAGE_ID)).toBe(ROOT_FRAME_ID);

    const shapes = file.shapes.get(PAGE_ID)!;
    expect(shapes.size).toBe(3);

    const rect = shapes.get(RECT_ID)!;
    expect(rect.type).toBe('rect');
    expect(rect.fills?.[0]?.fillColor).toBe('#ff0000');
    expect(rect.r1).toBe(8);

    const text = shapes.get(TEXT_ID)!;
    expect(text.type).toBe('text');

    // Media linked under both storage id and file-media id.
    expect(doc.media.has(MEDIA_STORAGE_ID)).toBe(true);
    expect(doc.media.has(MEDIA_FILE_ID)).toBe(true);
    const entry = doc.media.get(MEDIA_FILE_ID)!;
    expect(entry.contentType).toBe('image/png');
    expect(Array.from(entry.bytes)).toEqual(Array.from(PNG_BYTES));
  });

  it('rejects non-penpot files', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ type: 'something-else' }));
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });
    await expect(parsePenpotFile(buffer)).rejects.toThrow('Not a Penpot .penpot file');
  });
});
