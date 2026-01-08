import { describe, expect, it } from 'vitest';
import { findTmdBlocks, parseTasksInBlock, replaceBlockContent } from '../../src/sync/tmd-block.js';

describe('findTmdBlocks', () => {
  it('finds a single block with query', () => {
    const content = `# Daily Focus

<!-- tmd:start query="status:open bucket:today" -->
- [ ] Task 1 [id:proj:1]
- [ ] Task 2 [id:proj:2]
<!-- tmd:end -->

Other content`;

    const blocks = findTmdBlocks(content);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      startLine: 3,
      endLine: 6,
      query: 'status:open bucket:today',
    });
    expect(blocks[0]?.content).toContain('Task 1');
    expect(blocks[0]?.content).toContain('Task 2');
  });

  it('finds block with name attribute', () => {
    const content = `<!-- tmd:start name="today" query="bucket:today" -->
<!-- tmd:end -->`;

    const blocks = findTmdBlocks(content);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.name).toBe('today');
    expect(blocks[0]?.query).toBe('bucket:today');
  });

  it('finds multiple blocks', () => {
    const content = `<!-- tmd:start query="bucket:today" -->
<!-- tmd:end -->

<!-- tmd:start query="bucket:upcoming" -->
Content here
<!-- tmd:end -->`;

    const blocks = findTmdBlocks(content);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.query).toBe('bucket:today');
    expect(blocks[1]?.query).toBe('bucket:upcoming');
  });

  it('handles single-quoted attributes', () => {
    const content = `<!-- tmd:start query='status:open' name='test' -->
<!-- tmd:end -->`;

    const blocks = findTmdBlocks(content);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.query).toBe('status:open');
    expect(blocks[0]?.name).toBe('test');
  });

  it('skips blocks without query', () => {
    const content = `<!-- tmd:start name="invalid" -->
<!-- tmd:end -->`;

    const blocks = findTmdBlocks(content);

    expect(blocks).toHaveLength(0);
  });

  it('throws on missing end marker', () => {
    const content = `<!-- tmd:start query="status:open" -->
Some content
No end marker`;

    expect(() => findTmdBlocks(content)).toThrow('missing tmd:end marker');
  });

  it('handles empty blocks', () => {
    const content = `<!-- tmd:start query="status:open" -->
<!-- tmd:end -->`;

    const blocks = findTmdBlocks(content);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.content).toBe('');
  });

  it('handles complex queries with multiple filters', () => {
    const content = `<!-- tmd:start query="status:open bucket:today energy:low project:inbox" -->
<!-- tmd:end -->`;

    const blocks = findTmdBlocks(content);

    expect(blocks[0]?.query).toBe('status:open bucket:today energy:low project:inbox');
  });
});

describe('replaceBlockContent', () => {
  it('replaces content between markers', () => {
    const content = `Header

<!-- tmd:start query="status:open" -->
Old content
<!-- tmd:end -->

Footer`;

    const block = {
      startLine: 3,
      endLine: 5,
      query: 'status:open',
      content: 'Old content',
    };

    const result = replaceBlockContent(content, block, '- [ ] New task [id:proj:1]');

    expect(result).toContain('<!-- tmd:start query="status:open" -->');
    expect(result).toContain('- [ ] New task [id:proj:1]');
    expect(result).toContain('<!-- tmd:end -->');
    expect(result).not.toContain('Old content');
    expect(result).toContain('Header');
    expect(result).toContain('Footer');
  });

  it('handles empty new content', () => {
    const content = `<!-- tmd:start query="status:open" -->
Old content
<!-- tmd:end -->`;

    const block = {
      startLine: 1,
      endLine: 3,
      query: 'status:open',
      content: 'Old content',
    };

    const result = replaceBlockContent(content, block, '');

    expect(result).toContain('<!-- tmd:start query="status:open" -->');
    expect(result).toContain('<!-- tmd:end -->');
    expect(result).not.toContain('Old content');
  });
});

describe('parseTasksInBlock', () => {
  it('parses completed and incomplete tasks', () => {
    const blockContent = `- [ ] Open task [id:proj:1]
- [x] Done task [id:proj:2]
- [X] Also done [id:proj:3]`;

    const tasks = parseTasksInBlock(blockContent);

    expect(tasks).toHaveLength(3);
    expect(tasks[0]).toMatchObject({
      globalId: 'proj:1',
      completed: false,
      lineInBlock: 1,
    });
    expect(tasks[1]).toMatchObject({
      globalId: 'proj:2',
      completed: true,
      lineInBlock: 2,
    });
    expect(tasks[2]).toMatchObject({
      globalId: 'proj:3',
      completed: true,
      lineInBlock: 3,
    });
  });

  it('handles dotted IDs', () => {
    const blockContent = `- [ ] Parent task [id:proj:1]
- [ ] Child task [id:proj:1.1]
- [ ] Grandchild [id:proj:1.1.1]`;

    const tasks = parseTasksInBlock(blockContent);

    expect(tasks).toHaveLength(3);
    expect(tasks[0]?.globalId).toBe('proj:1');
    expect(tasks[1]?.globalId).toBe('proj:1.1');
    expect(tasks[2]?.globalId).toBe('proj:1.1.1');
  });

  it('ignores lines without task format', () => {
    const blockContent = `Some text
- [ ] Real task [id:proj:1]
Another line
* Not a task`;

    const tasks = parseTasksInBlock(blockContent);

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.globalId).toBe('proj:1');
  });

  it('ignores tasks without id', () => {
    const blockContent = `- [ ] Task without id
- [ ] Task with id [id:proj:1]`;

    const tasks = parseTasksInBlock(blockContent);

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.globalId).toBe('proj:1');
  });

  it('handles empty content', () => {
    const tasks = parseTasksInBlock('');
    expect(tasks).toHaveLength(0);
  });

  it('handles tasks with extra metadata', () => {
    const blockContent = `- [ ] Task [id:proj:1 energy:low due:2025-12-20]`;

    const tasks = parseTasksInBlock(blockContent);

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.globalId).toBe('proj:1');
  });
});
