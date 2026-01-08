import fs from 'node:fs';
import { parseMetadataBlock, serializeMetadata } from '../parser/metadata-parser.js';

export type TaskStatus = 'open' | 'done';

export interface EditResult {
  success: boolean;
  error?: string;
  previousStatus?: TaskStatus;
  newStatus?: TaskStatus;
  alreadyInState?: boolean;
}

/**
 * Set the status of a task in a markdown file.
 * Changes `- [ ]` to `- [x]` or vice versa.
 *
 * @param filePath - Path to the markdown file
 * @param lineNumber - 1-indexed line number where the task is
 * @param expectedText - Expected task text (for safety check)
 * @param newStatus - Desired status ('open' or 'done')
 * @returns EditResult with success/failure info
 */
export function setTaskStatus(
  filePath: string,
  lineNumber: number,
  expectedText: string,
  newStatus: TaskStatus
): EditResult {
  // Read file
  if (!fs.existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Get line (1-indexed)
  const lineIndex = lineNumber - 1;
  if (lineIndex < 0 || lineIndex >= lines.length) {
    return { success: false, error: `Line ${lineNumber} out of range (file has ${lines.length} lines)` };
  }

  const line = lines[lineIndex]!;

  // Check if it's a task line
  const openMatch = line.match(/^(\s*)- \[ \] (.+)$/);
  const doneMatch = line.match(/^(\s*)- \[x\] (.+)$/);

  if (!openMatch && !doneMatch) {
    return { success: false, error: `Line ${lineNumber} is not a task: "${line}"` };
  }

  const match = openMatch ?? doneMatch!;
  const indent = match[1]!;
  const taskContent = match[2]!;

  // Extract text without metadata for comparison
  const textWithoutMeta = extractTextWithoutMetadata(taskContent);
  const expectedTextWithoutMeta = extractTextWithoutMetadata(expectedText);

  // Compare text (fuzzy - ignore minor differences)
  if (!textsMatch(textWithoutMeta, expectedTextWithoutMeta)) {
    return {
      success: false,
      error: `Task text mismatch at line ${lineNumber}. Expected "${expectedTextWithoutMeta}", found "${textWithoutMeta}". Re-run \`tmd index\`.`,
    };
  }

  // Determine current status
  const currentStatus: TaskStatus = openMatch ? 'open' : 'done';

  // Check if already in desired state
  if (currentStatus === newStatus) {
    return {
      success: true,
      previousStatus: currentStatus,
      newStatus: currentStatus,
      alreadyInState: true,
    };
  }

  const { metadata, textWithoutMetadata } = parseMetadataBlock(taskContent);
  const today = new Date().toISOString().split('T')[0]!;
  metadata.updated = today;

  const metadataStr = serializeMetadata(orderMetadata(metadata));
  const rebuiltContent = metadataStr ? `${textWithoutMetadata} ${metadataStr}` : textWithoutMetadata;

  // Update the line
  const newCheckbox = newStatus === 'done' ? '[x]' : '[ ]';
  const newLine = `${indent}- ${newCheckbox} ${rebuiltContent}`;
  lines[lineIndex] = newLine;

  // Write file back
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');

  return {
    success: true,
    previousStatus: currentStatus,
    newStatus: newStatus,
  };
}

/**
 * Mark a task as done.
 */
export function markTaskDone(filePath: string, lineNumber: number, expectedText: string): EditResult {
  return setTaskStatus(filePath, lineNumber, expectedText, 'done');
}

/**
 * Mark a task as undone (open).
 */
export function markTaskUndone(filePath: string, lineNumber: number, expectedText: string): EditResult {
  return setTaskStatus(filePath, lineNumber, expectedText, 'open');
}

/**
 * Extract task text without the metadata block [key:value ...].
 */
function extractTextWithoutMetadata(text: string): string {
  // Remove trailing metadata block
  return text.replace(/\s*\[[^\]]*\]\s*$/, '').trim();
}

/**
 * Compare two task texts, allowing for minor differences.
 */
function textsMatch(a: string, b: string): boolean {
  // Normalize whitespace and compare
  const normalizeA = a.replace(/\s+/g, ' ').trim().toLowerCase();
  const normalizeB = b.replace(/\s+/g, ' ').trim().toLowerCase();
  return normalizeA === normalizeB;
}

function orderMetadata(metadata: Record<string, string>): Record<string, string> {
  const ordered: Record<string, string> = {};

  if (metadata.id) {
    ordered.id = metadata.id;
  }

  const otherKeys = Object.keys(metadata)
    .filter((k) => k !== 'id')
    .sort();
  for (const key of otherKeys) {
    const value = metadata[key];
    if (value) {
      ordered[key] = value;
    }
  }

  return ordered;
}
