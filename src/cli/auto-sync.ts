import type { Config } from '../config/loader.js';
import { handleSyncCommand } from './sync-command.js';

interface AutoSyncOptions {
  config: Config;
  configPath?: string | null;
  output: string;
  noSync: boolean;
}

export function runAutoSyncIfNeeded(options: AutoSyncOptions): boolean {
  const { config, configPath, output, noSync } = options;

  if (noSync) {
    return false;
  }

  if (!config.views || config.views.length === 0) {
    return false;
  }

  const args: string[] = [];

  if (configPath) {
    args.push('--config', configPath);
  }

  if (output) {
    args.push('--output', output);
  }

  args.push('--push-only');

  handleSyncCommand(args);
  return true;
}
