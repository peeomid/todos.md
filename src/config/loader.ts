import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export const ConfigSchema = z.object({
  files: z.array(z.string()).default(['todos.md']),
  output: z.string().default('todos.json'),
  views: z.array(z.string()).optional(),
  interactive: z
    .object({
      views: z
        .array(
          z.object({
            key: z.string(),
            name: z.string(),
            query: z.string(),
            sort: z.string().optional(),
          })
        )
        .optional(),
      groupBy: z.enum(['project', 'none']).optional(),
      colors: z
        .object({
          disable: z.boolean().optional(),
        })
        .optional(),
      defaultProject: z.string().optional(),
    })
    .optional(),
  defaults: z
    .object({
      area: z.string().optional(),
      energy: z.enum(['low', 'normal', 'high']).optional(),
    })
    .optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

const CONFIG_FILENAME = '.todosmd.json';
const DEFAULT_GLOBAL_CONFIG_PATH = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? '',
  '.config',
  'todosmd',
  'config.json'
);

export function getDefaultProjectConfigPath(startDir: string = process.cwd()): string {
  return path.join(startDir, CONFIG_FILENAME);
}

export function getGlobalConfigPath(): string {
  // Recompute each call so tests that stub HOME behave correctly.
  return path.join(
    process.env.HOME ?? process.env.USERPROFILE ?? '',
    '.config',
    'todosmd',
    'config.json'
  );
}

export function findConfigPath(startDir: string = process.cwd()): string | null {
  let dir = startDir;
  while (true) {
    const configPath = path.join(dir, CONFIG_FILENAME);
    if (fs.existsSync(configPath)) {
      return configPath;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return null;
}

export function loadConfig(configPath?: string): Config {
  const pathToLoad = configPath ?? findConfigPath() ?? getGlobalConfigPath() ?? DEFAULT_GLOBAL_CONFIG_PATH;

  if (!fs.existsSync(pathToLoad)) {
    return ConfigSchema.parse({});
  }

  try {
    const content = fs.readFileSync(pathToLoad, 'utf-8');
    const parsed = JSON.parse(content);
    return ConfigSchema.parse(parsed);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in config file: ${pathToLoad}`);
    }
    throw error;
  }
}

export function resolveFiles(config: Config, fileFlags: string[]): string[] {
  if (fileFlags.length > 0) {
    return fileFlags;
  }
  return config.files;
}

export function resolveOutput(config: Config, outputFlag?: string): string {
  return outputFlag ?? config.output;
}
