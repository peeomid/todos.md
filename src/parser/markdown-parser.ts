import fs from 'node:fs';
import type { ParsedAreaHeading, ParsedFile, ParsedProject, ParsedSectionHeading, ParsedTask } from './types.js';
import { parseFrontmatter } from './frontmatter.js';
import { parseMetadataBlock } from './metadata-parser.js';

const HEADING_REGEX = /^(#{1,6})\s+(.+)$/;
const TASK_REGEX = /^(\s*)- \[([ xX])\]\s+(.+)$/;

export function parseMarkdownFile(filePath: string): ParsedFile {
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseMarkdownContent(content, filePath);
}

export function parseMarkdownContent(content: string, filePath: string): ParsedFile {
  const { frontmatter, contentWithoutFrontmatter } = parseFrontmatter(content);

  const lines = contentWithoutFrontmatter.split('\n');
  const projects: ParsedProject[] = [];
  const areaHeadings: ParsedAreaHeading[] = [];
  const sectionHeadings: ParsedSectionHeading[] = [];
  const tasks: ParsedTask[] = [];

  // Track line offset due to frontmatter removal
  const frontmatterLines = content.split('\n').length - contentWithoutFrontmatter.split('\n').length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    const lineNumber = i + 1 + frontmatterLines;

    // Check for heading (project)
    const headingMatch = line.match(HEADING_REGEX);
    if (headingMatch) {
      const [, hashes, headingContent] = headingMatch;
      if (hashes && headingContent) {
        const { metadata, textWithoutMetadata, hasMetadata } = parseMetadataBlock(headingContent);

        if (hasMetadata && metadata.project) {
          projects.push({
            id: metadata.project,
            name: textWithoutMetadata.trim(),
            area: metadata.area,
            filePath,
            lineNumber,
            headingLevel: hashes.length,
            metadata,
          });
        } else if (hasMetadata && metadata.area && !metadata.project) {
          areaHeadings.push({
            area: metadata.area,
            name: textWithoutMetadata.trim(),
            filePath,
            lineNumber,
            headingLevel: hashes.length,
            metadata,
          });
        } else if (!hasMetadata) {
          sectionHeadings.push({
            name: textWithoutMetadata.trim(),
            filePath,
            lineNumber,
            headingLevel: hashes.length,
          });
        }
      }
      continue;
    }

    // Check for task
    const taskMatch = line.match(TASK_REGEX);
    if (taskMatch) {
      const [, indent, checkbox, taskContent] = taskMatch;
      if (indent !== undefined && checkbox && taskContent) {
        const { metadata, textWithoutMetadata } = parseMetadataBlock(taskContent);
        const completed = checkbox.toLowerCase() === 'x';
        const indentLevel = indent.length;

        tasks.push({
          localId: metadata.id ?? null,
          text: textWithoutMetadata.trim(),
          completed,
          metadata,
          filePath,
          lineNumber,
          indentLevel,
          rawLine: line,
        });
      }
    }
  }

  return {
    filePath,
    formatVersion: frontmatter.taskFormatVersion,
    projects,
    areaHeadings,
    sectionHeadings,
    tasks,
  };
}
