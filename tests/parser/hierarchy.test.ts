import { describe, it, expect } from 'vitest';
import { parseMarkdownContent } from '../../src/parser/markdown-parser.js';
import { buildHierarchy } from '../../src/parser/hierarchy.js';

describe('buildHierarchy', () => {
  it('assigns project IDs to tasks', () => {
    const content = `# Project A [project:a]

- [ ] Task in A [id:1]

# Project B [project:b]

- [ ] Task in B [id:1]`;

    const parsed = parseMarkdownContent(content, 'test.md');
    const result = buildHierarchy(parsed);

    expect(result[0]?.projectId).toBe('a');
    expect(result[1]?.projectId).toBe('b');
  });

  it('builds parent-child relationships', () => {
    const content = `# Project [project:proj]

- [ ] Parent [id:1]
  - [ ] Child 1 [id:1.1]
  - [ ] Child 2 [id:1.2]
- [ ] Another parent [id:2]`;

    const parsed = parseMarkdownContent(content, 'test.md');
    const result = buildHierarchy(parsed);

    const parent = result.find((t) => t.localId === '1');
    const child1 = result.find((t) => t.localId === '1.1');
    const child2 = result.find((t) => t.localId === '1.2');
    const another = result.find((t) => t.localId === '2');

    expect(parent?.childrenLocalIds).toEqual(['1.1', '1.2']);
    expect(child1?.parentLocalId).toBe('1');
    expect(child2?.parentLocalId).toBe('1');
    expect(another?.parentLocalId).toBeNull();
  });

  it('handles deeply nested tasks', () => {
    const content = `# Project [project:proj]

- [ ] Level 0 [id:1]
  - [ ] Level 1 [id:1.1]
    - [ ] Level 2 [id:1.1.1]`;

    const parsed = parseMarkdownContent(content, 'test.md');
    const result = buildHierarchy(parsed);

    expect(result[2]?.parentLocalId).toBe('1.1');
  });
});
