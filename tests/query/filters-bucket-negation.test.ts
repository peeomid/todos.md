import { describe, it, expect } from 'vitest';
import { filterByBucket } from '../../src/query/filters.js';
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

describe('filterByBucket', () => {
  it('supports exclusion-only bucket filters via !prefix', () => {
    const f = filterByBucket('!today');
    expect(f(createTask({ bucket: 'today' }))).toBe(false);
    expect(f(createTask({ bucket: 'upcoming' }))).toBe(true);
    expect(f(createTask({ bucket: 'custom' as any }))).toBe(true);
    expect(f(createTask({ bucket: undefined }))).toBe(true);
  });

  it('keeps existing inclusion behavior when no exclusions are used', () => {
    const f = filterByBucket('today,upcoming');
    expect(f(createTask({ bucket: 'today' }))).toBe(true);
    expect(f(createTask({ bucket: 'upcoming' }))).toBe(true);
    expect(f(createTask({ bucket: 'anytime' }))).toBe(false);
    expect(f(createTask({ bucket: undefined }))).toBe(false);
  });

  it('applies exclusions in addition to inclusions', () => {
    const f = filterByBucket('today,upcoming,!today');
    expect(f(createTask({ bucket: 'today' }))).toBe(false);
    expect(f(createTask({ bucket: 'upcoming' }))).toBe(true);
    expect(f(createTask({ bucket: 'anytime' }))).toBe(false);
    expect(f(createTask({ bucket: undefined }))).toBe(false);
  });

  it('allows removing all matches by excluding the only included bucket', () => {
    const f = filterByBucket('today,!today');
    expect(f(createTask({ bucket: 'today' }))).toBe(false);
    expect(f(createTask({ bucket: 'upcoming' }))).toBe(false);
    expect(f(createTask({ bucket: undefined }))).toBe(false);
  });
});

