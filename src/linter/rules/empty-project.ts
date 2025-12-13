import type { LintRule, LintContext, LintIssue } from '../types.js';

export const emptyProjectRule: LintRule = {
  name: 'empty-project',
  severity: 'warning',
  check(context: LintContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const { parsed, filePath } = context;

    // Sort projects by line number
    const sortedProjects = [...parsed.projects].sort((a, b) => a.lineNumber - b.lineNumber);

    for (let i = 0; i < sortedProjects.length; i++) {
      const project = sortedProjects[i];
      if (!project) continue;

      const nextProject = sortedProjects[i + 1];
      const projectEndLine = nextProject?.lineNumber ?? Infinity;

      // Count tasks in this project
      const tasksInProject = parsed.tasks.filter(
        (task) => task.lineNumber > project.lineNumber && task.lineNumber < projectEndLine
      );

      if (tasksInProject.length === 0) {
        issues.push({
          file: filePath,
          line: project.lineNumber,
          severity: 'warning',
          rule: 'empty-project',
          message: `Project '${project.id}' has no tasks`,
          fixable: false,
        });
      }
    }

    return issues;
  },
};
