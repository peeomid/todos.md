import type { ShorthandResult } from './types.js';

// Priority shorthands at start of task text (after checkbox)
const PRIORITY_SHORTCUTS: Record<string, 'high' | 'normal' | 'low'> = {
  '(A)': 'high',
  '(B)': 'normal',
  '(C)': 'low',
};

// Symbol shorthands at start of task text (after optional priority)
const SYMBOL_SHORTCUTS: Record<string, { bucket: string; setsPlan: boolean }> = {
  '*': { bucket: 'now', setsPlan: false },
  '!': { bucket: 'today', setsPlan: true },
  '>': { bucket: 'upcoming', setsPlan: false },
  '~': { bucket: 'anytime', setsPlan: false },
  '?': { bucket: 'someday', setsPlan: false },
};

// @tag shorthands in task text
const AT_TAG_SHORTCUTS: Record<string, { bucket: string; setsPlan: boolean }> = {
  '@now': { bucket: 'now', setsPlan: false },
  '@today': { bucket: 'today', setsPlan: true },
  '@upcoming': { bucket: 'upcoming', setsPlan: false },
  '@anytime': { bucket: 'anytime', setsPlan: false },
  '@someday': { bucket: 'someday', setsPlan: false },
};

const PRIORITY_REGEX = /^\(([ABC])\)\s*/;
const SYMBOL_REGEX = /^([*!>~?])\s+/;
const AT_TAG_REGEX = /\s*(@now|@today|@upcoming|@anytime|@someday)\s*/g;

/**
 * Parse shorthands from task text and return canonical values.
 * Order: priority (A/B/C) -> bucket symbol (!/>~?) -> @tags
 * Symbol shortcuts take priority over @tags for bucket.
 */
export function parseShorthands(text: string, keepShorthands: boolean, today: string): ShorthandResult {
  let cleanedText = text;
  let priority: 'high' | 'normal' | 'low' | undefined;
  let bucket: string | undefined;
  let plan: string | undefined;
  let shorthandType: ShorthandResult['shorthandType'];
  let priorityShorthand: ShorthandResult['priorityShorthand'];

  // Step 1: Check for priority shorthand (A), (B), (C) at start
  const priorityMatch = cleanedText.match(PRIORITY_REGEX);
  if (priorityMatch?.[1]) {
    const letter = priorityMatch[1] as 'A' | 'B' | 'C';
    const fullShorthand = `(${letter})` as '(A)' | '(B)' | '(C)';
    priority = PRIORITY_SHORTCUTS[fullShorthand];
    priorityShorthand = fullShorthand;

    if (!keepShorthands) {
      cleanedText = cleanedText.slice(priorityMatch[0].length);
    }
  }

  // Step 2: Check for symbol shortcut at start (after optional priority)
  const symbolMatch = cleanedText.match(SYMBOL_REGEX);
  if (symbolMatch?.[1]) {
    const symbol = symbolMatch[1] as '!' | '>' | '~' | '?';
    const config = SYMBOL_SHORTCUTS[symbol];
    if (config) {
      bucket = config.bucket;
      if (config.setsPlan) {
        plan = today;
      }
      shorthandType = symbol;

      if (!keepShorthands) {
        cleanedText = cleanedText.slice(symbolMatch[0].length);
      }
    }
  }

  // Step 3: Check for @tag shorthands (only if no symbol found)
  if (!bucket) {
    for (const [tag, config] of Object.entries(AT_TAG_SHORTCUTS)) {
      if (cleanedText.includes(tag)) {
        bucket = config.bucket;
        if (config.setsPlan) {
          plan = today;
        }
        shorthandType = tag as ShorthandResult['shorthandType'];

        if (!keepShorthands) {
          cleanedText = cleanedText.replace(new RegExp(`\\s*${tag}\\s*`, 'g'), ' ').trim();
        }
        break;
      }
    }
  }

  return {
    priority,
    bucket,
    plan,
    cleanedText: cleanedText.trim(),
    shorthandType,
    priorityShorthand,
  };
}

/**
 * Check if text has any shorthand markers.
 */
export function hasShorthands(text: string): boolean {
  if (PRIORITY_REGEX.test(text)) {
    return true;
  }
  if (SYMBOL_REGEX.test(text)) {
    return true;
  }
  for (const tag of Object.keys(AT_TAG_SHORTCUTS)) {
    if (text.includes(tag)) {
      return true;
    }
  }
  return false;
}
