import { describe, expect, it } from 'vitest';
import {
  applyDefaultStatusToGroups,
  buildFiltersFromOptions,
  composeFilters,
  filterByArea,
  filterByBucket,
  filterByEnergy,
  filterByParent,
  filterByPriority,
  filterByProject,
  filterByStatus,
  filterByTags,
  filterByText,
  filterTopLevel,
  groupTasks,
  parseFilterArg,
  parseFilterArgs,
  sortTasks,
} from '../../src/cli/list-filters.js';
import type { Task } from '../../src/schema/index.js';

// Helper to create a mock task
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

describe('parseFilterArg', () => {
  it('parses valid key:value', () => {
    expect(parseFilterArg('project:inbox')).toEqual({ key: 'project', value: 'inbox' });
    expect(parseFilterArg('status:open')).toEqual({ key: 'status', value: 'open' });
    expect(parseFilterArg('energy:low')).toEqual({ key: 'energy', value: 'low' });
  });

  it('handles values with colons', () => {
    // First colon is the separator
    expect(parseFilterArg('due:2025-12-20')).toEqual({ key: 'due', value: '2025-12-20' });
  });

  it('returns null for invalid formats', () => {
    expect(parseFilterArg('nocolon')).toBeNull();
    expect(parseFilterArg(':nokey')).toBeNull();
    expect(parseFilterArg('novalue:')).toBeNull();
  });
});

describe('parseFilterArgs', () => {
  it('parses multiple filter arguments', () => {
    const args = ['project:inbox', 'status:open', 'energy:low'];
    const result = parseFilterArgs(args);

    expect(result).toEqual({
      project: 'inbox',
      status: 'open',
      energy: 'low',
    });
  });

  it('merges repeated project filters as OR', () => {
    const result = parseFilterArgs(['project:sy', 'project:in', 'status:open']);
    expect(result.project).toBe('sy,in');
  });

  it('parses priority filter', () => {
    const result = parseFilterArgs(['priority:high']);
    expect(result.priority).toBe('high');
  });

  it('parses bucket filter', () => {
    const result = parseFilterArgs(['bucket:today']);
    expect(result.bucket).toBe('today');
  });

  it('parses plan filter', () => {
    const result = parseFilterArgs(['plan:this-week']);
    expect(result.plan).toBe('this-week');
  });

  it('parses text filter', () => {
    const result = parseFilterArgs(['text:search term']);
    expect(result.text).toBe('search term');
  });

  it('parses overdue filter', () => {
    const result = parseFilterArgs(['overdue:true']);
    expect(result.overdue).toBe(true);
  });

  it('parses top-level filter', () => {
    const result = parseFilterArgs(['top-level:true']);
    expect(result.topLevel).toBe(true);
  });

  it('ignores invalid energy/priority/status values', () => {
    const result = parseFilterArgs(['energy:invalid', 'priority:invalid', 'status:invalid']);
    expect(result.energy).toBeUndefined();
    expect(result.priority).toBeUndefined();
    expect(result.status).toBeUndefined();
  });

  it('ignores non-filter arguments', () => {
    const result = parseFilterArgs(['nofilter', 'project:inbox']);
    expect(result.project).toBe('inbox');
  });
});

describe('individual filters', () => {
  describe('filterByProject', () => {
    it('matches tasks with given project', () => {
      const filter = filterByProject('inbox');
      expect(filter(createTask({ projectId: 'inbox' }))).toBe(true);
      expect(filter(createTask({ projectId: 'other' }))).toBe(false);
    });
  });

  describe('filterByArea', () => {
    it('matches tasks with given area', () => {
      const filter = filterByArea('work');
      expect(filter(createTask({ area: 'work' }))).toBe(true);
      expect(filter(createTask({ area: 'personal' }))).toBe(false);
      expect(filter(createTask({ area: undefined }))).toBe(false);
    });
  });

  describe('filterByEnergy', () => {
    it('matches tasks with given energy', () => {
      const filter = filterByEnergy('low');
      expect(filter(createTask({ energy: 'low' }))).toBe(true);
      expect(filter(createTask({ energy: 'high' }))).toBe(false);
    });
  });

  describe('filterByPriority', () => {
    it('matches tasks with given priority', () => {
      const filter = filterByPriority('high');
      expect(filter(createTask({ priority: 'high' }))).toBe(true);
      expect(filter(createTask({ priority: 'low' }))).toBe(false);
      expect(filter(createTask({ priority: undefined }))).toBe(false);
    });
  });

  describe('filterByBucket', () => {
    it('matches tasks with given bucket', () => {
      const filter = filterByBucket('today');
      expect(filter(createTask({ bucket: 'today' }))).toBe(true);
      expect(filter(createTask({ bucket: 'upcoming' }))).toBe(false);
      expect(filter(createTask({ bucket: undefined }))).toBe(false);
    });
  });

  describe('filterByText', () => {
    it('matches case-insensitive substring', () => {
      const filter = filterByText('important');
      expect(filter(createTask({ text: 'This is IMPORTANT task' }))).toBe(true);
      expect(filter(createTask({ text: 'Regular task' }))).toBe(false);
    });
  });

  describe('filterByStatus', () => {
    it('filters open tasks', () => {
      const filter = filterByStatus('open');
      expect(filter(createTask({ completed: false }))).toBe(true);
      expect(filter(createTask({ completed: true }))).toBe(false);
    });

    it('filters done tasks', () => {
      const filter = filterByStatus('done');
      expect(filter(createTask({ completed: true }))).toBe(true);
      expect(filter(createTask({ completed: false }))).toBe(false);
    });

    it('returns all tasks for status:all', () => {
      const filter = filterByStatus('all');
      expect(filter(createTask({ completed: true }))).toBe(true);
      expect(filter(createTask({ completed: false }))).toBe(true);
    });
  });

  describe('filterByTags', () => {
    it('matches any tag in comma-separated list', () => {
      const filter = filterByTags('urgent,important');
      expect(filter(createTask({ tags: ['urgent'] }))).toBe(true);
      expect(filter(createTask({ tags: ['important'] }))).toBe(true);
      expect(filter(createTask({ tags: ['other'] }))).toBe(false);
      expect(filter(createTask({ tags: undefined }))).toBe(false);
    });

    it('is case insensitive', () => {
      const filter = filterByTags('URGENT');
      expect(filter(createTask({ tags: ['urgent'] }))).toBe(true);
    });
  });

  describe('filterByParent', () => {
    it('matches tasks with given parent', () => {
      const filter = filterByParent('proj:1');
      expect(filter(createTask({ parentId: 'proj:1' }))).toBe(true);
      expect(filter(createTask({ parentId: 'proj:2' }))).toBe(false);
      expect(filter(createTask({ parentId: null }))).toBe(false);
    });
  });

  describe('filterTopLevel', () => {
    it('matches tasks without parent', () => {
      const filter = filterTopLevel();
      expect(filter(createTask({ parentId: null }))).toBe(true);
      expect(filter(createTask({ parentId: 'proj:1' }))).toBe(false);
    });
  });
});

describe('composeFilters', () => {
  it('combines multiple filters with AND logic', () => {
    const filters = [filterByProject('inbox'), filterByEnergy('low')];
    const composed = composeFilters(filters);

    expect(composed(createTask({ projectId: 'inbox', energy: 'low' }))).toBe(true);
    expect(composed(createTask({ projectId: 'inbox', energy: 'high' }))).toBe(false);
    expect(composed(createTask({ projectId: 'other', energy: 'low' }))).toBe(false);
  });

  it('returns true-filter for empty array', () => {
    const composed = composeFilters([]);
    expect(composed(createTask())).toBe(true);
  });
});

describe('applyDefaultStatusToGroups', () => {
  it('adds status:open when missing', () => {
    const groups = applyDefaultStatusToGroups([['project:inbox']], 'open');
    expect(groups).toEqual([['project:inbox', 'status:open']]);
  });

  it('preserves existing status filter', () => {
    const groups = applyDefaultStatusToGroups([['status:done', 'project:inbox']], 'open');
    expect(groups).toEqual([['status:done', 'project:inbox']]);
  });

  it('defaults empty group set to status:open', () => {
    const groups = applyDefaultStatusToGroups([], 'open');
    expect(groups).toEqual([['status:open']]);
  });
});

describe('sortTasks', () => {
  it('sorts by priority (high first)', () => {
    const tasks = [
      createTask({ globalId: '1', priority: 'low' }),
      createTask({ globalId: '2', priority: 'high' }),
      createTask({ globalId: '3', priority: 'normal' }),
      createTask({ globalId: '4', priority: undefined }),
    ];

    const sorted = sortTasks(tasks, 'priority');

    expect(sorted.map((t) => t.globalId)).toEqual(['2', '3', '1', '4']);
  });

  it('sorts by bucket (today first)', () => {
    const tasks = [
      createTask({ globalId: '1', bucket: 'someday' }),
      createTask({ globalId: '2', bucket: 'today' }),
      createTask({ globalId: '3', bucket: 'upcoming' }),
      createTask({ globalId: '4', bucket: undefined }),
    ];

    const sorted = sortTasks(tasks, 'bucket');

    expect(sorted.map((t) => t.globalId)).toEqual(['2', '3', '1', '4']);
  });

  it('sorts by due date (earlier first)', () => {
    const tasks = [
      createTask({ globalId: '1', due: '2025-12-20' }),
      createTask({ globalId: '2', due: '2025-12-10' }),
      createTask({ globalId: '3', due: undefined }),
    ];

    const sorted = sortTasks(tasks, 'due');

    expect(sorted.map((t) => t.globalId)).toEqual(['2', '1', '3']);
  });

  it('sorts by energy (low first)', () => {
    const tasks = [
      createTask({ globalId: '1', energy: 'high' }),
      createTask({ globalId: '2', energy: 'low' }),
      createTask({ globalId: '3', energy: 'normal' }),
    ];

    const sorted = sortTasks(tasks, 'energy');

    expect(sorted.map((t) => t.globalId)).toEqual(['2', '3', '1']);
  });
});

describe('groupTasks', () => {
  it('groups by project', () => {
    const tasks = [
      createTask({ projectId: 'proj-a' }),
      createTask({ projectId: 'proj-b' }),
      createTask({ projectId: 'proj-a' }),
    ];

    const groups = groupTasks(tasks, 'project');

    expect(groups.get('proj-a')).toHaveLength(2);
    expect(groups.get('proj-b')).toHaveLength(1);
  });

  it('groups by bucket', () => {
    const tasks = [
      createTask({ bucket: 'today' }),
      createTask({ bucket: 'upcoming' }),
      createTask({ bucket: undefined }),
    ];

    const groups = groupTasks(tasks, 'bucket');

    expect(groups.get('today')).toHaveLength(1);
    expect(groups.get('upcoming')).toHaveLength(1);
    expect(groups.get('(no bucket)')).toHaveLength(1);
  });

  it('returns single group for none', () => {
    const tasks = [createTask(), createTask()];
    const groups = groupTasks(tasks, 'none');

    expect(groups.get('')).toHaveLength(2);
  });
});

describe('buildFiltersFromOptions', () => {
  it('builds filters from options object', () => {
    const options = {
      project: 'inbox',
      status: 'open' as const,
      energy: 'low' as const,
    };

    const filters = buildFiltersFromOptions(options);
    const composed = composeFilters(filters);

    expect(composed(createTask({ projectId: 'inbox', completed: false, energy: 'low' }))).toBe(true);
    expect(composed(createTask({ projectId: 'inbox', completed: true, energy: 'low' }))).toBe(false);
  });

  it('supports OR for repeated/comma-separated project filters', () => {
    const filters = buildFiltersFromOptions({ project: 'sy,in' });
    const composed = composeFilters(filters);

    expect(composed(createTask({ projectId: 'sy' }))).toBe(true);
    expect(composed(createTask({ projectId: 'in' }))).toBe(true);
    expect(composed(createTask({ projectId: 'other' }))).toBe(false);
  });

  it('handles empty options', () => {
    const filters = buildFiltersFromOptions({});
    expect(filters).toHaveLength(0);
  });
});
