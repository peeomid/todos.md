import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleAddCommand } from '../../src/cli/add-command.js';
import { writeIndexFile } from '../../src/indexer/index-file.js';
import { buildIndex } from '../../src/indexer/indexer.js';

let originalCwd: string;
let tempDir: string;

beforeEach(() => {
  originalCwd = process.cwd();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmd-cli-add-'));
  process.chdir(tempDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function writeIndexFor(files: string[]): void {
  const { index } = buildIndex(files);
  writeIndexFile(index, path.join(tempDir, 'todos.json'));
}

describe('tmd add command', () => {
  it('honors --file flag when adding a task', () => {
    const markdownPath = path.join(tempDir, 'custom.md');
    fs.writeFileSync(markdownPath, `# Project [project:proj]\n`);

    writeIndexFor([markdownPath]);

    expect(() => handleAddCommand(['--file', markdownPath, 'proj', 'New task'])).not.toThrow();

    const updated = fs.readFileSync(markdownPath, 'utf-8');
    expect(updated).toContain('- [ ] New task [id:1');
  });

  it('auto-syncs view files after adding when configured', () => {
    const markdownPath = path.join(tempDir, 'todos.md');
    fs.writeFileSync(markdownPath, `# Project [project:proj]\n`);

    const viewPath = path.join(tempDir, 'view.md');
    fs.writeFileSync(
      viewPath,
      `<!-- tmd:start query="status:all project:proj" -->
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

    writeIndexFor([markdownPath]);

    handleAddCommand(['proj', 'New task for sync']);

    const updatedView = fs.readFileSync(viewPath, 'utf-8');
    expect(updatedView).toContain('New task for sync');
  });

  it('respects --no-sync flag', () => {
    const markdownPath = path.join(tempDir, 'todos.md');
    fs.writeFileSync(markdownPath, `# Project [project:proj]\n`);

    const viewPath = path.join(tempDir, 'view.md');
    const originalView = `<!-- tmd:start query="status:all project:proj" -->
- [ ] Placeholder [id:proj:0]
<!-- tmd:end -->
`;
    fs.writeFileSync(viewPath, originalView);

    fs.writeFileSync(
      path.join(tempDir, '.todosmd.json'),
      JSON.stringify({
        files: ['todos.md'],
        output: 'todos.json',
        views: ['view.md'],
      })
    );

    writeIndexFor([markdownPath]);

    handleAddCommand(['proj', 'Task without sync', '--no-sync']);

    const updatedView = fs.readFileSync(viewPath, 'utf-8');
    expect(updatedView).toBe(originalView);

    const updatedMarkdown = fs.readFileSync(markdownPath, 'utf-8');
    expect(updatedMarkdown).toContain('Task without sync');
  });
});
