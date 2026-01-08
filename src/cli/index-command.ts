import fs from 'node:fs';
import { getGlobalConfigPath, loadConfig, resolveFiles, resolveOutput } from '../config/loader.js';
import { buildIndex } from '../indexer/index.js';
import { writeIndexFile } from '../indexer/index-file.js';
import { FileNotFoundError } from './errors.js';
import { extractBooleanFlags, extractFlags, extractRepeatableFlags } from './flag-utils.js';
import { boldText, dimText, greenText, yellowText } from './terminal.js';

interface IndexOptions {
  files: string[];
  output: string;
  quiet: boolean;
  json: boolean;
}

export function handleIndexCommand(args: string[]): void {
  const options = parseIndexFlags(args);
  runIndex(options);
}

function parseIndexFlags(args: string[]): IndexOptions {
  const boolFlags = extractBooleanFlags(args, ['--quiet', '-q', '--json', '--global-config', '-G']);
  const valueFlags = extractFlags(args, ['--output', '-o', '--config', '-c']);
  const fileFlags = extractRepeatableFlags(args, '--file');
  const shortFileFlags = extractRepeatableFlags(args, '-f');

  const useGlobalConfig = boolFlags.has('--global-config') || boolFlags.has('-G');
  const configPath = useGlobalConfig ? getGlobalConfigPath() : (valueFlags['--config'] ?? valueFlags['-c']);
  const config = loadConfig(configPath);

  const files = resolveFiles(config, [...fileFlags, ...shortFileFlags]);
  const output = resolveOutput(config, valueFlags['--output'] ?? valueFlags['-o']);

  return {
    files,
    output,
    quiet: boolFlags.has('--quiet') || boolFlags.has('-q'),
    json: boolFlags.has('--json'),
  };
}

function runIndex(options: IndexOptions): void {
  const { files, output, quiet, json } = options;

  // Validate files exist
  for (const file of files) {
    if (!fs.existsSync(file)) {
      throw new FileNotFoundError(file);
    }
  }

  if (!quiet && !json) {
    console.log(`Parsing ${files.length} file(s)...`);
    for (const file of files) {
      console.log(`  ${dimText('-')} ${file}`);
    }
  }

  const { index, stats, warnings } = buildIndex(files);

  // Show warnings
  if (!quiet && !json && warnings.length > 0) {
    console.log('');
    for (const warning of warnings) {
      const location = warning.line ? `${warning.file}:${warning.line}` : warning.file;
      console.log(`${yellowText('warning:')} ${location}: ${warning.message}`);
    }
  }

  // Write index file
  writeIndexFile(index, output);

  if (json) {
    console.log(
      JSON.stringify(
        {
          success: true,
          files,
          output,
          stats,
          warnings: warnings.map((w) => ({
            file: w.file,
            line: w.line,
            message: w.message,
          })),
        },
        null,
        2
      )
    );
    return;
  }

  if (!quiet) {
    console.log('');
    console.log(
      `Found ${boldText(String(stats.projects))} projects, ${boldText(String(stats.tasks.total))} tasks (${greenText(`${String(stats.tasks.open)} open`)}, ${dimText(`${String(stats.tasks.done)} done`)})`
    );
    console.log(`Written to: ${boldText(output)}`);
  }
}

export function printIndexHelp(): void {
  const lines = [
    'Usage: tmd index [options]',
    '',
    'Parse markdown files and generate todos.json index.',
    '',
    'Options:',
    '  --file, -f <path>    Input file (repeatable)',
    '  --output, -o <path>  Output file path (default: todos.json)',
    '  --config, -c <path>  Path to config file',
    '  --quiet, -q          Suppress output except errors',
    '  --json               Output as JSON',
    '',
    'Examples:',
    '  tmd index',
    '  tmd index -f todos.md -f projects/work.md',
    '  tmd index --output todos.json',
  ];
  console.log(lines.join('\n'));
}
