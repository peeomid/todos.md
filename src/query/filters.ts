/**
 * Shared query/filter/sort helpers used by CLI commands and the TUI.
 *
 * This is intentionally non-CLI so interactive mode can reuse the same
 * filter semantics as `tmd list`.
 */

import type { Task, Energy, Priority } from '../schema/index.js';
import { parseDateSpec, isDateInRange, isOverdue } from '../cli/date-utils.js';

export type TaskFilter = (task: Task) => boolean;
type QueryToken =
  | { type: 'filter'; value: string }
  | { type: 'or' }
  | { type: 'lparen' }
  | { type: 'rparen' };

type QueryNode =
  | { type: 'filter'; value: string }
  | { type: 'and'; nodes: QueryNode[] }
  | { type: 'or'; nodes: QueryNode[] };

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function mergeCsv(existing: string | undefined, incoming: string): string {
  const next = incoming.trim();
  if (!next) return existing ?? '';
  return existing ? `${existing},${next}` : next;
}

/**
 * Parse a key:value filter string into filter options
 */
export interface FilterOptions {
  project?: string;
  area?: string;
  energy?: string;
  priority?: string;
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

export function tokenizeQuery(query: string): string[] {
  const tokens: string[] = [];
  let current = '';
  const pushCurrent = () => {
    if (current) tokens.push(current);
    current = '';
  };

  for (const ch of query) {
    if (/\s/.test(ch)) {
      pushCurrent();
      continue;
    }
    if (ch === '(' || ch === ')' || ch === '|') {
      pushCurrent();
      tokens.push(ch);
      continue;
    }
    current += ch;
  }
  pushCurrent();
  return tokens.filter(Boolean);
}

export function isQueryOperatorToken(token: string): boolean {
  if (token === '(' || token === ')' || token === '|') return true;
  return token.toUpperCase() === 'OR';
}

function toQueryTokens(tokens: string[]): QueryToken[] {
  const out: QueryToken[] = [];
  for (const token of tokens) {
    if (token === '(') {
      out.push({ type: 'lparen' });
      continue;
    }
    if (token === ')') {
      out.push({ type: 'rparen' });
      continue;
    }
    if (token === '|' || token.toUpperCase() === 'OR') {
      out.push({ type: 'or' });
      continue;
    }
    if (parseFilterArg(token)) {
      out.push({ type: 'filter', value: token });
    }
  }
  return out;
}

function parseQueryTokens(tokens: QueryToken[]): QueryNode {
  let index = 0;

  const peek = () => tokens[index];
  const consume = () => tokens[index++];

  const parsePrimary = (): QueryNode => {
    const token = peek();
    if (!token) {
      throw new Error('Expected filter or "(" but reached end of query.');
    }
    if (token.type === 'filter') {
      consume();
      return { type: 'filter', value: token.value };
    }
    if (token.type === 'lparen') {
      consume();
      const expr = parseOr();
      const next = peek();
      if (!next || next.type !== 'rparen') {
        throw new Error('Expected ")" to close group.');
      }
      consume();
      return expr;
    }
    throw new Error(`Unexpected token '${token.type}'.`);
  };

  const parseAnd = (): QueryNode => {
    const nodes: QueryNode[] = [];
    while (true) {
      const token = peek();
      if (!token || token.type === 'or' || token.type === 'rparen') break;
      nodes.push(parsePrimary());
    }
    if (nodes.length === 0) {
      throw new Error('Expected filter or "(" after operator.');
    }
    return nodes.length === 1 ? nodes[0]! : { type: 'and', nodes };
  };

  const parseOr = (): QueryNode => {
    let node = parseAnd();
    const nodes: QueryNode[] = [node];
    while (peek()?.type === 'or') {
      consume();
      nodes.push(parseAnd());
    }
    node = nodes.length === 1 ? nodes[0]! : { type: 'or', nodes };
    return node;
  };

  const root = parseOr();
  if (index < tokens.length) {
    const token = tokens[index]!;
    throw new Error(`Unexpected token '${token.type}'.`);
  }
  return root;
}

function toDnfGroups(node: QueryNode): string[][] {
  switch (node.type) {
    case 'filter':
      return [[node.value]];
    case 'or': {
      const out: string[][] = [];
      for (const child of node.nodes) {
        out.push(...toDnfGroups(child));
      }
      return out;
    }
    case 'and': {
      let groups: string[][] = [[]];
      for (const child of node.nodes) {
        const childGroups = toDnfGroups(child);
        const next: string[][] = [];
        for (const group of groups) {
          for (const childGroup of childGroups) {
            next.push([...group, ...childGroup]);
          }
        }
        groups = next;
      }
      return groups;
    }
  }
}

export function parseQueryToFilterGroups(input: string | string[]): string[][] {
  const query = Array.isArray(input) ? input.join(' ') : input;
  const rawTokens = tokenizeQuery(query);
  const tokens = toQueryTokens(rawTokens);
  if (tokens.length === 0) return [];
  const ast = parseQueryTokens(tokens);
  return toDnfGroups(ast).map((group) => group.filter(Boolean));
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
        options.project = mergeCsv(options.project, value);
        break;
      case 'area':
        options.area = mergeCsv(options.area, value);
        break;
      case 'energy':
        {
          const parts = splitCsv(value);
          const valid = parts.filter((v) => v === 'low' || v === 'normal' || v === 'high');
          if (valid.length > 0) options.energy = mergeCsv(options.energy, valid.join(','));
        }
        break;
      case 'priority':
        {
          const parts = splitCsv(value);
          const valid = parts.filter((v) => v === 'high' || v === 'normal' || v === 'low');
          if (valid.length > 0) options.priority = mergeCsv(options.priority, valid.join(','));
        }
        break;
      case 'due':
        options.due = value;
        break;
      case 'plan':
        options.plan = value;
        break;
      case 'bucket':
        options.bucket = mergeCsv(options.bucket, value);
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
        options.tags = mergeCsv(options.tags, value);
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
  const ids = splitCsv(projectId);
  if (ids.length <= 1) {
    const id = ids[0] ?? projectId;
    return (task) => task.projectId === id;
  }
  const set = new Set(ids);
  return (task) => set.has(task.projectId);
}

/**
 * Filter by area
 */
export function filterByArea(area: string): TaskFilter {
  const areas = splitCsv(area);
  if (areas.length <= 1) {
    const a = areas[0] ?? area;
    return (task) => task.area === a;
  }
  const set = new Set(areas);
  return (task) => (task.area ? set.has(task.area) : false);
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

function filterByEnergyAny(energyCsv: string): TaskFilter {
  const energies = splitCsv(energyCsv).filter((v): v is Energy => v === 'low' || v === 'normal' || v === 'high');
  if (energies.length <= 1) {
    const e = energies[0];
    return e ? filterByEnergy(e) : () => false;
  }
  const set = new Set(energies);
  return (task) => (task.energy ? set.has(task.energy) : false);
}

function filterByPriorityAny(priorityCsv: string): TaskFilter {
  const priorities = splitCsv(priorityCsv).filter((v): v is Priority => v === 'high' || v === 'normal' || v === 'low');
  if (priorities.length <= 1) {
    const p = priorities[0];
    return p ? filterByPriority(p) : () => false;
  }
  const set = new Set(priorities);
  return (task) => (task.priority ? set.has(task.priority) : false);
}

/**
 * Filter by bucket
 */
export function filterByBucket(bucket: string): TaskFilter {
  const values = splitCsv(bucket);
  const include: string[] = [];
  const exclude: string[] = [];

  for (const v of values) {
    const trimmed = v.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('!') && trimmed.length > 1) exclude.push(trimmed.slice(1));
    else include.push(trimmed);
  }

  const includeSet = new Set(include);
  const excludeSet = new Set(exclude);

  // Semantics:
  // - If includes are present, task.bucket must be one of them (and also not excluded).
  // - If only excludes are present, match all tasks except those with a matching bucket.
  return (task) => {
    const b = task.bucket;
    if (b && excludeSet.has(b)) return false;
    if (includeSet.size > 0) return b ? includeSet.has(b) : false;
    return true;
  };
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

export function buildFilterGroups(groups: string[][]): TaskFilter[] {
  return groups.map((group) => {
    const options = parseFilterArgs(group);
    const filters = buildFiltersFromOptions(options);
    return composeFilters(filters);
  });
}

export function groupHasFilterKey(group: string[], key: string): boolean {
  return group.some((token) => parseFilterArg(token)?.key === key);
}

export function applyDefaultStatusToGroups(
  groups: string[][],
  status: 'open' | 'done' | 'all'
): string[][] {
  const base = groups.length > 0 ? groups : [[]];
  return base.map((group) => (groupHasFilterKey(group, 'status') ? group : [...group, `status:${status}`]));
}

export function composeFilterGroups(groups: TaskFilter[]): TaskFilter {
  if (groups.length === 0) {
    return () => true;
  }
  return (task) => groups.some((filter) => filter(task));
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
      return a.projectId.localeCompare(b.projectId);
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
    // Deterministic tie-breaker: keep task ordering stable by id.
    const projectCmp = a.task.projectId.localeCompare(b.task.projectId);
    if (projectCmp !== 0) return projectCmp;
    const localCmp = a.task.localId.localeCompare(b.task.localId, undefined, { numeric: true });
    if (localCmp !== 0) return localCmp;
    return a.idx - b.idx;
  });
  return indexed.map((x) => x.task);
}

export function sortTasksByFieldsWithOverrides(
  tasks: Task[],
  sortBy: SortField[],
  overrides?: { priorityOrder?: 'high-first' | 'low-first' }
): Task[] {
  const indexed = tasks.map((task, idx) => ({ task, idx }));
  indexed.sort((a, b) => {
    for (const field of sortBy) {
      const cmp =
        field === 'priority' && overrides?.priorityOrder === 'low-first'
          ? (() => {
              const order: Record<string, number> = { low: 1, normal: 2, high: 3 };
              const aOrder = a.task.priority ? (order[a.task.priority] ?? 4) : 4;
              const bOrder = b.task.priority ? (order[b.task.priority] ?? 4) : 4;
              return aOrder - bOrder;
            })()
          : compareBySortField(a.task, b.task, field);
      if (cmp !== 0) return cmp;
    }
    const projectCmp = a.task.projectId.localeCompare(b.task.projectId);
    if (projectCmp !== 0) return projectCmp;
    const localCmp = a.task.localId.localeCompare(b.task.localId, undefined, { numeric: true });
    if (localCmp !== 0) return localCmp;
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
    filters.push(filterByEnergyAny(options.energy));
  }
  if (options.priority) {
    filters.push(filterByPriorityAny(options.priority));
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
  return tokenizeQuery(query);
}
