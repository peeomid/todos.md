import type { AreaHeading, SectionHeading, TaskIndex, Task, Project } from '../schema/index.js';
import {
  parseMarkdownFile,
  buildHierarchy,
  type TaskWithHierarchy,
  type ParsedProject,
  type ParsedAreaHeading,
  type ParsedSectionHeading,
} from '../parser/index.js';
import type { IndexerResult, IndexStats, IndexWarning } from './types.js';

export function buildIndex(filePaths: string[]): IndexerResult {
  const areas: Record<string, AreaHeading> = {};
  const projects: Record<string, Project> = {};
  const sections: Record<string, SectionHeading> = {};
  const tasks: Record<string, Task> = {};
  const warnings: IndexWarning[] = [];

  let totalTasks = 0;
  let openTasks = 0;
  let doneTasks = 0;

  for (const filePath of filePaths) {
    const parsed = parseMarkdownFile(filePath);
    const tasksWithHierarchy = buildHierarchy(parsed);
    const sectionsWithProject = buildSections(parsed);

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

    // Add section headings (organizational headings without metadata, within a project context)
    for (const section of sectionsWithProject) {
      if (sections[section.id]) {
        warnings.push({
          file: filePath,
          line: section.lineNumber,
          message: `Duplicate section ID '${section.id}'`,
        });
        continue;
      }
      sections[section.id] = section;
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
    version: 3,
    generatedAt: new Date().toISOString(),
    files: filePaths,
    areas,
    projects,
    sections,
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

function buildSections(parsedFile: {
  filePath: string;
  projects: ParsedProject[];
  sectionHeadings: ParsedSectionHeading[];
}): SectionHeading[] {
  const sortedProjects = [...parsedFile.projects].sort((a, b) => a.lineNumber - b.lineNumber);
  const sectionHeadings = [...parsedFile.sectionHeadings].sort((a, b) => a.lineNumber - b.lineNumber);

  const byProject: Record<string, SectionHeading[]> = {};
  for (const h of sectionHeadings) {
    let projectId: string | null = null;
    for (const project of sortedProjects) {
      if (project.lineNumber < h.lineNumber) projectId = project.id;
      else break;
    }
    if (!projectId) continue;

    const id = makeSectionId(projectId, parsedFile.filePath, h.lineNumber, h.headingLevel);
    const section: SectionHeading = {
      id,
      projectId,
      name: h.name,
      filePath: parsedFile.filePath,
      lineNumber: h.lineNumber,
      headingLevel: h.headingLevel,
      parentId: null,
    };
    (byProject[projectId] ??= []).push(section);
  }

  // Establish parent/child relationships per project (markdown heading nesting by level).
  for (const list of Object.values(byProject)) {
    list.sort((a, b) => a.lineNumber - b.lineNumber);
    const stack: Array<{ level: number; id: string }> = [];

    for (const s of list) {
      while (stack.length > 0 && stack[stack.length - 1]!.level >= s.headingLevel) {
        stack.pop();
      }
      s.parentId = stack.length > 0 ? stack[stack.length - 1]!.id : null;
      stack.push({ level: s.headingLevel, id: s.id });
    }
  }

  return Object.values(byProject).flat();
}

function hash32Base36(input: string): string {
  // FNV-1a 32-bit (small + deterministic; avoids filePath keys bloating ids)
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

function makeSectionId(projectId: string, filePath: string, lineNumber: number, headingLevel: number): string {
  return `sec:${projectId}:${hash32Base36(filePath)}:${lineNumber}:${headingLevel}`;
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
