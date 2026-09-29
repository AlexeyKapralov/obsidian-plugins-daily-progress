import { DEFAULT_DATA_PATH, type PanelConfig } from "./model";

export function parsePanelConfig(source: string): PanelConfig {
  const values = new Map<string, string>();
  for (const rawLine of source.split(/\r?\n/)) {
    const match = /^\s*([a-zA-Z][\w-]*)\s*:\s*(.*?)\s*$/.exec(rawLine);
    if (match?.[1] && match[2] !== undefined) values.set(match[1].toLowerCase(), match[2]);
  }

  return { dataPath: values.get("data") || DEFAULT_DATA_PATH };
}

export function panelCodeBlock(dataPath = DEFAULT_DATA_PATH): string {
  return `\`\`\`daily-progress\ndata: ${dataPath}\n\`\`\``;
}
