import fs from 'node:fs';
import { lintFiles, type LintIssue } from '../linter/index.js';
import { loadConfig, resolveFiles } from '../config/loader.js';
import { extractBooleanFlags, extractRepeatableFlags, extractFlags } from './flag-utils.js';
import { boldText, dimText, redText, yellowText, cyanText } from './terminal.js';
import { FileNotFoundError } from './errors.js';

interface LintOptions {
  files: string[];
  fix: boolean;
  quiet: boolean;
  json: boolean;
}

export function handleLintCommand(args: string[]): void {
  const options = parseLintFlags(args);
  const exitCode = runLint(options);
  process.exitCode = exitCode;
}

function parseLintFlags(args: string[]): LintOptions {
  const boolFlags = extractBooleanFlags(args, ['--fix', '--quiet', '-q', '--json']);
  const valueFlags = extractFlags(args, ['--config', '-c']);
  const fileFlags = extractRepeatableFlags(args, '--file');
  const shortFileFlags = extractRepeatableFlags(args, '-f');

  const configPath = valueFlags['--config'] ?? valueFlags['-c'];
  const config = loadConfig(configPath);

  const files = resolveFiles(config, [...fileFlags, ...shortFileFlags]);

  return {
    files,
    fix: boolFlags.has('--fix'),
    quiet: boolFlags.has('--quiet') || boolFlags.has('-q'),
    json: boolFlags.has('--json'),
  };
}

function runLint(options: LintOptions): number {
  const { files, fix, quiet, json } = options;

  // Validate files exist
  for (const file of files) {
    if (!fs.existsSync(file)) {
      throw new FileNotFoundError(file);
    }
  }

  const { issues, summary, fixed } = lintFiles(files, { fix });

  if (json) {
    // Group issues by file for JSON output
    const fileIssues: Record<string, LintIssue[]> = {};
    for (const issue of issues) {
      if (!fileIssues[issue.file]) {
        fileIssues[issue.file] = [];
      }
      fileIssues[issue.file]!.push(issue);
    }

    console.log(
      JSON.stringify(
        {
          success: summary.errors === 0,
          files: Object.entries(fileIssues).map(([path, fileIssueList]) => ({
            path,
            issues: fileIssueList.map((i) => ({
              line: i.line,
              severity: i.severity,
              rule: i.rule,
              message: i.message,
              fixable: i.fixable,
            })),
          })),
          summary: { ...summary, fixed },
        },
        null,
        2
      )
    );
    return summary.errors > 0 ? 1 : 0;
  }

  // Text output
  if (issues.length === 0 && fixed === 0) {
    if (!quiet) {
      console.log(`${cyanText('✓')} No issues found in ${summary.filesChecked} file(s)`);
    }
    return 0;
  }

  if (issues.length === 0 && fixed > 0) {
    console.log(`${cyanText('✓')} Fixed ${fixed} issue${fixed === 1 ? '' : 's'} in ${summary.filesChecked} file(s)`);
    return 0;
  }

  // Group by file
  const issuesByFile = new Map<string, LintIssue[]>();
  for (const issue of issues) {
    const existing = issuesByFile.get(issue.file) ?? [];
    existing.push(issue);
    issuesByFile.set(issue.file, existing);
  }

  // Print issues by file
  for (const [file, fileIssues] of issuesByFile) {
    console.log(boldText(file));
    for (const issue of fileIssues) {
      const severityColor =
        issue.severity === 'error' ? redText : issue.severity === 'warning' ? yellowText : dimText;
      const prefix = severityColor(`  Line ${issue.line}: ${issue.severity}:`);
      console.log(`${prefix} ${issue.message} ${dimText(`(${issue.rule})`)}`);
    }
    console.log('');
  }

  // Summary
  const parts: string[] = [];
  if (summary.errors > 0) {
    parts.push(redText(`${summary.errors} error${summary.errors === 1 ? '' : 's'}`));
  }
  if (summary.warnings > 0) {
    parts.push(yellowText(`${summary.warnings} warning${summary.warnings === 1 ? '' : 's'}`));
  }
  if (summary.infos > 0) {
    parts.push(dimText(`${summary.infos} info`));
  }

  console.log(`Found ${parts.join(', ')} in ${summary.filesWithIssues} file(s)`);
  if (fixed > 0) {
    console.log(cyanText(`Fixed ${fixed} issue${fixed === 1 ? '' : 's'}`));
  }

  return summary.errors > 0 ? 1 : 0;
}

export function printLintHelp(): void {
  const lines = [
    'Usage: tmd lint [options]',
    '',
    'Validate markdown files for format issues.',
    '',
    'Options:',
    '  --file, -f <path>    Input file (repeatable)',
    '  --config, -c <path>  Path to config file',
    '  --fix                Auto-fix issues where possible',
    '  --quiet, -q          Only show errors, not warnings',
    '  --json               Output as JSON',
    '',
    'Examples:',
    '  tmd lint',
    '  tmd lint -f todos.md',
    '  tmd lint --fix',
    '  tmd lint --json',
  ];
  console.log(lines.join('\n'));
}
