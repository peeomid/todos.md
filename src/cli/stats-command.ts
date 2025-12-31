/**
 * tmd stats - Task statistics and completion metrics
 */

import { readIndexFile } from '../indexer/index-file.js';
import { getGlobalConfigPath, loadConfig, resolveOutput } from '../config/loader.js';
import { extractBooleanFlags, extractFlags } from './flag-utils.js';
import { CliUsageError } from './errors.js';
import { boldText, dimText, greenText, cyanText } from './terminal.js';
import { parseQueryToFilterGroups, buildFilterGroups, composeFilterGroups } from './list-filters.js';
import { parseDateSpec, formatDate, isOverdue } from './date-utils.js';
import type { Task, TaskIndex } from '../schema/index.js';

type Period = 'today' | 'last-7d' | 'last-30d' | 'this-week';
type GroupBy = 'project' | 'area' | 'bucket' | 'energy';

interface StatsOptions {
  filterGroups: string[][];
  period: Period;
  groupBy: GroupBy;
  json: boolean;
  output: string;
}

interface StatsResult {
  period: Period;
  overview: {
    total: number;
    open: number;
    done: number;
  };
  byBucket: Record<string, number>;
  byEnergy: Record<string, number>;
  byPriority: Record<string, number>;
  completed: {
    today: number;
    last7d: number;
    last30d: number;
    byDay: Record<string, number>;
  };
  topProjects: Array<{
    id: string;
    open: number;
    dueThisWeek?: number;
    overdue?: number;
  }>;
  overdue: {
    total: number;
    byProject: Record<string, number>;
  };
}

export function handleStatsCommand(args: string[]): void {
  const options = parseStatsFlags(args);
  runStats(options);
}

function parseStatsFlags(args: string[]): StatsOptions {
  const boolFlags = extractBooleanFlags(args, ['--json', '--global-config', '-G']);

  const valueFlags = extractFlags(args, [
    '--period',
    '--by',
    '--config',
    '-c',
    '--output',
    '-o',
  ]);

  const useGlobalConfig = boolFlags.has('--global-config') || boolFlags.has('-G');
  const configPath = useGlobalConfig
    ? getGlobalConfigPath()
    : (valueFlags['--config'] ?? valueFlags['-c']);
  const config = loadConfig(configPath);
  const output = resolveOutput(config, valueFlags['--output'] ?? valueFlags['-o']);

  // Parse filters
  let filterGroups: string[][];
  try {
    filterGroups = parseQueryToFilterGroups(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid query syntax.';
    throw new CliUsageError(message);
  }

  // Validate period
  const periodRaw = valueFlags['--period'] ?? 'last-7d';
  if (!['today', 'last-7d', 'last-30d', 'this-week'].includes(periodRaw)) {
    throw new CliUsageError(`Invalid period: '${periodRaw}'. Use today, last-7d, last-30d, or this-week.`);
  }
  const period = periodRaw as Period;

  // Validate group-by
  const groupByRaw = valueFlags['--by'] ?? 'project';
  if (!['project', 'area', 'bucket', 'energy'].includes(groupByRaw)) {
    throw new CliUsageError(`Invalid --by: '${groupByRaw}'. Use project, area, bucket, or energy.`);
  }
  const groupBy = groupByRaw as GroupBy;

  return {
    filterGroups,
    period,
    groupBy,
    json: boolFlags.has('--json'),
    output,
  };
}

function runStats(options: StatsOptions): void {
  // Load index
  const index = readIndexFile(options.output);
  if (!index) {
    throw new CliUsageError(`No index found. Run \`tmd index\` first.`);
  }

  // Build and apply filters (without status filter to count all)
  const groupFilters = buildFilterGroups(options.filterGroups);
  const composedFilter = composeFilterGroups(groupFilters);
  const allTasks = Object.values(index.tasks).filter(composedFilter);

  // Calculate stats
  const stats = calculateStats(allTasks, index, options.period);

  // Output
  if (options.json) {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  printStats(stats, options.period);
}

function calculateStats(tasks: Task[], index: TaskIndex, period: Period): StatsResult {
  const today = new Date();
  const todayStr = formatDate(today);

  // Overview
  let open = 0;
  let done = 0;
  for (const task of tasks) {
    if (task.completed) {
      done++;
    } else {
      open++;
    }
  }

  // By bucket (open only)
  const byBucket: Record<string, number> = {
    today: 0,
    upcoming: 0,
    anytime: 0,
    someday: 0,
  };
  for (const task of tasks) {
    if (!task.completed && task.bucket) {
      byBucket[task.bucket] = (byBucket[task.bucket] ?? 0) + 1;
    }
  }

  // By energy (open only)
  const byEnergy: Record<string, number> = {
    low: 0,
    normal: 0,
    high: 0,
  };
  for (const task of tasks) {
    if (!task.completed && task.energy) {
      byEnergy[task.energy] = (byEnergy[task.energy] ?? 0) + 1;
    }
  }

  // By priority (open only)
  const byPriority: Record<string, number> = {
    high: 0,
    normal: 0,
    low: 0,
  };
  for (const task of tasks) {
    if (!task.completed && task.priority) {
      byPriority[task.priority] = (byPriority[task.priority] ?? 0) + 1;
    }
  }

  // Completed tasks over time
  const completedToday = tasks.filter((t) => t.completed && t.updated === todayStr).length;

  // Calculate date ranges
  const last7Days = getLastNDays(7);
  const last30Days = getLastNDays(30);

  const completedLast7d = tasks.filter(
    (t) => t.completed && t.updated && last7Days.includes(t.updated)
  ).length;

  const completedLast30d = tasks.filter(
    (t) => t.completed && t.updated && last30Days.includes(t.updated)
  ).length;

  // By day (last 7 days)
  const byDay: Record<string, number> = {};
  for (const day of last7Days) {
    byDay[day] = tasks.filter((t) => t.completed && t.updated === day).length;
  }

  // Top projects (by open count)
  const projectOpenCounts: Record<string, { open: number; overdue: number; dueThisWeek: number }> = {};
  const thisWeekRange = parseDateSpec('this-week');

  for (const task of tasks) {
    if (!projectOpenCounts[task.projectId]) {
      projectOpenCounts[task.projectId] = { open: 0, overdue: 0, dueThisWeek: 0 };
    }

    if (!task.completed) {
      projectOpenCounts[task.projectId]!.open++;

      if (task.due && isOverdue(task.due)) {
        projectOpenCounts[task.projectId]!.overdue++;
      }

      if (task.due && thisWeekRange) {
        const dueDate = new Date(task.due);
        if (dueDate >= thisWeekRange.start && dueDate <= thisWeekRange.end) {
          projectOpenCounts[task.projectId]!.dueThisWeek++;
        }
      }
    }
  }

  const topProjects = Object.entries(projectOpenCounts)
    .sort(([, a], [, b]) => b.open - a.open)
    .slice(0, 5)
    .map(([id, counts]) => ({
      id,
      open: counts.open,
      dueThisWeek: counts.dueThisWeek > 0 ? counts.dueThisWeek : undefined,
      overdue: counts.overdue > 0 ? counts.overdue : undefined,
    }));

  // Overdue
  const overdueTotal = tasks.filter((t) => !t.completed && t.due && isOverdue(t.due)).length;
  const overdueByProject: Record<string, number> = {};
  for (const task of tasks) {
    if (!task.completed && task.due && isOverdue(task.due)) {
      overdueByProject[task.projectId] = (overdueByProject[task.projectId] ?? 0) + 1;
    }
  }

  return {
    period,
    overview: {
      total: tasks.length,
      open,
      done,
    },
    byBucket,
    byEnergy,
    byPriority,
    completed: {
      today: completedToday,
      last7d: completedLast7d,
      last30d: completedLast30d,
      byDay,
    },
    topProjects,
    overdue: {
      total: overdueTotal,
      byProject: overdueByProject,
    },
  };
}

function getLastNDays(n: number): string[] {
  const days: string[] = [];
  const today = new Date();

  for (let i = 0; i < n; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    days.push(formatDate(date));
  }

  return days;
}

function printStats(stats: StatsResult, period: Period): void {
  const periodLabel = {
    today: 'today',
    'last-7d': 'last 7 days',
    'last-30d': 'last 30 days',
    'this-week': 'this week',
  }[period];

  console.log(boldText(`Task Stats (${periodLabel})`));
  console.log('========================');
  console.log('');

  // Overview
  console.log('Overview:');
  console.log(`  Total: ${stats.overview.total} tasks`);
  console.log(`  Open: ${greenText(String(stats.overview.open))} | Done: ${dimText(String(stats.overview.done))}`);
  console.log('');

  // By Bucket
  console.log('By Bucket (open):');
  for (const [bucket, count] of Object.entries(stats.byBucket)) {
    if (count > 0) {
      console.log(`  ${bucket.padEnd(10)} ${count}`);
    }
  }
  console.log('');

  // By Energy
  console.log('By Energy (open):');
  for (const [energy, count] of Object.entries(stats.byEnergy)) {
    if (count > 0) {
      console.log(`  ${energy.padEnd(10)} ${count}`);
    }
  }
  console.log('');

  // By Priority
  const hasPriority = Object.values(stats.byPriority).some((c) => c > 0);
  if (hasPriority) {
    console.log('By Priority (open):');
    for (const [priority, count] of Object.entries(stats.byPriority)) {
      if (count > 0) {
        console.log(`  ${priority.padEnd(10)} ${count}`);
      }
    }
    console.log('');
  }

  // Completed
  console.log('Completed:');
  console.log(`  today:       ${stats.completed.today}`);
  console.log(`  last 7 days: ${stats.completed.last7d}`);
  console.log(`  last 30 days: ${stats.completed.last30d}`);
  console.log('');

  // Daily breakdown (last 7 days)
  const days = Object.entries(stats.completed.byDay).slice(0, 7);
  if (days.length > 0) {
    for (const [day, count] of days) {
      console.log(`  ${day}: ${count}`);
    }
    console.log('');
  }

  // Top Projects
  if (stats.topProjects.length > 0) {
    console.log('Top Projects (open):');
    for (const proj of stats.topProjects) {
      let line = `  ${cyanText(proj.id.padEnd(10))} ${proj.open} open`;
      if (proj.dueThisWeek) {
        line += ` (${proj.dueThisWeek} due this week)`;
      }
      if (proj.overdue) {
        line += ` (${proj.overdue} overdue)`;
      }
      console.log(line);
    }
    console.log('');
  }

  // Overdue
  if (stats.overdue.total > 0) {
    console.log(`Overdue: ${stats.overdue.total} tasks`);
    for (const [proj, count] of Object.entries(stats.overdue.byProject)) {
      console.log(`  ${proj}: ${count}`);
    }
  }
}

export function printStatsHelp(): void {
  console.log(`Usage: tmd stats [filters...] [options]

Show task statistics and completion metrics.

Filters (same as tmd list):
  project:<id>          Filter by project
  area:<name>           Filter by area
  bucket:<name>         Filter by bucket
  ... (see tmd list --help for all filters)

Options:
  --period <period>     Focus on: today, last-7d, last-30d, this-week [default: last-7d]
  --by <field>          Group by: project, area, bucket, energy [default: project]
  --json                Output as JSON

Examples:
  tmd stats                          # Overall stats
  tmd stats area:work                # Stats for work area
  tmd stats project:as-onb           # Stats for specific project
  tmd stats --period this-week       # This week's completion
  tmd stats --by bucket              # Group by bucket
  tmd stats --json                   # JSON output
`);
}
