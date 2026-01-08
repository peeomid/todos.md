import type { LintContext, LintIssue, LintRule } from '../types.js';

export const duplicateIdRule: LintRule = {
  name: 'duplicate-id',
  severity: 'error',
  check(context: LintContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const { parsed, filePath } = context;

    // Track IDs within this file and their first occurrence
    const seenIds = new Map<string, number>();

    for (const task of parsed.tasks) {
      if (!task.localId) continue;

      // Find the project this task belongs to
      let projectId: string | null = null;
      for (const project of parsed.projects) {
        if (project.lineNumber < task.lineNumber) {
          projectId = project.id;
        }
      }

      if (!projectId) continue;

      const globalId = `${projectId}:${task.localId}`;

      const firstLine = seenIds.get(globalId);
      if (firstLine !== undefined) {
        issues.push({
          file: filePath,
          line: task.lineNumber,
          severity: 'error',
          rule: 'duplicate-id',
          message: `Duplicate ID '${globalId}' (first seen on line ${firstLine})`,
          fixable: false,
        });
      } else {
        seenIds.set(globalId, task.lineNumber);
      }
    }

    return issues;
  },
};
