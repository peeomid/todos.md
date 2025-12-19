import { describe, it, expect } from 'vitest';
import { getShorthandHelpLines } from '../../src/tui/shorthand-help.js';

describe('getShorthandHelpLines', () => {
  it('includes priority and bucket shorthands', () => {
    const lines = getShorthandHelpLines().join('\n');
    expect(lines).toContain('(A)');
    expect(lines).toContain('(B)');
    expect(lines).toContain('(C)');
    expect(lines).toContain('! = today');
    expect(lines).toContain('> = upcoming');
    expect(lines).toContain('~ = anytime');
    expect(lines).toContain('? = someday');
  });
});

