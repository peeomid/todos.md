/**
 * tmd sync - Bidirectional sync between source files and view files
 *
 * Phase 1 (PULL): Read done tasks from view files → update source files
 * Phase 2 (PUSH): Query index → regenerate view file blocks
 */

import fs from 'node:fs';
import { getGlobalConfigPath, loadConfig, resolveFiles, resolveOutput } from '../config/loader.js';
import { markTaskDone } from '../editor/task-editor.js';
import { readIndexFile, writeIndexFile } from '../indexer/index-file.js';
import { buildIndex } from '../indexer/indexer.js';
import type { Task, TaskIndex } from '../schema/index.js';
import { renderTasksAsMarkdown } from '../sync/task-renderer.js';
import { findTmdBlocks, parseTasksInBlock, replaceBlockContent } from '../sync/tmd-block.js';
import { CliUsageError } from './errors.js';
import { extractBooleanFlags, extractFlags, extractMultipleFlags } from './flag-utils.js';
import {
  applyDefaultStatusToGroups,
  buildFilterGroups,
  composeFilterGroups,
  parseQueryToFilterGroups,
  sortTasks,
} from './list-filters.js';
import { dimText } from './terminal.js';

interface SyncOptions {
  viewFiles: string[];
  pushOnly: boolean;
  pullOnly: boolean;
  dryRun: boolean;
  json: boolean;
  output: string;
  files: string[];
}

interface PullResult {
  tasksMarkedDone: Array<{
    globalId: string;
    text: string;
    sourceFile: string;
    sourceLine: number;
    foundInView: string;
  }>;
  alreadyDone: string[];
}

interface PushResult {
  files: Array<{
    path: string;
    blocks: Array<{
      query: string;
      taskCount: number;
    }>;
  }>;
}

interface SyncResult {
  success: boolean;
  pull: PullResult;
  push: PushResult;
  dryRun: boolean;
}

export function handleSyncCommand(args: string[]): void {
  const options = parseSyncFlags(args);
  runSync(options);
}

function parseSyncFlags(args: string[]): SyncOptions {
  const boolFlags = extractBooleanFlags(args, [
    '--push-only',
    '--pull-only',
    '--dry-run',
    '--json',
    '--global-config',
    '-G',
  ]);

  const valueFlags = extractFlags(args, ['--config', '-c', '--output', '-o']);

  // Extract multiple --file/-f flags
  const fileFlags = extractMultipleFlags(args, ['--file', '-f']);

  const useGlobalConfig = boolFlags.has('--global-config') || boolFlags.has('-G');
  const configPath = useGlobalConfig ? getGlobalConfigPath() : (valueFlags['--config'] ?? valueFlags['-c']);
  const config = loadConfig(configPath);
  const output = resolveOutput(config, valueFlags['--output'] ?? valueFlags['-o']);
  const files = resolveFiles(config, []);

  // Resolve view files
  let viewFiles: string[] = [];
  if (fileFlags.length > 0) {
    viewFiles = fileFlags;
  } else if (config.views && config.views.length > 0) {
    viewFiles = config.views;
  }

  if (viewFiles.length === 0) {
    throw new CliUsageError("No view files specified. Use --file or configure 'views' in .todosmd.json");
  }

  // Validate view files exist
  for (const viewFile of viewFiles) {
    if (!fs.existsSync(viewFile)) {
      throw new CliUsageError(`View file not found: ${viewFile}`);
    }
  }

  return {
    viewFiles,
    pushOnly: boolFlags.has('--push-only'),
    pullOnly: boolFlags.has('--pull-only'),
    dryRun: boolFlags.has('--dry-run'),
    json: boolFlags.has('--json'),
    output,
    files,
  };
}

function runSync(options: SyncOptions): void {
  const { viewFiles, pushOnly, pullOnly, dryRun, json, output, files } = options;

  // Load index
  let index = readIndexFile(output);
  if (!index) {
    throw new CliUsageError(`No index found. Run \`tmd index\` first.`);
  }

  const result: SyncResult = {
    success: true,
    pull: { tasksMarkedDone: [], alreadyDone: [] },
    push: { files: [] },
    dryRun,
  };

  if (!json && !dryRun) {
    console.log(`Syncing ${viewFiles.length} view file(s)...`);
    console.log('');
  } else if (!json && dryRun) {
    console.log(`Syncing ${viewFiles.length} view file(s)... (dry run)`);
    console.log('');
  }

  // Phase 1: PULL (unless --push-only)
  if (!pushOnly) {
    if (!json) {
      console.log('Phase 1: Pulling done tasks from views');
    }

    for (const viewFile of viewFiles) {
      const pullResult = pullDoneFromView(viewFile, index, dryRun);
      result.pull.tasksMarkedDone.push(...pullResult.tasksMarkedDone);
      result.pull.alreadyDone.push(...pullResult.alreadyDone);

      if (!json) {
        console.log(`  ${viewFile}`);
        for (const task of pullResult.tasksMarkedDone) {
          const prefix = dryRun ? '→' : '✓';
          const action = dryRun ? 'would mark done' : 'marked done in source';
          console.log(`    ${prefix} ${task.globalId} - ${action} (${task.text})`);
        }
        for (const id of pullResult.alreadyDone) {
          console.log(`    · ${id} - already done in source`);
        }
      }
    }

    // Reindex after pull (if changes were made)
    if (result.pull.tasksMarkedDone.length > 0 && !dryRun) {
      if (!json) {
        console.log('  Reindexing...');
      }
      const { index: newIndex } = buildIndex(files);
      writeIndexFile(newIndex, output);
      index = newIndex;
    }

    if (!json) {
      console.log('');
    }
  }

  // Phase 2: PUSH (unless --pull-only)
  if (!pullOnly) {
    if (!json) {
      console.log('Phase 2: Regenerating view blocks');
    }

    for (const viewFile of viewFiles) {
      const pushResult = regenerateViewBlocks(viewFile, index, dryRun);
      result.push.files.push(pushResult);

      if (!json) {
        console.log(`  ${viewFile}`);
        for (const block of pushResult.blocks) {
          console.log(`    Block: ${block.query} → ${block.taskCount} tasks`);
        }
      }
    }

    if (!json) {
      console.log('');
    }
  }

  // Summary
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('Summary:');
    console.log(`  Tasks marked done: ${result.pull.tasksMarkedDone.length}`);
    console.log(`  Views updated: ${result.push.files.length}`);
    if (dryRun) {
      console.log('');
      console.log(dimText('No files modified (dry run).'));
    }
  }
}

/**
 * Pull done tasks from a view file back to source files
 */
function pullDoneFromView(
  viewFile: string,
  index: TaskIndex,
  dryRun: boolean
): { tasksMarkedDone: PullResult['tasksMarkedDone']; alreadyDone: string[] } {
  const content = fs.readFileSync(viewFile, 'utf-8');
  const blocks = findTmdBlocks(content);

  const tasksMarkedDone: PullResult['tasksMarkedDone'] = [];
  const alreadyDone: string[] = [];

  for (const block of blocks) {
    const blockTasks = parseTasksInBlock(block.content);

    for (const blockTask of blockTasks) {
      if (!blockTask.completed) {
        continue; // Only interested in done tasks
      }

      const task = index.tasks[blockTask.globalId];
      if (!task) {
        // Task not found in index - skip
        continue;
      }

      if (task.completed) {
        // Already done in source
        alreadyDone.push(blockTask.globalId);
        continue;
      }

      // Mark as done in source
      if (!dryRun) {
        markTaskDone(task.filePath, task.lineNumber, task.text);
      }
      task.completed = true;

      tasksMarkedDone.push({
        globalId: task.globalId,
        text: task.text,
        sourceFile: task.filePath,
        sourceLine: task.lineNumber,
        foundInView: viewFile,
      });

      const cascadedChildren = cascadeMarkDoneFromView(task, index, dryRun);
      for (const child of cascadedChildren) {
        if (tasksMarkedDone.some((existing) => existing.globalId === child.globalId)) {
          continue;
        }
        tasksMarkedDone.push({
          globalId: child.globalId,
          text: child.text,
          sourceFile: child.filePath,
          sourceLine: child.lineNumber,
          foundInView: viewFile,
        });
      }
    }
  }

  return { tasksMarkedDone, alreadyDone };
}

/**
 * Regenerate tmd blocks in a view file
 */
function regenerateViewBlocks(
  viewFile: string,
  index: TaskIndex,
  dryRun: boolean
): { path: string; blocks: Array<{ query: string; taskCount: number }> } {
  let content = fs.readFileSync(viewFile, 'utf-8');
  const blocks = findTmdBlocks(content);

  const blockResults: Array<{ query: string; taskCount: number }> = [];

  // Process blocks in reverse order to maintain line numbers
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i]!;

    // Parse query and build filters
    let filterGroups: string[][];
    try {
      filterGroups = parseQueryToFilterGroups(block.query);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid query syntax.';
      throw new CliUsageError(`Invalid query in block "${block.query}": ${message}`);
    }

    filterGroups = applyDefaultStatusToGroups(filterGroups, 'open');

    // Build and apply filters
    const groupFilters = buildFilterGroups(filterGroups);
    const composedFilter = composeFilterGroups(groupFilters);
    let tasks = Object.values(index.tasks).filter(composedFilter);

    // Sort by bucket, then plan/due, then priority, then id
    tasks = sortTasks(tasks, 'bucket');

    // Render tasks
    const newContent = renderTasksAsMarkdown(tasks);

    // Replace block content
    content = replaceBlockContent(content, block, newContent);

    blockResults.unshift({
      query: block.query,
      taskCount: tasks.length,
    });
  }

  // Write file
  if (!dryRun) {
    fs.writeFileSync(viewFile, content, 'utf-8');
  }

  return {
    path: viewFile,
    blocks: blockResults,
  };
}

function cascadeMarkDoneFromView(task: Task, index: TaskIndex, dryRun: boolean): Task[] {
  const cascaded: Task[] = [];

  function process(parent: Task): void {
    for (const childId of parent.childrenIds) {
      const child = index.tasks[childId];
      if (!child) continue;

      if (!child.completed) {
        if (!dryRun) {
          markTaskDone(child.filePath, child.lineNumber, child.text);
        }
        child.completed = true;
        cascaded.push(child);
      }

      process(child);
    }
  }

  process(task);
  return cascaded;
}

export function printSyncHelp(): void {
  console.log(`Usage: tmd sync [options]

Bidirectional sync between source files and view files.

Phase 1 (PULL): Read done tasks from view files → update source files
Phase 2 (PUSH): Query index → regenerate view file blocks

Options:
  --file, -f <path>     View file to sync (repeatable)
  --push-only           Skip pull phase, only regenerate views
  --pull-only           Skip push phase, only pull done tasks
  --dry-run             Show what would change, don't write
  --json                Output as JSON

Configuration:
  View files can be configured in .todosmd.json:
  {
    "files": ["todos.md"],
    "views": ["00-daily-focus.md", "weekly-plan.md"]
  }

Block Format:
  <!-- tmd:start query="status:open bucket:today" -->
  ... tasks inserted here ...
  <!-- tmd:end -->

Examples:
  tmd sync                           # Sync all configured view files
  tmd sync --file 00-daily-focus.md  # Sync specific file
  tmd sync -f daily.md -f weekly.md  # Sync multiple files
  tmd sync --dry-run                 # Preview changes
  tmd sync --push-only               # Only regenerate views
  tmd sync --pull-only               # Only pull done tasks
`);
}
