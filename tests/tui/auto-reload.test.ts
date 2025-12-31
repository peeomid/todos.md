import { describe, expect, it } from 'vitest';
import { formatAutoReloadLabel, shouldShowAutoReloadIndicator } from '../../src/tui/auto-reload.js';

describe('formatAutoReloadLabel', () => {
  it('formats without files', () => {
    expect(formatAutoReloadLabel([])).toBe('Auto-reloaded');
  });

  it('shows up to two basenames', () => {
    expect(formatAutoReloadLabel(['/a/b/todos.md'])).toBe('Auto-reloaded (todos.md)');
    expect(formatAutoReloadLabel(['/a/b/todos.md', '/x/y/other.md'])).toBe('Auto-reloaded (todos.md, other.md)');
  });

  it('adds +N suffix when more than two files', () => {
    expect(formatAutoReloadLabel(['/a/b/todos.md', '/x/y/other.md', '/z/w/third.md'])).toBe(
      'Auto-reloaded (todos.md, other.md +1)'
    );
  });
});

describe('shouldShowAutoReloadIndicator', () => {
  it('returns true while within TTL', () => {
    expect(shouldShowAutoReloadIndicator({ lastAtMs: 1000, files: ['a'] }, 4999)).toBe(true);
  });

  it('returns false after TTL', () => {
    expect(shouldShowAutoReloadIndicator({ lastAtMs: 1000, files: ['a'] }, 5001)).toBe(false);
  });
});

