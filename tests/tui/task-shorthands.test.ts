import { describe, expect, it } from 'vitest';
import {
  formatBucketSymbolShorthand,
  formatBucketTagShorthand,
  formatPriorityShorthand,
  getTaskShorthandTokens,
} from '../../src/tui/task-shorthands.js';

describe('task shorthands', () => {
  it('formats priority shorthands', () => {
    expect(formatPriorityShorthand('high')).toBe('(A)');
    expect(formatPriorityShorthand('normal')).toBe('(B)');
    expect(formatPriorityShorthand('low')).toBe('(C)');
    expect(formatPriorityShorthand(undefined)).toBe('');
  });

  it('formats bucket symbol shorthands', () => {
    expect(formatBucketSymbolShorthand('now')).toBe('*');
    expect(formatBucketSymbolShorthand('today')).toBe('!');
    expect(formatBucketSymbolShorthand('upcoming')).toBe('>');
    expect(formatBucketSymbolShorthand('anytime')).toBe('~');
    expect(formatBucketSymbolShorthand('someday')).toBe('?');
    expect(formatBucketSymbolShorthand(undefined)).toBe('');
    expect(formatBucketSymbolShorthand('custom')).toBe('');
  });

  it('formats bucket tag shorthands', () => {
    expect(formatBucketTagShorthand('now')).toBe('@now');
    expect(formatBucketTagShorthand('today')).toBe('@today');
    expect(formatBucketTagShorthand('upcoming')).toBe('@upcoming');
    expect(formatBucketTagShorthand('anytime')).toBe('@anytime');
    expect(formatBucketTagShorthand('someday')).toBe('@someday');
    expect(formatBucketTagShorthand(undefined)).toBe('');
    expect(formatBucketTagShorthand('custom')).toBe('');
  });

  it('orders tokens as: priority then bucket', () => {
    expect(getTaskShorthandTokens('high', 'today')).toEqual([
      { kind: 'priority', text: '(A)' },
      { kind: 'bucket', text: '!' },
    ]);
    expect(getTaskShorthandTokens(undefined, 'today')).toEqual([{ kind: 'bucket', text: '!' }]);
    expect(getTaskShorthandTokens('normal', undefined)).toEqual([{ kind: 'priority', text: '(B)' }]);
  });
});
