export { enrichFile, enrichFiles, enrichContent } from './enricher.js';
export { parseShorthands, hasShorthands } from './shorthand-parser.js';
export { generateNextId } from './id-generator.js';
export type {
  EnrichOptions,
  EnrichChange,
  EnrichFileResult,
  EnrichResult,
  ShorthandResult,
} from './types.js';
