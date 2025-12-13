export interface MetadataParseResult {
  metadata: Record<string, string>;
  textWithoutMetadata: string;
  hasMetadata: boolean;
}

const METADATA_BLOCK_REGEX = /\[([^\]]+)\]\s*$/;

export function parseMetadataBlock(line: string): MetadataParseResult {
  const match = line.match(METADATA_BLOCK_REGEX);

  if (!match?.[1]) {
    return {
      metadata: {},
      textWithoutMetadata: line,
      hasMetadata: false,
    };
  }

  const metadataStr = match[1];
  const metadata: Record<string, string> = {};

  // Parse key:value pairs separated by spaces
  // Handle values that might contain spaces by stopping at next key:
  const tokens = metadataStr.split(/\s+/);

  for (const token of tokens) {
    const colonIndex = token.indexOf(':');
    if (colonIndex === -1) {
      continue; // Skip malformed tokens
    }

    const key = token.slice(0, colonIndex);
    const value = token.slice(colonIndex + 1);

    if (key && value) {
      metadata[key] = value;
    }
  }

  const textWithoutMetadata = line.slice(0, match.index).trimEnd();

  return {
    metadata,
    textWithoutMetadata,
    hasMetadata: true,
  };
}

export function serializeMetadata(metadata: Record<string, string>): string {
  const pairs = Object.entries(metadata)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key}:${value}`);

  return pairs.length > 0 ? `[${pairs.join(' ')}]` : '';
}
