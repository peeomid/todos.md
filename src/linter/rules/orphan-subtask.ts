import type { LintContext, LintIssue, LintRule } from '../types.js';

export const orphanSubtaskRule: LintRule = {
  name: 'orphan-subtask',
  severity: 'warning',
  check(context: LintContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const { parsed, filePath } = context;

    // Collect all local IDs in this file
    const localIds = new Set<string>();
    for (const task of parsed.tasks) {
      if (task.localId) {
        localIds.add(task.localId);
      }
    }

    for (const task of parsed.tasks) {
      if (!task.localId) continue;

      // Check if ID implies a parent (e.g., 1.1 implies parent 1)
      const dotIndex = task.localId.lastIndexOf('.');
      if (dotIndex === -1) continue;

      const impliedParentId = task.localId.slice(0, dotIndex);
      if (impliedParentId && !localIds.has(impliedParentId)) {
        issues.push({
          file: filePath,
          line: task.lineNumber,
          severity: 'warning',
          rule: 'orphan-subtask',
          message: `Orphan subtask: ID '${task.localId}' implies parent '${impliedParentId}' which doesn't exist`,
          fixable: false,
        });
      }
    }

    return issues;
  },
};
