import { describe, expect, it } from 'vitest';
import { getFooterHeight } from '../../src/tui/layout.js';

describe('tui layout', () => {
  it('reserves extra lines for the autocomplete panel during search', () => {
    expect(getFooterHeight({ searchActive: false })).toBe(8);
    expect(getFooterHeight({ searchActive: true })).toBe(14);
  });

  it('makes the autocomplete panel visible for typical terminal heights', () => {
    const termHeight = 24;
    const listTop = 5;

    const footerHeightWithoutPanel = getFooterHeight({ searchActive: false });
    const listHeightWithoutPanel = Math.max(1, termHeight - listTop - footerHeightWithoutPanel);
    const footerTopWithoutPanel = listTop + listHeightWithoutPanel;
    const panelStartRowWithoutPanel = footerTopWithoutPanel + 8;
    const panelHintRowWithoutPanel = panelStartRowWithoutPanel + 5; // border + 4 suggestions + hint
    expect(panelHintRowWithoutPanel).toBeGreaterThan(termHeight);

    const footerHeightWithPanel = getFooterHeight({ searchActive: true });
    const listHeightWithPanel = Math.max(1, termHeight - listTop - footerHeightWithPanel);
    const footerTopWithPanel = listTop + listHeightWithPanel;
    const panelStartRowWithPanel = footerTopWithPanel + 8;
    const panelHintRowWithPanel = panelStartRowWithPanel + 5;
    expect(panelHintRowWithPanel).toBeLessThanOrEqual(termHeight);
  });
});
