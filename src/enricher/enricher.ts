import fs from 'node:fs';
import { parseMetadataBlock, serializeMetadata } from '../parser/metadata-parser.js';
import { generateNextId } from './id-generator.js';
import { parseShorthands } from './shorthand-parser.js';
import type { EnrichChange, EnrichFileResult, EnrichOptions, EnrichResult } from './types.js';

const TASK_REGEX = /^(\s*)- \[([ xX])\]\s+(.+)$/;
const PROJECT_HEADING_REGEX = /^(#{1,6})\s+.+\[.*project:([^\s\]]+)/;
const ANY_HEADING_REGEX = /^#{1,6}\s+/;

interface ProjectContext {
  id: string;
  existingIds: string[];
}

/**
 * Enrich a single markdown file by converting shorthands and auto-generating IDs.
 */
export function enrichFile(filePath: string, options: EnrichOptions): EnrichFileResult {
  const content = fs.readFileSync(filePath, 'utf-8');
  return enrichContent(content, filePath, options);
}

/**
 * Enrich markdown content.
 */
export function enrichContent(content: string, filePath: string, options: EnrichOptions): EnrichFileResult {
  const lines = content.split('\n');
  const changes: EnrichChange[] = [];
  const today = new Date().toISOString().split('T')[0]!; // YYYY-MM-DD

  // First pass: collect existing IDs per project
  const projectsById = new Map<string, ProjectContext>();
  let currentProject: ProjectContext | null = null;

  for (const line of lines) {
    // Check for project heading
    const projectMatch = line.match(PROJECT_HEADING_REGEX);
    if (projectMatch?.[2]) {
      const projectId = projectMatch[2];
      if (!projectsById.has(projectId)) {
        projectsById.set(projectId, { id: projectId, existingIds: [] });
      }
      currentProject = projectsById.get(projectId)!;
      continue;
    }

    // Collect existing task IDs
    const taskMatch = line.match(TASK_REGEX);
    if (taskMatch && currentProject) {
      const taskContent = taskMatch[3];
      if (taskContent) {
        const { metadata } = parseMetadataBlock(taskContent);
        if (metadata.id) {
          currentProject.existingIds.push(metadata.id);
        }
      }
    }
  }

  // Second pass: enrich tasks
  currentProject = null;
  const modifiedLines: string[] = [];
  let taskStack: Array<{ indentWidth: number; localId: string }> = [];
  let baseIndentWidth: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNumber = i + 1;

    // Track current project
    const projectMatch = line.match(PROJECT_HEADING_REGEX);
    if (projectMatch?.[2]) {
      currentProject = projectsById.get(projectMatch[2]) ?? null;
      taskStack = [];
      baseIndentWidth = null;
      modifiedLines.push(line);
      continue;
    }

    // Reset task stack on headings (lists typically restart under new headings)
    if (ANY_HEADING_REGEX.test(line)) {
      taskStack = [];
      baseIndentWidth = null;
      modifiedLines.push(line);
      continue;
    }

    // Check for task
    const taskMatch = line.match(TASK_REGEX);
    if (!taskMatch || !currentProject) {
      modifiedLines.push(line);
      continue;
    }

    const [_fullMatch, indent, checkbox, taskContent] = taskMatch;
    // Note: indent can be empty string for top-level tasks, which is valid
    if (indent === undefined || !checkbox || !taskContent) {
      modifiedLines.push(line);
      continue;
    }

    const { metadata, textWithoutMetadata } = parseMetadataBlock(taskContent);
    const added: string[] = [];
    const currentIndentWidth = measureIndentWidth(indent);

    if (baseIndentWidth === null) baseIndentWidth = currentIndentWidth;
    // If indentation decreases below the baseline, treat it as a new list block.
    if (currentIndentWidth < baseIndentWidth) {
      baseIndentWidth = currentIndentWidth;
      taskStack = [];
    }

    // Determine parent based on indentation.
    while (taskStack.length > 0 && (taskStack[taskStack.length - 1]?.indentWidth ?? -1) >= currentIndentWidth) {
      taskStack.pop();
    }
    const isTopLevel = currentIndentWidth === baseIndentWidth;
    const parentLocalId = !isTopLevel ? taskStack[taskStack.length - 1]?.localId : undefined;

    // Parse shorthands from task text
    const shorthandResult = parseShorthands(textWithoutMetadata, options.keepShorthands, today);

    // Determine final text (with or without shorthands)
    const finalText = shorthandResult.cleanedText;

    // Apply shorthand-derived values (only if not already set)
    if (shorthandResult.priority && !metadata.priority) {
      metadata.priority = shorthandResult.priority;
      added.push(`priority:${shorthandResult.priority}`);
    }
    if (shorthandResult.bucket && !metadata.bucket) {
      metadata.bucket = shorthandResult.bucket;
      added.push(`bucket:${shorthandResult.bucket}`);
    }
    if (shorthandResult.plan && !metadata.plan) {
      metadata.plan = shorthandResult.plan;
      added.push(`plan:${shorthandResult.plan}`);
    }

    // Auto-generate ID if missing
    if (!metadata.id) {
      const newId = generateNextId(currentProject.existingIds, parentLocalId);
      metadata.id = newId;
      currentProject.existingIds.push(newId);
      added.push(`id:${newId}`);
    }

    // Add created date if missing
    if (!metadata.created) {
      metadata.created = today;
      added.push(`created:${today}`);
    }

    // Set updated if we made changes
    if (added.length > 0 && !metadata.updated) {
      metadata.updated = today;
      added.push(`updated:${today}`);
    }

    // Build new line
    if (added.length > 0 || finalText !== textWithoutMetadata) {
      // Order metadata: id first, then alphabetically
      const orderedMetadata = orderMetadata(metadata);
      const metadataStr = serializeMetadata(orderedMetadata);

      const newLine = `${indent}- [${checkbox}] ${finalText}${metadataStr ? ` ${metadataStr}` : ''}`;

      changes.push({
        lineNumber,
        originalLine: line,
        newLine,
        taskText: finalText,
        added,
        shorthandFound: shorthandResult.shorthandType,
      });

      modifiedLines.push(newLine);
    } else {
      modifiedLines.push(line);
    }

    // Update stack for subsequent children.
    if (metadata.id) {
      taskStack.push({ indentWidth: currentIndentWidth, localId: metadata.id });
    }
  }

  const modifiedContent = modifiedLines.join('\n');
  const modified = changes.length > 0;

  return {
    filePath,
    changes,
    modifiedContent,
    modified,
  };
}

function measureIndentWidth(indent: string): number {
  // Treat tabs as 2 spaces for consistent indentation comparisons.
  return indent.replaceAll('\t', '  ').length;
}

/**
 * Order metadata with id first, then alphabetically.
 */
function orderMetadata(metadata: Record<string, string>): Record<string, string> {
  const ordered: Record<string, string> = {};

  // id first
  if (metadata.id) {
    ordered.id = metadata.id;
  }

  // Then alphabetically
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

/**
 * Enrich multiple files.
 */
export function enrichFiles(filePaths: string[], options: EnrichOptions): EnrichResult {
  const files: EnrichFileResult[] = [];
  let filesModified = 0;
  let totalTasksModified = 0;

  for (const filePath of filePaths) {
    const result = enrichFile(filePath, options);
    files.push(result);

    if (result.modified) {
      filesModified++;
      totalTasksModified += result.changes.length;

      if (!options.dryRun) {
        fs.writeFileSync(filePath, result.modifiedContent, 'utf-8');
      }
    }
  }

  return {
    files,
    summary: {
      filesProcessed: filePaths.length,
      filesModified,
      totalTasksModified,
    },
  };
}
