import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('tmd help output', () => {
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errSpy.mockRestore();
  });

  it('includes init command in the main help', async () => {
    const { printHelp } = await import('../../src/cli/help.js');
    printHelp();
    const out = errSpy.mock.calls.map((c: unknown[]) => String(c[0] ?? '')).join('\n');
    expect(out).toContain('init');
    expect(out).toContain('Scaffold a new todosmd workspace');
  });
});

