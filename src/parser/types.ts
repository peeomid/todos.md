export interface ParsedProject {
  id: string;
  name: string;
  area?: string;
  filePath: string;
  lineNumber: number;
  headingLevel: number;
  metadata: Record<string, string>;
}

export interface ParsedAreaHeading {
  area: string;
  name: string;
  filePath: string;
  lineNumber: number;
  headingLevel: number;
  metadata: Record<string, string>;
}

export interface ParsedSectionHeading {
  name: string;
  filePath: string;
  lineNumber: number;
  headingLevel: number;
}

export interface ParsedTask {
  localId: string | null;
  text: string;
  completed: boolean;
  metadata: Record<string, string>;
  filePath: string;
  lineNumber: number;
  indentLevel: number;
  rawLine: string;
}

export interface ParsedFile {
  filePath: string;
  formatVersion?: number;
  projects: ParsedProject[];
  areaHeadings: ParsedAreaHeading[];
  sectionHeadings: ParsedSectionHeading[];
  tasks: ParsedTask[];
}

export interface TaskWithHierarchy extends ParsedTask {
  projectId: string | null;
  parentLocalId: string | null;
  childrenLocalIds: string[];
}
