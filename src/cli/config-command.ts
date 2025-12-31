import fs from 'node:fs';
import path from 'node:path';
import {
  ConfigSchema,
  findConfigPath,
  getDefaultProjectConfigPath,
  getGlobalConfigPath,
  loadConfig,
  type Config,
} from '../config/loader.js';
import { extractBooleanFlags } from './flag-utils.js';
import { CliUsageError } from './errors.js';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export function handleConfigCommand(args: string[]): void {
  extractBooleanFlags(args, ['--global-config', '-G']);
  if (args.length === 0) {
    throw new CliUsageError('Usage: tmd config <init|get|set|list|path> [args]');
  }

  const subcommand = args.shift();
  if (!subcommand) {
    throw new CliUsageError('Usage: tmd config <init|get|set|list|path> [args]');
  }

  switch (subcommand) {
    case 'init':
      runConfigInit(args);
      return;
    case 'get':
      runConfigGet(args);
      return;
    case 'set':
      runConfigSet(args);
      return;
    case 'list':
      runConfigList(args);
      return;
    case 'path':
      runConfigPath(args);
      return;
    default:
      throw new CliUsageError(`Unknown subcommand 'config ${subcommand}'.`);
  }
}

export function printConfigHelp(): void {
  console.log(`Usage: tmd config <subcommand> [options]

Configuration subcommands:
  init                Create a new config file
  get <key>           Get a config value (supports dot paths)
  set <key> <value>   Set a config value (supports dot paths)
  list                List all config values
  path                Show config paths and active source

Examples:
  tmd config init
  tmd config init --global
  tmd config get files
  tmd config set output todos.json
  tmd config list --json
  tmd config path
`);
}

export function printConfigInitHelp(): void {
  console.log(`Usage: tmd config init [options]

Create a new config file.

Options:
  --global   Create global config instead of project config
  --force    Overwrite existing config file
  --json     Output as JSON
`);
}

export function printConfigGetHelp(): void {
  console.log(`Usage: tmd config get <key> [options]

Get a config value. Supports dot paths (e.g. defaults.area).

Options:
  --json     Output as JSON
`);
}

export function printConfigSetHelp(): void {
  console.log(`Usage: tmd config set <key> <value> [options]

Set a config value. Supports dot paths (e.g. defaults.area).

Options:
  --global   Write to global config instead of project config
  --json     Output as JSON
`);
}

export function printConfigListHelp(): void {
  console.log(`Usage: tmd config list [options]

List config values from the active config source.

Options:
  --json     Output as JSON
`);
}

export function printConfigPathHelp(): void {
  console.log(`Usage: tmd config path [options]

Show project/global config paths and which one is active.

Options:
  --json     Output as JSON
`);
}

function runConfigInit(args: string[]): void {
  const boolFlags = extractBooleanFlags(args, ['--global', '--force', '--json']);
  if (args.length > 0) {
    throw new CliUsageError(`Unexpected arguments: ${args.join(' ')}`);
  }

  const targetPath = boolFlags.has('--global')
    ? getGlobalConfigPath()
    : getDefaultProjectConfigPath(process.cwd());

  if (fs.existsSync(targetPath) && !boolFlags.has('--force')) {
    throw new CliUsageError(
      `Config already exists at ${targetPath}. Use --force to overwrite.`
    );
  }

  ensureParentDir(targetPath);

  const config: Config = ConfigSchema.parse({
    files: ['todos.md'],
    output: 'todos.json',
  });

  fs.writeFileSync(targetPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

  if (boolFlags.has('--json')) {
    console.log(
      JSON.stringify(
        {
          success: true,
          path: targetPath,
          config,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`Created: ${targetPath}`);
}

function runConfigGet(args: string[]): void {
  const boolFlags = extractBooleanFlags(args, ['--json']);

  if (args.length < 1) {
    throw new CliUsageError('Usage: tmd config get <key>');
  }
  const key = args[0]!;

  const { config, source } = loadActiveConfigWithSource();
  const value = getByPath(config as unknown as JsonValue, key);

  if (boolFlags.has('--json')) {
    console.log(JSON.stringify({ key, value, source }, null, 2));
    return;
  }

  console.log(`${key}: ${JSON.stringify(value)}`);
  console.log(`  Source: ${source}`);
}

function runConfigSet(args: string[]): void {
  const boolFlags = extractBooleanFlags(args, ['--global', '--json']);

  if (args.length < 2) {
    throw new CliUsageError('Usage: tmd config set <key> <value>');
  }

  const key = args[0]!;
  const rawValue = args[1]!;

  const targetPath = boolFlags.has('--global')
    ? getGlobalConfigPath()
    : getDefaultProjectConfigPath(process.cwd());

  const existing = fs.existsSync(targetPath) ? loadConfig(targetPath) : ConfigSchema.parse({});
  const jsonValue = parseValueForKey(key, rawValue);
  const updated = setByPath(existing as unknown as JsonValue, key, jsonValue);
  const validated = ConfigSchema.parse(updated);

  ensureParentDir(targetPath);
  fs.writeFileSync(targetPath, JSON.stringify(validated, null, 2) + '\n', 'utf-8');

  if (boolFlags.has('--json')) {
    console.log(JSON.stringify({ success: true, key, value: jsonValue, path: targetPath }, null, 2));
    return;
  }

  console.log(`Set ${key} = ${JSON.stringify(jsonValue)}`);
  console.log(`  File: ${targetPath}`);
}

function runConfigList(args: string[]): void {
  const boolFlags = extractBooleanFlags(args, ['--json']);
  if (args.length > 0) {
    throw new CliUsageError(`Unexpected arguments: ${args.join(' ')}`);
  }

  const { config, source } = loadActiveConfigWithSource();
  const flattened = flattenObject(config as unknown as JsonValue);

  if (boolFlags.has('--json')) {
    console.log(JSON.stringify({ source, config, flattened }, null, 2));
    return;
  }

  console.log(`Source: ${source}`);
  for (const [key, value] of Object.entries(flattened)) {
    console.log(`${key}: ${JSON.stringify(value)}`);
  }
}

function runConfigPath(args: string[]): void {
  const boolFlags = extractBooleanFlags(args, ['--json']);
  if (args.length > 0) {
    throw new CliUsageError(`Unexpected arguments: ${args.join(' ')}`);
  }

  const projectPath = findConfigPath();
  const globalPath = getGlobalConfigPath();
  const active = projectPath ?? globalPath;

  if (boolFlags.has('--json')) {
    console.log(
      JSON.stringify(
        {
          project: projectPath,
          global: globalPath,
          active,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`Project config: ${projectPath ?? '(none)'}`);
  console.log(`Global config: ${globalPath}`);
  console.log('');
  console.log(`Active: ${active}`);
}

function ensureParentDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadActiveConfigWithSource(): { config: Config; source: string } {
  const projectPath = findConfigPath();
  const globalPath = getGlobalConfigPath();
  const source = projectPath ?? globalPath;
  const config = loadConfig(source);
  return { config, source };
}

function getByPath(value: JsonValue, keyPath: string): JsonValue {
  const parts = keyPath.split('.').filter(Boolean);
  let current: JsonValue = value;
  for (const part of parts) {
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      current = (current as Record<string, JsonValue>)[part] ?? null;
    } else {
      return null;
    }
  }
  return current ?? null;
}

function setByPath(root: JsonValue, keyPath: string, newValue: JsonValue): JsonValue {
  const parts = keyPath.split('.').filter(Boolean);
  if (parts.length === 0) return root;

  const clone: JsonValue = deepClone(root);
  let current: JsonValue = clone;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const isLast = i === parts.length - 1;

    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      throw new CliUsageError(`Cannot set '${keyPath}' on non-object value.`);
    }

    const obj = current as Record<string, JsonValue>;
    if (isLast) {
      obj[part] = newValue;
      break;
    }

    const next = obj[part];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      obj[part] = {};
    }
    current = obj[part]!;
  }

  return clone;
}

function deepClone(value: JsonValue): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function flattenObject(value: JsonValue, prefix: string = ''): Record<string, JsonValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? { [prefix]: value } : {};
  }

  const result: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(value)) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      Object.assign(result, flattenObject(child, nextPrefix));
    } else {
      result[nextPrefix] = child;
    }
  }
  return result;
}

function parseValueForKey(key: string, raw: string): JsonValue {
  const trimmed = raw.trim();

  // Allow JSON values for anything
  if (
    trimmed === 'null' ||
    trimmed === 'true' ||
    trimmed === 'false' ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[') ||
    /^-?\d+(\.\d+)?$/.test(trimmed)
  ) {
    try {
      return JSON.parse(trimmed) as JsonValue;
    } catch {
      // Fall through to string parsing.
    }
  }

  // Convenience: comma-separated for common list keys
  if (key === 'files' || key === 'views') {
    return trimmed.split(',').map((v) => v.trim()).filter(Boolean);
  }

  return trimmed;
}
