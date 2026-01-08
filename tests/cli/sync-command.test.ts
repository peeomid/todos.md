import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleSyncCommand } from '../../src/cli/sync-command.js';
import { writeIndexFile } from '../../src/indexer/index-file.js';
import { buildIndex } from '../../src/indexer/indexer.js';

let originalCwd: string;
let tempDir: string;

beforeEach(() => {
  originalCwd = process.cwd();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmd-cli-sync-'));
  process.chdir(tempDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('tmd sync command', () => {
  it('cascades done status to child tasks when pulling from views', () => {
    const markdownPath = path.join(tempDir, 'todos.md');
    fs.writeFileSync(
      markdownPath,
      `# Project [project:proj]

- [ ] Parent task [id:1]
  - [ ] Child task [id:1.1]
`
    );

    const { index } = buildIndex([markdownPath]);
    writeIndexFile(index, path.join(tempDir, 'todos.json'));

    const viewPath = path.join(tempDir, 'view.md');
    fs.writeFileSync(
      viewPath,
      `<!-- tmd:start query="status:all project:proj" -->
- [x] Parent task [id:proj:1]
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

    expect(() => handleSyncCommand(['--file', viewPath, '--pull-only'])).not.toThrow();

    const updatedMarkdown = fs.readFileSync(markdownPath, 'utf-8');
    expect(updatedMarkdown).toContain('- [x] Child task [id:1.1]');
  });
});
