import { describe, expect, it, vi } from 'vitest';
import { runEditFlow } from '../../src/tui/edit-flow.js';

function taskStub(overrides?: Partial<any>): any {
  return {
    globalId: 'proj:1',
    text: 'Old text',
    filePath: '/tmp/todos.md',
    lineNumber: 3,
    ...overrides,
  };
}

describe('runEditFlow', () => {
  it('edits text only when choosing t', async () => {
    const showKeyMenu = vi.fn(async () => 't');
    const promptText = vi.fn(async () => 'New text');
    const readMetadataBlockString = vi.fn(() => '[id:1]');

    const res = await runEditFlow({
      term: {},
      task: taskStub(),
      colorsDisabled: true,
      showKeyMenu,
      promptText,
      readMetadataBlockString,
    });

    expect(res).toEqual({ ok: true, text: 'New text', metadataBlock: '[id:1]' });
    expect(showKeyMenu).toHaveBeenCalled();
    expect(promptText).toHaveBeenCalledTimes(1);
  });

  it('edits metadata only when choosing m', async () => {
    const showKeyMenu = vi.fn(async () => 'm');
    const promptText = vi.fn(async () => '[id:1 priority:high]');
    const readMetadataBlockString = vi.fn(() => '[id:1]');

    const res = await runEditFlow({
      term: {},
      task: taskStub({ lineNumber: 1 }),
      colorsDisabled: true,
      showKeyMenu,
      promptText,
      readMetadataBlockString,
    });

    expect(res).toEqual({ ok: true, text: 'Old text', metadataBlock: '[id:1 priority:high]' });
    expect(promptText).toHaveBeenCalledTimes(1);
  });

  it('returns error for invalid metadata block', async () => {
    const showKeyMenu = vi.fn(async () => 'm');
    const promptText = vi.fn(async () => 'id:1');
    const readMetadataBlockString = vi.fn(() => '[id:1]');

    const res = await runEditFlow({
      term: {},
      task: taskStub({ lineNumber: 1 }),
      colorsDisabled: true,
      showKeyMenu,
      promptText,
      readMetadataBlockString,
    });

    expect(res).toEqual({ ok: false, error: 'Metadata must be empty or a [key:value ...] block' });
  });

  it('returns canceled when user cancels choice or prompt', async () => {
    const showKeyMenu = vi.fn<(..._args: any[]) => Promise<string | null>>(async () => null);
    const promptText = vi.fn<(..._args: any[]) => Promise<string | null>>();

    const res1 = await runEditFlow({
      term: {},
      task: taskStub(),
      colorsDisabled: true,
      showKeyMenu,
      promptText,
    });
    expect(res1).toEqual({ ok: false, canceled: true });

    showKeyMenu.mockResolvedValueOnce('t');
    promptText.mockResolvedValueOnce(null);
    const readMetadataBlockString = vi.fn(() => '[id:1]');

    const res2 = await runEditFlow({
      term: {},
      task: taskStub({ lineNumber: 1 }),
      colorsDisabled: true,
      showKeyMenu,
      promptText,
      readMetadataBlockString,
    });
    expect(res2).toEqual({ ok: false, canceled: true });
  });
});
