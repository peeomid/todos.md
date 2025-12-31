import type { Task } from '../schema/index.js';
import type { SortField } from '../query/filters.js';

type PriorityOrderOverride = 'high-first' | 'low-first';

type SubtreeKey = {
  due: string | null;
  plan: string | null;
  created: string | null;
  energy: number;
  priority: number;
  bucket: number;
};

const ENERGY_ORDER: Record<string, number> = {
  low: 1,
  normal: 2,
  high: 3,
};

const PRIORITY_ORDER_HIGH_FIRST: Record<string, number> = {
  high: 1,
  normal: 2,
  low: 3,
};

const PRIORITY_ORDER_LOW_FIRST: Record<string, number> = {
  low: 1,
  normal: 2,
  high: 3,
};

const BUCKET_ORDER: Record<string, number> = {
  today: 1,
  upcoming: 2,
  anytime: 3,
  someday: 4,
};

function minIsoDate(a: string | null, b: string | null): string | null {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  return a.localeCompare(b) <= 0 ? a : b;
}

function minNum(a: number, b: number): number {
  return a <= b ? a : b;
}

function compareDateNullable(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

function taskOwnKey(task: Task, priorityOrder: PriorityOrderOverride): SubtreeKey {
  const pOrder = priorityOrder === 'low-first' ? PRIORITY_ORDER_LOW_FIRST : PRIORITY_ORDER_HIGH_FIRST;

  return {
    due: task.due ?? null,
    plan: task.plan ?? null,
    created: task.created ?? null,
    energy: ENERGY_ORDER[task.energy ?? 'normal'] ?? 2,
    priority: task.priority ? (pOrder[task.priority] ?? 4) : 4,
    bucket: task.bucket ? (BUCKET_ORDER[task.bucket] ?? 5) : 6,
  };
}

function mergeSubtreeKey(a: SubtreeKey, b: SubtreeKey): SubtreeKey {
  return {
    due: minIsoDate(a.due, b.due),
    plan: minIsoDate(a.plan, b.plan),
    created: minIsoDate(a.created, b.created),
    energy: minNum(a.energy, b.energy),
    priority: minNum(a.priority, b.priority),
    bucket: minNum(a.bucket, b.bucket),
  };
}

export function orderTasksForTreeView(
  tasks: Task[],
  sortBy: SortField[],
  opts?: { priorityOrder?: PriorityOrderOverride }
): Task[] {
  if (tasks.length <= 1) return tasks;

  const priorityOrder: PriorityOrderOverride = opts?.priorityOrder ?? 'high-first';
  const byId = new Map<string, Task>();
  for (const t of tasks) byId.set(t.globalId, t);

  const childrenByParent = new Map<string | null, string[]>();
  for (const t of tasks) {
    const parentKey = t.parentId && byId.has(t.parentId) ? t.parentId : null;
    const arr = childrenByParent.get(parentKey) ?? [];
    arr.push(t.globalId);
    childrenByParent.set(parentKey, arr);
  }

  const keyMemo = new Map<string, SubtreeKey>();
  const visiting = new Set<string>();

  const keyFor = (taskId: string): SubtreeKey => {
    const existing = keyMemo.get(taskId);
    if (existing) return existing;
    if (visiting.has(taskId)) {
      // Cycle fallback: treat the node's own metadata as its key.
      const t = byId.get(taskId);
      const k = t ? taskOwnKey(t, priorityOrder) : taskOwnKey(tasks[0]!, priorityOrder);
      keyMemo.set(taskId, k);
      return k;
    }

    visiting.add(taskId);
    const task = byId.get(taskId);
    let key = task ? taskOwnKey(task, priorityOrder) : taskOwnKey(tasks[0]!, priorityOrder);
    for (const childId of childrenByParent.get(taskId) ?? []) {
      key = mergeSubtreeKey(key, keyFor(childId));
    }
    visiting.delete(taskId);
    keyMemo.set(taskId, key);
    return key;
  };

  const compareIds = (aId: string, bId: string): number => {
    if (aId === bId) return 0;
    const a = byId.get(aId);
    const b = byId.get(bId);
    if (!a || !b) return a ? -1 : b ? 1 : aId.localeCompare(bId);

    const ak = keyFor(aId);
    const bk = keyFor(bId);

    for (const field of sortBy) {
      switch (field) {
        case 'due': {
          const cmp = compareDateNullable(ak.due, bk.due);
          if (cmp !== 0) return cmp;
          break;
        }
        case 'plan': {
          const cmp = compareDateNullable(ak.plan, bk.plan);
          if (cmp !== 0) return cmp;
          break;
        }
        case 'created': {
          const cmp = compareDateNullable(ak.created, bk.created);
          if (cmp !== 0) return cmp;
          break;
        }
        case 'energy': {
          const cmp = ak.energy - bk.energy;
          if (cmp !== 0) return cmp;
          break;
        }
        case 'priority': {
          const cmp = ak.priority - bk.priority;
          if (cmp !== 0) return cmp;
          break;
        }
        case 'bucket': {
          const cmp = ak.bucket - bk.bucket;
          if (cmp !== 0) return cmp;
          break;
        }
        case 'project': {
          // Tree-view ordering is always within a single project; ignore.
          break;
        }
      }
    }

    // Final deterministic tie-breaker: keep file order when sort keys match.
    const byLine = a.lineNumber - b.lineNumber;
    if (byLine !== 0) return byLine;
    const byLocal = a.localId.localeCompare(b.localId, undefined, { numeric: true });
    if (byLocal !== 0) return byLocal;
    return a.globalId.localeCompare(b.globalId);
  };

  for (const [p, ids] of childrenByParent.entries()) {
    ids.sort(compareIds);
    childrenByParent.set(p, ids);
  }

  const out: Task[] = [];
  const emitted = new Set<string>();
  const emit = (taskId: string): void => {
    if (emitted.has(taskId)) return;
    emitted.add(taskId);
    const t = byId.get(taskId);
    if (t) out.push(t);
    for (const childId of childrenByParent.get(taskId) ?? []) {
      emit(childId);
    }
  };

  for (const rootId of childrenByParent.get(null) ?? []) {
    emit(rootId);
  }

  // If there are any unreachable nodes (corrupt parent pointers), append them deterministically.
  if (out.length < tasks.length) {
    const remaining = tasks
      .filter((t) => !emitted.has(t.globalId))
      .map((t) => t.globalId)
      .sort(compareIds);
    for (const id of remaining) emit(id);
  }

  return out;
}
