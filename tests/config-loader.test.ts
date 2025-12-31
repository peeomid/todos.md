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
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmd-config-'));
  process.chdir(tempDir);
  process.env.HOME = tempDir;
});

afterEach(() => {
  process.chdir(originalCwd);
  process.env.HOME = originalHome;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('config loader precedence', () => {
  it('falls back to global config when no local config is present', async () => {
    const globalConfigPath = path.join(tempDir, '.config', 'todosmd');
    fs.mkdirSync(globalConfigPath, { recursive: true });
    fs.writeFileSync(
      path.join(globalConfigPath, 'config.json'),
      JSON.stringify({
        files: ['global.md'],
        output: 'global.json',
      }),
      'utf-8'
    );

    vi.resetModules();
    const { loadConfig } = await import('../src/config/loader.js');
    const config = loadConfig();
    expect(config.files).toEqual(['global.md']);
    expect(config.output).toBe('global.json');
  });

  it('prioritizes local project config over global config', async () => {
    const globalConfigPath = path.join(tempDir, '.config', 'todosmd');
    fs.mkdirSync(globalConfigPath, { recursive: true });
    fs.writeFileSync(
      path.join(globalConfigPath, 'config.json'),
      JSON.stringify({
        files: ['global.md'],
        output: 'global.json',
      }),
      'utf-8'
    );

    fs.writeFileSync(
      path.join(tempDir, '.todosmd.json'),
      JSON.stringify({
        files: ['local.md'],
        output: 'local.json',
      }),
      'utf-8'
    );

    vi.resetModules();
    const { loadConfig } = await import('../src/config/loader.js');
    const config = loadConfig();
    expect(config.files).toEqual(['local.md']);
    expect(config.output).toBe('local.json');
  });

  it('allows CLI overrides via resolveFiles', async () => {
    fs.writeFileSync(
      path.join(tempDir, '.todosmd.json'),
      JSON.stringify({
        files: ['local.md'],
      }),
      'utf-8'
    );

    vi.resetModules();
    const { loadConfig, resolveFiles } = await import('../src/config/loader.js');
    const config = loadConfig();
    const resolved = resolveFiles(config, ['override.md']);
    expect(resolved).toEqual(['override.md']);
  });

  it('accepts interactive.autoEnrichOnReload', async () => {
    fs.writeFileSync(
      path.join(tempDir, '.todosmd.json'),
      JSON.stringify({
        interactive: { autoEnrichOnReload: false },
      }),
      'utf-8'
    );

    vi.resetModules();
    const { loadConfig } = await import('../src/config/loader.js');
    const config = loadConfig();
    expect(config.interactive?.autoEnrichOnReload).toBe(false);
  });
});
