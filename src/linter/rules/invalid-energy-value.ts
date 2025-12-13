import type { LintRule, LintContext, LintIssue } from '../types.js';

const VALID_ENERGY_VALUES = ['low', 'normal', 'high'];

export const invalidEnergyValueRule: LintRule = {
  name: 'invalid-energy-value',
  severity: 'error',
  check(context: LintContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const { parsed, filePath } = context;

    for (const task of parsed.tasks) {
      const value = task.metadata.energy;
      if (value && !VALID_ENERGY_VALUES.includes(value)) {
        issues.push({
          file: filePath,
          line: task.lineNumber,
          severity: 'error',
          rule: 'invalid-energy-value',
          message: `Invalid energy value '${value}' (expected: low, normal, high)`,
          fixable: false,
        });
      }
    }

    return issues;
  },
};
