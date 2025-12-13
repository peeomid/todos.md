import type { LintRule, LintContext, LintIssue } from '../types.js';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DATE_FIELDS = ['due', 'created', 'updated', 'plan'];

export const invalidDateFormatRule: LintRule = {
  name: 'invalid-date-format',
  severity: 'error',
  check(context: LintContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const { parsed, filePath } = context;

    for (const task of parsed.tasks) {
      for (const field of DATE_FIELDS) {
        const value = task.metadata[field];
        if (value && !DATE_REGEX.test(value)) {
          issues.push({
            file: filePath,
            line: task.lineNumber,
            severity: 'error',
            rule: 'invalid-date-format',
            message: `Invalid date format '${value}' in '${field}' (expected YYYY-MM-DD)`,
            fixable: false,
          });
        }
      }
    }

    return issues;
  },
};
