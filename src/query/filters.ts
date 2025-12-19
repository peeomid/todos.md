/**
 * Shared query/filter/sort helpers used by CLI commands and the TUI.
 *
 * This is intentionally non-CLI so interactive mode can reuse the same
 * filter semantics as `tmd list`.
 */

import type { Task, Energy, Priority } from '../schema/index.js';
import { parseDateSpec, isDateInRange, isOverdue } from '../cli/date-utils.js';

export type TaskFilter = (task: Task) => boolean;

/**
 * Parse a key:value filter string into filter options
 */
export interface FilterOptions {
  project?: string;
  area?: string;
  energy?: Energy;
  priority?: Priority;
  due?: string;
  plan?: string;
  bucket?: string;
  overdue?: boolean;
  status?: 'open' | 'done' | 'all';
  tags?: string;
  parent?: string;
  topLevel?: boolean;
  text?: string;
}

/**
 * Parse a single key:value filter string
 */
export function parseFilterArg(arg: string): { key: string; value: string } | null {
  const colonIndex = arg.indexOf(':');
  if (colonIndex === -1) {
    return null;
  }
  const key = arg.slice(0, colonIndex);
  const value = arg.slice(colonIndex + 1);
  if (!key || !value) {
    return null;
  }
  return { key, value };
}

/**
 * Parse multiple filter arguments into FilterOptions
 */
export function parseFilterArgs(args: string[]): FilterOptions {
  const options: FilterOptions = {};

  for (const arg of args) {
    const parsed = parseFilterArg(arg);
    if (!parsed) continue;

    const { key, value } = parsed;
    switch (key) {
      case 'project':
        options.project = value;
        break;
      case 'area':
        options.area = value;
        break;
      case 'energy':
        if (value === 'low' || value === 'normal' || value === 'high') {
          options.energy = value;
        }
        break;
      case 'priority':
        if (value === 'high' || value === 'normal' || value === 'low') {
          options.priority = value;
        }
        break;
      case 'due':
        options.due = value;
        break;
      case 'plan':
        options.plan = value;
        break;
      case 'bucket':
        options.bucket = value;
        break;
      case 'overdue':
        options.overdue = value === 'true';
        break;
      case 'status':
        if (value === 'open' || value === 'done' || value === 'all') {
          options.status = value;
        }
        break;
      case 'tags':
        options.tags = value;
        break;
      case 'parent':
        options.parent = value;
        break;
      case 'top-level':
        options.topLevel = value === 'true';
        break;
      case 'text':
        options.text = value;
        break;
    }
  }

  return options;
}

/**
 * Filter by project ID
 */
export function filterByProject(projectId: string): TaskFilter {
  return (task) => task.projectId === projectId;
}

/**
 * Filter by area
 */
export function filterByArea(area: string): TaskFilter {
  return (task) => task.area === area;
}

/**
 * Filter by energy level
 */
export function filterByEnergy(energy: Energy): TaskFilter {
  return (task) => task.energy === energy;
}

/**
 * Filter by priority level
 */
export function filterByPriority(priority: Priority): TaskFilter {
  return (task) => task.priority === priority;
}

/**
 * Filter by bucket
 */
export function filterByBucket(bucket: string): TaskFilter {
  return (task) => task.bucket === bucket;
}

/**
 * Filter by plan date spec (today, tomorrow, this-week, etc.)
 */
export function filterByPlan(dateSpec: string): TaskFilter {
  const range = parseDateSpec(dateSpec);
  if (!range) {
    throw new Error(`Invalid plan date filter: '${dateSpec}'`);
  }
  return (task) => {
    if (!task.plan) {
      return false;
    }
    return isDateInRange(task.plan, range);
  };
}

/**
 * Filter by text (case-insensitive substring match on task text)
 */
export function filterByText(searchText: string): TaskFilter {
  const lowerSearch = searchText.toLowerCase();
  return (task) => task.text.toLowerCase().includes(lowerSearch);
}

/**
 * Filter by due date spec (today, tomorrow, this-week, etc.)
 */
export function filterByDue(dateSpec: string): TaskFilter {
  const range = parseDateSpec(dateSpec);
  if (!range) {
    throw new Error(`Invalid date filter: '${dateSpec}'`);
  }
  return (task) => {
    if (!task.due) {
      return false;
    }
    return isDateInRange(task.due, range);
  };
}

/**
 * Filter overdue tasks
 */
export function filterOverdue(): TaskFilter {
  return (task) => {
    if (!task.due) {
      return false;
    }
    return isOverdue(task.due);
  };
}

/**
 * Filter by status (open, done, all)
 */
export function filterByStatus(status: 'open' | 'done' | 'all'): TaskFilter {
  if (status === 'all') {
    return () => true;
  }
  const completed = status === 'done';
  return (task) => task.completed === completed;
}

/**
 * Filter by tags (comma-separated list)
 */
export function filterByTags(tagsStr: string): TaskFilter {
  const tags = tagsStr.split(',').map((t) => t.trim().toLowerCase());
  return (task) => {
    if (!task.tags || task.tags.length === 0) {
      return false;
    }
    const taskTags = task.tags.map((t) => t.toLowerCase());
    return tags.some((tag) => taskTags.includes(tag));
  };
}

/**
 * Filter by parent ID
 */
export function filterByParent(parentId: string): TaskFilter {
  return (task) => task.parentId === parentId;
}

/**
 * Filter top-level tasks only (no parent)
 */
export function filterTopLevel(): TaskFilter {
  return (task) => task.parentId === null;
}

/**
 * Compose multiple filters with AND logic
 */
export function composeFilters(filters: TaskFilter[]): TaskFilter {
  if (filters.length === 0) {
    return () => true;
  }
  return (task) => filters.every((filter) => filter(task));
}

/**
 * Sort tasks by field
 */
export type SortField = 'due' | 'plan' | 'created' | 'project' | 'energy' | 'priority' | 'bucket';

const ENERGY_ORDER: Record<string, number> = {
  low: 1,
  normal: 2,
  high: 3,
};

const PRIORITY_ORDER: Record<string, number> = {
  high: 1,
  normal: 2,
  low: 3,
};

const BUCKET_ORDER: Record<string, number> = {
  today: 1,
  upcoming: 2,
  anytime: 3,
  someday: 4,
};

function compareBySortField(a: Task, b: Task, sortBy: SortField): number {
  switch (sortBy) {
    case 'due': {
      if (!a.due && !b.due) return 0;
      if (!a.due) return 1;
      if (!b.due) return -1;
      return a.due.localeCompare(b.due);
    }
    case 'plan': {
      if (!a.plan && !b.plan) return 0;
      if (!a.plan) return 1;
      if (!b.plan) return -1;
      return a.plan.localeCompare(b.plan);
    }
    case 'created': {
      if (!a.created && !b.created) return 0;
      if (!a.created) return 1;
      if (!b.created) return -1;
      return a.created.localeCompare(b.created);
    }
    case 'project': {
      const projectCmp = a.projectId.localeCompare(b.projectId);
      if (projectCmp !== 0) return projectCmp;
      return a.localId.localeCompare(b.localId, undefined, { numeric: true });
    }
    case 'energy': {
      const aOrder = ENERGY_ORDER[a.energy ?? 'normal'] ?? 2;
      const bOrder = ENERGY_ORDER[b.energy ?? 'normal'] ?? 2;
      return aOrder - bOrder;
    }
    case 'priority': {
      const aOrder = a.priority ? PRIORITY_ORDER[a.priority] ?? 4 : 4;
      const bOrder = b.priority ? PRIORITY_ORDER[b.priority] ?? 4 : 4;
      return aOrder - bOrder;
    }
    case 'bucket': {
      const aOrder = a.bucket ? (BUCKET_ORDER[a.bucket] ?? 5) : 6;
      const bOrder = b.bucket ? (BUCKET_ORDER[b.bucket] ?? 5) : 6;
      return aOrder - bOrder;
    }
    default:
      return 0;
  }
}

export function sortTasks(tasks: Task[], sortBy: SortField): Task[] {
  return sortTasksByFields(tasks, [sortBy]);
}

/**
 * Stable multi-sort (left-to-right priority).
 *
 * Example: ['bucket','plan','due'] compares by bucket first, then plan, then due.
 */
export function sortTasksByFields(tasks: Task[], sortBy: SortField[]): Task[] {
  const indexed = tasks.map((task, idx) => ({ task, idx }));
  indexed.sort((a, b) => {
    for (const field of sortBy) {
      const cmp = compareBySortField(a.task, b.task, field);
      if (cmp !== 0) return cmp;
    }
    return a.idx - b.idx;
  });
  return indexed.map((x) => x.task);
}

/**
 * Group tasks by field
 */
export type GroupField = 'project' | 'area' | 'due' | 'bucket' | 'none';

export function groupTasks(tasks: Task[], groupBy: GroupField): Map<string, Task[]> {
  if (groupBy === 'none') {
    return new Map([['', tasks]]);
  }

  const groups = new Map<string, Task[]>();

  for (const task of tasks) {
    let key: string;
    switch (groupBy) {
      case 'project':
        key = task.projectId;
        break;
      case 'area':
        key = task.area ?? '(no area)';
        break;
      case 'due':
        key = task.due ?? '(no due date)';
        break;
      case 'bucket':
        key = task.bucket ?? '(no bucket)';
        break;
      default:
        key = '';
    }

    const group = groups.get(key);
    if (group) {
      group.push(task);
    } else {
      groups.set(key, [task]);
    }
  }

  return groups;
}

/**
 * Build filters from FilterOptions
 */
export function buildFiltersFromOptions(options: FilterOptions): TaskFilter[] {
  const filters: TaskFilter[] = [];

  if (options.project) {
    filters.push(filterByProject(options.project));
  }
  if (options.area) {
    filters.push(filterByArea(options.area));
  }
  if (options.energy) {
    filters.push(filterByEnergy(options.energy));
  }
  if (options.priority) {
    filters.push(filterByPriority(options.priority));
  }
  if (options.due) {
    filters.push(filterByDue(options.due));
  }
  if (options.plan) {
    filters.push(filterByPlan(options.plan));
  }
  if (options.bucket) {
    filters.push(filterByBucket(options.bucket));
  }
  if (options.overdue) {
    filters.push(filterOverdue());
  }
  if (options.status) {
    filters.push(filterByStatus(options.status));
  }
  if (options.tags) {
    filters.push(filterByTags(options.tags));
  }
  if (options.parent) {
    filters.push(filterByParent(options.parent));
  }
  if (options.topLevel) {
    filters.push(filterTopLevel());
  }
  if (options.text) {
    filters.push(filterByText(options.text));
  }

  return filters;
}

export function parseQueryString(query: string): string[] {
  return query
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

