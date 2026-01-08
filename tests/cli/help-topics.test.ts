import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('tmd help topics', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('prints topics index', async () => {
    const { printHelpTopicsIndex } = await import('../../src/cli/help-topics.js');
    printHelpTopicsIndex();
    const out = logSpy.mock.calls.map((c: unknown[]) => String(c[0] ?? '')).join('\n');
    expect(out).toContain('Help topics');
    expect(out).toContain('config');
    expect(out).toContain('workflows');
  });

  it('prints a specific topic', async () => {
    const { printHelpTopic } = await import('../../src/cli/help-topics.js');
    expect(printHelpTopic('config')).toBe(true);
    const out = logSpy.mock.calls.map((c: unknown[]) => String(c[0] ?? '')).join('\n');
    expect(out).toContain('Help: Config');
    expect(out).toContain('tmd config path');
  });

  it('returns false for unknown topic', async () => {
    const { printHelpTopic } = await import('../../src/cli/help-topics.js');
    expect(printHelpTopic('nope')).toBe(false);
  });
});
