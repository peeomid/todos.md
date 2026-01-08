import type { LintContext, LintIssue, LintRule } from '../types.js';

const METADATA_BLOCK_REGEX = /\[([^\]]+)\]\s*$/;

export const malformedMetadataRule: LintRule = {
  name: 'malformed-metadata',
  severity: 'error',
  check(context: LintContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const { lines, filePath } = context;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      // Only check task lines
      if (!line.match(/^\s*- \[[ xX]\]/)) continue;

      const match = line.match(METADATA_BLOCK_REGEX);
      if (!match?.[1]) continue;

      const metadataStr = match[1];
      const tokens = metadataStr.split(/\s+/);

      for (const token of tokens) {
        if (!token) continue;

        const colonIndex = token.indexOf(':');

        // Missing colon
        if (colonIndex === -1) {
          issues.push({
            file: filePath,
            line: i + 1,
            severity: 'error',
            rule: 'malformed-metadata',
            message: `Malformed metadata: '${token}' missing colon separator`,
            fixable: false,
          });
          continue;
        }

        const key = token.slice(0, colonIndex);
        const value = token.slice(colonIndex + 1);

        // Empty key
        if (!key) {
          issues.push({
            file: filePath,
            line: i + 1,
            severity: 'error',
            rule: 'malformed-metadata',
            message: `Malformed metadata: empty key before ':'`,
            fixable: false,
          });
          continue;
        }

        // Empty value
        if (!value) {
          issues.push({
            file: filePath,
            line: i + 1,
            severity: 'error',
            rule: 'malformed-metadata',
            message: `Malformed metadata: empty value for '${key}'`,
            fixable: false,
          });
        }
      }
    }

    return issues;
  },
};
