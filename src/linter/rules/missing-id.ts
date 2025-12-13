import type { LintRule, LintContext, LintIssue } from '../types.js';

export const missingIdRule: LintRule = {
  name: 'missing-id',
  severity: 'warning',
  check(context: LintContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const { parsed, filePath } = context;

    for (const task of parsed.tasks) {
      if (!task.localId) {
        issues.push({
          file: filePath,
          line: task.lineNumber,
          severity: 'warning',
          rule: 'missing-id',
          message: "Task without ID (not trackable). Run 'tmd enrich' to auto-generate IDs.",
          fixable: false, // Use `tmd enrich` instead
        });
      }
    }

    return issues;
  },
};
