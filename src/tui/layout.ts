export const BASE_FOOTER_HEIGHT = 8;
// Rendered as: top border (1) + up to 4 suggestions (4) + hint line (1)
export const AUTOCOMPLETE_PANEL_HEIGHT = 6;

export function getFooterHeight(options: { searchActive: boolean }): number {
  return BASE_FOOTER_HEIGHT + (options.searchActive ? AUTOCOMPLETE_PANEL_HEIGHT : 0);
}

