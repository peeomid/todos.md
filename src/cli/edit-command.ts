/**
 * tmd edit - Edit task metadata
 */

import fs from 'node:fs';
import { type Config, getGlobalConfigPath, loadConfig, resolveFiles, resolveOutput } from '../config/loader.js';
import { readIndexFile, writeIndexFile } from '../indexer/index-file.js';
import { buildIndex } from '../indexer/indexer.js';
import { parseMetadataBlock, serializeMetadata } from '../parser/metadata-parser.js';
import type { Task } from '../schema/index.js';
import { todayLocalIso } from '../utils/date.js';
import { runAutoSyncIfNeeded } from './auto-sync.js';
import { parseRelativeDate } from './date-utils.js';
import { CliUsageError } from './errors.js';
import { extractBooleanFlags, extractFlags, extractMultipleFlags } from './flag-utils.js';
import { greenText } from './terminal.js';

interface EditOptions {
  globalId: string;
  changes: MetadataChange[];
  json: boolean;
  noReindex: boolean;
  noSync: boolean;
  output: string;
  files: string[];
  config: Config;
  configPath?: string | null;
}

interface MetadataChange {
  field: string;
  value: string | null; // null means remove
  previousValue: string | null;
}

interface EditResult {
  success: boolean;
  task: {
    globalId: string;
    text: string;
  };
  changes: MetadataChange[];
  file: {
    path: string;
    line: number;
  };
  reindexed: boolean;
  synced: boolean;
}

export function handleEditCommand(args: string[]): void {
  const options = parseEditFlags(args);
  runEdit(options);
}

function parseEditFlags(args: string[]): EditOptions {
  const boolFlags = extractBooleanFlags(args, ['--json', '--no-reindex', '--no-sync', '--global-config', '-G']);

  const valueFlags = extractFlags(args, [
    '--energy',
    '--priority',
    '--est',
    '--due',
    '--plan',
    '--bucket',
    '--area',
    '--tags',
    '--add-tag',
    '--remove-tag',
    '--config',
    '-c',
    '--output',
    '-o',
  ]);
  const fileFlags = extractMultipleFlags(args, ['--file', '-f']);

  const useGlobalConfig = boolFlags.has('--global-config') || boolFlags.has('-G');
  const configPath = useGlobalConfig ? getGlobalConfigPath() : (valueFlags['--config'] ?? valueFlags['-c'] ?? null);
  const config = loadConfig(configPath ?? undefined);
  const output = resolveOutput(config, valueFlags['--output'] ?? valueFlags['-o']);
  const files = resolveFiles(config, fileFlags);

  // The global ID should be the remaining positional argument
  if (args.length === 0) {
    throw new CliUsageError('Missing task ID. Usage: tmd edit <global-id> [options]');
  }

  const globalId = args[0]!;

  // Validate ID format (should contain ':')
  if (!globalId.includes(':')) {
    throw new CliUsageError(`Invalid task ID format: '${globalId}'. Expected 'project:localId' (e.g., 'as-onb:1.1').`);
  }

  // Collect changes
  const changes: { field: string; value: string | null }[] = [];

  if (valueFlags['--energy']) {
    const energy = valueFlags['--energy'];
    if (!['low', 'normal', 'high'].includes(energy)) {
      throw new CliUsageError(`Invalid energy level: '${energy}'. Use low, normal, or high.`);
    }
    changes.push({ field: 'energy', value: energy });
  }

  if (valueFlags['--priority']) {
    const priority = valueFlags['--priority'];
    if (!['high', 'normal', 'low', 'none'].includes(priority)) {
      throw new CliUsageError(`Invalid priority: '${priority}'. Use high, normal, low, or none.`);
    }
    changes.push({ field: 'priority', value: priority === 'none' ? null : priority });
  }

  if (valueFlags['--est']) {
    changes.push({ field: 'est', value: valueFlags['--est'] === 'none' ? null : valueFlags['--est'] });
  }

  if (valueFlags['--due']) {
    const due = valueFlags['--due'];
    changes.push({ field: 'due', value: due === 'none' ? null : parseRelativeDate(due) });
  }

  if (valueFlags['--plan']) {
    const plan = valueFlags['--plan'];
    changes.push({ field: 'plan', value: plan === 'none' ? null : parseRelativeDate(plan) });
  }

  if (valueFlags['--bucket']) {
    const bucket = valueFlags['--bucket'];
    changes.push({ field: 'bucket', value: bucket === 'none' ? null : bucket });
  }

  if (valueFlags['--area']) {
    changes.push({ field: 'area', value: valueFlags['--area'] === 'none' ? null : valueFlags['--area'] });
  }

  if (valueFlags['--tags']) {
    changes.push({ field: 'tags', value: valueFlags['--tags'] === 'none' ? null : valueFlags['--tags'] });
  }

  // Tag operations are handled specially
  if (valueFlags['--add-tag']) {
    changes.push({ field: '__add_tag', value: valueFlags['--add-tag'] });
  }

  if (valueFlags['--remove-tag']) {
    changes.push({ field: '__remove_tag', value: valueFlags['--remove-tag'] });
  }

  if (changes.length === 0) {
    throw new CliUsageError('No changes specified. Use --energy, --due, --plan, --bucket, etc.');
  }

  return {
    globalId,
    changes: changes.map((c) => ({ ...c, previousValue: null })),
    json: boolFlags.has('--json'),
    noReindex: boolFlags.has('--no-reindex'),
    noSync: boolFlags.has('--no-sync'),
    output,
    files,
    config,
    configPath,
  };
}

function runEdit(options: EditOptions): void {
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

  // Apply changes to the file
  const result = editTaskMetadata(task, options.changes);

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
    const output: EditResult = {
      success: true,
      task: {
        globalId: task.globalId,
        text: task.text,
      },
      changes: result.changes,
      file: {
        path: task.filePath,
        line: task.lineNumber,
      },
      reindexed,
      synced,
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`${greenText('Updated:')} ${globalId} (${task.text})`);
    for (const change of result.changes) {
      const prev = change.previousValue ?? 'none';
      const next = change.value ?? 'none';
      if (change.field.startsWith('__')) {
        // Tag operation
        if (change.field === '__add_tag') {
          console.log(`  Added tag: ${change.value}`);
        } else if (change.field === '__remove_tag') {
          console.log(`  Removed tag: ${change.value}`);
        }
      } else {
        console.log(`  Changed: ${change.field} (${prev} → ${next})`);
      }
    }
    console.log(`  File: ${task.filePath}:${task.lineNumber}`);
  }
}

interface EditMetadataResult {
  success: boolean;
  changes: MetadataChange[];
}

function editTaskMetadata(task: Task, changes: MetadataChange[]): EditMetadataResult {
  // Read file
  const content = fs.readFileSync(task.filePath, 'utf-8');
  const lines = content.split('\n');

  const lineIndex = task.lineNumber - 1;
  if (lineIndex < 0 || lineIndex >= lines.length) {
    throw new Error(`Line ${task.lineNumber} out of range`);
  }

  const line = lines[lineIndex]!;

  // Parse the line to extract checkbox, text, and metadata
  const taskMatch = line.match(/^(\s*)- \[([ xX])\]\s+(.+)$/);
  if (!taskMatch) {
    throw new Error(`Line ${task.lineNumber} is not a task`);
  }

  const [, indent, checkbox, taskContent] = taskMatch;
  const { metadata, textWithoutMetadata } = parseMetadataBlock(taskContent!);

  // Apply changes
  const appliedChanges: MetadataChange[] = [];

  for (const change of changes) {
    if (change.field === '__add_tag') {
      // Add tag
      const currentTags = metadata.tags ? metadata.tags.split(',') : [];
      if (change.value && !currentTags.includes(change.value)) {
        currentTags.push(change.value);
        metadata.tags = currentTags.join(',');
        appliedChanges.push({
          field: '__add_tag',
          value: change.value,
          previousValue: null,
        });
      }
    } else if (change.field === '__remove_tag') {
      // Remove tag
      const currentTags = metadata.tags ? metadata.tags.split(',') : [];
      const idx = currentTags.indexOf(change.value!);
      if (idx !== -1) {
        currentTags.splice(idx, 1);
        metadata.tags = currentTags.length > 0 ? currentTags.join(',') : '';
        appliedChanges.push({
          field: '__remove_tag',
          value: change.value,
          previousValue: null,
        });
      }
    } else {
      // Regular field change
      const previousValue = metadata[change.field] ?? null;
      if (change.value === null) {
        delete metadata[change.field];
      } else {
        metadata[change.field] = change.value;
      }
      appliedChanges.push({
        field: change.field,
        value: change.value,
        previousValue,
      });
    }
  }

  // Set updated date
  metadata.updated = todayLocalIso();

  // Remove empty tags field
  if (metadata.tags === '') {
    delete metadata.tags;
  }

  // Rebuild line
  const orderedMetadata = orderMetadata(metadata);
  const metadataStr = serializeMetadata(orderedMetadata);
  const newLine = `${indent}- [${checkbox}] ${textWithoutMetadata}${metadataStr ? ` ${metadataStr}` : ''}`;

  // Write file
  lines[lineIndex] = newLine;
  fs.writeFileSync(task.filePath, lines.join('\n'), 'utf-8');

  return {
    success: true,
    changes: appliedChanges,
  };
}

function orderMetadata(metadata: Record<string, string>): Record<string, string> {
  const ordered: Record<string, string> = {};

  // id first
  if (metadata.id) {
    ordered.id = metadata.id;
  }

  // Then alphabetically
  const otherKeys = Object.keys(metadata)
    .filter((k) => k !== 'id')
    .sort();
  for (const key of otherKeys) {
    const value = metadata[key];
    if (value) {
      ordered[key] = value;
    }
  }

  return ordered;
}

export function printEditHelp(): void {
  console.log(`Usage: tmd edit <global-id> [options]

Edit task metadata.

Arguments:
  <global-id>           Task global ID (e.g., as-onb:1.1)

Options:
  --energy <level>      Set energy (low, normal, high)
  --priority <level>    Set priority (high, normal, low, or none to remove)
  --est <duration>      Set estimate (15m, 30m, 1h, etc., or none)
  --due <date>          Set due date (YYYY-MM-DD, today, tomorrow, +Nd, +Nw, or none)
  --plan <date>         Set plan date (YYYY-MM-DD, today, tomorrow, +Nd, +Nw, or none)
  --bucket <name>       Set bucket (today, upcoming, anytime, someday, now, custom, or none)
  --area <name>         Set area (or none to remove)
  --tags <tags>         Set tags (comma-separated, or none to remove)
  --add-tag <tag>       Add a single tag
  --remove-tag <tag>    Remove a single tag
  --json                Output as JSON
  --no-reindex          Don't update todos.json after edit
  --no-sync             Don't run tmd sync after edit
  --file, -f <path>     Input file(s) used when reindexing (repeatable)
  -c, --config          Path to config file
  -o, --output          Override output file path

Examples:
  tmd edit as-onb:1.1 --due 2025-12-20
  tmd edit inbox:1 --energy high --priority high
  tmd edit inbox:1 --bucket today --plan today
  tmd edit as-onb:1 --add-tag urgent
  tmd edit inbox:1 --due none
`);
}
