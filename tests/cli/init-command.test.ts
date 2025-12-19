import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { handleInitCommand } from '../../src/cli/init-command.js';
import { CliUsageError } from '../../src/cli/errors.js';

let originalCwd: string;
let tempDir: string;

beforeEach(() => {
  originalCwd = process.cwd();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmd-cli-init-'));
  process.chdir(tempDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('tmd init command', () => {
  it('creates scaffold files by default', () => {
    expect(() => handleInitCommand([])).not.toThrow();

    expect(fs.existsSync(path.join(tempDir, 'todos.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.todosmd.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'views', 'daily.md'))).toBe(true);
  });

  it('does not overwrite existing files without --force', () => {
    fs.writeFileSync(path.join(tempDir, 'todos.md'), '# Existing\n', 'utf-8');
    expect(() => handleInitCommand([])).toThrow(CliUsageError);
  });

  it('supports --dry-run without writing files', () => {
    expect(() => handleInitCommand(['--dry-run'])).not.toThrow();

    expect(fs.existsSync(path.join(tempDir, 'todos.md'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, '.todosmd.json'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'views', 'daily.md'))).toBe(false);
  });

  it('creates an index scaffold when --with-index is used', () => {
    expect(() => handleInitCommand(['--with-index'])).not.toThrow();
    const indexPath = path.join(tempDir, 'todos.json');
    expect(fs.existsSync(indexPath)).toBe(true);

    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as { version: number };
    expect(index.version).toBe(1);
  });
});

