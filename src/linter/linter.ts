import fs from 'node:fs';
import { parseMarkdownContent } from '../parser/index.js';
import { allRules } from './rules/index.js';
import type { LintContext, LintFix, LintIssue, LintSummary } from './types.js';

export interface LinterResult {
  issues: LintIssue[];
  summary: LintSummary;
  fixed: number;
}

export interface LintOptions {
  fix?: boolean;
}

export function lintFiles(filePaths: string[], options: LintOptions = {}): LinterResult {
  const { fix = false } = options;
  const allIssues: LintIssue[] = [];
  const filesWithIssues = new Set<string>();
  let totalFixed = 0;

  // Parse all files first (for cross-file checks)
  const parsedFiles = filePaths.map((filePath) => {
    const content = fs.readFileSync(filePath, 'utf-8');
    return {
      filePath,
      content,
      parsed: parseMarkdownContent(content, filePath),
    };
  });

  // Collect all global IDs for cross-file duplicate checking
  const allGlobalIds = new Set<string>();

  // Track fixes to apply per file
  const fixesByFile = new Map<string, LintFix[]>();

  for (const { filePath, content, parsed } of parsedFiles) {
    const lines = content.split('\n');

    const context: LintContext = {
      filePath,
      content,
      lines,
      parsed,
      allParsedFiles: parsedFiles.map((f) => f.parsed),
      allGlobalIds,
    };

    for (const rule of allRules) {
      const issues = rule.check(context);
      for (const issue of issues) {
        // If fix mode and issue is fixable, try to fix it
        if (fix && issue.fixable && rule.fix) {
          const fixResult = rule.fix(context, issue);
          if (fixResult) {
            const fileFixes = fixesByFile.get(filePath) ?? [];
            fileFixes.push(fixResult);
            fixesByFile.set(filePath, fileFixes);
            totalFixed++;
            continue; // Don't report fixed issues
          }
        }

        allIssues.push(issue);
        filesWithIssues.add(issue.file);
      }
    }

    // Update global IDs after processing file
    for (const task of parsed.tasks) {
      if (!task.localId) continue;

      let projectId: string | null = null;
      for (const project of parsed.projects) {
        if (project.lineNumber < task.lineNumber) {
          projectId = project.id;
        }
      }

      if (projectId) {
        allGlobalIds.add(`${projectId}:${task.localId}`);
      }
    }
  }

  // Apply fixes
  if (fix) {
    for (const [filePath, fixes] of fixesByFile) {
      applyFixes(filePath, fixes);
    }
  }

  // Sort issues by file and line
  allIssues.sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.line - b.line;
  });

  const summary: LintSummary = {
    filesChecked: filePaths.length,
    filesWithIssues: filesWithIssues.size,
    errors: allIssues.filter((i) => i.severity === 'error').length,
    warnings: allIssues.filter((i) => i.severity === 'warning').length,
    infos: allIssues.filter((i) => i.severity === 'info').length,
  };

  return { issues: allIssues, summary, fixed: totalFixed };
}

/**
 * Apply fixes to a file. Fixes are sorted by line number in reverse order
 * to avoid line number shifts during replacement.
 */
function applyFixes(filePath: string, fixes: LintFix[]): void {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Sort fixes by line number in reverse order
  const sortedFixes = [...fixes].sort((a, b) => b.line - a.line);

  for (const fix of sortedFixes) {
    const lineIndex = fix.line - 1;
    if (lineIndex >= 0 && lineIndex < lines.length) {
      lines[lineIndex] = fix.newText;
    }
  }

  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
}
