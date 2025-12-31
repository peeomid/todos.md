export function shouldAllowGlobalQuit(params: {
  busy: boolean;
  searchActive: boolean;
  commandActive: boolean;
  projectsFilterActive: boolean;
}): boolean {
  // When a text input is active (search / go-to-line / projects filter),
  // treat printable characters as text, not global shortcuts.
  if (params.busy) return false;
  if (params.searchActive) return false;
  if (params.commandActive) return false;
  if (params.projectsFilterActive) return false;
  return true;
}

