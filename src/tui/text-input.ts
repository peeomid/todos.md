import { isSpaceKeyName } from './key-utils.js';

export interface TextInputState {
  value: string;
  /**
   * Cursor position measured in Unicode codepoints (i.e. `Array.from(value)` index).
   */
  cursor: number;
}

function toChars(value: string): string[] {
  return Array.from(value ?? '');
}

export function toCodeUnitCursor(value: string, cursorCodepoints: number): number {
  const chars = toChars(value);
  const clamped = Math.max(0, Math.min(cursorCodepoints, chars.length));
  return chars.slice(0, clamped).join('').length;
}

export function toCodepointCursor(value: string, cursorCodeUnits: number): number {
  const clamped = Math.max(0, Math.min(cursorCodeUnits, (value ?? '').length));
  return toChars((value ?? '').slice(0, clamped)).length;
}

function clampCursor(value: string, cursor: number): number {
  const len = toChars(value).length;
  return Math.max(0, Math.min(cursor, len));
}

export function createTextInput(initial: string): TextInputState {
  const value = initial ?? '';
  const cursor = toChars(value).length;
  return { value, cursor };
}

function withCursor(state: TextInputState, cursor: number): TextInputState {
  return { value: state.value, cursor: clampCursor(state.value, cursor) };
}

function setValueAndCursor(value: string, cursor: number): TextInputState {
  const clamped = clampCursor(value, cursor);
  return { value, cursor: clamped };
}

function insertAt(state: TextInputState, text: string): TextInputState {
  const chars = toChars(state.value);
  const insertChars = toChars(text);
  const cursor = clampCursor(state.value, state.cursor);
  chars.splice(cursor, 0, ...insertChars);
  return setValueAndCursor(chars.join(''), cursor + insertChars.length);
}

function deleteRange(state: TextInputState, start: number, end: number): TextInputState {
  const chars = toChars(state.value);
  const from = Math.max(0, Math.min(start, chars.length));
  const to = Math.max(0, Math.min(end, chars.length));
  if (to <= from) return withCursor(state, state.cursor);
  chars.splice(from, to - from);
  return setValueAndCursor(chars.join(''), from);
}

function isWhitespaceChar(ch: string): boolean {
  return /\s/.test(ch);
}

function moveWordLeft(state: TextInputState): TextInputState {
  const chars = toChars(state.value);
  let i = clampCursor(state.value, state.cursor);
  while (i > 0 && isWhitespaceChar(chars[i - 1] ?? '')) i--;
  while (i > 0 && !isWhitespaceChar(chars[i - 1] ?? '')) i--;
  return withCursor(state, i);
}

function moveWordRight(state: TextInputState): TextInputState {
  const chars = toChars(state.value);
  let i = clampCursor(state.value, state.cursor);
  while (i < chars.length && isWhitespaceChar(chars[i] ?? '')) i++;
  while (i < chars.length && !isWhitespaceChar(chars[i] ?? '')) i++;
  return withCursor(state, i);
}

export function applyTextInputKey(
  state: TextInputState,
  name: string
): { state: TextInputState; didChangeValue: boolean } | null {
  const prevValue = state.value;
  const prevCursor = clampCursor(state.value, state.cursor);
  const normalized = { value: state.value ?? '', cursor: prevCursor };

  const finish = (next: TextInputState): { state: TextInputState; didChangeValue: boolean } => ({
    state: next,
    didChangeValue: next.value !== prevValue,
  });

  // Cancel/submit are handled by callers.
  if (name === 'ESCAPE' || name === 'CTRL_C' || name === 'ENTER' || name === 'TAB') return null;

  // Basic movement
  if (name === 'LEFT' || name === 'CTRL_B') return finish(withCursor(normalized, prevCursor - 1));
  if (name === 'RIGHT' || name === 'CTRL_F') return finish(withCursor(normalized, prevCursor + 1));
  if (name === 'HOME' || name === 'CTRL_A' || name === 'META_LEFT' || name === 'CMD_LEFT')
    return finish(withCursor(normalized, 0));
  if (name === 'END' || name === 'CTRL_E' || name === 'META_RIGHT' || name === 'CMD_RIGHT') {
    return finish(withCursor(normalized, toChars(normalized.value).length));
  }

  // Word movement (common on macOS terminals and readline-style UIs)
  if (name === 'ALT_LEFT' || name === 'CTRL_LEFT' || name === 'ALT_B' || name === 'META_B')
    return finish(moveWordLeft(normalized));
  if (name === 'ALT_RIGHT' || name === 'CTRL_RIGHT' || name === 'ALT_F' || name === 'META_F')
    return finish(moveWordRight(normalized));

  // Deletion
  if (name === 'BACKSPACE') {
    if (prevCursor <= 0) return finish(normalized);
    return finish(deleteRange(normalized, prevCursor - 1, prevCursor));
  }
  if (name === 'DELETE' || name === 'DEL' || name === 'CTRL_D') {
    const len = toChars(normalized.value).length;
    if (prevCursor >= len) return finish(normalized);
    return finish(deleteRange(normalized, prevCursor, prevCursor + 1));
  }
  if (name === 'ALT_BACKSPACE' || name === 'META_BACKSPACE' || name === 'CTRL_W') {
    const moved = moveWordLeft(normalized);
    return finish(deleteRange(normalized, moved.cursor, prevCursor));
  }
  if (name === 'CTRL_U' || name === 'CMD_BACKSPACE') {
    return finish(deleteRange(normalized, 0, prevCursor));
  }
  if (name === 'CTRL_K') {
    const len = toChars(normalized.value).length;
    return finish(deleteRange(normalized, prevCursor, len));
  }

  // Insertion
  if (isSpaceKeyName(name)) return finish(insertAt(normalized, ' '));
  if (name.length === 1) return finish(insertAt(normalized, name));

  return null;
}
