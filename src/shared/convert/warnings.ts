export interface ImportWarning {
  shapeId?: string;
  shapeName?: string;
  message: string;
}

export class WarningCollector {
  readonly warnings: ImportWarning[] = [];

  add(message: string, shape?: { id?: string; name?: string }): void {
    this.warnings.push({ message, shapeId: shape?.id, shapeName: shape?.name });
  }

  get size(): number {
    return this.warnings.length;
  }
}
