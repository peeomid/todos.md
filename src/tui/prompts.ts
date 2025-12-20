import { setCursorVisible } from './term-cursor.js';
import { isSpaceKeyName } from './key-utils.js';
import { renderLabeledInputField } from './input-render.js';
import {
  getAutocompleteContext,
  generateSuggestionsWithSpecs,
  applySuggestion,
  METADATA_SPECS,
  ADD_METADATA_SPECS,
  type AutocompleteState,
} from './autocomplete.js';
import { renderAutocompleteSuggestionsBox } from './autocomplete-render.js';
import type { Task } from '../schema/index.js';
import terminalKit from 'terminal-kit';

type Term = any;

function eraseLineAfterSafe(term: Term): void {
  if (typeof term.eraseLineAfter === 'function') {
    term.eraseLineAfter();
  }
}

function titleHintForKeyMenu(allowed: string[], hasEnter: boolean): string {
  if (allowed.length === 0) {
    return hasEnter ? 'Press Enter to close, Esc to cancel' : 'Press Esc to close';
  }
  return hasEnter ? 'Press a key in [brackets] (Enter uses default)' : 'Press a key in [brackets] to choose';
}

function fieldLabelFromPromptLabel(label: string): string {
  const lower = label.trim().toLowerCase();
  const pick = (s: string) => `${s[0]!.toUpperCase()}${s.slice(1)} `;

  if (lower.includes('task text') || lower.includes('text')) return pick('text');
  if (lower.includes('metadata')) return pick('metadata');
  if (lower.includes('project id') || /\bid\b/.test(lower)) return pick('id');
  if (lower.includes('project name') || lower.includes('name')) return pick('name');
  if (lower.includes('area')) return pick('area');
  if (lower.includes('project')) return pick('project');
  if (lower.includes('plan')) return pick('plan');
  if (lower.includes('due')) return pick('due');
  if (lower.includes('input')) return pick('input');

  const firstWord = label.trim().split(/\s+/)[0] ?? 'Input';
  return `${firstWord.replace(/:$/, '')} `;
}

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

function stripBracketedMetadata(block: string): string {
  const trimmed = (block ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return trimmed.slice(1, -1).trim();
  return trimmed;
}

function wrapMetadata(inner: string): string {
  const trimmed = (inner ?? '').trim();
  if (!trimmed) return '';
  const noBrackets = trimmed.replace(/^\[+/, '').replace(/\]+$/, '').trim();
  if (!noBrackets) return '';
  if (noBrackets.includes('[') || noBrackets.includes(']')) {
    throw new Error('Metadata cannot contain "[" or "]"');
  }
  return `[${noBrackets}]`;
}

function redOrPlain(term: Term, colorsDisabled: boolean): (s: string) => void {
  if (colorsDisabled) return (s: string) => term(s);
  if (typeof term.red === 'function') return (s: string) => term.red(s);
  return (s: string) => term(s);
}

function isShiftTabKeyName(name: string): boolean {
  return name === 'SHIFT_TAB' || name === 'BACKTAB' || name === 'BACK_TAB';
}

export async function showKeyMenu(
  term: Term,
  title: string,
  lines: string[],
  allowed: string[],
  colorsDisabled: boolean,
  options?: { enter?: string }
): Promise<string | null> {
  let scrollTop = 0;

  function formatChoiceHint(): string | null {
    const uniq = Array.from(new Set(allowed));
    if (uniq.length === 0) return null;

    const allSingleChar = uniq.every((k) => k.length === 1);
    if (!allSingleChar) return null;

    const isDigit = uniq.every((k) => k >= '0' && k <= '9');
    if (isDigit) {
      const nums = uniq
        .map((k) => Number.parseInt(k, 10))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);
      if (nums.length !== uniq.length) return null;

      let contiguous = true;
      for (let i = 1; i < nums.length; i++) {
        if (nums[i] !== nums[i - 1]! + 1) {
          contiguous = false;
          break;
        }
      }
      if (contiguous && nums.length >= 3) return `Press [${nums[0]}-${nums[nums.length - 1]}]`;
      return `Press [${nums.join('/')}]`;
    }

    const isLetter = uniq.every((k) => k >= 'a' && k <= 'z');
    if (isLetter) return `Press [${uniq.join('/')}]`;

    return null;
  }

  const render = (): void => {
    const width: number = term.width ?? process.stdout.columns ?? 80;
    const height: number = term.height ?? process.stdout.rows ?? 24;
    const contentTop = 3;
    const contentMaxRows = Math.max(1, height - contentTop - 2);
    const maxScrollTop = Math.max(0, lines.length - contentMaxRows);
    scrollTop = Math.min(Math.max(0, scrollTop), maxScrollTop);

    term.clear();
    term.moveTo(1, 1);
    boldOrPlain(term, colorsDisabled)(terminalKit.truncateString(title, width));
    term.moveTo(1, 2);
    dimOrPlain(term, colorsDisabled)(
      terminalKit.truncateString(titleHintForKeyMenu(allowed, options?.enter !== undefined), width)
    );

    const shown = lines.slice(scrollTop, scrollTop + contentMaxRows);
    for (let i = 0; i < shown.length; i++) {
      term.moveTo(1, contentTop + i);
      term(terminalKit.truncateString(shown[i] ?? '', width));
    }

    const footerParts: string[] = [];
    if (lines.length > contentMaxRows) footerParts.push('[↑/↓] scroll');
    const choiceHint = formatChoiceHint();
    if (choiceHint) footerParts.push(choiceHint);
    if (options?.enter !== undefined) footerParts.push(allowed.length === 0 ? '[Enter] close' : '[Enter] default');
    footerParts.push('[Esc] cancel');
    term.moveTo(1, contentTop + contentMaxRows + 1);
    dimOrPlain(term, colorsDisabled)(terminalKit.truncateString(footerParts.join('  '), width));
  };

  render();

  return await new Promise<string | null>((resolve) => {
    const handler = (name: string) => {
      const height: number = term.height ?? process.stdout.rows ?? 24;
      const contentTop = 3;
      const contentMaxRows = Math.max(1, height - contentTop - 2);
      const maxScrollTop = Math.max(0, lines.length - contentMaxRows);

      if (name === 'ESCAPE' || name === 'CTRL_C') {
        term.removeListener('key', handler);
        resolve(null);
        return;
      }
      if (name === 'ENTER' && options?.enter !== undefined) {
        term.removeListener('key', handler);
        resolve(options.enter);
        return;
      }
      if (name === 'UP' && scrollTop > 0) {
        scrollTop = Math.max(0, scrollTop - 1);
        render();
        return;
      }
      if (name === 'DOWN' && scrollTop < maxScrollTop) {
        scrollTop = Math.min(maxScrollTop, scrollTop + 1);
        render();
        return;
      }
      if (name === 'PAGE_UP' && scrollTop > 0) {
        scrollTop = Math.max(0, scrollTop - Math.max(1, Math.floor(contentMaxRows / 2)));
        render();
        return;
      }
      if (name === 'PAGE_DOWN' && scrollTop < maxScrollTop) {
        scrollTop = Math.min(maxScrollTop, scrollTop + Math.max(1, Math.floor(contentMaxRows / 2)));
        render();
        return;
      }
      if (name === 'HOME' && scrollTop !== 0) {
        scrollTop = 0;
        render();
        return;
      }
      if (name === 'END' && scrollTop !== maxScrollTop) {
        scrollTop = maxScrollTop;
        render();
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
  // Fallback for unit tests / minimal terminal stubs: keep the old terminal-kit inputField behavior.
  // In the real TUI, we prefer a custom-rendered field so the cursor is always visible even when
  // the terminal cursor is subtle/disabled.
  if (typeof term.on !== 'function' || typeof term.removeListener !== 'function') {
    term.clear();
    term.moveTo(1, 1);
    boldOrPlain(term, colorsDisabled)(title);
    term.moveTo(1, 2);
    dimOrPlain(term, colorsDisabled)('[Enter] save  [Esc] cancel');
    term.moveTo(1, 3);
    term(label);
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

  let value = initial ?? '';
  const fieldLabel = fieldLabelFromPromptLabel(label);

  function render(): void {
    const width: number = term.width ?? process.stdout.columns ?? 80;
    term.clear();
    term.moveTo(1, 1);
    boldOrPlain(term, colorsDisabled)(terminalKit.truncateString(title, width));
    term.moveTo(1, 2);
    dimOrPlain(term, colorsDisabled)(terminalKit.truncateString('[Enter] save  [Esc] cancel', width));
    term.moveTo(1, 3);
    term(terminalKit.truncateString(label, width));

    term.moveTo(1, 4);
    eraseLineAfterSafe(term);
    const { cursorCol } = renderLabeledInputField(term, {
      label: fieldLabel,
      value,
      width,
      colorsDisabled,
      placeholder: 'type…',
    });
    eraseLineAfterSafe(term);
    term.moveTo(cursorCol, 4);
    setCursorVisible(term, true);
  }

  render();
  setCursorVisible(term, true);

  return await new Promise<string | null>((resolve) => {
    const handler = (name: string) => {
      if (name === 'ESCAPE' || name === 'CTRL_C') {
        term.removeListener('key', handler);
        setCursorVisible(term, false);
        resolve(null);
        return;
      }
      if (name === 'ENTER') {
        term.removeListener('key', handler);
        setCursorVisible(term, false);
        resolve(value);
        return;
      }
      if (name === 'BACKSPACE') {
        value = value.slice(0, -1);
        render();
        return;
      }
      if (isSpaceKeyName(name)) {
        value += ' ';
        render();
        return;
      }
      if (name.length === 1) {
        value += name;
        render();
        return;
      }
    };
    term.on('key', handler);
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
  term.moveTo(1, 2);
  dimOrPlain(term, colorsDisabled)('Press y/n (Esc cancels)');
  for (let i = 0; i < lines.length; i++) {
    term.moveTo(1, 3 + i);
    term(lines[i]!);
  }
  term.moveTo(1, 3 + lines.length + 1);
  dimOrPlain(term, colorsDisabled)('[y] yes  [n] no  [Esc] cancel');

  return await new Promise<boolean>((resolve) => {
    const handler = (name: string) => {
      const lower = name.toLowerCase();
      if (name === 'ESCAPE' || name === 'CTRL_C') {
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
    const width: number = term.width ?? process.stdout.columns ?? 80;
    const height: number = term.height ?? process.stdout.rows ?? 24;
    const listTop = 5;
    term.clear();
    term.moveTo(1, 1);
    boldOrPlain(term, colorsDisabled)(title);
    term.moveTo(1, 2);
    dimOrPlain(term, colorsDisabled)(terminalKit.truncateString('[Type] filter  [↑/↓] select  [Enter] choose  [Esc] cancel', width));
    term.moveTo(1, 3);
    eraseLineAfterSafe(term);
    const { cursorCol } = renderLabeledInputField(term, {
      label: 'Project ',
      value: query,
      width,
      colorsDisabled,
      placeholder: 'type to filter…',
    });
    term.moveTo(cursorCol, 3);
    setCursorVisible(term, true);

    const maxRows = Math.max(1, height - (listTop - 1));
    const shown = list.slice(0, maxRows);
    if (selected >= shown.length) selected = Math.max(0, shown.length - 1);

    for (let i = 0; i < shown.length; i++) {
      const p = shown[i]!;
      const label = `${p.id}  ${p.name}${p.area ? `  (${p.area})` : ''}`;
      term.moveTo(1, listTop + i);
      if (i === selected) {
        if (colorsDisabled) term(label);
        else term.inverse(label);
      } else {
        term(label);
      }
    }
    if (shown.length === 0) {
      term.moveTo(1, listTop);
      dimOrPlain(term, colorsDisabled)('No matches');
    }
  }

  render();

  return await new Promise<string | null>((resolve) => {
    const handler = (name: string) => {
      const list = filterProjects();

      if (name === 'ESCAPE' || name === 'CTRL_C') {
        term.removeListener('key', handler);
        setCursorVisible(term, false);
        resolve(null);
        return;
      }
      if (name === 'ENTER') {
        const chosen = list[selected] ?? list[0] ?? null;
        term.removeListener('key', handler);
        setCursorVisible(term, false);
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
      if (isSpaceKeyName(name)) {
        query += ' ';
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

export async function promptMetadataBlock(options: {
  term: Term;
  title: string;
  taskLine?: string;
  initial: string;
  allTasks: Task[];
  colorsDisabled: boolean;
}): Promise<string | null> {
  const { term, title, taskLine, initial, allTasks, colorsDisabled } = options;

  let value = stripBracketedMetadata(initial);
  let cursorPos = value.length;

  const autocomplete: AutocompleteState = {
    active: false,
    suggestions: [],
    selectedIndex: 0,
    context: null,
  };

  function updateAutocomplete(): void {
    const context = getAutocompleteContext(value, cursorPos);
    autocomplete.context = context;
    const suggestions = generateSuggestionsWithSpecs(context, allTasks, METADATA_SPECS as any);
    autocomplete.suggestions = suggestions;
    autocomplete.selectedIndex = Math.max(0, Math.min(autocomplete.selectedIndex, Math.max(0, suggestions.length - 1)));
    autocomplete.active = suggestions.length > 0;
  }

  function render(): void {
    const width: number = term.width ?? process.stdout.columns ?? 80;
    const height: number = term.height ?? process.stdout.rows ?? 24;
    const inputRow = 5;
    const afterInputRow = inputRow + 1;
    const suggestStartRow = afterInputRow + 1;

    term.clear();
    term.moveTo(1, 1);
    boldOrPlain(term, colorsDisabled)(terminalKit.truncateString(title, width));
    term.moveTo(1, 2);
    dimOrPlain(term, colorsDisabled)(
      terminalKit.truncateString('[Type] key:value  [Tab] apply  [↑/↓] select  [Enter] save  [Esc] cancel', width)
    );
    if (taskLine) {
      term.moveTo(1, 3);
      dimOrPlain(term, colorsDisabled)(terminalKit.truncateString(taskLine, width));
    }

    term.moveTo(1, inputRow);
    eraseLineAfterSafe(term);
    const { cursorCol } = renderLabeledInputField(term, {
      label: 'Metadata ',
      value,
      width,
      colorsDisabled,
      placeholder: 'id:1 bucket:today plan:today',
    });
    eraseLineAfterSafe(term);
    term.moveTo(cursorCol, inputRow);
    setCursorVisible(term, true);

    term.moveTo(1, afterInputRow);
    eraseLineAfterSafe(term);
    try {
      dimOrPlain(term, colorsDisabled)(terminalKit.truncateString(`Saved as: ${wrapMetadata(value) || '(empty)'}`, width));
    } catch {
      dimOrPlain(term, colorsDisabled)(terminalKit.truncateString('Saved as: (invalid metadata)', width));
    }

    // If we don't have space for suggestions, skip them.
    const remainingRows = height - suggestStartRow + 1;
    if (autocomplete.active && remainingRows >= 3) {
      renderAutocompleteSuggestionsBox(term, {
        suggestions: autocomplete.suggestions,
        selectedIndex: autocomplete.selectedIndex,
        startRow: suggestStartRow,
        width,
        colorsDisabled,
        maxSuggestions: Math.min(4, Math.max(1, remainingRows - 2)),
        hintWhenMore: undefined,
        hintWhenNoMore: '  ↑↓ navigate · Tab apply · Esc cancel',
      });
    }
  }

  updateAutocomplete();
  render();

  return await new Promise<string | null>((resolve) => {
    const handler = (name: string) => {
      if (name === 'ESCAPE' || name === 'CTRL_C') {
        term.removeListener('key', handler);
        setCursorVisible(term, false);
        resolve(null);
        return;
      }
      if (name === 'ENTER') {
        term.removeListener('key', handler);
        setCursorVisible(term, false);
        try {
          resolve(wrapMetadata(value));
        } catch {
          // Stay in the prompt; user can fix input.
          setCursorVisible(term, true);
          render();
        }
        return;
      }
      if (name === 'UP' && autocomplete.active) {
        autocomplete.selectedIndex = Math.max(0, autocomplete.selectedIndex - 1);
        render();
        return;
      }
      if (name === 'DOWN' && autocomplete.active) {
        autocomplete.selectedIndex = Math.min(autocomplete.suggestions.length - 1, autocomplete.selectedIndex + 1);
        render();
        return;
      }
      if (name === 'TAB' && autocomplete.active && autocomplete.context) {
        const suggestion = autocomplete.suggestions[autocomplete.selectedIndex];
        if (suggestion) {
          const applied = applySuggestion(value, cursorPos, suggestion, autocomplete.context);
          value = applied.newInput;
          cursorPos = applied.newCursorPos;
          updateAutocomplete();
          render();
        }
        return;
      }
      if (name === 'BACKSPACE') {
        value = value.slice(0, -1);
        cursorPos = value.length;
        updateAutocomplete();
        render();
        return;
      }
      if (isSpaceKeyName(name)) {
        value += ' ';
        cursorPos = value.length;
        updateAutocomplete();
        render();
        return;
      }
      if (name.length === 1) {
        value += name;
        cursorPos = value.length;
        updateAutocomplete();
        render();
        return;
      }
    };
    term.on('key', handler);
  });
}

export async function promptEditTaskModal(options: {
  term: Term;
  title: string;
  taskLine?: string;
  initialText: string;
  initialMetadata: string;
  allTasks: Task[];
  colorsDisabled: boolean;
}): Promise<{ text: string; metadataBlock: string } | null> {
  const { term, title, taskLine, initialText, initialMetadata, allTasks, colorsDisabled } = options;

  type Focus = 'text' | 'meta';
  let focus: Focus = 'text';

  let textValue = initialText ?? '';
  let metaValue = stripBracketedMetadata(initialMetadata ?? '');
  let message: string | null = null;

  const metaAutocomplete: AutocompleteState = {
    active: false,
    suggestions: [],
    selectedIndex: 0,
    context: null,
  };

  function updateMetaAutocomplete(): void {
    if (focus !== 'meta') return;
    const cursorPos = metaValue.length;
    const context = getAutocompleteContext(metaValue, cursorPos);
    metaAutocomplete.context = context;
    if (!context.filterKey && !context.isAfterColon && context.currentToken === '') {
      clearMetaAutocomplete();
      return;
    }
    const suggestions = generateSuggestionsWithSpecs(context, allTasks, METADATA_SPECS as any);
    metaAutocomplete.suggestions = suggestions;
    metaAutocomplete.selectedIndex = Math.max(
      0,
      Math.min(metaAutocomplete.selectedIndex, Math.max(0, suggestions.length - 1))
    );
    metaAutocomplete.active = suggestions.length > 0;
  }

  function clearMetaAutocomplete(): void {
    metaAutocomplete.active = false;
    metaAutocomplete.suggestions = [];
    metaAutocomplete.selectedIndex = 0;
    metaAutocomplete.context = null;
  }

  function render(): void {
    const width: number = term.width ?? process.stdout.columns ?? 80;
    const height: number = term.height ?? process.stdout.rows ?? 24;

    const textRow = 5;
    const metaRow = 7;
    const hintRow = 9;
    const suggestStartRow = 10;
    const footerRow = height;

    term.clear();
    term.moveTo(1, 1);
    boldOrPlain(term, colorsDisabled)(terminalKit.truncateString(title, width));
    term.moveTo(1, 2);
    if (taskLine) dimOrPlain(term, colorsDisabled)(terminalKit.truncateString(taskLine, width));
    else dimOrPlain(term, colorsDisabled)(terminalKit.truncateString('', width));

    // Text field
    term.moveTo(1, textRow);
    eraseLineAfterSafe(term);
    const textCursor = renderLabeledInputField(term, {
      label: focus === 'text' ? 'Text * ' : 'Text   ',
      value: textValue,
      width,
      colorsDisabled,
      placeholder: 'task description…',
      focused: focus === 'text',
    });
    eraseLineAfterSafe(term);

    // Metadata field
    term.moveTo(1, metaRow);
    eraseLineAfterSafe(term);
    const metaCursor = renderLabeledInputField(term, {
      label: focus === 'meta' ? 'Meta * ' : 'Meta   ',
      value: metaValue,
      width,
      colorsDisabled,
      placeholder: 'id:1 bucket:today plan:today',
      focused: focus === 'meta',
    });
    eraseLineAfterSafe(term);

    // Context line / errors
    term.moveTo(1, hintRow);
    eraseLineAfterSafe(term);
    if (message) {
      redOrPlain(term, colorsDisabled)(terminalKit.truncateString(message, width));
    } else if (focus === 'meta' && metaAutocomplete.active) {
      dimOrPlain(term, colorsDisabled)(
        terminalKit.truncateString('Meta autocomplete: Tab/Enter applies the selected suggestion', width)
      );
    } else {
      dimOrPlain(term, colorsDisabled)(
        terminalKit.truncateString(focus === 'text' ? 'Enter → Meta' : 'Enter → Save', width)
      );
    }

    // Suggestions below metadata field (only when meta focused)
    const remainingRows = (footerRow - 1) - suggestStartRow + 1;
    if (focus === 'meta' && metaAutocomplete.active && remainingRows >= 3) {
      renderAutocompleteSuggestionsBox(term, {
        suggestions: metaAutocomplete.suggestions,
        selectedIndex: metaAutocomplete.selectedIndex,
        startRow: suggestStartRow,
        width,
        colorsDisabled,
        maxSuggestions: Math.min(4, Math.max(1, remainingRows - 2)),
        hintWhenNoMore: '  ↑↓ navigate · Tab/Enter apply · Esc cancel',
      });
    }

    // Footer help (consistent with list view: keys at bottom)
    term.moveTo(1, footerRow);
    term.eraseLineAfter?.();
    const footerHelp = metaAutocomplete.active
      ? '[Tab/Enter] apply  [↑/↓] choose  [Shift+Tab] prev  [Esc] cancel'
      : '[Tab] next  [Shift+Tab] prev  [Enter] next/save  [↑/↓] switch  [Esc] cancel';
    dimOrPlain(term, colorsDisabled)(terminalKit.truncateString(footerHelp, width));

    const cursorPos = focus === 'text' ? { x: textCursor.cursorCol, y: textRow } : { x: metaCursor.cursorCol, y: metaRow };
    term.moveTo(cursorPos.x, cursorPos.y);
    setCursorVisible(term, true);
  }

  updateMetaAutocomplete();
  render();

  return await new Promise<{ text: string; metadataBlock: string } | null>((resolve) => {
    const handler = (name: string) => {
      message = null;

      if (name === 'ESCAPE' || name === 'CTRL_C') {
        term.removeListener('key', handler);
        setCursorVisible(term, false);
        resolve(null);
        return;
      }

      if (focus === 'meta') {
        if ((name === 'UP' || name === 'DOWN') && metaAutocomplete.active) {
          metaAutocomplete.selectedIndex =
            name === 'UP'
              ? Math.max(0, metaAutocomplete.selectedIndex - 1)
              : Math.min(metaAutocomplete.suggestions.length - 1, metaAutocomplete.selectedIndex + 1);
          render();
          return;
        }
        if (isShiftTabKeyName(name)) {
          focus = 'text';
          clearMetaAutocomplete();
          render();
          return;
        }
        if ((name === 'TAB' || name === 'ENTER') && metaAutocomplete.active && metaAutocomplete.context) {
          const suggestion = metaAutocomplete.suggestions[metaAutocomplete.selectedIndex];
          if (suggestion) {
            const cursorPos = metaValue.length;
            const applied = applySuggestion(metaValue, cursorPos, suggestion, metaAutocomplete.context);
            metaValue = applied.newInput;
            updateMetaAutocomplete();
            render();
          }
          return;
        }
        if (name === 'UP' && !metaAutocomplete.active) {
          focus = 'text';
          clearMetaAutocomplete();
          render();
          return;
        }
        if (name === 'DOWN' && !metaAutocomplete.active) {
          // already last field
          return;
        }
        if (name === 'TAB' && !metaAutocomplete.active) {
          message = 'Press Enter to save';
          render();
          return;
        }
        if (name === 'ENTER' && !metaAutocomplete.active) {
          try {
            const metadataBlock = wrapMetadata(metaValue);
            term.removeListener('key', handler);
            setCursorVisible(term, false);
            resolve({ text: textValue, metadataBlock });
          } catch (e) {
            message = e instanceof Error ? e.message : String(e);
            updateMetaAutocomplete();
            render();
          }
          return;
        }
        if (name === 'BACKSPACE') {
          metaValue = metaValue.slice(0, -1);
          updateMetaAutocomplete();
          render();
          return;
        }
        if (isSpaceKeyName(name)) {
          metaValue += ' ';
          updateMetaAutocomplete();
          render();
          return;
        }
        if (name.length === 1) {
          metaValue += name;
          updateMetaAutocomplete();
          render();
          return;
        }
      } else {
        if (name === 'UP') return; // already first field
        if (isShiftTabKeyName(name)) return; // already first field
        if (name === 'DOWN') {
          focus = 'meta';
          updateMetaAutocomplete();
          render();
          return;
        }
        if (name === 'TAB') {
          focus = 'meta';
          updateMetaAutocomplete();
          render();
          return;
        }
        if (name === 'ENTER') {
          focus = 'meta';
          updateMetaAutocomplete();
          render();
          return;
        }
        if (name === 'BACKSPACE') {
          textValue = textValue.slice(0, -1);
          render();
          return;
        }
        if (isSpaceKeyName(name)) {
          textValue += ' ';
          render();
          return;
        }
        if (name.length === 1) {
          textValue += name;
          render();
          return;
        }
      }
    };
    term.on('key', handler);
  });
}

export async function promptAddTaskModal(options: {
  term: Term;
  title: string;
  projects: { id: string; name: string; area?: string }[];
  initialProjectId?: string | null;
  allTasks: Task[];
  colorsDisabled: boolean;
}): Promise<{ projectId: string; text: string; metadataInner: string } | null> {
  const { term, title, projects, initialProjectId, allTasks, colorsDisabled } = options;

  type Focus = 'project' | 'text' | 'meta';

  let focus: Focus = 'project';
  let message: string | null = null;

  let projectSelected: string | null = initialProjectId ?? null;
  let projectQuery: string = initialProjectId ?? '';
  let textValue = '';
  let metaValue = '';

  const projectList: AutocompleteState = { active: false, suggestions: [], selectedIndex: 0, context: null };
  const metaAutocomplete: AutocompleteState = { active: false, suggestions: [], selectedIndex: 0, context: null };

  function clearProjectList(): void {
    projectList.active = false;
    projectList.suggestions = [];
    projectList.selectedIndex = 0;
    projectList.context = null;
  }

  function clearMetaAutocomplete(): void {
    metaAutocomplete.active = false;
    metaAutocomplete.suggestions = [];
    metaAutocomplete.selectedIndex = 0;
    metaAutocomplete.context = null;
  }

  function computeProjectSuggestions(): void {
    if (focus !== 'project') {
      clearProjectList();
      return;
    }

    if (projectSelected) {
      clearProjectList();
      return;
    }

    const q = projectQuery.trim().toLowerCase();
    const scored = projects
      .map((p) => {
        const hay = `${p.id} ${p.name} ${p.area ?? ''}`.toLowerCase();
        const ok = q === '' ? true : hay.includes(q);
        const score = q && p.id.toLowerCase().startsWith(q) ? 2 : q && hay.includes(q) ? 1 : 0;
        return { p, ok, score };
      })
      .filter((x) => x.ok)
      .sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id))
      .slice(0, 10)
      .map((x) => x.p);

    projectList.suggestions = scored.map((p) => ({
      type: 'value' as const,
      text: p.id,
      display: p.id,
      description: p.area ? `${p.name} (${p.area})` : p.name,
    }));
    projectList.selectedIndex = Math.max(0, Math.min(projectList.selectedIndex, Math.max(0, projectList.suggestions.length - 1)));
    projectList.active = projectList.suggestions.length > 0;
  }

  function updateMetaAutocomplete(): void {
    if (focus !== 'meta') {
      clearMetaAutocomplete();
      return;
    }
    const cursorPos = metaValue.length;
    const context = getAutocompleteContext(metaValue, cursorPos);
    metaAutocomplete.context = context;
    if (!context.filterKey && !context.isAfterColon && context.currentToken === '') {
      clearMetaAutocomplete();
      return;
    }
    const suggestions = generateSuggestionsWithSpecs(context, allTasks, ADD_METADATA_SPECS as any);
    metaAutocomplete.suggestions = suggestions;
    metaAutocomplete.selectedIndex = Math.max(
      0,
      Math.min(metaAutocomplete.selectedIndex, Math.max(0, suggestions.length - 1))
    );
    metaAutocomplete.active = suggestions.length > 0;
  }

  function applySelectedSuggestion(list: AutocompleteState): boolean {
    if (!list.active) return false;
    const suggestion = list.suggestions[list.selectedIndex];
    if (!suggestion) return false;

    if (focus === 'project') {
      projectSelected = suggestion.text;
      projectQuery = suggestion.text;
      clearProjectList();
      return true;
    }

    if (focus === 'meta' && metaAutocomplete.context) {
      const applied = applySuggestion(metaValue, metaValue.length, suggestion, metaAutocomplete.context);
      metaValue = applied.newInput;
      updateMetaAutocomplete();
      return true;
    }

    return false;
  }

  function focusPrevField(): void {
    focus = focus === 'meta' ? 'text' : focus === 'text' ? 'project' : 'project';
    computeProjectSuggestions();
    updateMetaAutocomplete();
  }

  function focusNextField(): void {
    focus = focus === 'project' ? 'text' : focus === 'text' ? 'meta' : 'meta';
    computeProjectSuggestions();
    updateMetaAutocomplete();
  }

  function tryAdvanceFromCurrentField(): boolean {
    if (focus === 'project' && !projectSelected) {
      message = 'Choose a project';
      computeProjectSuggestions();
      return false;
    }
    if (focus === 'text' && !textValue.trim()) {
      message = 'Task text is required';
      return false;
    }
    if (focus === 'meta') {
      message = 'Press Enter to save';
      return false;
    }
    focusNextField();
    return true;
  }

  function render(): void {
    const width: number = term.width ?? process.stdout.columns ?? 80;
    const height: number = term.height ?? process.stdout.rows ?? 24;

    const projectRow = 5;
    const textRow = 7;
    const metaRow = 9;
    const hintRow = 11;
    const suggestStartRow = 12;
    const footerRow = height;

    term.clear();
    term.moveTo(1, 1);
    boldOrPlain(term, colorsDisabled)(terminalKit.truncateString(title, width));

    const activeList = focus === 'project' ? projectList.active : focus === 'meta' ? metaAutocomplete.active : false;
    term.moveTo(1, 2);
    dimOrPlain(term, colorsDisabled)(terminalKit.truncateString('', width));

    term.moveTo(1, projectRow);
    eraseLineAfterSafe(term);
    const projectCursor = renderLabeledInputField(term, {
      label: focus === 'project' ? 'Project * ' : 'Project   ',
      value: projectSelected ?? projectQuery,
      width,
      colorsDisabled,
      placeholder: 'type to filter…',
      focused: focus === 'project',
    });
    eraseLineAfterSafe(term);

    term.moveTo(1, textRow);
    eraseLineAfterSafe(term);
    const textCursor = renderLabeledInputField(term, {
      label: focus === 'text' ? 'Text * ' : 'Text   ',
      value: textValue,
      width,
      colorsDisabled,
      placeholder: 'task description…',
      focused: focus === 'text',
    });
    eraseLineAfterSafe(term);

    term.moveTo(1, metaRow);
    eraseLineAfterSafe(term);
    const metaCursor = renderLabeledInputField(term, {
      label: focus === 'meta' ? 'Meta * ' : 'Meta   ',
      value: metaValue,
      width,
      colorsDisabled,
      placeholder: 'bucket:today plan:today priority:high',
      focused: focus === 'meta',
    });
    eraseLineAfterSafe(term);

    term.moveTo(1, hintRow);
    eraseLineAfterSafe(term);
    if (message) {
      redOrPlain(term, colorsDisabled)(terminalKit.truncateString(message, width));
    } else if (focus === 'project' && projectSelected) {
      dimOrPlain(term, colorsDisabled)(terminalKit.truncateString('Enter → Text (or type to change project)', width));
    } else if (focus === 'project') {
      dimOrPlain(term, colorsDisabled)(terminalKit.truncateString('Type to filter projects', width));
    } else if (focus === 'text') {
      dimOrPlain(term, colorsDisabled)(terminalKit.truncateString('Enter → Meta', width));
    } else if (focus === 'meta') {
      try {
        dimOrPlain(term, colorsDisabled)(
          terminalKit.truncateString(`Will save meta: ${wrapMetadata(metaValue) || '(none)'}`, width)
        );
      } catch {
        dimOrPlain(term, colorsDisabled)(terminalKit.truncateString('Meta is invalid', width));
      }
    }

    const list = focus === 'project' ? projectList : metaAutocomplete;
    const showList = list.active && (focus === 'project' || focus === 'meta');
    const remainingRows = (footerRow - 1) - suggestStartRow + 1;
    if (showList && remainingRows >= 3) {
      renderAutocompleteSuggestionsBox(term, {
        suggestions: list.suggestions,
        selectedIndex: list.selectedIndex,
        startRow: suggestStartRow,
        width,
        colorsDisabled,
        maxSuggestions: Math.min(6, Math.max(1, remainingRows - 2)),
        hintWhenNoMore: '  ↑↓ navigate · Tab/Enter select · Esc cancel',
      });
    }

    // Footer help (consistent with list view: keys at bottom)
    term.moveTo(1, footerRow);
    term.eraseLineAfter?.();
    const footerHelp = activeList
      ? '[Tab/Enter] select  [↑/↓] choose  [Shift+Tab] prev  [Esc] cancel'
      : '[Tab] next  [Shift+Tab] prev  [Enter] next/save  [↑/↓] switch  [Esc] cancel';
    dimOrPlain(term, colorsDisabled)(terminalKit.truncateString(footerHelp, width));

    const cursorPos =
      focus === 'project'
        ? { x: projectCursor.cursorCol, y: projectRow }
        : focus === 'text'
          ? { x: textCursor.cursorCol, y: textRow }
          : { x: metaCursor.cursorCol, y: metaRow };
    term.moveTo(cursorPos.x, cursorPos.y);
    setCursorVisible(term, true);
  }

  computeProjectSuggestions();
  updateMetaAutocomplete();
  render();

  return await new Promise<{ projectId: string; text: string; metadataInner: string } | null>((resolve) => {
    const handler = (name: string) => {
      message = null;

      const listActive =
        (focus === 'project' && projectList.active) || (focus === 'meta' && metaAutocomplete.active);

      if (name === 'ESCAPE' || name === 'CTRL_C') {
        term.removeListener('key', handler);
        setCursorVisible(term, false);
        resolve(null);
        return;
      }

      if ((name === 'UP' || name === 'DOWN') && listActive) {
        const list = focus === 'project' ? projectList : metaAutocomplete;
        list.selectedIndex =
          name === 'UP'
            ? Math.max(0, list.selectedIndex - 1)
            : Math.min(list.suggestions.length - 1, list.selectedIndex + 1);
        render();
        return;
      }

      if ((name === 'UP' || name === 'DOWN') && !listActive) {
        if (name === 'UP') focusPrevField();
        else focusNextField();
        render();
        return;
      }

      if (isShiftTabKeyName(name)) {
        focusPrevField();
        render();
        return;
      }

      if ((name === 'TAB' || name === 'ENTER') && listActive) {
        applySelectedSuggestion(focus === 'project' ? projectList : metaAutocomplete);
        computeProjectSuggestions();
        updateMetaAutocomplete();
        render();
        return;
      }

      if (name === 'TAB' && !listActive) {
        const moved = tryAdvanceFromCurrentField();
        computeProjectSuggestions();
        updateMetaAutocomplete();
        render();
        return;
      }

      if (name === 'ENTER' && !listActive) {
        if (focus === 'project') {
          if (!projectSelected) {
            message = 'Choose a project';
            computeProjectSuggestions();
            render();
            return;
          }
          focusNextField();
          render();
          return;
        }
        if (focus === 'text') {
          if (!textValue.trim()) {
            message = 'Task text is required';
            render();
            return;
          }
          focusNextField();
          render();
          return;
        }
        if (focus === 'meta') {
          if (!projectSelected) {
            message = 'Choose a project';
            focus = 'project';
            computeProjectSuggestions();
            render();
            return;
          }
          const trimmedText = textValue.trim();
          if (!trimmedText) {
            message = 'Task text is required';
            focus = 'text';
            render();
            return;
          }
          try {
            wrapMetadata(metaValue); // validate
          } catch (e) {
            message = e instanceof Error ? e.message : String(e);
            updateMetaAutocomplete();
            render();
            return;
          }
          term.removeListener('key', handler);
          setCursorVisible(term, false);
          resolve({ projectId: projectSelected, text: trimmedText, metadataInner: metaValue.trim() });
          return;
        }
      }

      if (focus === 'project') {
        if (projectSelected) {
          // Any edit action clears selection and enters filter mode.
          if (name === 'BACKSPACE') {
            projectSelected = null;
            projectQuery = '';
            computeProjectSuggestions();
            render();
            return;
          }
          if (isSpaceKeyName(name) || name.length === 1) {
            projectSelected = null;
            projectQuery = '';
            // fall through to apply this key to query
          } else {
            return;
          }
        }

        if (name === 'BACKSPACE') {
          projectQuery = projectQuery.slice(0, -1);
          computeProjectSuggestions();
          render();
          return;
        }
        if (isSpaceKeyName(name)) {
          projectQuery += ' ';
          computeProjectSuggestions();
          render();
          return;
        }
        if (name.length === 1) {
          projectQuery += name;
          computeProjectSuggestions();
          render();
          return;
        }
        return;
      }

      if (focus === 'text') {
        if (name === 'BACKSPACE') {
          textValue = textValue.slice(0, -1);
          render();
          return;
        }
        if (isSpaceKeyName(name)) {
          textValue += ' ';
          render();
          return;
        }
        if (name.length === 1) {
          textValue += name;
          render();
          return;
        }
        return;
      }

      if (focus === 'meta') {
        if (name === 'BACKSPACE') {
          metaValue = metaValue.slice(0, -1);
          updateMetaAutocomplete();
          render();
          return;
        }
        if (isSpaceKeyName(name)) {
          metaValue += ' ';
          updateMetaAutocomplete();
          render();
          return;
        }
        if (name.length === 1) {
          metaValue += name;
          updateMetaAutocomplete();
          render();
          return;
        }
      }
    };
    term.on('key', handler);
  });
}
