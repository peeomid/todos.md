import type { LintRule, LintContext, LintIssue, LintFix } from '../types.js';

export const duplicateTagsRule: LintRule = {
  name: 'duplicate-tags',
  severity: 'info',
  check(context: LintContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const { parsed, filePath } = context;

    for (const task of parsed.tasks) {
      const tagsValue = task.metadata.tags;
      if (!tagsValue) continue;

      const tags = tagsValue.split(',').filter(Boolean);
      const seen = new Set<string>();
      const duplicates: string[] = [];

      for (const tag of tags) {
        if (seen.has(tag)) {
          duplicates.push(tag);
        } else {
          seen.add(tag);
        }
      }

      if (duplicates.length > 0) {
        const taskId = task.localId ?? 'unknown';
        issues.push({
          file: filePath,
          line: task.lineNumber,
          severity: 'info',
          rule: 'duplicate-tags',
          message: `Duplicate tag '${duplicates[0]}' in task ${taskId}`,
          fixable: true,
        });
      }
    }

    return issues;
  },

  fix(context: LintContext, issue: LintIssue): LintFix | null {
    const { lines, filePath } = context;
    const lineIndex = issue.line - 1;
    const line = lines[lineIndex];
    if (!line) return null;

    // Find the tags:... in the metadata block
    const tagsMatch = line.match(/tags:([^\s\]]+)/);
    if (!tagsMatch) return null;

    const oldTagsValue = tagsMatch[1]!;
    const tags = oldTagsValue.split(',').filter(Boolean);

    // Deduplicate while preserving order
    const seen = new Set<string>();
    const uniqueTags: string[] = [];
    for (const tag of tags) {
      if (!seen.has(tag)) {
        seen.add(tag);
        uniqueTags.push(tag);
      }
    }

    const newTagsValue = uniqueTags.join(',');
    const newLine = line.replace(`tags:${oldTagsValue}`, `tags:${newTagsValue}`);

    return {
      file: filePath,
      line: issue.line,
      oldText: line,
      newText: newLine,
    };
  },
};
