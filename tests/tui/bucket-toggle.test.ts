import { describe, expect, it } from 'vitest';
import { getNowToggleChanges } from '../../src/tui/bucket-toggle.js';

describe('getNowToggleChanges', () => {
  it('sets bucket to now when not already now', () => {
    expect(getNowToggleChanges({ bucket: null, plan: null, todayIso: '2025-12-23' })).toEqual({ bucket: 'now' });
    expect(getNowToggleChanges({ bucket: 'today', plan: null, todayIso: '2025-12-23' })).toEqual({ bucket: 'now' });
    expect(getNowToggleChanges({ bucket: 'upcoming', plan: null, todayIso: '2025-12-23' })).toEqual({ bucket: 'now' });
  });

  it('sets bucket back to today when already now', () => {
    expect(getNowToggleChanges({ bucket: 'now', plan: '2025-12-10', todayIso: '2025-12-23' })).toEqual({
      bucket: 'today',
    });
  });

  it('sets plan to today when toggling now→today and plan is empty', () => {
    expect(getNowToggleChanges({ bucket: 'now', plan: null, todayIso: '2025-12-23' })).toEqual({
      bucket: 'today',
      plan: '2025-12-23',
    });
  });
});
