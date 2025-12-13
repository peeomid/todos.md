/**
 * Render tasks as markdown for sync blocks
 */

import type { Task } from '../schema/index.js';

/**
 * Render tasks as markdown checkbox list
 * Uses global ID in metadata block
 */
export function renderTasksAsMarkdown(tasks: Task[]): string {
  if (tasks.length === 0) {
    return '';
  }

  const lines: string[] = [];

  for (const task of tasks) {
    const checkbox = task.completed ? '[x]' : '[ ]';
    const metadata: string[] = [`id:${task.globalId}`];

    // Include relevant metadata
    if (task.energy && task.energy !== 'normal') {
      metadata.push(`energy:${task.energy}`);
    }
    if (task.priority) {
      metadata.push(`priority:${task.priority}`);
    }
    if (task.est) {
      metadata.push(`est:${task.est}`);
    }
    if (task.due) {
      metadata.push(`due:${task.due}`);
    }
    if (task.plan) {
      metadata.push(`plan:${task.plan}`);
    }
    if (task.bucket) {
      metadata.push(`bucket:${task.bucket}`);
    }

    const metaStr = `[${metadata.join(' ')}]`;
    lines.push(`- ${checkbox} ${task.text} ${metaStr}`);
  }

  return lines.join('\n');
}
