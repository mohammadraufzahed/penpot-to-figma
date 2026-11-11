import type { PenpotFileData, PenpotShape } from '../shared/penpot';
import { planVariables, type VariablePlan } from '../shared/convert/tokens';
import { parseHexColor } from '../shared/convert/color';
import type { WarningCollector } from '../shared/convert/warnings';

export interface LibraryResult {
  variables: Map<string, Variable>; // token path -> variable
  componentNodes: Map<string, ComponentNode>; // penpot component id -> component
  styles: { color: Map<string, PaintStyle>; text: Map<string, TextStyle> };
}

function sanitizeName(name: string): string {
  return name.replace(/[{}\[\]<>:"|?*]/g, '_').trim() || 'Unnamed';
}

/** Create Figma variables from Penpot tokens. */
export async function createVariables(fileData: PenpotFileData, warnings: WarningCollector): Promise<Map<string, Variable>> {
  const { variables: plans } = planVariables(fileData.tokens);
  const result = new Map<string, Variable>();
  if (plans.length === 0) return result;

  const collections = figma.variables.getLocalVariableCollections();
  let collection = collections.find(c => c.name === 'Penpot Tokens');
  if (!collection) {
    collection = figma.variables.createVariableCollection('Penpot Tokens');
  }

  // Group plans by collection (token set).
  const byCollection = new Map<string, VariablePlan[]>();
  for (const plan of plans) {
    const list = byCollection.get(plan.collectionName) ?? [];
    list.push(plan);
    byCollection.set(plan.collectionName, list);
  }

  // Figma variable collections hold modes; use single mode "Value".
  const modes = collection.modes;
  const modeId = modes[0]?.modeId ?? collection.modes[0]?.modeId;

  for (const [collectionName, collectionPlans] of byCollection) {
    let targetCollection = collection;
    if (collectionName !== 'Penpot Tokens') {
      const existing = collections.find(c => c.name === collectionName);
      if (existing) {
        targetCollection = existing;
      } else {
        try {
          targetCollection = figma.variables.createVariableCollection(collectionName);
        } catch {
          targetCollection = collection;
        }
      }
    }

    for (const plan of collectionPlans) {
      try {
        const type = plan.type === 'COLOR' ? 'COLOR' : plan.type === 'STRING' ? 'STRING' : 'FLOAT';
        const variable = figma.variables.createVariable(sanitizeName(plan.name), targetCollection, type);
        if (plan.type === 'COLOR' && typeof plan.value === 'object') {
          const v = plan.value as { r: number; g: number; b: number; a: number };
          variable.setValueForMode(modeId, { r: v.r, g: v.g, b: v.b, a: v.a });
        } else if (plan.type === 'FLOAT') {
          variable.setValueForMode(modeId, plan.value as number);
        } else {
          variable.setValueForMode(modeId, String(plan.value));
        }
        if (plan.description) variable.description = plan.description;
        result.set(plan.path, variable);
      } catch (err) {
        warnings.add(`Failed to create variable "${plan.name}": ${String(err)}`);
      }
    }
  }

  return result;
}

/** Create paint/text styles from Penpot color/typography libraries. */
export async function createStyles(fileData: PenpotFileData, warnings: WarningCollector): Promise<{ color: Map<string, PaintStyle>; text: Map<string, TextStyle> }> {
  const colorStyles = new Map<string, PaintStyle>();
  const textStyles = new Map<string, TextStyle>();

  for (const color of fileData.colors.values()) {
    try {
      const name = sanitizeName(color.name ?? color.id);
      let style: PaintStyle | null = null;
      const existing = figma.getLocalPaintStyles().find(s => s.name === name);
      if (existing) {
        style = existing;
      } else {
        style = figma.createPaintStyle();
        style.name = name;
      }
      if (color.color) {
        const parsed = parseHexColor(color.color);
        if (parsed) {
          style.paints = [{ type: 'SOLID', color: { r: parsed.r, g: parsed.g, b: parsed.b }, opacity: (color.opacity ?? 1) * parsed.a }];
        }
      } else if (color.gradient) {
        // Gradient styles: approximate with first stop solid + warning.
        warnings.add(`Color style "${name}" uses a gradient; imported as solid approximation`);
        const first = color.gradient.stops?.[0];
        if (first) {
          const parsed = parseHexColor(first.color);
          if (parsed) style.paints = [{ type: 'SOLID', color: { r: parsed.r, g: parsed.g, b: parsed.b } }];
        }
      }
      colorStyles.set(color.id, style);
    } catch (err) {
      warnings.add(`Failed to create color style "${color.name ?? color.id}": ${String(err)}`);
    }
  }

  for (const typo of fileData.typographies.values()) {
    try {
      const name = sanitizeName(typo.name ?? typo.id);
      let style: TextStyle | null = null;
      const existing = figma.getLocalTextStyles().find(s => s.name === name);
      if (existing) {
        style = existing;
      } else {
        style = figma.createTextStyle();
        style.name = name;
      }
      style.fontName = { family: typo.fontFamily ?? 'Inter', style: typo.fontStyle === 'italic' ? 'Italic' : 'Regular' };
      if (typo.fontSize) style.fontSize = parseFloat(typo.fontSize) || 16;
      colorStyles.set(typo.id, style as unknown as PaintStyle);
      textStyles.set(typo.id, style);
    } catch (err) {
      warnings.add(`Failed to create text style "${typo.name ?? typo.id}": ${String(err)}`);
    }
  }

  return { color: colorStyles, text: textStyles };
}

/**
 * Create Figma components from Penpot component main instances.
 * Penpot components live in the page shapes with mainInstanceId; we import
 * their subtree once as a ComponentNode, then map instances to it.
 */
export async function createComponents(
  fileData: PenpotFileData,
  pageShapes: Map<string, PenpotShape>,
  createShapeNode: (shape: PenpotShape, parent: BaseNode & ChildrenMixin) => Promise<SceneNode | null>,
  warnings: WarningCollector
): Promise<Map<string, ComponentNode>> {
  const components = new Map<string, ComponentNode>();

  // Find main instance shapes (component roots).
  const mainInstances = [...pageShapes.values()].filter(s => s.mainInstance || s.componentRoot);

  for (const main of mainInstances) {
    try {
      const component = figma.createComponent();
      component.name = main.name ?? 'Component';

      // Import children of the main instance into the component.
      const childIds = main.shapes ?? [];
      for (const childId of childIds) {
        const child = pageShapes.get(childId);
        if (!child) continue;
        await createShapeNode(child, component);
      }

      // If the main instance itself has geometry/paints, apply them.
      if (main.width && main.height) {
        try {
          component.resize(main.width, main.height);
        } catch {
          // ignore
        }
      }

      components.set(main.id, component);

      // Also map by componentId for instance lookup.
      if (main.componentId) components.set(main.componentId, component);
    } catch (err) {
      warnings.add(`Failed to create component "${main.name ?? main.id}": ${String(err)}`);
    }
  }

  // Fallback: use Penpot component assets with embedded objects.
  for (const asset of fileData.components.values()) {
    if (components.has(asset.id)) continue;
    if (!asset.objects) continue;
    try {
      const component = figma.createComponent();
      component.name = asset.name ?? asset.id;
      for (const obj of Object.values(asset.objects)) {
        if (!obj || typeof obj !== 'object') continue;
        await createShapeNode(obj as PenpotShape, component);
      }
      components.set(asset.id, component);
    } catch (err) {
      warnings.add(`Failed to create component from asset "${asset.name ?? asset.id}": ${String(err)}`);
    }
  }

  return components;
}
