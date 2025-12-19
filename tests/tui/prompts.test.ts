import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { promptText, showKeyMenu } from '../../src/tui/prompts.js';

function createTermStub(): any {
  const calls: any[] = [];
  const term: any = (...args: any[]) => calls.push(['write', ...args]);
  term._calls = calls;
  term.clear = vi.fn();
  term.moveTo = vi.fn();
  term.dim = vi.fn((s: string) => calls.push(['dim', s]));
  term.bold = vi.fn((s: string) => calls.push(['bold', s]));
  return term;
}

describe('tui prompts', () => {
  it('promptText works when term.showCursor is missing', async () => {
    const term = createTermStub();
    term.showCursor = undefined;
    term.hideCursor = vi.fn();
    term.inputField = vi.fn((_opts: any, cb: any) => cb(null, 'hello'));

    const res = await promptText(term, 'Title', 'Label', '', false);
    expect(res).toBe('hello');
    expect(term.hideCursor).toHaveBeenCalledWith(false);
    expect(term.hideCursor).toHaveBeenCalledTimes(2);
  });

  it('promptText returns null on cancel/error', async () => {
    const term = createTermStub();
    term.showCursor = undefined;
    term.hideCursor = vi.fn();
    term.inputField = vi.fn((_opts: any, cb: any) => cb(new Error('cancel'), 'ignored'));

    const res = await promptText(term, 'Title', 'Label', '', false);
    expect(res).toBe(null);
    expect(term.hideCursor).toHaveBeenCalledWith(false);
    expect(term.hideCursor).toHaveBeenCalledTimes(2);
  });

  it('showKeyMenu resolves allowed key and cancels on escape', async () => {
    const emitter = new EventEmitter();
    const term = createTermStub();
    term.on = emitter.on.bind(emitter);
    term.removeListener = emitter.removeListener.bind(emitter);

    const p1 = showKeyMenu(term, 'Pick', ['[h] high'], ['h'], true);
    queueMicrotask(() => emitter.emit('key', 'h'));
    await expect(p1).resolves.toBe('h');

    const p2 = showKeyMenu(term, 'Pick', ['[h] high'], ['h'], true);
    queueMicrotask(() => emitter.emit('key', 'ESCAPE'));
    await expect(p2).resolves.toBe(null);
  });
});

