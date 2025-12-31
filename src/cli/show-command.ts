/**
 * tmd show - Display detailed information about a single task
 */

import { readIndexFile } from '../indexer/index-file.js';
import { getGlobalConfigPath, loadConfig, resolveOutput } from '../config/loader.js';
import { extractBooleanFlags, extractFlags } from './flag-utils.js';
import { CliUsageError } from './errors.js';
import type { Task, TaskIndex } from '../schema/index.js';
import { boldText, dimText, cyanText, greenText } from './terminal.js';

interface ShowOptions {
  globalId: string;
  json: boolean;
  output: string;
}

export function handleShowCommand(args: string[]): void {
  const options = parseShowFlags(args);
  runShow(options);
}

function parseShowFlags(args: string[]): ShowOptions {
  const boolFlags = extractBooleanFlags(args, ['--json', '--global-config', '-G']);
  const valueFlags = extractFlags(args, ['--config', '-c', '--output', '-o']);

  const useGlobalConfig = boolFlags.has('--global-config') || boolFlags.has('-G');
  const configPath = useGlobalConfig
    ? getGlobalConfigPath()
    : (valueFlags['--config'] ?? valueFlags['-c']);
  const config = loadConfig(configPath);
  const output = resolveOutput(config, valueFlags['--output'] ?? valueFlags['-o']);

  // The global ID should be the remaining positional argument
  if (args.length === 0) {
    throw new CliUsageError('Missing task ID. Usage: tmd show <global-id>');
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
    output,
  };
}

function runShow(options: ShowOptions): void {
  // Load index
  const index = readIndexFile(options.output);
  if (!index) {
    throw new CliUsageError(`No index found. Run \`tmd index\` first.`);
  }

  // Find task
  const task = index.tasks[options.globalId];
  if (!task) {
    throw new CliUsageError(`Task '${options.globalId}' not found.`);
  }

  // Get related info
  const project = index.projects[task.projectId];
  const parent = task.parentId ? (index.tasks[task.parentId] ?? null) : null;
  const children = task.childrenIds
    .map((id) => index.tasks[id])
    .filter((t): t is Task => t !== undefined);

  if (options.json) {
    console.log(formatShowJson(task, project, parent, children));
  } else {
    console.log(formatShowText(task, project, parent, children, index));
  }
}

function formatShowJson(
  task: Task,
  project: { id: string; name: string; area?: string } | undefined,
  parent: Task | null,
  children: Task[]
): string {
  const output = {
    globalId: task.globalId,
    localId: task.localId,
    projectId: task.projectId,
    text: task.text,
    completed: task.completed,
    metadata: {
      energy: task.energy,
      est: task.est,
      due: task.due,
      plan: task.plan,
      bucket: task.bucket,
      area: task.area,
      tags: task.tags,
      created: task.created,
      updated: task.updated,
    },
    project: project
      ? {
          id: project.id,
          name: project.name,
          area: project.area,
        }
      : null,
    location: {
      filePath: task.filePath,
      lineNumber: task.lineNumber,
    },
    hierarchy: {
      parentId: task.parentId,
      parentText: parent?.text ?? null,
      childrenIds: task.childrenIds,
    },
  };

  return JSON.stringify(output, null, 2);
}

function formatShowText(
  task: Task,
  project: { id: string; name: string; area?: string } | undefined,
  parent: Task | null,
  children: Task[],
  _index: TaskIndex
): string {
  const lines: string[] = [];

  // Header
  lines.push(`Task: ${cyanText(task.globalId)}`);
  lines.push(`Text: ${task.text}`);
  lines.push(`Status: ${task.completed ? dimText('done') : greenText('open')}`);
  lines.push('');

  // Project info
  if (project) {
    lines.push(`Project: ${boldText(project.id)} (${project.name})`);
  } else {
    lines.push(`Project: ${task.projectId}`);
  }
  if (task.area) {
    lines.push(`Area: ${task.area}`);
  }
  lines.push('');

  // Metadata section
  const metaLines: string[] = [];
  if (task.energy) metaLines.push(`  energy: ${task.energy}`);
  if (task.est) metaLines.push(`  est: ${task.est}`);
  if (task.due) metaLines.push(`  due: ${task.due}`);
  if (task.plan) metaLines.push(`  plan: ${task.plan}`);
  if (task.bucket) metaLines.push(`  bucket: ${task.bucket}`);
  if (task.tags && task.tags.length > 0) metaLines.push(`  tags: ${task.tags.join(', ')}`);
  if (task.created) metaLines.push(`  created: ${task.created}`);
  if (task.updated) metaLines.push(`  updated: ${task.updated}`);

  if (metaLines.length > 0) {
    lines.push('Metadata:');
    lines.push(...metaLines);
    lines.push('');
  }

  // Location
  lines.push('Location:');
  lines.push(`  File: ${task.filePath}`);
  lines.push(`  Line: ${task.lineNumber}`);
  lines.push('');

  // Hierarchy
  lines.push('Hierarchy:');
  if (parent) {
    lines.push(`  Parent: ${cyanText(task.parentId!)} (${parent.text})`);
  } else {
    lines.push(`  Parent: ${dimText('none (top-level)')}`);
  }

  if (children.length > 0) {
    lines.push('  Children:');
    for (const child of children) {
      lines.push(`    - ${cyanText(child.globalId)} (${child.text})`);
    }
  } else {
    lines.push(`  Children: ${dimText('none')}`);
  }

  return lines.join('\n');
}

export function printShowHelp(): void {
  const lines = [
    'Usage: tmd show <global-id> [options]',
    '',
    'Display detailed information about a single task.',
    '',
    'Arguments:',
    '  <global-id>           Task global ID (e.g., as-onb:1.1)',
    '',
    'Options:',
    '  --json                Output as JSON',
    '  --config, -c <path>   Path to config file',
    '  --output, -o <path>   Path to todos.json (default: from config)',
    '',
    'Examples:',
    '  tmd show as-onb:1.1',
    '  tmd show inbox:1 --json',
  ];
  console.log(lines.join('\n'));
}
