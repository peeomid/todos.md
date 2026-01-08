import type { LintContext, LintIssue, LintRule } from '../types.js';

// Flexible estimate format: 15m, 30m, 1h, 1.5h, 90m, 1h30m, etc.
const ESTIMATE_REGEX = /^(\d+(\.\d+)?h)?(\d+m)?$/;

function isValidEstimate(value: string): boolean {
  if (!ESTIMATE_REGEX.test(value)) {
    return false;
  }
  // Must have at least hours or minutes
  return value.includes('h') || value.includes('m');
}

export const invalidEstimateFormatRule: LintRule = {
  name: 'invalid-estimate-format',
  severity: 'error',
  check(context: LintContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const { parsed, filePath } = context;

    for (const task of parsed.tasks) {
      const value = task.metadata.est;
      if (value && !isValidEstimate(value)) {
        issues.push({
          file: filePath,
          line: task.lineNumber,
          severity: 'error',
          rule: 'invalid-estimate-format',
          message: `Invalid estimate format '${value}' (expected: 15m, 30m, 1h, 1.5h, 1h30m, etc.)`,
          fixable: false,
        });
      }
    }

    return issues;
  },
};
