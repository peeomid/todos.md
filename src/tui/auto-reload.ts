import path from 'node:path';

export interface AutoReloadIndicator {
  lastAtMs: number;
  files: string[];
}

export function formatAutoReloadLabel(files: string[]): string {
  const unique = [...new Set(files)].filter(Boolean);
  if (unique.length === 0) return 'Auto-reloaded';
  const shown = unique
    .slice(0, 2)
    .map((f) => path.basename(f))
    .join(', ');
  const suffix = unique.length > 2 ? ` +${unique.length - 2}` : '';
  return `Auto-reloaded (${shown}${suffix})`;
}

export function shouldShowAutoReloadIndicator(
  indicator: AutoReloadIndicator | null,
  nowMs: number,
  ttlMs = 4000
): indicator is AutoReloadIndicator {
  if (!indicator) return false;
  return nowMs - indicator.lastAtMs <= ttlMs;
}

