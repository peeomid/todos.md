export function setCursorVisible(term: any, visible: boolean): void {
  if (visible) {
    if (typeof term.showCursor === 'function') {
      term.showCursor();
      return;
    }
    // terminal-kit supports show via hideCursor(false) in some builds.
    if (typeof term.hideCursor === 'function') {
      term.hideCursor(false);
    }
    return;
  }

  if (typeof term.hideCursor === 'function') {
    term.hideCursor();
    return;
  }
  // best-effort fallback
  if (typeof term.showCursor === 'function') {
    // no-op; can't reliably "hide" without hideCursor
    return;
  }
}
