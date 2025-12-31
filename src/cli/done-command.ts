import { readIndexFile, writeIndexFile } from '../indexer/index-file.js';
import { buildIndex } from '../indexer/indexer.js';
import { markTaskDone, type EditResult } from '../editor/task-editor.js';
import { getGlobalConfigPath, loadConfig, resolveFiles, resolveOutput, type Config } from '../config/loader.js';
import { extractBooleanFlags, extractFlags, extractMultipleFlags } from './flag-utils.js';
import { CliUsageError } from './errors.js';
import { dimText, greenText } from './terminal.js';
import { runAutoSyncIfNeeded } from './auto-sync.js';
import type { Task, TaskIndex } from '../schema/index.js';

interface DoneOptions {
  globalId: string;
  json: boolean;
  noReindex: boolean;
  noSync: boolean;
  output: string;
  files: string[];
  config: Config;
  configPath?: string | null;
}

interface CascadedTask {
  globalId: string;
  text: string;
  previousStatus: 'open' | 'done';
  newStatus: 'done';
}

export function handleDoneCommand(args: string[]): void {
  const options = parseDoneFlags(args);
  runDone(options);
}

export function printDoneHelp(): void {
  console.log(`Usage: tmd done <global-id> [options]

Mark a task as completed.

Notes:
  - Cascades: all descendant subtasks are also marked done.
  - After editing, this command reindexes by default (writes todos.json) and
    runs a push-only sync if views are configured (use --no-reindex / --no-sync to skip).

Arguments:
  <global-id>       Task global ID (e.g., as-onb:1.1)

Options:
  --json            Output as JSON
  --no-reindex      Don't update todos.json after edit
  --no-sync         Don't run tmd sync after edit
  --file, -f <path> Input file(s) used when reindexing (repeatable)
  -c, --config      Path to config file
  -o, --output      Override output file path
  -h, --help        Show this help

Examples:
  tmd done as-onb:1.1
  tmd done inbox:1 --json
  tmd done as-onb:1 --no-reindex
`);
}

function parseDoneFlags(args: string[]): DoneOptions {
  const boolFlags = extractBooleanFlags(args, [
    '--json',
    '--no-reindex',
    '--no-sync',
    '--global-config',
    '-G',
  ]);
  const valueFlags = extractFlags(args, ['--config', '-c', '--output', '-o']);
  const fileFlags = extractMultipleFlags(args, ['--file', '-f']);

  const useGlobalConfig = boolFlags.has('--global-config') || boolFlags.has('-G');
  const configPath = useGlobalConfig
    ? getGlobalConfigPath()
    : (valueFlags['--config'] ?? valueFlags['-c'] ?? null);
  const config = loadConfig(configPath ?? undefined);
  const output = resolveOutput(config, valueFlags['--output'] ?? valueFlags['-o']);
  const files = resolveFiles(config, fileFlags);

  // The global ID should be the remaining positional argument
  if (args.length === 0) {
    throw new CliUsageError('Missing task ID. Usage: tmd done <global-id>');
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

function runDone(options: DoneOptions): void {
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

  // Check if already done
  if (task.completed) {
    if (json) {
      console.log(
        JSON.stringify(
          {
            success: true,
            task: {
              globalId: task.globalId,
              text: task.text,
              previousStatus: 'done',
              newStatus: 'done',
            },
            cascaded: [],
            file: {
              path: task.filePath,
              line: task.lineNumber,
            },
            reindexed: false,
            synced: false,
            message: 'Task already done',
          },
          null,
          2
        )
      );
    } else {
      console.log(`Task already done: ${globalId} (${task.text})`);
    }
    return;
  }

  // Mark task as done
  const result = markTaskDone(task.filePath, task.lineNumber, task.text);
  if (!result.success) {
    throw new CliUsageError(result.error ?? 'Failed to mark task as done');
  }

  // Cascade to children
  const cascaded = cascadeMarkDone(task, index);

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
            previousStatus: 'open',
            newStatus: 'done',
          },
          cascaded,
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
    console.log(`${greenText('Marked as done:')} ${globalId} (${task.text})`);
    if (cascaded.length > 0) {
      console.log(`  Also marked done: ${cascaded.length} subtask(s)`);
      for (const c of cascaded) {
        console.log(`    ${dimText('-')} ${c.globalId} (${c.text})`);
      }
    }
    console.log(`  File: ${task.filePath}:${task.lineNumber}`);
  }
}

/**
 * Cascade mark-as-done to all descendants of a task.
 */
function cascadeMarkDone(task: Task, index: TaskIndex): CascadedTask[] {
  const cascaded: CascadedTask[] = [];

  function processChildren(parentTask: Task): void {
    for (const childId of parentTask.childrenIds) {
      const child = index.tasks[childId];
      if (!child) continue;

      if (!child.completed) {
        const result = markTaskDone(child.filePath, child.lineNumber, child.text);
        if (result.success && !result.alreadyInState) {
          cascaded.push({
            globalId: child.globalId,
            text: child.text,
            previousStatus: 'open',
            newStatus: 'done',
          });
        }
      }

      // Recurse to grandchildren
      processChildren(child);
    }
  }

  processChildren(task);
  return cascaded;
}
