interface ParsedKeyValue {
  name: string;
  value: string;
  enabled: boolean;
}

interface KeyValueItem {
  name: string;
  value: string;
  enabled: boolean;
}

export function parseBulkKeyValue(value: string): ParsedKeyValue[] {
  return value
    .split(/\r?\n/)
    .map((pair: string): ParsedKeyValue | null => {
      const isEnabled = !pair.trim().startsWith('//');
      const cleanPair = pair.replace(/^\/\/\s*/, '');
      const sep = cleanPair.indexOf(':');
      if (sep < 0) return null;
      return {
        name: cleanPair.slice(0, sep).trim(),
        value: cleanPair.slice(sep + 1).trim(),
        enabled: isEnabled
      };
    })
    .filter((item): item is ParsedKeyValue => item !== null);
}

export function serializeBulkKeyValue(items: KeyValueItem[]): string {
  return items.map((item) => `${item.enabled ? '' : '//'}${item.name}:${item.value}`).join('\n');
}
