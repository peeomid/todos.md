import { describe, expect, it } from 'vitest';
import { getStickyHeaderLabel } from '../../src/tui/sticky-header.js';

describe('getStickyHeaderLabel', () => {
  it('returns null for empty rows', () => {
    expect(getStickyHeaderLabel([], 0)).toBe(null);
  });

  it('returns nearest header at/before scroll', () => {
    const rows = [
      { kind: 'header' as const, label: 'proj-a — A (2 tasks)' },
      { kind: 'task' as const },
      { kind: 'task' as const },
      { kind: 'header' as const, label: 'proj-b — B (1 task)' },
      { kind: 'task' as const },
    ];

    expect(getStickyHeaderLabel(rows, 0)).toBe('proj-a — A (2 tasks)');
    expect(getStickyHeaderLabel(rows, 1)).toBe('proj-a — A (2 tasks)');
    expect(getStickyHeaderLabel(rows, 2)).toBe('proj-a — A (2 tasks)');
    expect(getStickyHeaderLabel(rows, 3)).toBe('proj-b — B (1 task)');
    expect(getStickyHeaderLabel(rows, 4)).toBe('proj-b — B (1 task)');
  });

  it('clamps scroll out of range', () => {
    const rows = [{ kind: 'header' as const, label: 'proj-a' }, { kind: 'task' as const }];
    expect(getStickyHeaderLabel(rows, -10)).toBe('proj-a');
    expect(getStickyHeaderLabel(rows, 999)).toBe('proj-a');
  });
});

