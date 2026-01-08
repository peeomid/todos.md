import type { LintContext, LintIssue, LintRule } from '../types.js';

export const inconsistentSubtaskIndentRule: LintRule = {
  name: 'inconsistent-subtask-indent',
  severity: 'warning',
  check(context: LintContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const { parsed, filePath } = context;

    // Detect indent unit from first indented task
    let detectedIndentUnit: number | null = null;

    for (const task of parsed.tasks) {
      if (task.indentLevel > 0) {
        if (detectedIndentUnit === null) {
          detectedIndentUnit = task.indentLevel;
        } else {
          // Check if this indent level is consistent with the unit
          if (task.indentLevel % detectedIndentUnit !== 0) {
            issues.push({
              file: filePath,
              line: task.lineNumber,
              severity: 'warning',
              rule: 'inconsistent-subtask-indent',
              message: `Inconsistent indentation: expected multiple of ${detectedIndentUnit} spaces, found ${task.indentLevel}`,
              fixable: false,
            });
          }
        }
      }
    }

    return issues;
  },
};
