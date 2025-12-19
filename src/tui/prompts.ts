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

export async function pickProjectTypeahead(
  term: Term,
  title: string,
  projects: { id: string; name: string; area?: string }[],
  initialQuery: string,
  colorsDisabled: boolean
): Promise<string | null> {
  let query = initialQuery;
  let selected = 0;

  function filterProjects(): { id: string; name: string; area?: string }[] {
    const q = query.trim().toLowerCase();
    const scored = projects
      .map((p) => {
        const hay = `${p.id} ${p.name} ${p.area ?? ''}`.toLowerCase();
        const ok = q === '' ? true : hay.includes(q);
        // crude score: prefer id prefix match
        const score = q && p.id.toLowerCase().startsWith(q) ? 2 : q && hay.includes(q) ? 1 : 0;
        return { p, ok, score };
      })
      .filter((x) => x.ok)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.p.id.localeCompare(b.p.id);
      })
      .map((x) => x.p);
    return scored;
  }

  function render(): void {
    const list = filterProjects();
    term.clear();
    term.moveTo(1, 1);
    boldOrPlain(term, colorsDisabled)(title);
    term.moveTo(1, 3);
    term(`Project: ${query}`);
    term.moveTo(1, 5);
    dimOrPlain(term, colorsDisabled)('[Type] filter  [↑/↓] select  [Enter] choose  [Esc] cancel');

    const maxRows = Math.max(1, (term.height ?? process.stdout.rows ?? 24) - 7);
    const shown = list.slice(0, maxRows);
    if (selected >= shown.length) selected = Math.max(0, shown.length - 1);

    for (let i = 0; i < shown.length; i++) {
      const p = shown[i]!;
      const label = `${p.id}  ${p.name}${p.area ? `  (${p.area})` : ''}`;
      term.moveTo(1, 7 + i);
      if (i === selected) {
        if (colorsDisabled) term(label);
        else term.inverse(label);
      } else {
        term(label);
      }
    }
    if (shown.length === 0) {
      term.moveTo(1, 7);
      dimOrPlain(term, colorsDisabled)('No matches');
    }
  }

  render();

  return await new Promise<string | null>((resolve) => {
    const handler = (name: string) => {
      const list = filterProjects();

      if (name === 'ESCAPE') {
        term.removeListener('key', handler);
        resolve(null);
        return;
      }
      if (name === 'ENTER') {
        const chosen = list[selected] ?? list[0] ?? null;
        term.removeListener('key', handler);
        resolve(chosen?.id ?? null);
        return;
      }
      if (name === 'UP') {
        selected = Math.max(0, selected - 1);
        render();
        return;
      }
      if (name === 'DOWN') {
        selected = Math.min(Math.max(0, list.length - 1), selected + 1);
        render();
        return;
      }
      if (name === 'BACKSPACE') {
        query = query.slice(0, -1);
        selected = 0;
        render();
        return;
      }
      // Basic text input (letters/digits/space and some punctuation)
      if (name.length === 1) {
        query += name;
        selected = 0;
        render();
        return;
      }
    };
    term.on('key', handler);
  });
}
