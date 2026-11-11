import type { SandboxToUIMessage, UIToSandboxMessage } from '../shared/messages';
import { importDocument } from './importer';

figma.showUI(__html__, { width: 420, height: 560, themeColors: true });

function post(message: SandboxToUIMessage): void {
  figma.ui.postMessage(message);
}

figma.ui.onmessage = async (msg: UIToSandboxMessage) => {
  if (msg.type === 'cancel') {
    post({ type: 'result', success: false, message: 'Import cancelled', warnings: [], stats: { pages: 0, nodes: 0, textNodes: 0, images: 0, components: 0, variables: 0, warnings: 0 } });
    return;
  }

  if (msg.type !== 'import') return;

  try {
    const result = await importDocument(msg.document, msg.options ?? {}, progress => {
      post({ type: 'progress', progress });
    });
    post({
      type: 'result',
      success: result.success,
      message: result.message,
      warnings: result.warnings,
      stats: result.stats
    });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
