import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildIndex } from '../../src/indexer/indexer.js';

const TEST_DIR = path.join(process.cwd(), 'tests', 'fixtures');
const TEST_FILE = path.join(TEST_DIR, 'test-todos.md');

describe('buildIndex', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_FILE)) {
      fs.unlinkSync(TEST_FILE);
    }
  });

  it('builds index from markdown file', () => {
    fs.writeFileSync(
      TEST_FILE,
      `# Project [project:proj area:work]

- [ ] Task 1 [id:1 energy:low]
- [x] Task 2 [id:2]`
    );

    const { index, stats } = buildIndex([TEST_FILE]);

    expect(index.version).toBe(3);
    expect(Object.keys(index.projects)).toHaveLength(1);
    expect(Object.keys(index.tasks)).toHaveLength(2);
    expect(stats.tasks.total).toBe(2);
    expect(stats.tasks.open).toBe(1);
    expect(stats.tasks.done).toBe(1);
  });

  it('creates global IDs from project and local ID', () => {
    fs.writeFileSync(
      TEST_FILE,
      `# My Project [project:myproj]

- [ ] Task [id:1]`
    );

    const { index } = buildIndex([TEST_FILE]);

    expect(index.tasks['myproj:1']).toBeDefined();
    expect(index.tasks['myproj:1']?.globalId).toBe('myproj:1');
  });

  it('indexes area-only headings and inherits area for nested projects', () => {
    fs.writeFileSync(
      TEST_FILE,
      `# Work [area:work]

## Project A [project:a]

- [ ] Task [id:1]`
    );

    const { index } = buildIndex([TEST_FILE]);

    expect(index.areas.work).toBeDefined();
    expect(index.areas.work?.name).toBe('Work');
    expect(index.projects.a?.area).toBe('work');
    expect(index.projects.a?.parentArea).toBe('work');
    expect(index.tasks['a:1']?.area).toBe('work');
  });

  it('indexes organizational section headings within a project', () => {
    fs.writeFileSync(
      TEST_FILE,
      `# Work [area:work]

## Project A [project:a]

### Current Sprint
- [ ] Task 1 [id:1]

### Backlog
- [ ] Task 2 [id:2]`
    );

    const { index } = buildIndex([TEST_FILE]);
    const sectionNames = Object.values(index.sections)
      .filter((s) => s.projectId === 'a')
      .map((s) => s.name)
      .sort();

    expect(sectionNames).toEqual(['Backlog', 'Current Sprint']);
  });

  it('warns on duplicate global IDs', () => {
    fs.writeFileSync(
      TEST_FILE,
      `# Project [project:proj]

- [ ] Task A [id:1]
- [ ] Task B [id:1]`
    );

    const { warnings } = buildIndex([TEST_FILE]);

    expect(warnings.some((w) => w.message.includes('Duplicate'))).toBe(true);
  });

  it('builds parent-child with global IDs', () => {
    fs.writeFileSync(
      TEST_FILE,
      `# Project [project:proj]

- [ ] Parent [id:1]
  - [ ] Child [id:1.1]`
    );

    const { index } = buildIndex([TEST_FILE]);

    expect(index.tasks['proj:1']?.childrenIds).toContain('proj:1.1');
    expect(index.tasks['proj:1.1']?.parentId).toBe('proj:1');
  });

  it('inherits area from project', () => {
    fs.writeFileSync(
      TEST_FILE,
      `# Project [project:proj area:work]

- [ ] Task [id:1]`
    );

    const { index } = buildIndex([TEST_FILE]);

    expect(index.tasks['proj:1']?.area).toBe('work');
  });

  it('defaults energy to normal', () => {
    fs.writeFileSync(
      TEST_FILE,
      `# Project [project:proj]

- [ ] Task without energy [id:1]`
    );

    const { index } = buildIndex([TEST_FILE]);

    expect(index.tasks['proj:1']?.energy).toBe('normal');
  });

  it('parses priority field', () => {
    fs.writeFileSync(
      TEST_FILE,
      `# Project [project:proj]

- [ ] High priority [id:1 priority:high]
- [ ] Low priority [id:2 priority:low]`
    );

    const { index } = buildIndex([TEST_FILE]);

    expect(index.tasks['proj:1']?.priority).toBe('high');
    expect(index.tasks['proj:2']?.priority).toBe('low');
  });

  it('parses bucket and plan fields', () => {
    fs.writeFileSync(
      TEST_FILE,
      `# Project [project:proj]

- [ ] Today task [id:1 bucket:today plan:2025-12-10]`
    );

    const { index } = buildIndex([TEST_FILE]);

    expect(index.tasks['proj:1']?.bucket).toBe('today');
    expect(index.tasks['proj:1']?.plan).toBe('2025-12-10');
  });

  it('handles tasks with all metadata fields', () => {
    fs.writeFileSync(
      TEST_FILE,
      `# Project [project:proj area:work]

- [ ] Full task [id:1 energy:high priority:high est:2h due:2025-12-20 bucket:today plan:2025-12-10 tags:urgent,important]`
    );

    const { index } = buildIndex([TEST_FILE]);
    const task = index.tasks['proj:1'];

    expect(task?.energy).toBe('high');
    expect(task?.priority).toBe('high');
    expect(task?.est).toBe('2h');
    expect(task?.due).toBe('2025-12-20');
    expect(task?.bucket).toBe('today');
    expect(task?.plan).toBe('2025-12-10');
    expect(task?.tags).toEqual(['urgent', 'important']);
    expect(task?.area).toBe('work');
  });
});
