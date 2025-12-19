import type { TaskIndex, Task } from '../schema/index.js';

export type AddTargetReason = 'project-drilldown' | 'single-project-list' | 'selected-task' | 'inbox-fallback' | 'none';

export interface AddTargetDecision {
  projectId: string | null;
  reason: AddTargetReason;
}

export function decideAddTargetProjectId(args: {
  index: TaskIndex;
  drilldownProjectId: string | null;
  filteredTasks: Task[];
  selectedTask: Task | null;
  inboxProjectId: string;
}): AddTargetDecision {
  const { index, drilldownProjectId, filteredTasks, selectedTask, inboxProjectId } = args;

  if (drilldownProjectId) {
    return { projectId: drilldownProjectId, reason: 'project-drilldown' };
  }

  const projectIds = new Set<string>();
  for (const t of filteredTasks) projectIds.add(t.projectId);
  if (projectIds.size === 1) {
    const only = [...projectIds][0]!;
    return { projectId: only, reason: 'single-project-list' };
  }

  if (selectedTask) {
    return { projectId: selectedTask.projectId, reason: 'selected-task' };
  }

  if (index.projects[inboxProjectId]) {
    return { projectId: inboxProjectId, reason: 'inbox-fallback' };
  }

  return { projectId: null, reason: 'none' };
}

