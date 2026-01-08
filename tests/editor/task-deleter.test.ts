import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deleteTaskSubtree } from '../../src/editor/task-deleter.js';

function writeTempFile(content: string): { dir: string; filePath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmd-task-delete-'));
  const filePath = path.join(dir, 'todos.md');
  fs.writeFileSync(filePath, content, 'utf-8');
  return { dir, filePath };
}

describe('deleteTaskSubtree', () => {
  it('deletes a leaf task line', () => {
    const { filePath } = writeTempFile(`- [ ] Parent [id:1]\n- [ ] Leaf [id:2]\n`);

    const res = deleteTaskSubtree(filePath, 2, 'Leaf');
    expect(res.success).toBe(true);

    const out = fs.readFileSync(filePath, 'utf-8');
    expect(out).toBe(`- [ ] Parent [id:1]\n`);
    expect(res.deletedTaskCount).toBe(1);
  });

  it('deletes a task and its indented subtree (tasks + notes)', () => {
    const { filePath } = writeTempFile(
      [
        '- [ ] Keep me [id:1]',
        '- [ ] Parent [id:2]',
        '  note: something',
        '  - [ ] Child A [id:2.1]',
        '',
        '  - [ ] Child B [id:2.2]',
        '- [ ] Sibling [id:3]',
        '',
      ].join('\n')
    );

    const res = deleteTaskSubtree(filePath, 2, 'Parent');
    expect(res.success).toBe(true);
    expect(res.deletedTaskCount).toBe(3);

    const out = fs.readFileSync(filePath, 'utf-8');
    expect(out).toBe(['- [ ] Keep me [id:1]', '- [ ] Sibling [id:3]', ''].join('\n'));
  });

  it('refuses to delete if expected text does not match', () => {
    const { filePath } = writeTempFile(`- [ ] Task A [id:1]\n`);

    const res = deleteTaskSubtree(filePath, 1, 'Different');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Task text mismatch/);

    const out = fs.readFileSync(filePath, 'utf-8');
    expect(out).toBe(`- [ ] Task A [id:1]\n`);
  });
});
