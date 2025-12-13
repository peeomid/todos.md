import type { LintRule, LintContext, LintIssue } from '../types.js';

const HEADING_WITH_METADATA_REGEX = /^(#{1,6})\s+(.+)\s*\[([^\]]+)\]\s*$/;

export const projectHeadingWithoutIdRule: LintRule = {
  name: 'project-heading-without-id',
  severity: 'error',
  check(context: LintContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const { lines, filePath } = context;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const match = line.match(HEADING_WITH_METADATA_REGEX);
      if (!match) continue;

      const metadataStr = match[3];
      if (!metadataStr) continue;

      const tokens = metadataStr.split(/\s+/).filter(Boolean);
      if (tokens.length === 0) continue;

      const hasProjectId = tokens.some((token) => token.startsWith('project:'));
      if (hasProjectId) continue;

      const areaOnlyHeading = tokens.every((token) => token.startsWith('area:'));
      if (areaOnlyHeading) continue;

      {
        const headingText = match[2]?.trim() ?? 'Unknown';
        issues.push({
          file: filePath,
          line: i + 1,
          severity: 'error',
          rule: 'project-heading-without-id',
          message: `Heading '${headingText}' has metadata but no 'project:' ID`,
          fixable: false,
        });
      }
    }

    return issues;
  },
};
