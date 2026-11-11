import { parsePenpotFile } from '../shared/parser';
import type { PenpotDocument, PenpotMediaEntry } from '../shared/penpot';
import type { ImportOptions, SandboxToUIMessage } from '../shared/messages';

const dropzone = document.getElementById('dropzone') as HTMLDivElement;
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const importBtn = document.getElementById('importBtn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const warningsEl = document.getElementById('warnings') as HTMLDivElement;
const progressBar = document.getElementById('progressBar') as HTMLDivElement;
const optPages = document.getElementById('optPages') as HTMLInputElement;
const optLibraries = document.getElementById('optLibraries') as HTMLInputElement;
const optPrototype = document.getElementById('optPrototype') as HTMLInputElement;

let parsedDoc: PenpotDocument | null = null;

function setStatus(msg: string): void {
  statusEl.textContent = msg;
}

function setProgress(pct: number): void {
  progressBar.style.width = `${Math.round(pct * 100)}%`;
}

function showWarnings(warnings: Array<{ message: string; shapeId?: string; shapeName?: string }>): void {
  warningsEl.innerHTML = '';
  if (warnings.length === 0) return;
  const header = document.createElement('div');
  header.textContent = `Warnings (${warnings.length}):`;
  header.style.fontWeight = 'bold';
  warningsEl.appendChild(header);
  for (const w of warnings.slice(0, 100)) {
    const div = document.createElement('div');
    div.className = 'warning';
    div.textContent = `${w.shapeName ? `[${w.shapeName}] ` : ''}${w.message}`;
    warningsEl.appendChild(div);
  }
  if (warnings.length > 100) {
    const more = document.createElement('div');
    more.textContent = `…and ${warnings.length - 100} more`;
    warningsEl.appendChild(more);
  }
}

dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) void handleFile(file);
});

dropzone.addEventListener('dragover', e => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  const file = e.dataTransfer?.files?.[0];
  if (file) void handleFile(file);
});

importBtn.addEventListener('click', () => {
  if (!parsedDoc) return;
  const options: ImportOptions = {
    createPages: optPages.checked,
    skipLibraries: !optLibraries.checked,
    skipPrototype: !optPrototype.checked
  };
  importBtn.disabled = true;
  setStatus('Importing…');
  setProgress(0);
  parent.postMessage({ pluginMessage: { type: 'import', document: parsedDoc, options } }, '*');
});

window.onmessage = (event: MessageEvent) => {
  const msg = event.data?.pluginMessage as SandboxToUIMessage | undefined;
  if (!msg) return;

  if (msg.type === 'progress') {
    const { current, total, message } = msg.progress;
    setProgress(total > 0 ? current / total : 0);
    setStatus(message ?? `${msg.progress.phase} ${current}/${total}`);
  } else if (msg.type === 'result') {
    importBtn.disabled = false;
    setProgress(1);
    setStatus(msg.message ?? (msg.success ? 'Import complete' : 'Import failed'));
    showWarnings(msg.warnings ?? []);
  } else if (msg.type === 'error') {
    importBtn.disabled = false;
    setStatus(`Error: ${msg.message}`);
  }
};

async function handleFile(file: File): Promise<void> {
  setStatus('Parsing .penpot file…');
  setProgress(0.1);
  try {
    const buffer = await file.arrayBuffer();
    const doc = await parsePenpotFile(buffer);
    await convertWebpImages(doc);
    parsedDoc = doc;
    importBtn.disabled = false;
    const fileCount = doc.files.length;
    const pageCount = doc.files.reduce((sum, f) => sum + f.pages.length, 0);
    const mediaCount = doc.media.size;
    setStatus(`Ready: ${fileCount} file(s), ${pageCount} page(s), ${mediaCount} media item(s)`);
    setProgress(0);
  } catch (err) {
    setStatus(`Failed to parse: ${err instanceof Error ? err.message : String(err)}`);
    parsedDoc = null;
    importBtn.disabled = true;
  }
}

/** Figma createImage doesn't support WebP; convert to PNG via canvas in the UI iframe. */
async function convertWebpImages(doc: PenpotDocument): Promise<void> {
  for (const entry of doc.media.values()) {
    if (entry.contentType !== 'image/webp') continue;
    try {
      const blob = new Blob([entry.bytes as unknown as BlobPart], { type: 'image/webp' });
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.drawImage(bitmap, 0, 0);
      const pngBlob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!pngBlob) continue;
      const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
      entry.bytes = pngBytes;
      entry.contentType = 'image/png';
    } catch {
      // Leave as-is; sandbox will skip with warning.
    }
  }
}
