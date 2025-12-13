/**
 * tmd list - Query and list tasks from the index
 *
 * Supports both old-style flags (--project, --energy) and new key:value syntax (project:id, energy:low)
 */

import { readIndexFile } from '../indexer/index-file.js';
import { loadConfig, resolveOutput } from '../config/loader.js';
import { extractBooleanFlags, extractFlags } from './flag-utils.js';
import { CliUsageError } from './errors.js';
import type { Task, Energy, Priority, TaskIndex } from '../schema/index.js';
import {
  parseFilterArgs,
  buildFiltersFromOptions,
  composeFilters,
  filterByStatus,
  sortTasks,
  groupTasks,
  type FilterOptions,
  type TaskFilter,
  type SortField,
  type GroupField,
} from './list-filters.js';
import {
  formatCompactGrouped,
  formatCompactFlat,
  formatFull,
  formatJson,
  type FormatStyle,
} from './list-formatters.js';

interface ListOptions {
  // Filters (from key:value syntax or legacy flags)
  filterOptions: FilterOptions;

  // Display
  json: boolean;
  format: FormatStyle;
  groupBy: GroupField;
  sortBy: SortField;
  limit?: number;

  // Config
  output: string;
}

export function handleListCommand(args: string[]): void {
  const options = parseListFlags(args);
  runList(options);
}

function parseListFlags(args: string[]): ListOptions {
  const boolFlags = extractBooleanFlags(args, ['--json']);

  const valueFlags = extractFlags(args, [
    '--format',
    '-f',
    '--group-by',
    '-g',
    '--sort',
    '-s',
    '--limit',
    '-l',
    '--config',
    '-c',
    '--output',
    '-o',
  ]);

  const configPath = valueFlags['--config'] ?? valueFlags['-c'];
  const config = loadConfig(configPath);
  const output = resolveOutput(config, valueFlags['--output'] ?? valueFlags['-o']);

  // Parse key:value filters from remaining args
  const filterOptions = parseFilterArgs(args);

  // Default status to 'open' if not specified
  if (!filterOptions.status) {
    filterOptions.status = 'open';
  }

  // Validate format
  const formatRaw = valueFlags['--format'] ?? valueFlags['-f'] ?? 'compact';
  if (!['compact', 'full', 'markdown'].includes(formatRaw)) {
    throw new CliUsageError(`Invalid format: '${formatRaw}'. Use compact, full, or markdown.`);
  }
  const format = formatRaw as FormatStyle;

  // Validate group-by
  const groupByRaw = valueFlags['--group-by'] ?? valueFlags['-g'] ?? 'project';
  if (!['project', 'area', 'due', 'bucket', 'none'].includes(groupByRaw)) {
    throw new CliUsageError(`Invalid group-by: '${groupByRaw}'. Use project, area, due, bucket, or none.`);
  }
  const groupBy = groupByRaw as GroupField;

  // Validate sort
  const sortByRaw = valueFlags['--sort'] ?? valueFlags['-s'] ?? 'project';
  if (!['due', 'created', 'project', 'energy', 'priority', 'bucket'].includes(sortByRaw)) {
    throw new CliUsageError(`Invalid sort: '${sortByRaw}'. Use due, created, project, energy, priority, or bucket.`);
  }
  const sortBy = sortByRaw as SortField;

  // Parse limit
  const limitRaw = valueFlags['--limit'] ?? valueFlags['-l'];
  let limit: number | undefined;
  if (limitRaw) {
    limit = parseInt(limitRaw, 10);
    if (isNaN(limit) || limit < 1) {
      throw new CliUsageError(`Invalid limit: '${limitRaw}'. Must be a positive number.`);
    }
  }

  return {
    filterOptions,
    json: boolFlags.has('--json'),
    format,
    groupBy,
    sortBy,
    limit,
    output,
  };
}

function runList(options: ListOptions): void {
  // Load index
  const index = readIndexFile(options.output);
  if (!index) {
    throw new CliUsageError(`No index found. Run \`tmd index\` first.`);
  }

  // Build filters from options
  const filters = buildFiltersFromOptions(options.filterOptions);

  // Apply filters
  const composedFilter = composeFilters(filters);
  let tasks = Object.values(index.tasks).filter(composedFilter);

  // Sort
  tasks = sortTasks(tasks, options.sortBy);

  // Limit
  if (options.limit) {
    tasks = tasks.slice(0, options.limit);
  }

  // Format output
  if (options.json) {
    const output = formatJson(tasks, options.filterOptions);
    console.log(output);
    return;
  }

  if (options.format === 'full') {
    console.log(formatFull(tasks, index));
    return;
  }

  if (options.format === 'markdown') {
    console.log(formatMarkdown(tasks));
    return;
  }

  // Compact format
  if (options.groupBy === 'none') {
    console.log(formatCompactFlat(tasks));
  } else {
    const groups = groupTasks(tasks, options.groupBy);
    console.log(formatCompactGrouped(groups, index, options.groupBy));
  }
}

/**
 * Format tasks as markdown (same format as sync blocks)
 */
function formatMarkdown(tasks: Task[]): string {
  if (tasks.length === 0) {
    return '(no tasks)';
  }

  const lines: string[] = [];
  for (const task of tasks) {
    const checkbox = task.completed ? '[x]' : '[ ]';
    const metadata: string[] = [`id:${task.globalId}`];

    if (task.energy) metadata.push(`energy:${task.energy}`);
    if (task.priority) metadata.push(`priority:${task.priority}`);
    if (task.est) metadata.push(`est:${task.est}`);
    if (task.due) metadata.push(`due:${task.due}`);
    if (task.plan) metadata.push(`plan:${task.plan}`);
    if (task.bucket) metadata.push(`bucket:${task.bucket}`);

    const metaStr = metadata.length > 0 ? ` [${metadata.join(' ')}]` : '';
    lines.push(`- ${checkbox} ${task.text}${metaStr}`);
  }

  return lines.join('\n');
}

export function printListHelp(): void {
  const lines = [
    'Usage: tmd list [filters...] [options]',
    '',
    'List and query tasks from the index using key:value filter syntax.',
    '',
    'Filter Syntax (key:value):',
    '  project:<id>          Filter by project ID',
    '  area:<name>           Filter by area',
    '  energy:<level>        Filter by energy (low, normal, high)',
    '  priority:<level>      Filter by priority (high, normal, low)',
    '  due:<date>            Filter by due date (today, tomorrow, this-week, YYYY-MM-DD)',
    '  plan:<date>           Filter by plan date',
    '  bucket:<name>         Filter by bucket (today, upcoming, anytime, someday)',
    '  overdue:true          Show only overdue tasks',
    '  status:<status>       Filter by status (open, done, all) [default: open]',
    '  tags:<tags>           Filter by tags (comma-separated)',
    '  parent:<id>           Show children of a task',
    '  top-level:true        Show only top-level tasks',
    '  text:<query>          Full-text search in task text',
    '',
    'Display Options:',
    '  --json                Output as JSON',
    '  --format, -f <fmt>    Output format (compact, full, markdown) [default: compact]',
    '  --group-by, -g <fld>  Group by (project, area, due, bucket, none) [default: project]',
    '  --sort, -s <field>    Sort by (due, created, project, energy, priority, bucket)',
    '  --limit, -l <n>       Limit number of results',
    '',
    'Examples:',
    '  tmd list                          # List all open tasks',
    '  tmd list project:inbox            # Filter by project',
    '  tmd list energy:low               # Light tasks only',
    '  tmd list bucket:today             # Today\'s tasks',
    '  tmd list priority:high            # High priority tasks',
    '  tmd list due:today                # Due today',
    '  tmd list overdue:true             # Overdue tasks',
    '  tmd list status:done              # Completed tasks',
    '  tmd list bucket:today --sort priority  # Today by priority',
    '  tmd list --json                   # JSON output',
    '  tmd list --format markdown        # Markdown format',
    '  tmd list --group-by bucket        # Group by bucket',
  ];
  console.log(lines.join('\n'));
}
