/**
 * tmd interactive - Full-screen terminal UI
 */

import fs from 'node:fs';
import { enrichFiles } from '../enricher/index.js';
import { buildIndex } from '../indexer/index.js';
import { writeIndexFile, readIndexFile } from '../indexer/index-file.js';
import { loadConfig, resolveFiles, resolveOutput, type Config } from '../config/loader.js';
import { extractFlags, extractMultipleFlags } from './flag-utils.js';
import { CliUsageError, FileNotFoundError } from './errors.js';
import { runInteractiveTui } from '../tui/interactive.js';
import { handleSyncCommand } from './sync-command.js';

interface InteractiveOptions {
  files: string[];
  output: string;
  config: Config;
  configPath?: string | null;
}

export async function handleInteractiveCommand(args: string[]): Promise<void> {
  const options = parseInteractiveFlags(args);
  await runInteractive(options);
}

export function printInteractiveHelp(): void {
  console.log(`Usage: tmd interactive [options]

Launch the full-screen interactive TUI.

On start:
  - runs \`tmd enrich\`
  - runs \`tmd index\`
  - loads the index into memory

On exit:
  - runs \`tmd index\` again
  - runs \`tmd sync\` once (if views are configured)

Options:
  --file, --input, -f <path>    Input file (repeatable)
  --config, -c <path>           Path to config file
  --output, --out, -o <path>    Override output file path
  -h, --help           Show help
`);
}

function parseInteractiveFlags(args: string[]): InteractiveOptions {
  const valueFlags = extractFlags(args, ['--config', '-c', '--output', '--out', '-o']);
  const fileFlags = extractMultipleFlags(args, ['--file', '--input', '-f']);

  const configPath = valueFlags['--config'] ?? valueFlags['-c'] ?? null;
  const config = loadConfig(configPath ?? undefined);
  const output = resolveOutput(config, valueFlags['--output'] ?? valueFlags['--out'] ?? valueFlags['-o']);
  const files = resolveFiles(config, fileFlags);

  return { files, output, config, configPath };
}

async function runInteractive(options: InteractiveOptions): Promise<void> {
  const { files, output, config, configPath } = options;

  // Validate files exist
  for (const file of files) {
    if (!fs.existsSync(file)) {
      throw new FileNotFoundError(file);
    }
  }

  console.log('Starting…');
  console.log('Running enrich…');
  enrichFiles(files, { keepShorthands: false, dryRun: false });

  console.log('Running index…');
  const { index } = buildIndex(files);
  writeIndexFile(index, output);

  console.log('Loading index…');
  const loaded = readIndexFile(output);
  if (!loaded) {
    throw new CliUsageError(`Failed to load index. Expected file at: ${output}`);
  }

  const finalIndex = await runInteractiveTui({
    index: loaded,
    config,
    configPath,
    files,
    output,
  });

  console.log('Exiting…');
  console.log('Reindexing…');
  writeIndexFile(finalIndex, output);

  const hasViews = (config.views?.length ?? 0) > 0;
  if (hasViews) {
    console.log('Syncing…');
    const syncArgs: string[] = [];
    if (configPath) {
      syncArgs.push('--config', configPath);
    }
    syncArgs.push('--output', output);
    handleSyncCommand(syncArgs);
  }

  console.log('Done.');
}
