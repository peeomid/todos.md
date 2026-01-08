/**
 * Output formatters for the list command
 */

import type { Task, TaskIndex } from '../schema/index.js';
import { boldText, cyanText, dimText, greenText } from './terminal.js';

export type FormatStyle = 'compact' | 'full' | 'markdown';

interface ListSummary {
  total: number;
  open: number;
  done: number;
}

interface ListFilters {
  project?: string;
  area?: string;
  energy?: string;
  priority?: string;
  due?: string;
  plan?: string;
  bucket?: string;
  overdue?: boolean;
  status?: string;
  tags?: string;
  parent?: string;
  topLevel?: boolean;
  text?: string;
}

interface ListFilterPayload {
  filters: ListFilters;
  filterGroups?: string[][];
  query?: string;
}

/**
 * Format metadata for compact display
 */
function formatMetadata(task: Task): string {
  const parts: string[] = [];

  if (task.energy && task.energy !== 'normal') {
    parts.push(`energy:${task.energy}`);
  }
  if (task.est) {
    parts.push(`est:${task.est}`);
  }
  if (task.due) {
    parts.push(`due:${task.due}`);
  }

  if (parts.length === 0) {
    return '';
  }
  return dimText(`[${parts.join(' ')}]`);
}

/**
 * Format a single task for compact display
 */
function formatTaskCompact(task: Task, isSubtask: boolean): string {
  const prefix = isSubtask ? '└─ ' : '';
  const checkbox = task.completed ? dimText('[x]') : '[ ]';
  const metadata = formatMetadata(task);

  const idPart = cyanText(task.globalId.padEnd(12));
  const textPart = task.completed ? dimText(task.text) : task.text;
  const metaPart = metadata ? ` ${metadata}` : '';

  return `${idPart} ${prefix}${checkbox} ${textPart}${metaPart}`;
}

/**
 * Format a single task for full display
 */
function formatTaskFull(task: Task, index: TaskIndex): string {
  const lines: string[] = [];
  const project = index.projects[task.projectId];
  const projectName = project ? `${project.id} (${project.name})` : task.projectId;

  lines.push(`${cyanText(task.globalId)} - ${task.text}`);
  lines.push(`  Project: ${projectName}`);
  lines.push(`  Status: ${task.completed ? 'done' : 'open'}`);

  // Metadata
  const metaParts: string[] = [];
  if (task.energy) metaParts.push(`Energy: ${task.energy}`);
  if (task.est) metaParts.push(`Est: ${task.est}`);
  if (metaParts.length > 0) {
    lines.push(`  ${metaParts.join(' | ')}`);
  }

  if (task.due) {
    lines.push(`  Due: ${task.due}`);
  }
  if (task.area) {
    lines.push(`  Area: ${task.area}`);
  }
  if (task.tags && task.tags.length > 0) {
    lines.push(`  Tags: ${task.tags.join(', ')}`);
  }

  // Hierarchy
  if (task.parentId) {
    const parent = index.tasks[task.parentId];
    const parentText = parent ? `(${parent.text})` : '';
    lines.push(`  Parent: ${task.parentId} ${parentText}`);
  }
  if (task.childrenIds.length > 0) {
    lines.push(`  Children: ${task.childrenIds.length}`);
  }

  return lines.join('\n');
}

/**
 * Compute list summary
 */
function computeSummary(tasks: Task[]): ListSummary {
  let open = 0;
  let done = 0;

  for (const task of tasks) {
    if (task.completed) {
      done++;
    } else {
      open++;
    }
  }

  return { total: tasks.length, open, done };
}

/**
 * Format summary line
 */
function formatSummary(summary: ListSummary): string {
  const total = boldText(String(summary.total));
  const open = greenText(`${summary.open} open`);
  const done = dimText(`${summary.done} done`);
  return `${total} tasks (${open}, ${done})`;
}

/**
 * Format tasks grouped by a field (compact)
 */
export function formatCompactGrouped(
  groups: Map<string, Task[]>,
  index: TaskIndex,
  groupBy: 'project' | 'area' | 'due' | 'bucket' = 'project'
): string {
  const lines: string[] = [];

  for (const [groupKey, tasks] of groups) {
    // Group header
    if (groupBy === 'project') {
      const project = index.projects[groupKey];
      if (project) {
        lines.push(`## ${boldText(project.id)} (${project.name})`);
      } else if (groupKey) {
        lines.push(`## ${boldText(groupKey)}`);
      }
    } else if (groupKey) {
      lines.push(`## ${boldText(groupKey)}`);
    }
    lines.push('');

    // Tasks
    for (const task of tasks) {
      const isSubtask = task.parentId !== null;
      lines.push(formatTaskCompact(task, isSubtask));
    }

    lines.push('');
  }

  // Summary
  const allTasks = Array.from(groups.values()).flat();
  lines.push(formatSummary(computeSummary(allTasks)));

  return lines.join('\n');
}

/**
 * Format tasks as flat list (compact)
 */
export function formatCompactFlat(tasks: Task[]): string {
  const lines: string[] = [];

  for (const task of tasks) {
    const isSubtask = task.parentId !== null;
    lines.push(formatTaskCompact(task, isSubtask));
  }

  lines.push('');
  lines.push(formatSummary(computeSummary(tasks)));

  return lines.join('\n');
}

/**
 * Format tasks in full format
 */
export function formatFull(tasks: Task[], index: TaskIndex): string {
  const lines: string[] = [];

  for (const task of tasks) {
    lines.push(formatTaskFull(task, index));
    lines.push('');
  }

  lines.push(formatSummary(computeSummary(tasks)));

  return lines.join('\n');
}

/**
 * Format tasks as JSON
 */
export function formatJson(tasks: Task[], payload: ListFilterPayload): string {
  const summary = computeSummary(tasks);

  const output = {
    tasks: tasks.map((task) => ({
      globalId: task.globalId,
      localId: task.localId,
      projectId: task.projectId,
      text: task.text,
      completed: task.completed,
      energy: task.energy,
      priority: task.priority,
      est: task.est,
      due: task.due,
      plan: task.plan,
      bucket: task.bucket,
      area: task.area,
      tags: task.tags,
      parentId: task.parentId,
      childrenIds: task.childrenIds,
    })),
    summary,
    filters: Object.fromEntries(Object.entries(payload.filters).filter(([, v]) => v !== undefined)),
    filterGroups: payload.filterGroups,
    query: payload.query,
  };

  return JSON.stringify(output, null, 2);
}
