import { readIndexFile, writeIndexFile } from '../indexer/index-file.js';
import { buildIndex } from '../indexer/indexer.js';
import { markTaskUndone } from '../editor/task-editor.js';
import { loadConfig, resolveFiles, resolveOutput, type Config } from '../config/loader.js';
import { extractBooleanFlags, extractFlags, extractMultipleFlags } from './flag-utils.js';
import { CliUsageError } from './errors.js';
import { yellowText } from './terminal.js';
import { runAutoSyncIfNeeded } from './auto-sync.js';

interface UndoneOptions {
  globalId: string;
  json: boolean;
  noReindex: boolean;
  noSync: boolean;
  output: string;
  files: string[];
  config: Config;
  configPath?: string | null;
}

export function handleUndoneCommand(args: string[]): void {
  const options = parseUndoneFlags(args);
  runUndone(options);
}

export function printUndoneHelp(): void {
  console.log(`Usage: tmd undone <global-id> [options]

Mark a task as incomplete.

Arguments:
  <global-id>       Task global ID (e.g., as-onb:1.1)

Options:
  --json            Output as JSON
  --no-reindex      Don't update todos.json after edit
  --no-sync         Don't run tmd sync after edit
  -c, --config      Path to config file
  -o, --output      Override output file path
  -h, --help        Show this help

Note: Unlike 'done', undone does NOT cascade to children.

Examples:
  tmd undone as-onb:1.1
  tmd undone inbox:1 --json
`);
}

function parseUndoneFlags(args: string[]): UndoneOptions {
  const boolFlags = extractBooleanFlags(args, ['--json', '--no-reindex', '--no-sync']);
  const valueFlags = extractFlags(args, ['--config', '-c', '--output', '-o']);
  const fileFlags = extractMultipleFlags(args, ['--file', '-f']);

  const configPath = valueFlags['--config'] ?? valueFlags['-c'] ?? null;
  const config = loadConfig(configPath ?? undefined);
  const output = resolveOutput(config, valueFlags['--output'] ?? valueFlags['-o']);
  const files = resolveFiles(config, fileFlags);

  // The global ID should be the remaining positional argument
  if (args.length === 0) {
    throw new CliUsageError('Missing task ID. Usage: tmd undone <global-id>');
  }

  const globalId = args[0]!;

  // Validate ID format (should contain ':')
  if (!globalId.includes(':')) {
    throw new CliUsageError(
      `Invalid task ID format: '${globalId}'. Expected 'project:localId' (e.g., 'as-onb:1.1').`
    );
  }

  return {
    globalId,
    json: boolFlags.has('--json'),
    noReindex: boolFlags.has('--no-reindex'),
    noSync: boolFlags.has('--no-sync'),
    output,
    files,
    config,
    configPath,
  };
}

function runUndone(options: UndoneOptions): void {
  const { globalId, json, noReindex, output, files, config, configPath, noSync } = options;

  // Load index
  const index = readIndexFile(output);
  if (!index) {
    throw new CliUsageError(`No index found. Run \`tmd index\` first.`);
  }

  // Find task
  const task = index.tasks[globalId];
  if (!task) {
    throw new CliUsageError(`Task '${globalId}' not found.`);
  }

  // Check if already open
  if (!task.completed) {
    if (json) {
      console.log(
        JSON.stringify(
          {
            success: true,
            task: {
              globalId: task.globalId,
              text: task.text,
              previousStatus: 'open',
              newStatus: 'open',
            },
            file: {
              path: task.filePath,
              line: task.lineNumber,
            },
            reindexed: false,
            synced: false,
            message: 'Task already open',
          },
          null,
          2
        )
      );
    } else {
      console.log(`Task already open: ${globalId} (${task.text})`);
    }
    return;
  }

  // Mark task as undone
  const result = markTaskUndone(task.filePath, task.lineNumber, task.text);
  if (!result.success) {
    throw new CliUsageError(result.error ?? 'Failed to mark task as undone');
  }

  // No cascade for undone (per spec)

  // Reindex
  let reindexed = false;
  if (!noReindex) {
    const { index: newIndex } = buildIndex(files);
    writeIndexFile(newIndex, output);
    reindexed = true;
  }

  const synced = runAutoSyncIfNeeded({
    config,
    configPath,
    output,
    noSync,
  });

  // Output
  if (json) {
    console.log(
      JSON.stringify(
        {
          success: true,
          task: {
            globalId: task.globalId,
            text: task.text,
            previousStatus: 'done',
            newStatus: 'open',
          },
          file: {
            path: task.filePath,
            line: task.lineNumber,
          },
          reindexed,
          synced,
        },
        null,
        2
      )
    );
  } else {
    console.log(`${yellowText('Marked as undone:')} ${globalId} (${task.text})`);
    console.log(`  File: ${task.filePath}:${task.lineNumber}`);
  }
}
