import fs from 'node:fs';
import path from 'node:path';
import { ConfigSchema, getGlobalConfigPath, type Config } from '../config/loader.js';
import { extractBooleanFlags, extractFlags } from './flag-utils.js';
import { CliUsageError } from './errors.js';
import { renderDailyViewScaffold, renderTodosScaffold } from '../templates/init.js';
import type { TaskIndex } from '../schema/index.js';

interface InitOptions {
  file: string;
  output: string;
  configPath: string;
  createConfig: boolean;
  globalConfig: boolean;
  withIndex: boolean;
  force: boolean;
  dryRun: boolean;
}

export function handleInitCommand(args: string[]): void {
  const options = parseInitFlags(args);
  runInit(options);
}

export function printInitHelp(): void {
  console.log(`Usage: tmd init [options]

Scaffold a new todosmd workspace.

Options:
  --file <path>          Path for primary todo file (default: todos.md)
  --output <path>        Path for generated index file (default: todos.json)
  --config <path>        Path for project config file (default: .todosmd.json)
  --no-config            Skip creating project config
  --global-config        Also initialize global config
  --with-index           Create an empty index scaffold file
  --force                Overwrite existing targets
  --dry-run              Show actions without writing files
  -h, --help             Show help
`);
}

function parseInitFlags(args: string[]): InitOptions {
  const boolFlags = extractBooleanFlags(args, [
    '--no-config',
    '--global-config',
    '--with-index',
    '--force',
    '--dry-run',
  ]);

  const valueFlags = extractFlags(args, ['--file', '--output', '--config']);

  if (args.length > 0) {
    throw new CliUsageError(`Unexpected arguments: ${args.join(' ')}`);
  }

  return {
    file: valueFlags['--file'] ?? 'todos.md',
    output: valueFlags['--output'] ?? 'todos.json',
    configPath: valueFlags['--config'] ?? '.todosmd.json',
    createConfig: !boolFlags.has('--no-config'),
    globalConfig: boolFlags.has('--global-config'),
    withIndex: boolFlags.has('--with-index'),
    force: boolFlags.has('--force'),
    dryRun: boolFlags.has('--dry-run'),
  };
}

function runInit(options: InitOptions): void {
  const { file, output, configPath, createConfig, globalConfig, withIndex, force, dryRun } = options;

  const viewPath = path.join('views', 'daily.md');

  const plannedWrites: Array<{ path: string; contents: string }> = [];

  plannedWrites.push({ path: file, contents: renderTodosScaffold() });
  plannedWrites.push({ path: viewPath, contents: renderDailyViewScaffold() });

  if (createConfig) {
    const config: Config = ConfigSchema.parse({
      files: [file],
      output,
      views: [viewPath],
      defaults: { area: 'inbox', energy: 'normal' },
    });
    plannedWrites.push({ path: configPath, contents: JSON.stringify(config, null, 2) + '\n' });
  }

  if (withIndex) {
    const index: TaskIndex = {
      version: 3,
      generatedAt: new Date().toISOString(),
      files: [file],
      areas: {},
      projects: {},
      sections: {},
      tasks: {},
    };
    plannedWrites.push({ path: output, contents: JSON.stringify(index, null, 2) + '\n' });
  }

  if (globalConfig) {
    const globalPath = getGlobalConfigPath();
    const globalConfigData: Config = ConfigSchema.parse({
      files: ['todos.md'],
      output: 'todos.json',
    });
    plannedWrites.push({ path: globalPath, contents: JSON.stringify(globalConfigData, null, 2) + '\n' });
  }

  // Validate overwrite rules (dry-run warns instead of throwing)
  for (const write of plannedWrites) {
    if (!force && fs.existsSync(write.path)) {
      const message = `File already exists: ${write.path}. Use --force to overwrite.`;
      if (dryRun) {
        console.log(`(dry-run) ${message}`);
        continue;
      }
      throw new CliUsageError(message);
    }
  }

  // Ensure directories exist
  for (const write of plannedWrites) {
    const dir = path.dirname(write.path);
    if (dir !== '.' && !fs.existsSync(dir)) {
      if (dryRun) {
        console.log(`(dry-run) Would create directory: ${dir}`);
      } else {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  // Write files
  for (const write of plannedWrites) {
    if (dryRun) {
      console.log(`(dry-run) Would write: ${write.path}`);
      continue;
    }
    fs.writeFileSync(write.path, write.contents, 'utf-8');
    console.log(`Created: ${write.path}`);
  }

  console.log('');
  console.log('Next steps:');
  console.log('  pnpm tmd index');
  console.log('  pnpm tmd list --json');
  console.log('  pnpm tmd sync');
}
