import fs from 'node:fs';

export interface DeleteResult {
  success: boolean;
  error?: string;
  deletedTaskCount?: number;
  deletedLineCount?: number;
}

const TASK_LINE_REGEX = /^(\s*)- \[([ xX])\]\s+(.+)$/;

/**
 * Delete a task (and its indented subtree) from a markdown file.
 *
 * Safety:
 * - Verifies the target line is a task line
 * - Verifies the text (ignoring trailing metadata) matches expectedText
 *
 * Subtree rule:
 * - Deletes the task line itself
 * - Also deletes any following lines that are visually "under" the task (indent > parent indent),
 *   including nested tasks and indented notes.
 * - Blank lines are deleted only if they sit between subtree content and the next subtree line.
 */
export function deleteTaskSubtree(
  filePath: string,
  lineNumber: number,
  expectedText: string
): DeleteResult {
  if (!fs.existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const lineIndex = lineNumber - 1;
  if (lineIndex < 0 || lineIndex >= lines.length) {
    return {
      success: false,
      error: `Line ${lineNumber} out of range (file has ${lines.length} lines)`,
    };
  }

  const line = lines[lineIndex] ?? '';
  const match = line.match(TASK_LINE_REGEX);
  if (!match) {
    return { success: false, error: `Line ${lineNumber} is not a task: "${line}"` };
  }

  const parentIndent = match[1]?.length ?? 0;
  const taskContent = match[3] ?? '';

  const textWithoutMeta = extractTextWithoutMetadata(taskContent);
  const expectedTextWithoutMeta = extractTextWithoutMetadata(expectedText);
  if (!textsMatch(textWithoutMeta, expectedTextWithoutMeta)) {
    return {
      success: false,
      error: `Task text mismatch at line ${lineNumber}. Expected "${expectedTextWithoutMeta}", found "${textWithoutMeta}". Re-run \`tmd index\`.`,
    };
  }

  let endExclusive = lineIndex + 1;
  while (endExclusive < lines.length) {
    const candidate = lines[endExclusive] ?? '';

    if (candidate.trim() === '') {
      // Only delete blank lines if the next non-blank line is still in the subtree.
      let lookahead = endExclusive + 1;
      while (lookahead < lines.length && (lines[lookahead]?.trim() ?? '') === '') lookahead++;
      if (lookahead >= lines.length) break;

      const next = lines[lookahead] ?? '';
      const nextIndent = leadingSpaces(next);
      const nextTaskIndent = next.match(TASK_LINE_REGEX)?.[1]?.length ?? null;
      const inSubtree =
        (nextTaskIndent !== null && nextTaskIndent > parentIndent) || nextIndent > parentIndent;
      if (!inSubtree) break;

      endExclusive++;
      continue;
    }

    const nextTaskMatch = candidate.match(TASK_LINE_REGEX);
    if (nextTaskMatch) {
      const indent = nextTaskMatch[1]?.length ?? 0;
      if (indent <= parentIndent) break;
      endExclusive++;
      continue;
    }

    const indent = leadingSpaces(candidate);
    if (indent <= parentIndent) break;
    endExclusive++;
  }

  const removed = lines.slice(lineIndex, endExclusive);
  const deletedTaskCount = removed.filter((l) => TASK_LINE_REGEX.test(l)).length;

  lines.splice(lineIndex, endExclusive - lineIndex);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');

  return {
    success: true,
    deletedTaskCount,
    deletedLineCount: removed.length,
  };
}

function leadingSpaces(line: string): number {
  const match = line.match(/^\s*/);
  return match?.[0]?.length ?? 0;
}

function extractTextWithoutMetadata(text: string): string {
  return text.replace(/\s*\[[^\]]*\]\s*$/, '').trim();
}

function textsMatch(a: string, b: string): boolean {
  const normalizeA = a.replace(/\s+/g, ' ').trim().toLowerCase();
  const normalizeB = b.replace(/\s+/g, ' ').trim().toLowerCase();
  return normalizeA === normalizeB;
}

