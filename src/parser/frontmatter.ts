export interface Frontmatter {
  taskFormatVersion?: number;
  raw: Record<string, unknown>;
}

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---/;

export function parseFrontmatter(content: string): { frontmatter: Frontmatter; contentWithoutFrontmatter: string } {
  const match = content.match(FRONTMATTER_REGEX);

  if (!match?.[1]) {
    return {
      frontmatter: { raw: {} },
      contentWithoutFrontmatter: content,
    };
  }

  const yamlContent = match[1];
  const raw: Record<string, unknown> = {};

  // Simple YAML parser for key: value pairs
  const lines = yamlContent.split('\n');
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value: unknown = line.slice(colonIndex + 1).trim();

    // Try to parse numbers
    if (/^\d+$/.test(value as string)) {
      value = parseInt(value as string, 10);
    }

    if (key) {
      raw[key] = value;
    }
  }

  const taskFormatVersion = typeof raw.task_format_version === 'number' ? raw.task_format_version : undefined;

  return {
    frontmatter: { taskFormatVersion, raw },
    contentWithoutFrontmatter: content.slice(match[0].length).trimStart(),
  };
}
