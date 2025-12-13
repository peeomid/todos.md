import fs from 'node:fs';
import type { Task, TaskIndex } from '../schema/index.js';

export interface InsertResult {
  success: boolean;
  lineNumber?: number;
  error?: string;
}

export interface TaskMetadata {
  id: string;
  energy?: 'low' | 'normal' | 'high';
  est?: string;
  due?: string;
  plan?: string;
  bucket?: string;
  area?: string;
  tags?: string[];
  created?: string;
}

/**
 * Build a task line with metadata.
 *
 * @param text - Task text
 * @param metadata - Task metadata
 * @param indentLevel - Indentation level (0 for top-level, 2 spaces per level)
 * @returns The formatted task line
 */
export function buildTaskLine(text: string, metadata: TaskMetadata, indentLevel: number = 0): string {
  const indent = '  '.repeat(indentLevel);
  const metaParts: string[] = [`id:${metadata.id}`];

  if (metadata.energy) {
    metaParts.push(`energy:${metadata.energy}`);
  }
  if (metadata.est) {
    metaParts.push(`est:${metadata.est}`);
  }
  if (metadata.due) {
    metaParts.push(`due:${metadata.due}`);
  }
  if (metadata.plan) {
    metaParts.push(`plan:${metadata.plan}`);
  }
  if (metadata.bucket) {
    metaParts.push(`bucket:${metadata.bucket}`);
  }
  if (metadata.area) {
    metaParts.push(`area:${metadata.area}`);
  }
  if (metadata.tags && metadata.tags.length > 0) {
    metaParts.push(`tags:${metadata.tags.join(',')}`);
  }
  if (metadata.created) {
    metaParts.push(`created:${metadata.created}`);
  }

  const metaBlock = `[${metaParts.join(' ')}]`;
  return `${indent}- [ ] ${text} ${metaBlock}`;
}

/**
 * Find the insertion point for a new top-level task in a project.
 *
 * @param lines - File lines
 * @param projectLineNumber - 1-indexed line number of the project heading
 * @param tasks - All tasks in the index
 * @param projectId - The project ID
 * @returns The line number (1-indexed) after which to insert
 */
export function findTopLevelInsertionPoint(
  lines: string[],
  projectLineNumber: number,
  tasks: Record<string, Task>,
  projectId: string
): number {
  // Find all top-level tasks in this project
  const projectTasks = Object.values(tasks)
    .filter((t) => t.projectId === projectId && t.indentLevel === 0)
    .sort((a, b) => a.lineNumber - b.lineNumber);

  if (projectTasks.length === 0) {
    // No tasks yet, insert right after project heading
    return projectLineNumber;
  }

  // Find the last task's block (including all its children)
  const lastTask = projectTasks[projectTasks.length - 1]!;
  return findEndOfTaskBlock(lines, lastTask.lineNumber);
}

/**
 * Find the insertion point for a subtask.
 *
 * @param lines - File lines
 * @param parentTask - The parent task
 * @param tasks - All tasks in the index
 * @returns The line number (1-indexed) after which to insert
 */
export function findSubtaskInsertionPoint(
  lines: string[],
  parentTask: Task,
  tasks: Record<string, Task>
): number {
  // Find all direct children of this parent
  const children = parentTask.childrenIds
    .map((id) => tasks[id])
    .filter((t): t is Task => t !== undefined)
    .sort((a, b) => a.lineNumber - b.lineNumber);

  if (children.length === 0) {
    // No children yet, insert right after parent
    return parentTask.lineNumber;
  }

  // Find the last child's block
  const lastChild = children[children.length - 1]!;
  return findEndOfTaskBlock(lines, lastChild.lineNumber);
}

/**
 * Find the end of a task block (including all descendants).
 *
 * @param lines - File lines
 * @param taskLineNumber - 1-indexed line number of the task
 * @returns The last line number (1-indexed) of the task block
 */
function findEndOfTaskBlock(lines: string[], taskLineNumber: number): number {
  const taskIndex = taskLineNumber - 1;
  const taskLine = lines[taskIndex];

  if (!taskLine) {
    return taskLineNumber;
  }

  // Get the indentation of this task
  const taskIndent = getIndentLevel(taskLine);

  // Scan forward to find all lines that are more indented (children)
  let lastLine = taskLineNumber;
  for (let i = taskIndex + 1; i < lines.length; i++) {
    const line = lines[i]!;

    // Skip empty lines
    if (line.trim() === '') {
      continue;
    }

    // If we hit a line with same or less indentation, we're done
    const lineIndent = getIndentLevel(line);
    if (lineIndent <= taskIndent) {
      break;
    }

    // If it's a task line (child), update lastLine
    if (line.trim().match(/^- \[[ x]\]/)) {
      lastLine = i + 1; // Convert to 1-indexed
    }
  }

  return lastLine;
}

/**
 * Get the indentation level of a line (number of leading spaces / 2).
 */
function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  if (!match) return 0;
  return Math.floor(match[1]!.length / 2);
}

/**
 * Insert a task line into a file.
 *
 * @param filePath - Path to the markdown file
 * @param afterLine - Insert after this line number (1-indexed)
 * @param taskLine - The formatted task line to insert
 * @returns InsertResult
 */
export function insertTaskLine(filePath: string, afterLine: number, taskLine: string): InsertResult {
  if (!fs.existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Validate afterLine
  if (afterLine < 1 || afterLine > lines.length) {
    return { success: false, error: `Line ${afterLine} out of range` };
  }

  // Insert after the specified line
  const insertIndex = afterLine; // 0-indexed, insert AFTER afterLine means at index afterLine
  lines.splice(insertIndex, 0, taskLine);

  // Write file back
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');

  return {
    success: true,
    lineNumber: afterLine + 1, // The new line is at afterLine + 1
  };
}

/**
 * Insert a new task into a project.
 *
 * @param index - The current TaskIndex
 * @param projectId - The project to add the task to
 * @param text - Task text
 * @param metadata - Task metadata (must include id)
 * @param parentLocalId - Optional parent local ID for subtasks
 * @returns InsertResult with the new line number
 */
export function insertTask(
  index: TaskIndex,
  projectId: string,
  text: string,
  metadata: TaskMetadata,
  parentLocalId?: string
): InsertResult {
  // Find project
  const project = index.projects[projectId];
  if (!project) {
    return { success: false, error: `Project '${projectId}' not found.` };
  }

  const filePath = project.filePath;
  if (!fs.existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  let afterLine: number;
  let indentLevel: number;

  if (parentLocalId) {
    // Find parent task
    const parentGlobalId = `${projectId}:${parentLocalId}`;
    const parentTask = index.tasks[parentGlobalId];
    if (!parentTask) {
      return { success: false, error: `Parent task '${parentLocalId}' not found in project '${projectId}'.` };
    }

    afterLine = findSubtaskInsertionPoint(lines, parentTask, index.tasks);
    indentLevel = parentTask.indentLevel + 1;
  } else {
    // Top-level task
    afterLine = findTopLevelInsertionPoint(lines, project.lineNumber, index.tasks, projectId);
    indentLevel = 0;
  }

  const taskLine = buildTaskLine(text, metadata, indentLevel);
  return insertTaskLine(filePath, afterLine, taskLine);
}
