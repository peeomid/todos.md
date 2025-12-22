export interface EnrichOptions {
  keepShorthands: boolean;
  dryRun: boolean;
}

export interface ShorthandResult {
  priority?: 'high' | 'normal' | 'low';
  bucket?: string;
  plan?: string; // Only for today shorthands
  cleanedText: string; // Text with shorthand removed
  shorthandType?: '*' | '!' | '>' | '~' | '?' | '@now' | '@today' | '@upcoming' | '@anytime' | '@someday';
  priorityShorthand?: '(A)' | '(B)' | '(C)';
}

export interface EnrichChange {
  lineNumber: number;
  originalLine: string;
  newLine: string;
  taskText: string;
  added: string[];
  shorthandFound?: string;
}

export interface EnrichFileResult {
  filePath: string;
  changes: EnrichChange[];
  modifiedContent: string;
  modified: boolean;
}

export interface EnrichResult {
  files: EnrichFileResult[];
  summary: {
    filesProcessed: number;
    filesModified: number;
    totalTasksModified: number;
  };
}
