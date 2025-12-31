import { describe, expect, it } from 'vitest';
import { shouldAllowGlobalQuit } from '../../src/tui/key-policy.js';

describe('shouldAllowGlobalQuit', () => {
  it('disables global quit while busy', () => {
    expect(
      shouldAllowGlobalQuit({
        busy: true,
        searchActive: false,
        commandActive: false,
        projectsFilterActive: false,
      })
    ).toBe(false);
  });

  it('disables global quit while search input is active', () => {
    expect(
      shouldAllowGlobalQuit({
        busy: false,
        searchActive: true,
        commandActive: false,
        projectsFilterActive: false,
      })
    ).toBe(false);
  });

  it('disables global quit while command input is active', () => {
    expect(
      shouldAllowGlobalQuit({
        busy: false,
        searchActive: false,
        commandActive: true,
        projectsFilterActive: false,
      })
    ).toBe(false);
  });

  it('disables global quit while projects filter input is active', () => {
    expect(
      shouldAllowGlobalQuit({
        busy: false,
        searchActive: false,
        commandActive: false,
        projectsFilterActive: true,
      })
    ).toBe(false);
  });

  it('allows global quit when no inputs are active', () => {
    expect(
      shouldAllowGlobalQuit({
        busy: false,
        searchActive: false,
        commandActive: false,
        projectsFilterActive: false,
      })
    ).toBe(true);
  });
});

