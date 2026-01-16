/**
 * tmd list - Query and list tasks from the index
 *
 * Supports both old-style flags (--project, --energy) and new key:value syntax (project:id, energy:low)
 */

import { getGlobalConfigPath, loadConfig, resolveOutput } from '../config/loader.js';
import { readIndexFile } from '../indexer/index-file.js';
import type { Task } from '../schema/index.js';
import { parseDateSpec } from './date-utils.js';
import { CliUsageError } from './errors.js';
import { extractBooleanFlags, extractFlags } from './flag-utils.js';
import {
  applyDefaultStatusToGroups,
  buildFilterGroups,
  composeFilterGroups,
  type FilterOptions,
  type GroupField,
  groupTasks,
  parseFilterArg,
  parseFilterArgs,
  parseQueryToFilterGroups,
  type SortField,
  sortTasks,
} from './list-filters.js';
import {
  type FormatStyle,
  formatCompactFlat,
  formatCompactGrouped,
  formatFull,
  formatJson,
} from './list-formatters.js';

const TODAY_SHORTCUT = 'today';
const TODAY_QUERY = '(bucket:today | plan:today | due:today)';
const DATE_RANGE_REGEX = /^\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2}$/;
const STATUS_SHORTHANDS: Record<string, string> = {
  done: 'status:done',
  open: 'status:open',
  all: 'status:all',
};

interface ListOptions {
  // Filters (from key:value syntax or legacy flags)
  filterGroups: string[][];
  filterOptions: FilterOptions;
  query: string;

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

export function normalizeListQueryArgs(args: string[]): string[] {
  const hasDone = args.some((arg) => arg === 'done' || arg === 'status:done');

  return args.map((arg) => {
    if (STATUS_SHORTHANDS[arg]) return STATUS_SHORTHANDS[arg];
    if (arg === TODAY_SHORTCUT) {
      return hasDone ? 'updated:today' : TODAY_QUERY;
    }
    if (hasDone && isBareDateSpec(arg)) {
      return `updated:${arg}`;
    }
    return arg;
  });
}

function isBareDateSpec(arg: string): boolean {
  if (DATE_RANGE_REGEX.test(arg)) return true;
  if (parseFilterArg(arg)) return false;
  return parseDateSpec(arg) !== null;
}

function parseListFlags(args: string[]): ListOptions {
  const boolFlags = extractBooleanFlags(args, ['--json', '--global-config', '-G']);

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

  const useGlobalConfig = boolFlags.has('--global-config') || boolFlags.has('-G');
  const configPath = useGlobalConfig ? getGlobalConfigPath() : (valueFlags['--config'] ?? valueFlags['-c']);
  const config = loadConfig(configPath);
  const output = resolveOutput(config, valueFlags['--output'] ?? valueFlags['-o']);

  // Parse key:value filters from remaining args (plus shorthand expansions)
  const expandedArgs = normalizeListQueryArgs(args);
  const query = expandedArgs.join(' ');
  let filterGroups: string[][];
  try {
    filterGroups = parseQueryToFilterGroups(query);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid query syntax.';
    throw new CliUsageError(message);
  }

  // Default status to 'open' if not specified
  filterGroups = applyDefaultStatusToGroups(filterGroups, 'open');
  const filterOptions = parseFilterArgs(filterGroups[0] ?? []);

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
    if (Number.isNaN(limit) || limit < 1) {
      throw new CliUsageError(`Invalid limit: '${limitRaw}'. Must be a positive number.`);
    }
  }

  return {
    filterGroups,
    filterOptions,
    query,
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
  const groupFilters = buildFilterGroups(options.filterGroups);

  // Apply filters
  const composedFilter = composeFilterGroups(groupFilters);
  let tasks = Object.values(index.tasks).filter(composedFilter);

  // Sort
  tasks = sortTasks(tasks, options.sortBy);

  // Limit
  if (options.limit) {
    tasks = tasks.slice(0, options.limit);
  }

  // Format output
  if (options.json) {
    const output = formatJson(tasks, {
      filters: options.filterOptions,
      filterGroups: options.filterGroups,
      query: options.query,
    });
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
    '  due:<date>            Filter by due date spec:',
    '                        today | yesterday | tomorrow | this-week | next-week | last-7d | last-30d | YYYY-MM-DD | YYYY-MM-DD:YYYY-MM-DD',
    '  plan:<date>           Filter by plan date spec (same formats as due:)',
    '  updated:<date>        Filter by updated date spec (same formats as due:)',
    '  bucket:<name>         Filter by bucket (today, upcoming, anytime, someday, now, or custom)',
    '  overdue:true          Show only overdue tasks',
    '  status:<status>       Filter by status (open, done, all) [default: open]',
    '  tags:<tags>           Filter by tags (comma-separated)',
    '  parent:<id>           Show children of a task',
    '  top-level:true        Show only top-level tasks',
    '  text:<query>          Full-text search in task text',
    '  today                Shortcut for (bucket:today | plan:today | due:today)',
    '  Use "|" or "OR" for OR (group with parentheses):',
    '    (bucket:today | plan:today) priority:high',
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
    '  tmd list today                    # Today (bucket/plan/due)',
    '  tmd list project:inbox            # Filter by project',
    '  tmd list energy:low               # Light tasks only',
    "  tmd list bucket:today             # Today's tasks",
    '  tmd list bucket:now               # Working right now',
    '  tmd list priority:high            # High priority tasks',
    '  tmd list due:today                # Due today',
    '  tmd list due:this-week            # Due this week',
    '  tmd list plan:next-week           # Planned next week',
    '  tmd list overdue:true             # Overdue tasks',
    '  tmd list status:done              # Completed tasks',
    '  tmd list bucket:today --sort priority  # Today by priority',
    '  tmd list --json                   # JSON output',
    '  tmd list --format markdown        # Markdown format',
    '  tmd list --group-by bucket        # Group by bucket',
  ];
  console.log(lines.join('\n'));
}
