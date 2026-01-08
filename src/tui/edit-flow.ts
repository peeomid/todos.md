import fs from 'node:fs';
import { parseMetadataBlock, serializeMetadata } from '../parser/metadata-parser.js';
import type { Task } from '../schema/index.js';

const TASK_LINE_REGEX = /^(\s*)-\s*\[([ xX])\]\s+(.*)$/;

function orderMetadata(metadata: Record<string, string>): Record<string, string> {
  const ordered: Record<string, string> = {};
  if (metadata.id) ordered.id = metadata.id;
  const otherKeys = Object.keys(metadata)
    .filter((k) => k !== 'id')
    .sort();
  for (const key of otherKeys) {
    ordered[key] = metadata[key]!;
  }
  return ordered;
}

export function readCurrentMetadataBlockString(task: Task): string {
  const line = fs.readFileSync(task.filePath, 'utf-8').split('\n')[task.lineNumber - 1];
  if (!line) return '';
  const match = line.match(TASK_LINE_REGEX);
  if (!match?.[3]) return '';
  const { metadata } = parseMetadataBlock(match[3]);
  return serializeMetadata(orderMetadata(metadata));
}

export type EditChoice = 't' | 'm';

export type EditFlowResult =
  | { ok: true; text: string; metadataBlock: string }
  | { ok: false; canceled: true }
  | { ok: false; error: string };

export async function runEditFlow(options: {
  term: any;
  task: Task;
  colorsDisabled: boolean;
  readMetadataBlockString?: (task: Task) => string;
  showKeyMenu: (
    term: any,
    title: string,
    lines: string[],
    allowed: string[],
    colorsDisabled: boolean,
    options?: { enter?: string }
  ) => Promise<string | null>;
  promptText: (
    term: any,
    title: string,
    label: string,
    initial: string,
    colorsDisabled: boolean
  ) => Promise<string | null>;
}): Promise<EditFlowResult> {
  const { term, task, colorsDisabled, showKeyMenu, promptText } = options;
  const readMetadataBlockString = options.readMetadataBlockString ?? readCurrentMetadataBlockString;

  const choice = await showKeyMenu(
    term,
    `Edit task — ${task.globalId}`,
    ['Choose what to edit:', '', '[t] text (task description)', '[m] metadata ([key:value ...])', '[Enter] text'],
    ['t', 'm'],
    colorsDisabled,
    { enter: 't' }
  );
  if (!choice) return { ok: false, canceled: true };

  if (choice === 't') {
    const nextText = await promptText(
      term,
      `Edit task text — ${task.globalId}`,
      'Task text:',
      task.text,
      colorsDisabled
    );
    if (nextText === null) return { ok: false, canceled: true };
    const currentMeta = readMetadataBlockString(task);
    return { ok: true, text: nextText.trim(), metadataBlock: currentMeta.trim() };
  }

  if (choice === 'm') {
    const currentMeta = readMetadataBlockString(task);
    const input = await promptText(
      term,
      `Edit metadata — ${task.globalId}`,
      'Metadata block ([key:value ...], empty clears):',
      currentMeta,
      colorsDisabled
    );
    if (input === null) return { ok: false, canceled: true };

    const trimmed = input.trim();
    if (!trimmed) {
      return { ok: true, text: task.text.trim(), metadataBlock: '' };
    }
    if (!(trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      return { ok: false, error: 'Metadata must be empty or a [key:value ...] block' };
    }
    return { ok: true, text: task.text.trim(), metadataBlock: trimmed };
  }

  return { ok: false, canceled: true };
}
