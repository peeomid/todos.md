import type { Task, TaskIndex, Project } from '../schema/index.js';

export interface IndexerResult {
  index: TaskIndex;
  stats: IndexStats;
  warnings: IndexWarning[];
}

export interface IndexStats {
  filesParsed: number;
  projects: number;
  tasks: {
    total: number;
    open: number;
    done: number;
  };
}

export interface IndexWarning {
  file: string;
  line?: number;
  message: string;
}

export type { Task, TaskIndex, Project };
