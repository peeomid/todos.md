import type { AreaHeading, TaskIndex, Task, Project } from '../schema/index.js';
import {
  parseMarkdownFile,
  buildHierarchy,
  type TaskWithHierarchy,
  type ParsedProject,
  type ParsedAreaHeading,
} from '../parser/index.js';
import type { IndexerResult, IndexStats, IndexWarning } from './types.js';

export function buildIndex(filePaths: string[]): IndexerResult {
  const areas: Record<string, AreaHeading> = {};
  const projects: Record<string, Project> = {};
  const tasks: Record<string, Task> = {};
  const warnings: IndexWarning[] = [];

  let totalTasks = 0;
  let openTasks = 0;
  let doneTasks = 0;

  for (const filePath of filePaths) {
    const parsed = parseMarkdownFile(filePath);
    const tasksWithHierarchy = buildHierarchy(parsed);

    // Add area headings (for grouping + inherited area context)
    for (const h of parsed.areaHeadings) {
      if (!areas[h.area]) {
        areas[h.area] = areaHeadingFromParsed(h);
      }
    }

    // Add projects
    for (const project of parsed.projects) {
      if (projects[project.id]) {
        warnings.push({
          file: filePath,
          line: project.lineNumber,
          message: `Duplicate project ID '${project.id}'`,
        });
      }
      const parentArea = findParentAreaForProject(project, parsed.areaHeadings);
      projects[project.id] = projectFromParsed(project, parentArea);
    }

    // Add tasks
    for (const task of tasksWithHierarchy) {
      if (!task.localId) {
        // Task without ID - skip but don't warn (handled by linter)
        continue;
      }

      if (!task.projectId) {
        warnings.push({
          file: filePath,
          line: task.lineNumber,
          message: `Task '${task.localId}' has no project context`,
        });
        continue;
      }

      const globalId = `${task.projectId}:${task.localId}`;

      if (tasks[globalId]) {
        warnings.push({
          file: filePath,
          line: task.lineNumber,
          message: `Duplicate global ID '${globalId}'`,
        });
        continue;
      }

      // Get project area for inheritance
      const project = projects[task.projectId];
      const projectArea = project?.area;

      tasks[globalId] = taskFromParsed(task, globalId, projectArea);

      totalTasks++;
      if (task.completed) {
        doneTasks++;
      } else {
        openTasks++;
      }
    }
  }

  // Second pass: update childrenIds to use global IDs
  for (const task of Object.values(tasks)) {
    if (task.parentId) {
      // parentId was stored as localId, convert to globalId
      const parentGlobalId = `${task.projectId}:${task.parentId}`;
      task.parentId = tasks[parentGlobalId] ? parentGlobalId : null;
    }

    // Convert children from localIds to globalIds
    task.childrenIds = task.childrenIds
      .map((localId) => `${task.projectId}:${localId}`)
      .filter((gid) => tasks[gid]);
  }

  const index: TaskIndex = {
    version: 2,
    generatedAt: new Date().toISOString(),
    files: filePaths,
    areas,
    projects,
    tasks,
  };

  const stats: IndexStats = {
    filesParsed: filePaths.length,
    projects: Object.keys(projects).length,
    tasks: {
      total: totalTasks,
      open: openTasks,
      done: doneTasks,
    },
  };

  return { index, stats, warnings };
}

function findParentAreaForProject(project: ParsedProject, areaHeadings: ParsedAreaHeading[]): string | undefined {
  if (areaHeadings.length === 0) return undefined;
  const candidates = areaHeadings
    .filter((h) => h.filePath === project.filePath)
    .filter((h) => h.lineNumber < project.lineNumber)
    .filter((h) => h.headingLevel < project.headingLevel)
    .sort((a, b) => b.lineNumber - a.lineNumber);
  return candidates[0]?.area;
}

function areaHeadingFromParsed(parsed: ParsedAreaHeading): AreaHeading {
  return {
    area: parsed.area,
    name: parsed.name,
    filePath: parsed.filePath,
    lineNumber: parsed.lineNumber,
    headingLevel: parsed.headingLevel,
  };
}

function projectFromParsed(parsed: ParsedProject, parentArea: string | undefined): Project {
  return {
    id: parsed.id,
    name: parsed.name,
    area: parsed.area ?? parentArea,
    parentArea,
    filePath: parsed.filePath,
    lineNumber: parsed.lineNumber,
  };
}

function taskFromParsed(task: TaskWithHierarchy, globalId: string, projectArea: string | undefined): Task {
  const { metadata } = task;
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  return {
    globalId,
    localId: task.localId!,
    projectId: task.projectId!,
    text: task.text,
    completed: task.completed,

    // Metadata (with inherited values)
    energy: parseEnergy(metadata.energy) ?? 'normal', // Default to 'normal' if not set
    priority: parsePriority(metadata.priority),
    est: metadata.est,
    due: metadata.due,
    plan: metadata.plan,
    bucket: metadata.bucket,
    area: metadata.area ?? projectArea, // Inherit from project if not set
    tags: metadata.tags?.split(',').filter(Boolean),
    created: metadata.created ?? today, // Default to today if not set
    updated: metadata.updated,

    // Location
    filePath: task.filePath,
    lineNumber: task.lineNumber,
    indentLevel: task.indentLevel,

    // Hierarchy (initially use local IDs, will be converted)
    parentId: task.parentLocalId,
    childrenIds: task.childrenLocalIds,
  };
}

function parseEnergy(value: string | undefined): 'low' | 'normal' | 'high' | undefined {
  if (value === 'low' || value === 'normal' || value === 'high') {
    return value;
  }
  return undefined;
}

function parsePriority(value: string | undefined): 'high' | 'normal' | 'low' | undefined {
  if (value === 'high' || value === 'normal' || value === 'low') {
    return value;
  }
  return undefined;
}
