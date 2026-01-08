/**
 * Generate the next available ID for a task.
 *
 * @param existingIds - Array of existing local IDs at the same level
 * @param parentId - Parent ID if creating a subtask (e.g., "1" for subtask "1.X")
 * @returns The next available ID
 */
export function generateNextId(existingIds: string[], parentId?: string): string {
  if (parentId) {
    // Subtask: find max suffix and increment
    const prefix = `${parentId}.`;
    const suffixes = existingIds
      .filter((id) => id.startsWith(prefix))
      .map((id) => {
        const suffix = id.slice(prefix.length);
        // Handle nested IDs (e.g., "1.1.1" under "1.1")
        const firstPart = suffix.split('.')[0];
        return parseInt(firstPart ?? '0', 10);
      })
      .filter((n) => !Number.isNaN(n));

    const maxSuffix = suffixes.length > 0 ? Math.max(...suffixes) : 0;
    return `${parentId}.${maxSuffix + 1}`;
  }

  // Top-level: find max numeric ID and increment
  const numericIds = existingIds
    .filter((id) => !id.includes('.')) // Only top-level IDs
    .map((id) => parseInt(id, 10))
    .filter((n) => !Number.isNaN(n));

  const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 0;
  return String(maxId + 1);
}

/**
 * Get all existing local IDs for a project from the index.
 *
 * @param tasks - Record of globalId to Task
 * @param projectId - The project ID to filter by
 * @returns Array of local IDs
 */
export function getExistingIdsForProject(
  tasks: Record<string, { projectId: string; localId: string }>,
  projectId: string
): string[] {
  return Object.values(tasks)
    .filter((task) => task.projectId === projectId)
    .map((task) => task.localId);
}
