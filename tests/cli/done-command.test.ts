import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { handleDoneCommand } from '../../src/cli/done-command.js';
import { buildIndex } from '../../src/indexer/indexer.js';
import { writeIndexFile } from '../../src/indexer/index-file.js';

let originalCwd: string;
let tempDir: string;

beforeEach(() => {
  originalCwd = process.cwd();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmd-cli-done-'));
  process.chdir(tempDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('tmd done command', () => {
  it('honors --file flag when marking a task done', () => {
    const markdownPath = path.join(tempDir, 'custom.md');
    fs.writeFileSync(
      markdownPath,
      `# Project [project:proj]

- [ ] Task [id:1]
`
    );

    const { index } = buildIndex([markdownPath]);
    writeIndexFile(index, path.join(tempDir, 'todos.json'));

    expect(() => handleDoneCommand(['--file', markdownPath, 'proj:1'])).not.toThrow();

    const updatedContent = fs.readFileSync(markdownPath, 'utf-8');
    expect(updatedContent).toContain('- [x] Task [id:1]');
  });

  it('auto-syncs configured view files after marking done', () => {
    const markdownPath = path.join(tempDir, 'todos.md');
    fs.writeFileSync(
      markdownPath,
      `# Project [project:proj]

- [ ] Parent task [id:1]
`
    );

    const viewPath = path.join(tempDir, 'view.md');
    fs.writeFileSync(
      viewPath,
      `<!-- tmd:start query="status:all project:proj" -->
- [ ] Parent task [id:proj:1]
<!-- tmd:end -->
`
    );

    fs.writeFileSync(
      path.join(tempDir, '.todosmd.json'),
      JSON.stringify({
        files: ['todos.md'],
        output: 'todos.json',
        views: ['view.md'],
      })
    );

    const { index } = buildIndex([markdownPath]);
    writeIndexFile(index, path.join(tempDir, 'todos.json'));

    expect(() => handleDoneCommand(['proj:1'])).not.toThrow();

    const updatedView = fs.readFileSync(viewPath, 'utf-8');
    expect(updatedView).toContain('- [x] Parent task [id:proj:1]');
  });
});
