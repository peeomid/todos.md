import { describe, expect, it } from 'vitest';
import { normalizeListQueryArgs } from '../../src/cli/list-command.js';

describe('normalizeListQueryArgs', () => {
  it('expands status shorthand tokens', () => {
    expect(normalizeListQueryArgs(['done'])).toEqual(['status:done']);
    expect(normalizeListQueryArgs(['open'])).toEqual(['status:open']);
    expect(normalizeListQueryArgs(['all'])).toEqual(['status:all']);
  });

  it('maps date specs to updated when done is present', () => {
    expect(normalizeListQueryArgs(['done', 'yesterday'])).toEqual(['status:done', 'updated:yesterday']);
    expect(normalizeListQueryArgs(['status:done', '2026-01-14'])).toEqual(['status:done', 'updated:2026-01-14']);
    expect(normalizeListQueryArgs(['done', '2026-01-01:2026-01-07'])).toEqual([
      'status:done',
      'updated:2026-01-01:2026-01-07',
    ]);
  });

  it('keeps today shortcut for non-done queries', () => {
    expect(normalizeListQueryArgs(['today'])).toEqual(['(bucket:today | plan:today | due:today)']);
    expect(normalizeListQueryArgs(['open', 'today'])).toEqual([
      'status:open',
      '(bucket:today | plan:today | due:today)',
    ]);
  });

  it('maps today to updated when done is present', () => {
    expect(normalizeListQueryArgs(['done', 'today'])).toEqual(['status:done', 'updated:today']);
  });

  it('does not rewrite explicit filters', () => {
    expect(normalizeListQueryArgs(['status:done', 'updated:yesterday'])).toEqual(['status:done', 'updated:yesterday']);
    expect(normalizeListQueryArgs(['done', 'due:today'])).toEqual(['status:done', 'due:today']);
  });
});
