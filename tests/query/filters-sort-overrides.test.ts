import { describe, it, expect } from 'vitest';
import { sortTasksByFields, sortTasksByFieldsWithOverrides } from '../../src/query/filters.js';
import type { Task } from '../../src/schema/index.js';

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    globalId: 'proj:1',
    localId: '1',
    projectId: 'proj',
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

describe('sortTasksByFieldsWithOverrides', () => {
  it('sorts priority high-first by default', () => {
    const tasks: Task[] = [
      createTask({ globalId: 'p:1', localId: '1', priority: 'low' }),
      createTask({ globalId: 'p:2', localId: '2', priority: 'high' }),
      createTask({ globalId: 'p:3', localId: '3', priority: 'normal' }),
      createTask({ globalId: 'p:4', localId: '4' }), // no priority
    ];

    const out = sortTasksByFields(tasks, ['priority']);
    expect(out.map((t) => t.globalId)).toEqual(['p:2', 'p:3', 'p:1', 'p:4']);
  });

  it('sorts priority low-first while keeping unprioritized tasks last', () => {
    const tasks: Task[] = [
      createTask({ globalId: 'p:1', localId: '1', priority: 'low' }),
      createTask({ globalId: 'p:2', localId: '2', priority: 'high' }),
      createTask({ globalId: 'p:3', localId: '3', priority: 'normal' }),
      createTask({ globalId: 'p:4', localId: '4' }), // no priority
    ];

    const out = sortTasksByFieldsWithOverrides(tasks, ['priority'], { priorityOrder: 'low-first' });
    expect(out.map((t) => t.globalId)).toEqual(['p:1', 'p:3', 'p:2', 'p:4']);
  });

  it('does not let project sort override other fields', () => {
    const tasks: Task[] = [
      createTask({ globalId: 'p:1', projectId: 'p', localId: '1', priority: 'low' }),
      createTask({ globalId: 'p:2', projectId: 'p', localId: '2', priority: 'high' }),
      createTask({ globalId: 'q:1', projectId: 'q', localId: '1', priority: 'high' }),
    ];

    const out = sortTasksByFields(tasks, ['project', 'priority']);
    // Within project "p", priority should apply (high before low).
    expect(out.map((t) => t.globalId)).toEqual(['p:2', 'p:1', 'q:1']);
  });
});
