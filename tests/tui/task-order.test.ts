import { describe, expect, it } from 'vitest';
import type { Task } from '../../src/schema/index.js';
import { orderTasksForTreeView } from '../../src/tui/task-order.js';

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    globalId: 'p:1',
    localId: '1',
    projectId: 'p',
    text: 'Test task',
    completed: false,
    filePath: 'test.md',
    lineNumber: 1,
    indentLevel: 0,
    childrenIds: [],
    parentId: null,
    ...overrides,
  };
}

describe('orderTasksForTreeView', () => {
  it('keeps children under their parent while sorting by plan (subtree key)', () => {
    const parent = createTask({ globalId: 'p:1', localId: '1', lineNumber: 10, indentLevel: 0, parentId: null });
    const child = createTask({
      globalId: 'p:1.1',
      localId: '1.1',
      lineNumber: 11,
      indentLevel: 2,
      parentId: 'p:1',
      plan: '2025-12-26',
    });
    const otherRoot = createTask({
      globalId: 'p:2',
      localId: '2',
      lineNumber: 20,
      indentLevel: 0,
      parentId: null,
      plan: '2025-12-27',
    });

    const out = orderTasksForTreeView([otherRoot, child, parent], ['plan']);
    expect(out.map((t) => t.globalId)).toEqual(['p:1', 'p:1.1', 'p:2']);
  });

  it('supports low-first priority ordering (subtree key)', () => {
    const a = createTask({ globalId: 'p:1', localId: '1', lineNumber: 1, priority: 'high' });
    const b = createTask({ globalId: 'p:2', localId: '2', lineNumber: 10 });
    const bChild = createTask({
      globalId: 'p:2.1',
      localId: '2.1',
      lineNumber: 11,
      indentLevel: 2,
      parentId: 'p:2',
      priority: 'low',
    });

    const out = orderTasksForTreeView([a, b, bChild], ['priority'], { priorityOrder: 'low-first' });
    expect(out.map((t) => t.globalId)).toEqual(['p:2', 'p:2.1', 'p:1']);
  });
});
