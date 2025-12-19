import type { Priority } from '../schema/index.js';

export type TaskShorthandToken = { kind: 'priority' | 'bucket'; text: string };

export function formatPriorityShorthand(priority: Priority | undefined): string {
  if (priority === 'high') return '(A)';
  if (priority === 'normal') return '(B)';
  if (priority === 'low') return '(C)';
  return '';
}

export function formatBucketSymbolShorthand(bucket: string | undefined): string {
  if (bucket === 'today') return '!';
  if (bucket === 'upcoming') return '>';
  if (bucket === 'anytime') return '~';
  if (bucket === 'someday') return '?';
  return '';
}

export function formatBucketTagShorthand(bucket: string | undefined): string {
  if (bucket === 'today') return '@today';
  if (bucket === 'upcoming') return '@upcoming';
  if (bucket === 'anytime') return '@anytime';
  if (bucket === 'someday') return '@someday';
  return '';
}

export function getTaskShorthandTokens(
  priority: Priority | undefined,
  bucket: string | undefined
): TaskShorthandToken[] {
  const tokens: TaskShorthandToken[] = [];
  const pri = formatPriorityShorthand(priority);
  if (pri) tokens.push({ kind: 'priority', text: pri });

  const buck = formatBucketSymbolShorthand(bucket);
  if (buck) tokens.push({ kind: 'bucket', text: buck });

  return tokens;
}
