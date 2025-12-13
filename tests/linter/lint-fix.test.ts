import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { lintFiles } from '../../src/linter/linter.js';

const TEST_DIR = path.join(process.cwd(), 'tests', 'fixtures');
const TEST_FILE = path.join(TEST_DIR, 'test-lint-fix.md');

describe('lint --fix', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_FILE)) {
      fs.unlinkSync(TEST_FILE);
    }
  });

  describe('duplicate-tags rule', () => {
    it('fixes duplicate tags by removing duplicates', () => {
      fs.writeFileSync(
        TEST_FILE,
        `# Project [project:proj]

- [ ] Task with duplicates [id:1 tags:email,urgent,email,admin,urgent]`
      );

      const { issues, fixed } = lintFiles([TEST_FILE], { fix: true });

      // Should have fixed the issue
      expect(fixed).toBe(1);
      // Should not report fixed issues
      const dupTagsIssues = issues.filter((i) => i.rule === 'duplicate-tags');
      expect(dupTagsIssues).toHaveLength(0);

      // Verify file was modified correctly
      const content = fs.readFileSync(TEST_FILE, 'utf-8');
      expect(content).toContain('tags:email,urgent,admin');
      expect(content).not.toContain('tags:email,urgent,email,admin,urgent');
    });

    it('preserves tag order while deduplicating', () => {
      fs.writeFileSync(
        TEST_FILE,
        `# Project [project:proj]

- [ ] Task [id:1 tags:c,a,b,a,c]`
      );

      lintFiles([TEST_FILE], { fix: true });

      const content = fs.readFileSync(TEST_FILE, 'utf-8');
      expect(content).toContain('tags:c,a,b');
    });

    it('handles multiple tasks with duplicate tags', () => {
      fs.writeFileSync(
        TEST_FILE,
        `# Project [project:proj]

- [ ] Task 1 [id:1 tags:a,b,a]
- [ ] Task 2 [id:2 tags:x,y,x,z]`
      );

      const { fixed } = lintFiles([TEST_FILE], { fix: true });

      expect(fixed).toBe(2);

      const content = fs.readFileSync(TEST_FILE, 'utf-8');
      expect(content).toContain('tags:a,b');
      expect(content).toContain('tags:x,y,z');
    });

    it('does not modify file when fix is false', () => {
      const original = `# Project [project:proj]

- [ ] Task [id:1 tags:email,urgent,email]`;
      fs.writeFileSync(TEST_FILE, original);

      const { issues, fixed } = lintFiles([TEST_FILE], { fix: false });

      expect(fixed).toBe(0);
      expect(issues.filter((i) => i.rule === 'duplicate-tags')).toHaveLength(1);

      // File should not be modified
      const content = fs.readFileSync(TEST_FILE, 'utf-8');
      expect(content).toBe(original);
    });

    it('reports unfixable issues normally', () => {
      fs.writeFileSync(
        TEST_FILE,
        `# Project [project:proj]

- [ ] Task 1 [id:1]
- [ ] Task 2 [id:1]`
      );

      const { issues, fixed } = lintFiles([TEST_FILE], { fix: true });

      // Duplicate ID is not fixable, should still be reported
      expect(fixed).toBe(0);
      expect(issues.some((i) => i.rule === 'duplicate-id')).toBe(true);
    });
  });
});
