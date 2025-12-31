import fs from 'node:fs';
import { enrichFiles, type EnrichFileResult, type EnrichResult } from '../enricher/index.js';
import { getGlobalConfigPath, loadConfig, resolveFiles } from '../config/loader.js';
import { extractBooleanFlags, extractRepeatableFlags, extractFlags } from './flag-utils.js';
import { boldText, dimText, cyanText, greenText } from './terminal.js';
import { FileNotFoundError } from './errors.js';

interface EnrichOptions {
  files: string[];
  keepShorthands: boolean;
  dryRun: boolean;
  json: boolean;
}

export function handleEnrichCommand(args: string[]): void {
  const options = parseEnrichFlags(args);
  runEnrich(options);
}

function parseEnrichFlags(args: string[]): EnrichOptions {
  const boolFlags = extractBooleanFlags(args, [
    '--keep-shorthands',
    '--dry-run',
    '--json',
    '--global-config',
    '-G',
  ]);
  const valueFlags = extractFlags(args, ['--config', '-c']);
  const fileFlags = extractRepeatableFlags(args, '--file');
  const shortFileFlags = extractRepeatableFlags(args, '-f');

  const useGlobalConfig = boolFlags.has('--global-config') || boolFlags.has('-G');
  const configPath = useGlobalConfig
    ? getGlobalConfigPath()
    : (valueFlags['--config'] ?? valueFlags['-c']);
  const config = loadConfig(configPath);

  const files = resolveFiles(config, [...fileFlags, ...shortFileFlags]);

  return {
    files,
    keepShorthands: boolFlags.has('--keep-shorthands'),
    dryRun: boolFlags.has('--dry-run'),
    json: boolFlags.has('--json'),
  };
}

function runEnrich(options: EnrichOptions): void {
  const { files, keepShorthands, dryRun, json } = options;

  // Validate files exist
  for (const file of files) {
    if (!fs.existsSync(file)) {
      throw new FileNotFoundError(file);
    }
  }

  const result = enrichFiles(files, { keepShorthands, dryRun });

  if (json) {
    printJsonOutput(result, dryRun);
  } else {
    printTextOutput(result, dryRun);
  }
}

function printJsonOutput(result: EnrichResult, dryRun: boolean): void {
  console.log(
    JSON.stringify(
      {
        success: true,
        files: result.files.map((f) => ({
          path: f.filePath,
          tasksModified: f.changes.length,
          changes: f.changes.map((c) => ({
            line: c.lineNumber,
            taskText: c.taskText,
            added: c.added,
            shorthandFound: c.shorthandFound,
          })),
        })),
        summary: result.summary,
        dryRun,
      },
      null,
      2
    )
  );
}

function printTextOutput(result: EnrichResult, dryRun: boolean): void {
  if (result.summary.totalTasksModified === 0) {
    console.log(`${cyanText('✓')} No tasks to enrich in ${result.summary.filesProcessed} file(s)`);
    return;
  }

  for (const file of result.files) {
    if (!file.modified) continue;

    const prefix = dryRun ? 'Would enrich' : 'Enriched';
    console.log(`${boldText(prefix)}: ${file.filePath}`);
    console.log(`  Tasks ${dryRun ? 'to modify' : 'modified'}: ${file.changes.length}`);

    for (const change of file.changes) {
      const shorthandInfo = change.shorthandFound ? ` ${dimText(`(from ${change.shorthandFound})`)}` : '';
      console.log(`  ${dimText(`Line ${change.lineNumber}:`)} ${change.taskText.slice(0, 40)}...`);
      console.log(`    ${greenText('+')} ${change.added.join(', ')}${shorthandInfo}`);
    }
    console.log('');
  }

  // Summary
  const action = dryRun ? 'Would modify' : 'Modified';
  console.log(
    `${action} ${result.summary.totalTasksModified} task(s) in ${result.summary.filesModified} file(s)`
  );

  if (dryRun) {
    console.log(dimText('(dry run - no files modified)'));
  }
}

export function printEnrichHelp(): void {
  const lines = [
    'Usage: tmd enrich [options]',
    '',
    'Convert human-friendly shorthands to canonical metadata and auto-generate IDs.',
    '',
    'What enrich does:',
    '  - Converts priority shorthands:',
    '      (A) → priority:high',
    '      (B) → priority:normal',
    '      (C) → priority:low',
    '  - Converts bucket shorthands:',
    '      *  → bucket:now',
    '      !  → bucket:today + sets plan:<today>',
    '      >  → bucket:upcoming',
    '      ~  → bucket:anytime',
    '      ?  → bucket:someday',
    '      @now/@today/@upcoming/@anytime/@someday → bucket:<...> (and @today sets plan:<today>)',
    '    (If both are present, symbol bucket shorthands win over @tags.)',
    '  - Auto-generates missing id: for tasks',
    '  - Adds created: date for new tasks',
    '  - Sets updated: when modifying tasks',
    '',
    'Options:',
    '  --file, -f <path>    Input file (repeatable)',
    '  --config, -c <path>  Path to config file',
    '  --keep-shorthands    Keep shorthand markers in task text',
    '  --dry-run            Show changes without modifying files',
    '  --json               Output as JSON',
    '',
    'Examples:',
    '  tmd enrich',
    '  tmd enrich -f todos.md',
    '  tmd enrich --dry-run',
    '  tmd enrich --keep-shorthands',
  ];
  console.log(lines.join('\n'));
}
