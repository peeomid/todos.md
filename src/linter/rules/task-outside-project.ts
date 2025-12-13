import type { LintRule, LintContext, LintIssue } from '../types.js';

export const taskOutsideProjectRule: LintRule = {
  name: 'task-outside-project',
  severity: 'warning',
  check(context: LintContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const { parsed, filePath } = context;

    // Find the first project line
    const firstProjectLine = parsed.projects.length > 0
      ? Math.min(...parsed.projects.map((p) => p.lineNumber))
      : Infinity;

    for (const task of parsed.tasks) {
      if (task.lineNumber < firstProjectLine) {
        issues.push({
          file: filePath,
          line: task.lineNumber,
          severity: 'warning',
          rule: 'task-outside-project',
          message: `Task on line ${task.lineNumber} has no project context`,
          fixable: false,
        });
      }
    }

    return issues;
  },
};
