import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseRelativeDate } from '../../src/cli/date-utils.js';

describe('parseRelativeDate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('supports today/tomorrow', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-12-19T12:00:00Z'));

    expect(parseRelativeDate('today')).toBe('2025-12-19');
    expect(parseRelativeDate('tomorrow')).toBe('2025-12-20');
  });

  it('supports +Nd and +Nw shortcuts', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-12-19T12:00:00Z'));

    expect(parseRelativeDate('+1d')).toBe('2025-12-20');
    expect(parseRelativeDate('+3d')).toBe('2025-12-22');
    expect(parseRelativeDate('+1w')).toBe('2025-12-26');
    expect(parseRelativeDate('+2w')).toBe('2026-01-02');
  });
});
