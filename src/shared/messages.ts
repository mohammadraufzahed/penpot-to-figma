import type { PenpotDocument } from './penpot';

export type UIToSandboxMessage =
  | { type: 'import'; document: PenpotDocument; options?: ImportOptions }
  | { type: 'cancel' };

export interface ImportOptions {
  /** Import each Penpot page as a Figma page (default true). */
  createPages?: boolean;
  /** Skip prototype interactions. */
  skipPrototype?: boolean;
  /** Skip variables/components libraries. */
  skipLibraries?: boolean;
}

export interface ImportProgress {
  phase: string;
  current: number;
  total: number;
  message?: string;
}

export type SandboxToUIMessage =
  | { type: 'progress'; progress: ImportProgress }
  | { type: 'result'; success: boolean; message?: string; warnings?: Array<{ message: string; shapeId?: string; shapeName?: string }>; stats?: ImportStats }
  | { type: 'error'; message: string };

export interface ImportStats {
  pages: number;
  nodes: number;
  textNodes: number;
  images: number;
  components: number;
  variables: number;
  warnings: number;
}
