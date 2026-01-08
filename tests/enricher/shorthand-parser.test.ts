import { describe, expect, it } from 'vitest';
import { hasShorthands, parseShorthands } from '../../src/enricher/shorthand-parser.js';

describe('parseShorthands', () => {
  const today = '2025-12-10';

  describe('priority shorthands', () => {
    it('parses (A) as high priority', () => {
      const result = parseShorthands('(A) Important task', false, today);
      expect(result.priority).toBe('high');
      expect(result.priorityShorthand).toBe('(A)');
      expect(result.cleanedText).toBe('Important task');
    });

    it('parses (B) as normal priority', () => {
      const result = parseShorthands('(B) Normal task', false, today);
      expect(result.priority).toBe('normal');
      expect(result.priorityShorthand).toBe('(B)');
      expect(result.cleanedText).toBe('Normal task');
    });

    it('parses (C) as low priority', () => {
      const result = parseShorthands('(C) Low priority task', false, today);
      expect(result.priority).toBe('low');
      expect(result.priorityShorthand).toBe('(C)');
      expect(result.cleanedText).toBe('Low priority task');
    });

    it('keeps priority shorthand when keepShorthands is true', () => {
      const result = parseShorthands('(A) Important task', true, today);
      expect(result.priority).toBe('high');
      expect(result.cleanedText).toBe('(A) Important task');
    });

    it('does not parse (D) as priority', () => {
      const result = parseShorthands('(D) Not a priority', false, today);
      expect(result.priority).toBeUndefined();
      expect(result.cleanedText).toBe('(D) Not a priority');
    });
  });

  describe('bucket symbol shorthands', () => {
    it('parses * as now bucket', () => {
      const result = parseShorthands('* Working on this', false, today);
      expect(result.bucket).toBe('now');
      expect(result.plan).toBeUndefined();
      expect(result.shorthandType).toBe('*');
      expect(result.cleanedText).toBe('Working on this');
    });

    it('parses ! as today bucket with plan', () => {
      const result = parseShorthands('! Do this today', false, today);
      expect(result.bucket).toBe('today');
      expect(result.plan).toBe('2025-12-10');
      expect(result.shorthandType).toBe('!');
      expect(result.cleanedText).toBe('Do this today');
    });

    it('parses > as upcoming bucket without plan', () => {
      const result = parseShorthands('> Do this later', false, today);
      expect(result.bucket).toBe('upcoming');
      expect(result.plan).toBeUndefined();
      expect(result.shorthandType).toBe('>');
      expect(result.cleanedText).toBe('Do this later');
    });

    it('parses ~ as anytime bucket', () => {
      const result = parseShorthands('~ Flexible task', false, today);
      expect(result.bucket).toBe('anytime');
      expect(result.plan).toBeUndefined();
      expect(result.shorthandType).toBe('~');
    });

    it('parses ? as someday bucket', () => {
      const result = parseShorthands('? Maybe someday', false, today);
      expect(result.bucket).toBe('someday');
      expect(result.plan).toBeUndefined();
      expect(result.shorthandType).toBe('?');
    });

    it('keeps bucket symbol when keepShorthands is true', () => {
      const result = parseShorthands('! Do this today', true, today);
      expect(result.bucket).toBe('today');
      expect(result.cleanedText).toBe('! Do this today');
    });
  });

  describe('@tag shorthands', () => {
    it('parses @now as now bucket', () => {
      const result = parseShorthands('Task @now', false, today);
      expect(result.bucket).toBe('now');
      expect(result.plan).toBeUndefined();
      expect(result.shorthandType).toBe('@now');
      expect(result.cleanedText).toBe('Task');
    });

    it('parses @today as today bucket with plan', () => {
      const result = parseShorthands('Task @today needs doing', false, today);
      expect(result.bucket).toBe('today');
      expect(result.plan).toBe('2025-12-10');
      expect(result.shorthandType).toBe('@today');
      expect(result.cleanedText).toBe('Task needs doing');
    });

    it('parses @upcoming as upcoming bucket', () => {
      const result = parseShorthands('Task @upcoming', false, today);
      expect(result.bucket).toBe('upcoming');
      expect(result.plan).toBeUndefined();
      expect(result.shorthandType).toBe('@upcoming');
    });

    it('parses @anytime as anytime bucket', () => {
      const result = parseShorthands('Task @anytime', false, today);
      expect(result.bucket).toBe('anytime');
      expect(result.shorthandType).toBe('@anytime');
    });

    it('parses @someday as someday bucket', () => {
      const result = parseShorthands('Task @someday', false, today);
      expect(result.bucket).toBe('someday');
      expect(result.shorthandType).toBe('@someday');
    });

    it('keeps @tag when keepShorthands is true', () => {
      const result = parseShorthands('Task @today', true, today);
      expect(result.bucket).toBe('today');
      expect(result.cleanedText).toBe('Task @today');
    });
  });

  describe('priority + bucket combinations', () => {
    it('parses (A) ! together', () => {
      const result = parseShorthands('(A) ! High priority today task', false, today);
      expect(result.priority).toBe('high');
      expect(result.bucket).toBe('today');
      expect(result.plan).toBe('2025-12-10');
      expect(result.cleanedText).toBe('High priority today task');
    });

    it('parses (B) > together', () => {
      const result = parseShorthands('(B) > Normal upcoming task', false, today);
      expect(result.priority).toBe('normal');
      expect(result.bucket).toBe('upcoming');
      expect(result.cleanedText).toBe('Normal upcoming task');
    });

    it('symbol shortcut takes priority over @tag', () => {
      const result = parseShorthands('! Task @someday', false, today);
      expect(result.bucket).toBe('today'); // ! wins over @someday
      expect(result.shorthandType).toBe('!');
    });
  });

  describe('no shorthands', () => {
    it('returns undefined values for plain text', () => {
      const result = parseShorthands('Plain task text', false, today);
      expect(result.priority).toBeUndefined();
      expect(result.bucket).toBeUndefined();
      expect(result.plan).toBeUndefined();
      expect(result.shorthandType).toBeUndefined();
      expect(result.cleanedText).toBe('Plain task text');
    });
  });
});

describe('hasShorthands', () => {
  it('returns true for priority shorthand', () => {
    expect(hasShorthands('(A) Task')).toBe(true);
    expect(hasShorthands('(B) Task')).toBe(true);
    expect(hasShorthands('(C) Task')).toBe(true);
  });

  it('returns true for bucket symbols', () => {
    expect(hasShorthands('* Task')).toBe(true);
    expect(hasShorthands('! Task')).toBe(true);
    expect(hasShorthands('> Task')).toBe(true);
    expect(hasShorthands('~ Task')).toBe(true);
    expect(hasShorthands('? Task')).toBe(true);
  });

  it('returns true for @tags', () => {
    expect(hasShorthands('Task @now')).toBe(true);
    expect(hasShorthands('Task @today')).toBe(true);
    expect(hasShorthands('Task @upcoming')).toBe(true);
    expect(hasShorthands('Task @anytime')).toBe(true);
    expect(hasShorthands('Task @someday')).toBe(true);
  });

  it('returns false for plain text', () => {
    expect(hasShorthands('Plain task text')).toBe(false);
  });

  it('returns false for similar but non-matching patterns', () => {
    expect(hasShorthands('(D) Task')).toBe(false);
    expect(hasShorthands('Task @other')).toBe(false);
  });
});
