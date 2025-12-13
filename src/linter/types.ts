import type { ParsedFile, ParsedProject, ParsedTask } from '../parser/types.js';

export type Severity = 'error' | 'warning' | 'info';

export interface LintIssue {
  file: string;
  line: number;
  severity: Severity;
  rule: string;
  message: string;
  fixable: boolean;
}

export interface LintContext {
  filePath: string;
  content: string;
  lines: string[];
  parsed: ParsedFile;
  allParsedFiles: ParsedFile[];
  allGlobalIds: Set<string>;
}

export interface LintFix {
  file: string;
  line: number;
  oldText: string;
  newText: string;
}

export interface LintRule {
  name: string;
  severity: Severity;
  check(context: LintContext): LintIssue[];
  fix?(context: LintContext, issue: LintIssue): LintFix | null;
}

export interface LintResult {
  issues: LintIssue[];
  fixed: number;
}

export interface LintSummary {
  filesChecked: number;
  filesWithIssues: number;
  errors: number;
  warnings: number;
  infos: number;
}
