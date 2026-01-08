import type { ParsedFile, TaskWithHierarchy } from './types.js';

export function buildHierarchy(parsedFile: ParsedFile): TaskWithHierarchy[] {
  const { projects, tasks } = parsedFile;

  // Sort projects by line number to determine which project a task belongs to
  const sortedProjects = [...projects].sort((a, b) => a.lineNumber - b.lineNumber);

  const result: TaskWithHierarchy[] = [];

  // Stack to track parent tasks at each indent level
  // Map from indentLevel to task
  const parentStack: Map<number, TaskWithHierarchy> = new Map();

  for (const task of tasks) {
    // Find the project this task belongs to
    // It's the last project that appears before this task
    let projectId: string | null = null;
    for (const project of sortedProjects) {
      if (project.lineNumber < task.lineNumber) {
        projectId = project.id;
      } else {
        break;
      }
    }

    // Find parent task based on indentation
    let parentLocalId: string | null = null;

    // Clear any entries in the stack that are at the same or higher indent level
    for (const [level] of parentStack) {
      if (level >= task.indentLevel) {
        parentStack.delete(level);
      }
    }

    // Find the closest parent (highest indent level less than current)
    let maxParentLevel = -1;
    for (const [level, parentTask] of parentStack) {
      if (level < task.indentLevel && level > maxParentLevel && parentTask.localId) {
        maxParentLevel = level;
        parentLocalId = parentTask.localId;
      }
    }

    const taskWithHierarchy: TaskWithHierarchy = {
      ...task,
      projectId,
      parentLocalId,
      childrenLocalIds: [],
    };

    // Add this task to the parent stack
    parentStack.set(task.indentLevel, taskWithHierarchy);

    result.push(taskWithHierarchy);
  }

  // Second pass: populate childrenLocalIds
  // Use composite key (projectId:localId) to handle duplicate localIds across projects
  const taskMap = new Map<string, TaskWithHierarchy>();
  for (const task of result) {
    if (task.localId && task.projectId) {
      taskMap.set(`${task.projectId}:${task.localId}`, task);
    }
  }

  for (const task of result) {
    if (task.parentLocalId && task.projectId) {
      const parent = taskMap.get(`${task.projectId}:${task.parentLocalId}`);
      if (parent && task.localId) {
        parent.childrenLocalIds.push(task.localId);
      }
    }
  }

  return result;
}
