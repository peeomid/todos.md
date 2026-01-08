import { describe, expect, it } from 'vitest';
import { parseMarkdownContent } from '../../src/parser/markdown-parser.js';

describe('parseMarkdownContent', () => {
  it('parses projects from headings', () => {
    const content = `# My Project [project:myproj area:work]

- [ ] Task [id:1]`;

    const result = parseMarkdownContent(content, 'test.md');

    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]).toMatchObject({
      id: 'myproj',
      name: 'My Project',
      area: 'work',
    });
  });

  it('parses tasks with metadata', () => {
    const content = `# Project [project:proj]

- [ ] Open task [id:1 energy:low est:30m]
- [x] Done task [id:2]`;

    const result = parseMarkdownContent(content, 'test.md');

    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[0]).toMatchObject({
      localId: '1',
      text: 'Open task',
      completed: false,
      metadata: { id: '1', energy: 'low', est: '30m' },
    });
    expect(result.tasks[1]).toMatchObject({
      localId: '2',
      completed: true,
    });
  });

  it('tracks indentation levels', () => {
    const content = `# Project [project:proj]

- [ ] Parent [id:1]
  - [ ] Child [id:1.1]
    - [ ] Grandchild [id:1.1.1]`;

    const result = parseMarkdownContent(content, 'test.md');

    expect(result.tasks[0]?.indentLevel).toBe(0);
    expect(result.tasks[1]?.indentLevel).toBe(2);
    expect(result.tasks[2]?.indentLevel).toBe(4);
  });

  it('parses frontmatter', () => {
    const content = `---
task_format_version: 1
---

# Project [project:proj]`;

    const result = parseMarkdownContent(content, 'test.md');

    expect(result.formatVersion).toBe(1);
  });

  it('handles tasks without ID', () => {
    const content = `# Project [project:proj]

- [ ] Task without ID
- [ ] Task with ID [id:1]`;

    const result = parseMarkdownContent(content, 'test.md');

    expect(result.tasks[0]?.localId).toBeNull();
    expect(result.tasks[1]?.localId).toBe('1');
  });
});
