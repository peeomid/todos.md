import type { AutocompleteSuggestion } from './autocomplete.js';

type Term = any;

/**
 * Render an autocomplete suggestions box starting at `startRow`.
 * Layout:
 *   startRow:     border
 *   startRow+1..: suggestions (up to maxSuggestions)
 *   last line:    hint (Tab apply, etc)
 */
export function renderAutocompleteSuggestionsBox(
  term: Term,
  options: {
    suggestions: AutocompleteSuggestion[];
    selectedIndex: number;
    startRow: number;
    width: number;
    colorsDisabled: boolean;
    maxSuggestions?: number;
    hintWhenMore?: string;
    hintWhenNoMore?: string;
  }
): void {
  const {
    suggestions,
    selectedIndex,
    startRow,
    width,
    colorsDisabled,
    maxSuggestions: maxSuggestionsRaw,
    hintWhenMore,
    hintWhenNoMore,
  } = options;

  if (suggestions.length === 0) return;

  const maxSuggestions = Math.min(maxSuggestionsRaw ?? 4, suggestions.length);
  const displaySuggestions = suggestions.slice(0, maxSuggestions);

  const style = {
    dim: (s: string) => (colorsDisabled ? term(s) : term.dim(s)),
    cyan: (s: string) => (colorsDisabled ? term(s) : term.cyan(s)),
    green: (s: string) => (colorsDisabled ? term(s) : term.green(s)),
    yellow: (s: string) => (colorsDisabled ? term(s) : term.yellow(s)),
    selectedBg: (s: string) => (colorsDisabled ? term.inverse(s) : term.bgCyan.black(s)),
    normal: (s: string) => term(s),
  };

  // Top border
  term.moveTo(1, startRow);
  term.eraseLineAfter?.();
  style.dim('─'.repeat(width));

  // Suggestions
  displaySuggestions.forEach((suggestion, index) => {
    const row = startRow + 1 + index;
    term.moveTo(1, row);
    term.eraseLineAfter?.();

    const isSelected = index === selectedIndex;
    const arrow = isSelected ? '▶' : ' ';

    if (isSelected) style.cyan(arrow + ' ');
    else style.dim(arrow + ' ');

    const mainText = suggestion.display.padEnd(14);
    if (isSelected) style.selectedBg(mainText);
    else if (suggestion.type === 'key') style.yellow(mainText);
    else style.green(mainText);

    const helpText = suggestion.preview || suggestion.description || '';
    if (helpText) {
      style.normal(' ');
      style.dim(helpText);
    }
  });

  // Hint line
  const hintRow = startRow + 1 + displaySuggestions.length;
  term.moveTo(1, hintRow);
  term.eraseLineAfter?.();

  const moreCount = suggestions.length - maxSuggestions;
  if (moreCount > 0) {
    style.dim(hintWhenMore ?? `  ↑↓ navigate · Tab apply · +${moreCount} more · type to filter`);
  } else {
    style.dim(hintWhenNoMore ?? '  ↑↓ navigate · Tab apply · Esc cancel');
  }
}

