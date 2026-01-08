import { describe, expect, it } from 'vitest';
import { isSpaceKeyName } from '../../src/tui/key-utils.js';

describe('isSpaceKeyName', () => {
  it('treats both SPACE and literal space as space', () => {
    expect(isSpaceKeyName('SPACE')).toBe(true);
    expect(isSpaceKeyName(' ')).toBe(true);
  });

  it('rejects non-space keys', () => {
    expect(isSpaceKeyName('ENTER')).toBe(false);
    expect(isSpaceKeyName('a')).toBe(false);
    expect(isSpaceKeyName('')).toBe(false);
  });
});
