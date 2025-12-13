import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { lintFiles } from '../../src/linter/linter.js';

const TEST_DIR = path.join(process.cwd(), 'tests', 'fixtures');
const TEST_FILE = path.join(TEST_DIR, 'test-lint.md');

describe('linter rules', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_FILE)) {
      fs.unlinkSync(TEST_FILE);
    }
  });

  it('detects duplicate IDs', () => {
    fs.writeFileSync(
      TEST_FILE,
      `# Project [project:proj]

- [ ] Task A [id:1]
- [ ] Task B [id:1]`
    );

    const { issues } = lintFiles([TEST_FILE]);
    const dupIssue = issues.find((i) => i.rule === 'duplicate-id');

    expect(dupIssue).toBeDefined();
    expect(dupIssue?.severity).toBe('error');
  });

  it('detects invalid date format', () => {
    fs.writeFileSync(
      TEST_FILE,
      `# Project [project:proj]

- [ ] Task [id:1 due:12-25-2025]`
    );

    const { issues } = lintFiles([TEST_FILE]);
    const dateIssue = issues.find((i) => i.rule === 'invalid-date-format');

    expect(dateIssue).toBeDefined();
    expect(dateIssue?.message).toContain('12-25-2025');
  });

  it('detects invalid energy value', () => {
    fs.writeFileSync(
      TEST_FILE,
      `# Project [project:proj]

- [ ] Task [id:1 energy:medium]`
    );

    const { issues } = lintFiles([TEST_FILE]);
    const energyIssue = issues.find((i) => i.rule === 'invalid-energy-value');

    expect(energyIssue).toBeDefined();
  });

  it('allows area-only heading without project ID', () => {
    fs.writeFileSync(
      TEST_FILE,
      `# Work [area:work]

- [ ] Task [id:1]`
    );

    const { issues } = lintFiles([TEST_FILE]);
    const projIssue = issues.find((i) => i.rule === 'project-heading-without-id');

    expect(projIssue).toBeUndefined();
  });

  it('detects heading metadata without project ID when other keys present', () => {
    fs.writeFileSync(
      TEST_FILE,
      `# Project [area:work energy:high]

- [ ] Task [id:1]`
    );

    const { issues } = lintFiles([TEST_FILE]);
    const projIssue = issues.find((i) => i.rule === 'project-heading-without-id');

    expect(projIssue).toBeDefined();
    expect(projIssue?.severity).toBe('error');
  });

  it('detects task outside project', () => {
    fs.writeFileSync(
      TEST_FILE,
      `- [ ] Orphan task [id:1]

# Project [project:proj]`
    );

    const { issues } = lintFiles([TEST_FILE]);
    const orphanIssue = issues.find((i) => i.rule === 'task-outside-project');

    expect(orphanIssue).toBeDefined();
    expect(orphanIssue?.severity).toBe('warning');
  });

  it('detects missing ID as warning', () => {
    fs.writeFileSync(
      TEST_FILE,
      `# Project [project:proj]

- [ ] Task without ID`
    );

    const { issues } = lintFiles([TEST_FILE]);
    const missingIdIssue = issues.find((i) => i.rule === 'missing-id');

    expect(missingIdIssue).toBeDefined();
    expect(missingIdIssue?.severity).toBe('warning');
    expect(missingIdIssue?.fixable).toBe(false); // Use `tmd enrich` instead
  });

  it('passes clean file with no issues', () => {
    fs.writeFileSync(
      TEST_FILE,
      `# Project [project:proj area:work]

- [ ] Task 1 [id:1 energy:low est:30m]
- [ ] Task 2 [id:2 due:2025-12-20]`
    );

    const { issues, summary } = lintFiles([TEST_FILE]);

    expect(summary.errors).toBe(0);
    expect(summary.warnings).toBe(0);
  });
});
