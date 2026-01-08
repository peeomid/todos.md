/**
 * tmd search - Full-text search for tasks
 *
 * Thin wrapper over `tmd list` with implicit `text:` filter
 */

import { getGlobalConfigPath, loadConfig, resolveOutput } from '../config/loader.js';
import { readIndexFile } from '../indexer/index-file.js';
import { CliUsageError } from './errors.js';
import { extractBooleanFlags, extractFlags } from './flag-utils.js';
import {
  applyDefaultStatusToGroups,
  buildFilterGroups,
  composeFilterGroups,
  composeFilters,
  type FilterOptions,
  filterByText,
  parseFilterArgs,
  parseQueryToFilterGroups,
  sortTasks,
} from './list-filters.js';
import type { FormatStyle } from './list-formatters.js';
import { cyanText, dimText } from './terminal.js';

interface SearchOptions {
  searchText: string;
  filterGroups: string[][];
  filterOptions: FilterOptions;
  json: boolean;
  format: FormatStyle;
  output: string;
}

export function handleSearchCommand(args: string[]): void {
  const options = parseSearchFlags(args);
  runSearch(options);
}

function parseSearchFlags(args: string[]): SearchOptions {
  const boolFlags = extractBooleanFlags(args, ['--json', '--global-config', '-G']);

  const valueFlags = extractFlags(args, ['--format', '-f', '--config', '-c', '--output', '-o']);

  const useGlobalConfig = boolFlags.has('--global-config') || boolFlags.has('-G');
  const configPath = useGlobalConfig ? getGlobalConfigPath() : (valueFlags['--config'] ?? valueFlags['-c']);
  const config = loadConfig(configPath);
  const output = resolveOutput(config, valueFlags['--output'] ?? valueFlags['-o']);

  // First non-flag argument is the search text
  const searchText = args.find((arg) => !arg.startsWith('-') && !arg.includes(':'));
  if (!searchText) {
    throw new CliUsageError('Missing search text. Usage: tmd search <text> [filters...]');
  }

  // Remove search text from args before parsing filters
  const filterArgs = args.filter((arg) => arg !== searchText);
  let filterGroups: string[][];
  try {
    filterGroups = parseQueryToFilterGroups(filterArgs);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid query syntax.';
    throw new CliUsageError(message);
  }

  filterGroups = applyDefaultStatusToGroups(filterGroups, 'open');
  const filterOptions = parseFilterArgs(filterGroups[0] ?? []);

  // Validate format
  const formatRaw = valueFlags['--format'] ?? valueFlags['-f'] ?? 'compact';
  if (!['compact', 'full'].includes(formatRaw)) {
    throw new CliUsageError(`Invalid format: '${formatRaw}'. Use compact or full.`);
  }
  const format = formatRaw as FormatStyle;

  return {
    searchText,
    filterGroups,
    filterOptions,
    json: boolFlags.has('--json'),
    format,
    output,
  };
}

function runSearch(options: SearchOptions): void {
  // Load index
  const index = readIndexFile(options.output);
  if (!index) {
    throw new CliUsageError(`No index found. Run \`tmd index\` first.`);
  }

  // Build filters from options + text filter
  const groupFilters = buildFilterGroups(options.filterGroups).map((groupFilter) =>
    composeFilters([groupFilter, filterByText(options.searchText)])
  );

  // Apply filters
  const composedFilter = composeFilterGroups(groupFilters);
  const tasks = Object.values(index.tasks).filter(composedFilter);

  // Sort by project (default)
  const sortedTasks = sortTasks(tasks, 'project');

  // Format output
  if (options.json) {
    const output = {
      query: options.searchText,
      filters: Object.fromEntries(Object.entries(options.filterOptions).filter(([, v]) => v !== undefined)),
      filterGroups: options.filterGroups,
      tasks: sortedTasks.map((task) => ({
        globalId: task.globalId,
        text: task.text,
        projectId: task.projectId,
        completed: task.completed,
        filePath: task.filePath,
        lineNumber: task.lineNumber,
      })),
      count: sortedTasks.length,
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // Text format
  if (sortedTasks.length === 0) {
    console.log(`No tasks found matching "${options.searchText}"`);
    return;
  }

  for (const task of sortedTasks) {
    console.log(`[${cyanText(task.globalId)}] ${task.text}`);
    console.log(`  file: ${task.filePath}:${task.lineNumber}`);

    const meta: string[] = [];
    if (task.plan) meta.push(`plan:${task.plan}`);
    if (task.bucket) meta.push(`bucket:${task.bucket}`);
    if (task.energy) meta.push(`energy:${task.energy}`);
    if (task.priority) meta.push(`priority:${task.priority}`);

    if (meta.length > 0) {
      console.log(`  ${dimText(meta.join('  '))}`);
    }
    console.log('');
  }

  console.log(`${sortedTasks.length} tasks found`);
}

export function printSearchHelp(): void {
  const lines = [
    'Usage: tmd search <text> [filters...] [options]',
    '',
    'Full-text search for tasks.',
    '',
    'Arguments:',
    '  <text>                Search string (matches task text)',
    '',
    'Filters (same as tmd list):',
    '  project:<id>          Filter by project',
    '  area:<name>           Filter by area',
    '  status:<status>       Filter by status (open, done, all)',
    '  bucket:<name>         Filter by bucket',
    '  due:<date>            Filter by due date spec (today, tomorrow, this-week, next-week, YYYY-MM-DD, YYYY-MM-DD:YYYY-MM-DD)',
    '  plan:<date>           Filter by plan date spec (same formats as due:)',
    '  Use "|" or "OR" for OR (group with parentheses).',
    '  ... (see tmd list --help for all filters)',
    '',
    'Options:',
    '  --json                Output as JSON',
    '  --format, -f <fmt>    Output format (compact, full)',
    '',
    'Examples:',
    '  tmd search "stripe"                    # Search all tasks',
    '  tmd search "email" project:as-onb      # Search within project',
    '  tmd search "invoice" status:done       # Search completed tasks',
    '  tmd search "onboarding" --json         # JSON output',
  ];
  console.log(lines.join('\n'));
}
