import terminalKit from 'terminal-kit';

type Term = any;

function dimOrPlain(term: Term, colorsDisabled: boolean): (s: string) => void {
  if (colorsDisabled) return (s: string) => term(s);
  if (typeof term.dim === 'function') return (s: string) => term.dim(s);
  return (s: string) => term(s);
}

function fieldOrPlain(term: Term, colorsDisabled: boolean): (s: string) => void {
  if (colorsDisabled) return (s: string) => term(s);
  // Subtle "input field" background (dark gray) so it works well on dark themes (e.g. iTerm).
  if (term.bgBlackBright?.white) return (s: string) => term.bgBlackBright.white(s);
  if (term.bgGray?.white) return (s: string) => term.bgGray.white(s);
  if (term.bgBrightBlack?.white) return (s: string) => term.bgBrightBlack.white(s);
  if (term.bgWhite?.black) return (s: string) => term.bgWhite.black(s);
  if (typeof term.inverse === 'function') return (s: string) => term.inverse(s);
  return (s: string) => term(s);
}

function cursorOrPlain(term: Term, colorsDisabled: boolean): (s: string) => void {
  if (colorsDisabled) return (s: string) => term(s);
  if (term.bgCyan?.black) return (s: string) => term.bgCyan.black(s);
  if (typeof term.bgCyan === 'function') return (s: string) => term.bgCyan(s);
  if (typeof term.inverse === 'function') return (s: string) => term.inverse(s);
  return (s: string) => term(s);
}

function truncateStartByWidth(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return '';
  if (terminalKit.stringWidth(text) <= maxWidth) return text;

  const chars = Array.from(text);
  let width = 0;
  const out: string[] = [];

  for (let idx = chars.length - 1; idx >= 0; idx--) {
    const ch = chars[idx]!;
    const w = terminalKit.stringWidth(ch);
    if (width + w > maxWidth) break;
    out.push(ch);
    width += w;
  }

  return out.reverse().join('');
}

export function renderLabeledInputField(
  term: Term,
  options: {
    label: string;
    value: string;
    width: number;
    colorsDisabled: boolean;
    placeholder?: string;
    focused?: boolean;
  }
): { cursorCol: number } {
  const label = options.label;
  const value = options.value ?? '';
  const placeholder = options.placeholder ?? '';
  const colorsDisabled = options.colorsDisabled;
  const width = options.width;
  const focused = options.focused ?? true;

  const dim = dimOrPlain(term, colorsDisabled);
  const field = fieldOrPlain(term, colorsDisabled);
  const cursor = cursorOrPlain(term, colorsDisabled);

  term(label);

  const prefixWidth = terminalKit.stringWidth(label);
  const available = Math.max(0, width - prefixWidth);
  if (available < 3) {
    // Not enough room for a bracketed field + cursor. Best-effort: just show a cursor marker.
    const tinyCursor = colorsDisabled ? '|' : '▌';
    term(tinyCursor.slice(0, available));
    return { cursorCol: Math.min(width, prefixWidth + 1) };
  }

  const bracketWidth = 2; // [ ]
  const fieldWidth = Math.max(0, available - bracketWidth);

  // Use a space with a background color so it's visible regardless of terminal theme.
  // Also return a real terminal cursor position so we can show the actual cursor.
  // Prefer a visible glyph (vs a blank block) so the insertion point is obvious even
  // when the terminal cursor is subtle/hidden by the user's theme.
  const cursorToken = '|';
  const cursorWidth = terminalKit.stringWidth(cursorToken);
  const valueBudget = Math.max(0, fieldWidth - cursorWidth);

  dim('[');

  // Cursor is rendered immediately after the visible text (not pinned to the far right),
  // so it matches the user's mental model of "insertion point".
  const cursorBaseCol = prefixWidth + 2; // label + '[' (1-based)

  if (!focused) {
    if (value.length === 0 && placeholder) {
      const ph = truncateStartByWidth(placeholder, fieldWidth);
      if (ph) dim(ph);
      const used = terminalKit.stringWidth(ph);
      const pad = Math.max(0, fieldWidth - used);
      if (pad > 0) field(' '.repeat(pad));
      dim(']');
      return { cursorCol: Math.min(width, cursorBaseCol) };
    }

    const shown = truncateStartByWidth(value, fieldWidth);
    const shownWidth = terminalKit.stringWidth(shown);
    const remaining = Math.max(0, fieldWidth - shownWidth);
    if (shown) field(shown);
    if (remaining > 0) field(' '.repeat(remaining));
    dim(']');
    return { cursorCol: Math.min(width, cursorBaseCol + shownWidth) };
  }

  if (value.length === 0 && placeholder) {
    const ph = truncateStartByWidth(placeholder, valueBudget);
    cursor(cursorToken);
    if (ph) dim(ph);
    const used = cursorWidth + terminalKit.stringWidth(ph);
    const pad = Math.max(0, fieldWidth - used);
    if (pad > 0) field(' '.repeat(pad));

    dim(']');
    return { cursorCol: Math.min(width, cursorBaseCol) };
  } else {
    const shown = truncateStartByWidth(value, valueBudget);
    const shownWidth = terminalKit.stringWidth(shown);
    const remaining = Math.max(0, fieldWidth - shownWidth - cursorWidth);
    if (shown) field(shown);
    cursor(cursorToken);
    if (remaining > 0) field(' '.repeat(remaining));

    dim(']');
    return { cursorCol: Math.min(width, cursorBaseCol + shownWidth) };
  }
}
