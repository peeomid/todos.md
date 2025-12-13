/**
 * Generate the next available ID for a project.
 *
 * @param existingIds - Array of existing local IDs in the project (e.g., ['1', '2', '1.1'])
 * @param parentId - If creating a subtask, the parent's local ID
 * @returns The next available ID
 */
export function generateNextId(existingIds: string[], parentId?: string): string {
  if (parentId) {
    // Generate subtask ID: parent.N
    const childPrefix = `${parentId}.`;
    const childIds = existingIds
      .filter((id) => id.startsWith(childPrefix) && !id.slice(childPrefix.length).includes('.'))
      .map((id) => {
        const suffix = id.slice(childPrefix.length);
        return Number.parseInt(suffix, 10);
      })
      .filter((n) => !Number.isNaN(n));

    const maxChild = childIds.length > 0 ? Math.max(...childIds) : 0;
    return `${parentId}.${maxChild + 1}`;
  }

  // Generate top-level ID
  const topLevelIds = existingIds
    .filter((id) => !id.includes('.'))
    .map((id) => Number.parseInt(id, 10))
    .filter((n) => !Number.isNaN(n));

  const maxId = topLevelIds.length > 0 ? Math.max(...topLevelIds) : 0;
  return String(maxId + 1);
}
