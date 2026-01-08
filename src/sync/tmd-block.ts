/**
 * Parse and manipulate tmd:start/tmd:end blocks in markdown files
 */

export interface TmdBlock {
  startLine: number; // 1-indexed
  endLine: number; // 1-indexed
  query: string;
  name?: string;
  content: string; // Content between markers
}

const START_MARKER_REGEX = /<!--\s*tmd:start\s+(.*?)-->/;
const END_MARKER_REGEX = /<!--\s*tmd:end\s*-->/;
const QUERY_REGEX = /query=["']([^"']+)["']/;
const NAME_REGEX = /name=["']([^"']+)["']/;

/**
 * Find all tmd:start/tmd:end blocks in content
 */
export function findTmdBlocks(content: string): TmdBlock[] {
  const lines = content.split('\n');
  const blocks: TmdBlock[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const startMatch = line.match(START_MARKER_REGEX);

    if (startMatch) {
      const startLine = i + 1; // 1-indexed
      const attributes = startMatch[1] ?? '';

      // Parse query and name
      const queryMatch = attributes.match(QUERY_REGEX);
      const nameMatch = attributes.match(NAME_REGEX);

      if (!queryMatch) {
        // Skip blocks without query
        i++;
        continue;
      }

      const query = queryMatch[1]!;
      const name = nameMatch?.[1];

      // Find end marker
      let endLine = -1;
      const contentLines: string[] = [];

      for (let j = i + 1; j < lines.length; j++) {
        if (END_MARKER_REGEX.test(lines[j]!)) {
          endLine = j + 1; // 1-indexed
          break;
        }
        contentLines.push(lines[j]!);
      }

      if (endLine === -1) {
        // Malformed block - no end marker
        throw new Error(`Malformed block at line ${startLine}: missing tmd:end marker`);
      }

      blocks.push({
        startLine,
        endLine,
        query,
        name,
        content: contentLines.join('\n'),
      });

      i = endLine; // Continue after end marker
    } else {
      i++;
    }
  }

  return blocks;
}

/**
 * Replace the content of a tmd block
 */
export function replaceBlockContent(content: string, block: TmdBlock, newContent: string): string {
  const lines = content.split('\n');

  // Lines between start and end (exclusive)
  const beforeStart = lines.slice(0, block.startLine); // Includes start marker
  const afterEnd = lines.slice(block.endLine - 1); // Includes end marker and after

  const result = [...beforeStart, newContent, ...afterEnd];
  return result.join('\n');
}

/**
 * Parse tasks from a tmd block content
 * Returns task global IDs and their completion status
 */
export interface BlockTask {
  globalId: string;
  completed: boolean;
  lineInBlock: number;
}

const TASK_REGEX = /^-\s+\[([ xX])\]\s+.+\[.*id:([^\s\]]+)/;

export function parseTasksInBlock(blockContent: string): BlockTask[] {
  const tasks: BlockTask[] = [];
  const lines = blockContent.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const match = line.match(TASK_REGEX);

    if (match) {
      const checkbox = match[1];
      const globalId = match[2]!;

      tasks.push({
        globalId,
        completed: checkbox !== ' ',
        lineInBlock: i + 1,
      });
    }
  }

  return tasks;
}
