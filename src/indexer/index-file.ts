import fs from 'node:fs';
import type { TaskIndex } from '../schema/index.js';

export function writeIndexFile(index: TaskIndex, outputPath: string): void {
  const content = JSON.stringify(index, null, 2);
  fs.writeFileSync(outputPath, content, 'utf-8');
}

export function readIndexFile(inputPath: string): TaskIndex | null {
  if (!fs.existsSync(inputPath)) {
    return null;
  }

  const content = fs.readFileSync(inputPath, 'utf-8');
  return JSON.parse(content) as TaskIndex;
}
