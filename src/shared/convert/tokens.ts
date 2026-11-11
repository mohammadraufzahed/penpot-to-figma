import type { PenpotTokensFile } from '../penpot';
import { parseHexColor } from './color';

export interface VariablePlan {
  name: string;
  type: 'COLOR' | 'FLOAT' | 'STRING';
  value: unknown;
  description?: string;
  collectionName: string;
  /** Dotted token path, e.g. "color.primary" — used for alias lookup. */
  path: string;
  unresolved?: string;
}

export interface TokenResolution {
  variables: VariablePlan[];
  /** Maps token path → resolved value, for alias resolution. */
  resolved: Map<string, unknown>;
}

interface FlatToken {
  path: string;
  value: unknown;
  type?: string;
  description?: string;
}

/** Flatten W3C-style tokens.json ({ set: { token: { $value, $type } } }) into a list. */
export function flattenTokensFile(tokensFile: PenpotTokensFile | undefined): FlatToken[] {
  const result: FlatToken[] = [];
  if (!tokensFile) return result;
  const walk = (node: unknown, prefix: string[]): void => {
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if ('$value' in record || 'value' in record) {
      result.push({
        path: prefix.join('.'),
        value: record.$value ?? record.value,
        type: String(record.$type ?? record.type ?? ''),
        description: typeof record.$description === 'string' ? record.$description : undefined
      });
      return;
    }
    for (const [key, child] of Object.entries(record)) {
      if (key.startsWith('$')) continue;
      walk(child, [...prefix, key]);
    }
  };
  for (const [setName, setValue] of Object.entries(tokensFile)) {
    if (setName.startsWith('$')) continue;
    walk(setValue, [setName]);
  }
  return result;
}

/**
 * Resolve Penpot tokens (values may alias other tokens via "{path.to.token}")
 * into a flat list of Figma variable plans.
 */
export function planVariables(tokensFile: PenpotTokensFile | undefined): TokenResolution {
  const variables: VariablePlan[] = [];
  const resolved = new Map<string, unknown>();
  const flat = flattenTokensFile(tokensFile);
  if (flat.length === 0) return { variables, resolved };

  const byPath = new Map(flat.map(t => [t.path, t]));

  const resolveValue = (token: FlatToken, seen: Set<string>): unknown => {
    const value = token.value;
    if (typeof value === 'string') {
      const aliasMatch = value.match(/^\{(.+)\}$/);
      if (aliasMatch) {
        const key = aliasMatch[1] ?? '';
        if (seen.has(key)) return undefined;
        const target = byPath.get(key);
        if (!target) return undefined;
        seen.add(key);
        const resolvedTarget = resolveValue(target, seen);
        seen.delete(key);
        return resolvedTarget;
      }
    }
    return value;
  };

  for (const token of flat) {
    const resolvedValue = resolveValue(token, new Set([token.path]));
    const collectionName = token.path.split('.')[0] ?? 'Penpot Tokens';
    const base = { name: token.path, collectionName, path: token.path, description: token.description };

    if (typeof resolvedValue === 'string') {
      const color = parseHexColor(resolvedValue);
      if (color) {
        variables.push({ ...base, type: 'COLOR', value: { r: color.r, g: color.g, b: color.b, a: color.a } });
        resolved.set(token.path, resolvedValue);
        continue;
      }
      const num = Number(resolvedValue);
      if (resolvedValue.trim() !== '' && Number.isFinite(num)) {
        variables.push({ ...base, type: 'FLOAT', value: num });
        resolved.set(token.path, num);
        continue;
      }
      variables.push({ ...base, type: 'STRING', value: resolvedValue });
      resolved.set(token.path, resolvedValue);
      continue;
    }

    if (typeof resolvedValue === 'number' && Number.isFinite(resolvedValue)) {
      variables.push({ ...base, type: 'FLOAT', value: resolvedValue });
      resolved.set(token.path, resolvedValue);
      continue;
    }

    variables.push({ ...base, type: 'FLOAT', value: 0, unresolved: `could not resolve token value: ${JSON.stringify(token.value)}` });
  }

  return { variables, resolved };
}
