import { describe, expect, it } from 'vitest';
import { buildFilterGroups, composeFilterGroups, parseQueryToFilterGroups } from '../../src/query/filters.js';
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
    energy: 'normal',
    ...overrides,
  };
}

describe('parseQueryToFilterGroups', () => {
  it('supports pipe OR', () => {
    expect(parseQueryToFilterGroups('bucket:today | plan:today')).toEqual([['bucket:today'], ['plan:today']]);
  });

  it('supports OR keyword (case-insensitive)', () => {
    expect(parseQueryToFilterGroups('bucket:today OR plan:today')).toEqual([['bucket:today'], ['plan:today']]);
    expect(parseQueryToFilterGroups('bucket:today or plan:today')).toEqual([['bucket:today'], ['plan:today']]);
  });

  it('supports grouping with AND outside parentheses', () => {
    expect(parseQueryToFilterGroups('(bucket:today | plan:today) priority:high')).toEqual([
      ['bucket:today', 'priority:high'],
      ['plan:today', 'priority:high'],
    ]);
  });

  it('supports nested grouping', () => {
    const groups = parseQueryToFilterGroups(
      'project:inbox (bucket:today | plan:today) (priority:high | priority:normal)'
    );
    expect(groups).toHaveLength(4);
    expect(groups).toContainEqual(['project:inbox', 'bucket:today', 'priority:high']);
    expect(groups).toContainEqual(['project:inbox', 'bucket:today', 'priority:normal']);
    expect(groups).toContainEqual(['project:inbox', 'plan:today', 'priority:high']);
    expect(groups).toContainEqual(['project:inbox', 'plan:today', 'priority:normal']);
  });

  it('splits OR tokens without spaces', () => {
    expect(parseQueryToFilterGroups('bucket:today|plan:today')).toEqual([['bucket:today'], ['plan:today']]);
  });

  it('ignores unknown tokens outside filter syntax', () => {
    expect(parseQueryToFilterGroups('nonsense bucket:today')).toEqual([['bucket:today']]);
  });

  it('throws on invalid syntax', () => {
    expect(() => parseQueryToFilterGroups('bucket:today |')).toThrow();
    expect(() => parseQueryToFilterGroups('(bucket:today')).toThrow();
    expect(() => parseQueryToFilterGroups('bucket:today )')).toThrow();
  });
});

describe('OR filter evaluation', () => {
  it('matches any group and preserves AND inside groups', () => {
    const groups = parseQueryToFilterGroups('(bucket:today | bucket:upcoming) priority:high');
    const groupFilters = buildFilterGroups(groups);
    const composed = composeFilterGroups(groupFilters);

    expect(composed(createTask({ bucket: 'today', priority: 'high' }))).toBe(true);
    expect(composed(createTask({ bucket: 'upcoming', priority: 'high' }))).toBe(true);
    expect(composed(createTask({ bucket: 'today', priority: 'low' }))).toBe(false);
    expect(composed(createTask({ bucket: 'anytime', priority: 'high' }))).toBe(false);
  });
});
