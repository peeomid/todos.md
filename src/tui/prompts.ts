import { setCursorVisible } from './term-cursor.js';

type Term = any;

function boldOrPlain(term: Term, colorsDisabled: boolean): (s: string) => void {
  if (colorsDisabled) return (s: string) => term(s);
  if (typeof term.bold === 'function') return (s: string) => term.bold(s);
  return (s: string) => term(s);
}

function dimOrPlain(term: Term, colorsDisabled: boolean): (s: string) => void {
  if (colorsDisabled) return (s: string) => term(s);
  if (typeof term.dim === 'function') return (s: string) => term.dim(s);
  return (s: string) => term(s);
}

export async function showKeyMenu(
  term: Term,
  title: string,
  lines: string[],
  allowed: string[],
  colorsDisabled: boolean,
  options?: { enter?: string }
): Promise<string | null> {
  term.clear();
  term.moveTo(1, 1);
  boldOrPlain(term, colorsDisabled)(title);
  for (let i = 0; i < lines.length; i++) {
    term.moveTo(1, 3 + i);
    term(lines[i]!);
  }
  term.moveTo(1, 3 + lines.length + 1);
  dimOrPlain(term, colorsDisabled)('[Esc] cancel');

  return await new Promise<string | null>((resolve) => {
    const handler = (name: string) => {
      if (name === 'ESCAPE') {
        term.removeListener('key', handler);
        resolve(null);
        return;
      }
      if (name === 'ENTER' && options?.enter !== undefined) {
        term.removeListener('key', handler);
        resolve(options.enter);
        return;
      }
      const lower = name.toLowerCase();
      if (allowed.includes(lower)) {
        term.removeListener('key', handler);
        resolve(lower);
      }
    };
    term.on('key', handler);
  });
}

export async function promptText(
  term: Term,
  title: string,
  label: string,
  initial: string,
  colorsDisabled: boolean
): Promise<string | null> {
  term.clear();
  term.moveTo(1, 1);
  boldOrPlain(term, colorsDisabled)(title);
  term.moveTo(1, 3);
  term(label);
  term.moveTo(1, 5);
  dimOrPlain(term, colorsDisabled)('Enter to save, Esc to cancel');
  term.moveTo(1, 4);
  setCursorVisible(term, true);

  return await new Promise<string | null>((resolve) => {
    term.inputField({ default: initial, cancelable: true }, (error: unknown, input: string) => {
      setCursorVisible(term, false);
      if (error) {
        resolve(null);
        return;
      }
      resolve(input ?? '');
    });
  });
}

export async function confirmYesNo(
  term: Term,
  title: string,
  lines: string[],
  colorsDisabled: boolean
): Promise<boolean> {
  term.clear();
  term.moveTo(1, 1);
  boldOrPlain(term, colorsDisabled)(title);
  for (let i = 0; i < lines.length; i++) {
    term.moveTo(1, 3 + i);
    term(lines[i]!);
  }
  term.moveTo(1, 3 + lines.length + 1);
  dimOrPlain(term, colorsDisabled)('[y] yes  [n] no  [Esc] cancel');

  return await new Promise<boolean>((resolve) => {
    const handler = (name: string) => {
      const lower = name.toLowerCase();
      if (name === 'ESCAPE') {
        term.removeListener('key', handler);
        resolve(false);
        return;
      }
      if (lower === 'y') {
        term.removeListener('key', handler);
        resolve(true);
        return;
      }
      if (lower === 'n') {
        term.removeListener('key', handler);
        resolve(false);
      }
    };
    term.on('key', handler);
  });
}
