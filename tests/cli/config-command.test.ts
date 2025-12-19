import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let originalCwd: string;
let tempDir: string;
let originalHome: string | undefined;

beforeEach(() => {
  originalCwd = process.cwd();
  originalHome = process.env.HOME;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmd-cli-config-'));
  process.chdir(tempDir);
  process.env.HOME = tempDir;
});

afterEach(() => {
  process.chdir(originalCwd);
  process.env.HOME = originalHome;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('tmd config command', () => {
  it('creates a project config with defaults', async () => {
    vi.resetModules();
    const { handleConfigCommand } = await import('../../src/cli/config-command.js');

    expect(() => handleConfigCommand(['init'])).not.toThrow();

    const configPath = path.join(tempDir, '.todosmd.json');
    expect(fs.existsSync(configPath)).toBe(true);
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { files: string[]; output: string };
    expect(config.files).toEqual(['todos.md']);
    expect(config.output).toBe('todos.json');
  });

  it('creates a global config when --global is used', async () => {
    vi.resetModules();
    const { handleConfigCommand } = await import('../../src/cli/config-command.js');

    expect(() => handleConfigCommand(['init', '--global'])).not.toThrow();

    const globalConfigPath = path.join(tempDir, '.config', 'todosmd', 'config.json');
    expect(fs.existsSync(globalConfigPath)).toBe(true);
  });

  it('sets a value in project config (creating file if missing)', async () => {
    vi.resetModules();
    const { handleConfigCommand } = await import('../../src/cli/config-command.js');

    expect(() => handleConfigCommand(['set', 'output', 'tasks.json'])).not.toThrow();

    const configPath = path.join(tempDir, '.todosmd.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { output: string };
    expect(config.output).toBe('tasks.json');
  });
});

