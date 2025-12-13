import { describe, it, expect } from 'vitest';
import { generateNextId, getExistingIdsForProject } from '../../src/editor/id-generator.js';

describe('generateNextId', () => {
  describe('top-level IDs', () => {
    it('generates 1 for empty list', () => {
      expect(generateNextId([])).toBe('1');
    });

    it('increments from existing IDs', () => {
      expect(generateNextId(['1', '2', '3'])).toBe('4');
    });

    it('handles gaps in IDs', () => {
      expect(generateNextId(['1', '5', '10'])).toBe('11');
    });

    it('ignores dotted IDs for top-level', () => {
      expect(generateNextId(['1', '1.1', '1.2', '2'])).toBe('3');
    });

    it('handles non-numeric IDs gracefully', () => {
      expect(generateNextId(['a', 'b', '1'])).toBe('2');
    });
  });

  describe('subtask IDs', () => {
    it('generates first subtask ID', () => {
      expect(generateNextId(['1'], '1')).toBe('1.1');
    });

    it('increments subtask ID', () => {
      expect(generateNextId(['1', '1.1', '1.2'], '1')).toBe('1.3');
    });

    it('handles deeply nested IDs', () => {
      expect(generateNextId(['1', '1.1', '1.1.1', '1.1.2'], '1.1')).toBe('1.1.3');
    });

    it('ignores IDs from other parents', () => {
      expect(generateNextId(['1', '1.1', '2', '2.1', '2.2'], '1')).toBe('1.2');
    });

    it('handles no existing subtasks', () => {
      expect(generateNextId(['1', '2', '3'], '2')).toBe('2.1');
    });

    it('ignores nested subtasks when counting immediate children', () => {
      // When adding under "1", only "1.X" count, not "1.1.X"
      expect(generateNextId(['1', '1.1', '1.1.1', '1.1.2', '1.2'], '1')).toBe('1.3');
    });
  });
});

describe('getExistingIdsForProject', () => {
  it('returns IDs for matching project', () => {
    const tasks = {
      'proj-a:1': { projectId: 'proj-a', localId: '1' },
      'proj-a:2': { projectId: 'proj-a', localId: '2' },
      'proj-b:1': { projectId: 'proj-b', localId: '1' },
    };

    const ids = getExistingIdsForProject(tasks, 'proj-a');

    expect(ids).toEqual(['1', '2']);
  });

  it('returns empty array for non-existent project', () => {
    const tasks = {
      'proj-a:1': { projectId: 'proj-a', localId: '1' },
    };

    const ids = getExistingIdsForProject(tasks, 'proj-b');

    expect(ids).toEqual([]);
  });

  it('handles empty tasks object', () => {
    const ids = getExistingIdsForProject({}, 'proj-a');
    expect(ids).toEqual([]);
  });

  it('includes dotted IDs', () => {
    const tasks = {
      'proj:1': { projectId: 'proj', localId: '1' },
      'proj:1.1': { projectId: 'proj', localId: '1.1' },
      'proj:1.2': { projectId: 'proj', localId: '1.2' },
    };

    const ids = getExistingIdsForProject(tasks, 'proj');

    expect(ids).toContain('1');
    expect(ids).toContain('1.1');
    expect(ids).toContain('1.2');
  });
});
