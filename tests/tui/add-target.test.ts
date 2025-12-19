import { describe, it, expect } from 'vitest';
import { decideAddTargetProjectId } from '../../src/tui/add-target.js';

function makeIndex(projectIds: string[]) {
  return {
    version: 1,
    generatedAt: '2025-12-19',
    files: ['todos.md'],
    projects: Object.fromEntries(
      projectIds.map((id) => [id, { id, name: id.toUpperCase(), filePath: 'todos.md', lineNumber: 1 }])
    ),
    tasks: {},
  } as any;
}

function task(projectId: string) {
  return { projectId } as any;
}

describe('decideAddTargetProjectId', () => {
  it('uses project drilldown when set', () => {
    const index = makeIndex(['a', 'b']);
    const res = decideAddTargetProjectId({
      index,
      drilldownProjectId: 'b',
      filteredTasks: [task('a'), task('b')],
      selectedTask: task('a'),
      inboxProjectId: 'inbox',
    });
    expect(res).toEqual({ projectId: 'b', reason: 'project-drilldown' });
  });

  it('uses single-project list when only one project is present', () => {
    const index = makeIndex(['a', 'b']);
    const res = decideAddTargetProjectId({
      index,
      drilldownProjectId: null,
      filteredTasks: [task('a'), task('a')],
      selectedTask: task('b'),
      inboxProjectId: 'inbox',
    });
    expect(res).toEqual({ projectId: 'a', reason: 'single-project-list' });
  });

  it("defaults to selected task's project in multi-project lists", () => {
    const index = makeIndex(['a', 'b']);
    const res = decideAddTargetProjectId({
      index,
      drilldownProjectId: null,
      filteredTasks: [task('a'), task('b')],
      selectedTask: task('b'),
      inboxProjectId: 'inbox',
    });
    expect(res).toEqual({ projectId: 'b', reason: 'selected-task' });
  });

  it('falls back to inbox when nothing else applies and inbox exists', () => {
    const index = makeIndex(['inbox']);
    const res = decideAddTargetProjectId({
      index,
      drilldownProjectId: null,
      filteredTasks: [],
      selectedTask: null,
      inboxProjectId: 'inbox',
    });
    expect(res).toEqual({ projectId: 'inbox', reason: 'inbox-fallback' });
  });

  it('returns null when inbox fallback is missing', () => {
    const index = makeIndex(['a']);
    const res = decideAddTargetProjectId({
      index,
      drilldownProjectId: null,
      filteredTasks: [],
      selectedTask: null,
      inboxProjectId: 'inbox',
    });
    expect(res).toEqual({ projectId: null, reason: 'none' });
  });
});
