import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleUndoneCommand } from '../../src/cli/undone-command.js';
import { writeIndexFile } from '../../src/indexer/index-file.js';
import { buildIndex } from '../../src/indexer/indexer.js';

let originalCwd: string;
let tempDir: string;

beforeEach(() => {
  originalCwd = process.cwd();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmd-cli-undone-'));
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

describe('tmd undone command', () => {
  it('honors --file flag when marking a task open', () => {
    const markdownPath = path.join(tempDir, 'custom.md');
    fs.writeFileSync(
      markdownPath,
      `# Project [project:proj]

- [x] Parent [id:1]
  - [x] Child [id:1.1]
`
    );

    writeIndexFor([markdownPath]);

    expect(() => handleUndoneCommand(['--file', markdownPath, 'proj:1'])).not.toThrow();

    const updated = fs.readFileSync(markdownPath, 'utf-8');
    expect(updated).toContain('- [ ] Parent [id:1');
    expect(updated).toContain('- [x] Child [id:1.1');
  });

  it('auto-syncs views after undo without cascading to children', () => {
    const markdownPath = path.join(tempDir, 'todos.md');
    fs.writeFileSync(
      markdownPath,
      `# Project [project:proj]

- [x] Parent [id:1]
  - [x] Child [id:1.1]
`
    );

    const viewPath = path.join(tempDir, 'view.md');
    fs.writeFileSync(
      viewPath,
      `<!-- tmd:start query="status:all project:proj" -->
- [x] Parent [id:proj:1]
- [x] Child [id:proj:1.1]
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

    handleUndoneCommand(['proj:1']);

    const updatedMarkdown = fs.readFileSync(markdownPath, 'utf-8');
    expect(updatedMarkdown).toContain('- [ ] Parent [id:1');
    expect(updatedMarkdown).toContain('- [x] Child [id:1.1');

    const updatedView = fs.readFileSync(viewPath, 'utf-8');
    expect(updatedView).toContain('- [ ] Parent [id:proj:1');
    expect(updatedView).toContain('- [x] Child [id:proj:1.1');
  });

  it('respects --no-sync flag', () => {
    const markdownPath = path.join(tempDir, 'todos.md');
    fs.writeFileSync(
      markdownPath,
      `# Project [project:proj]

- [x] Parent [id:1]
`
    );

    const viewPath = path.join(tempDir, 'view.md');
    const originalView = `<!-- tmd:start query="status:all project:proj" -->
- [x] Parent [id:proj:1]
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

    handleUndoneCommand(['proj:1', '--no-sync']);

    const updatedView = fs.readFileSync(viewPath, 'utf-8');
    expect(updatedView).toBe(originalView);

    const updatedMarkdown = fs.readFileSync(markdownPath, 'utf-8');
    expect(updatedMarkdown).toContain('- [ ] Parent [id:1');
  });
});
