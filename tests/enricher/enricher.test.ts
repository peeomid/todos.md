import { afterEach, describe, expect, it, vi } from 'vitest';
import { enrichContent } from '../../src/enricher/enricher.js';

describe('enrichContent (ID generation)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('generates dotted IDs for subtasks based on indentation', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-12-26T12:00:00Z'));

    const input = [
      '# Inbox [project:inbox area:life]',
      '',
      '- [ ] Parent task',
      '  - [ ] Child one',
      '  - [ ] Child two',
      '    - [ ] Grandchild',
      '- [ ] Second parent',
      '  - [ ] Child under second',
      '',
    ].join('\n');

    const result = enrichContent(input, 'todos.md', { keepShorthands: false, dryRun: true });

    expect(result.modified).toBe(true);
    const out = result.modifiedContent.split('\n');

    expect(out[2]).toBe('- [ ] Parent task [id:1 created:2025-12-26 updated:2025-12-26]');
    expect(out[3]).toBe('  - [ ] Child one [id:1.1 created:2025-12-26 updated:2025-12-26]');
    expect(out[4]).toBe('  - [ ] Child two [id:1.2 created:2025-12-26 updated:2025-12-26]');
    expect(out[5]).toBe('    - [ ] Grandchild [id:1.2.1 created:2025-12-26 updated:2025-12-26]');
    expect(out[6]).toBe('- [ ] Second parent [id:2 created:2025-12-26 updated:2025-12-26]');
    expect(out[7]).toBe('  - [ ] Child under second [id:2.1 created:2025-12-26 updated:2025-12-26]');
  });

  it('treats the first task indent as the top-level baseline', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-12-26T12:00:00Z'));

    const input = [
      '# Inbox [project:inbox]',
      '',
      '  - [ ] Top A',
      '  - [ ] Top B',
      '    - [ ] Child of B',
      '',
    ].join('\n');

    const result = enrichContent(input, 'todos.md', { keepShorthands: false, dryRun: true });
    const out = result.modifiedContent.split('\n');

    expect(out[2]).toBe('  - [ ] Top A [id:1 created:2025-12-26 updated:2025-12-26]');
    expect(out[3]).toBe('  - [ ] Top B [id:2 created:2025-12-26 updated:2025-12-26]');
    expect(out[4]).toBe('    - [ ] Child of B [id:2.1 created:2025-12-26 updated:2025-12-26]');
  });
});

