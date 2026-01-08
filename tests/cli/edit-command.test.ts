import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleEditCommand } from '../../src/cli/edit-command.js';
import { writeIndexFile } from '../../src/indexer/index-file.js';
import { buildIndex } from '../../src/indexer/indexer.js';

let originalCwd: string;
let tempDir: string;

beforeEach(() => {
  originalCwd = process.cwd();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmd-cli-edit-'));
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

describe('tmd edit command', () => {
  it('honors --file flag when editing metadata', () => {
    const markdownPath = path.join(tempDir, 'custom.md');
    fs.writeFileSync(
      markdownPath,
      `# Project [project:proj]

- [ ] Task [id:1 energy:low]
`
    );

    writeIndexFor([markdownPath]);

    expect(() => handleEditCommand(['--file', markdownPath, 'proj:1', '--energy', 'high'])).not.toThrow();

    const updated = fs.readFileSync(markdownPath, 'utf-8');
    expect(updated).toContain('energy:high');
  });

  it('auto-syncs views after editing metadata', () => {
    const markdownPath = path.join(tempDir, 'todos.md');
    fs.writeFileSync(
      markdownPath,
      `# Project [project:proj]

- [ ] Task [id:1 energy:low]
`
    );

    const viewPath = path.join(tempDir, 'view.md');
    fs.writeFileSync(
      viewPath,
      `<!-- tmd:start query="status:all project:proj" -->
- [ ] Task [id:proj:1 energy:low]
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

    handleEditCommand(['proj:1', '--energy', 'high']);

    const updatedView = fs.readFileSync(viewPath, 'utf-8');
    expect(updatedView).toContain('energy:high');
    expect(updatedView).not.toContain('energy:low');
  });

  it('respects --no-sync flag', () => {
    const markdownPath = path.join(tempDir, 'todos.md');
    fs.writeFileSync(
      markdownPath,
      `# Project [project:proj]

- [ ] Task [id:1 energy:low]
`
    );

    const viewPath = path.join(tempDir, 'view.md');
    const originalView = `<!-- tmd:start query="status:all project:proj" -->
- [ ] Task [id:proj:1 energy:low]
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

    handleEditCommand(['proj:1', '--energy', 'high', '--no-sync']);

    const updatedView = fs.readFileSync(viewPath, 'utf-8');
    expect(updatedView).toBe(originalView);

    const updatedMarkdown = fs.readFileSync(markdownPath, 'utf-8');
    expect(updatedMarkdown).toContain('energy:high');
  });
});
