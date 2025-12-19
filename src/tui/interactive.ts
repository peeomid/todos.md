import fs from 'node:fs';
import terminalKit from 'terminal-kit';
import type { Config } from '../config/loader.js';
import { buildIndex } from '../indexer/index.js';
import type { TaskIndex, Task, Project, Priority } from '../schema/index.js';
import {
  parseQueryString,
  parseFilterArg,
  parseFilterArgs,
  buildFiltersFromOptions,
  composeFilters,
  filterByText,
  groupTasks,
  sortTasksByFields,
  type SortField,
} from '../query/filters.js';
import { markTaskDone, markTaskUndone } from '../editor/task-editor.js';
import { deleteTaskSubtree } from '../editor/task-deleter.js';
import { parseMetadataBlock, serializeMetadata } from '../parser/metadata-parser.js';
import { parseDate, parseRelativeDate, formatDate } from '../cli/date-utils.js';
import { generateNextId, getExistingIdsForProject } from '../editor/id-generator.js';
import { insertTask, type TaskMetadata } from '../editor/task-inserter.js';
import { isSpaceKeyName } from './key-utils.js';
import { getStickyHeaderLabel } from './sticky-header.js';
import {
  formatBucketSymbolShorthand,
  formatBucketTagShorthand,
  formatPriorityShorthand,
  getTaskShorthandTokens,
} from './task-shorthands.js';
import { confirmYesNo, pickProjectTypeahead, promptText, showKeyMenu } from './prompts.js';
import { setCursorVisible } from './term-cursor.js';
import { runEditFlow } from './edit-flow.js';
import { decideAddTargetProjectId } from './add-target.js';
import { getShorthandHelpLines } from './shorthand-help.js';

type Term = any;

interface InteractiveView {
  key: string; // '0'..'9'
  name: string;
  query: string;
  sort?: string; // comma-separated sort fields
  kind: 'tasks' | 'projects';
}

interface TuiOptions {
  index: TaskIndex;
  config: Config;
  configPath?: string | null;
  files: string[];
  output: string;
}

interface SessionState {
  index: TaskIndex;
  views: InteractiveView[];
  viewIndex: number;
  statusMode: 'open' | 'all';
  query: string;
  search: { active: boolean; scope: 'view' | 'global'; input: string };
  selection: { row: number; scroll: number; selectedId: string | null };
  projects: { drilldownProjectId: string | null };
  fileMtimes: Map<string, number>;
  filteredTasks: Task[];
  renderRows: RenderRow[];
  filteredProjects: Project[];
  message: string | null;
  busy: boolean;
  colorsDisabled: boolean;
  groupBy: 'project' | 'none';
}

type RenderRow =
  | { kind: 'header'; projectId: string; label: string; count: number }
  | { kind: 'task'; task: Task };

function todayIso(): string {
  return new Date().toISOString().split('T')[0]!;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function normalizeStatusInQuery(query: string, statusMode: 'open' | 'all'): string {
  const tokens = parseQueryString(query).filter((t) => !t.startsWith('status:'));
  const statusToken = statusMode === 'all' ? 'status:all' : 'status:open';
  return [statusToken, ...tokens]
    .map((t) => (t === 'status:any' ? 'status:all' : t))
    .join(' ')
    .trim();
}

function ensureTrailingSpace(input: string): string {
  const trimmedEnd = input.replace(/\s+$/, '');
  return trimmedEnd ? `${trimmedEnd} ` : '';
}

function parseSortSpec(spec: string | undefined): SortField[] {
  const raw = (spec ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

  const fields: SortField[] = [];
  for (const field of raw) {
    if (
      field === 'due' ||
      field === 'plan' ||
      field === 'created' ||
      field === 'project' ||
      field === 'energy' ||
      field === 'priority' ||
      field === 'bucket'
    ) {
      fields.push(field);
    }
  }
  return fields;
}

function defaultSortForView(view: InteractiveView): SortField[] {
  if (view.kind === 'projects') {
    return [];
  }
  switch (view.key) {
    case '0':
      return ['project', 'priority', 'plan', 'due'];
    case '1':
    case '2':
    case '3':
    case '4':
      return ['priority', 'plan', 'due'];
    default:
      return ['priority', 'plan', 'due'];
  }
}

function buildViews(config: Config): InteractiveView[] {
  const builtins: InteractiveView[] = [
    { key: '0', name: 'All', query: 'status:open', sort: 'project,priority,plan,due', kind: 'tasks' },
    { key: '1', name: 'Today', query: 'status:open bucket:today', sort: 'priority,plan,due', kind: 'tasks' },
    { key: '2', name: 'Upcoming', query: 'status:open bucket:upcoming', sort: 'priority,plan,due', kind: 'tasks' },
    { key: '3', name: 'Anytime', query: 'status:open bucket:anytime', sort: 'priority,plan,due', kind: 'tasks' },
    { key: '4', name: 'Someday', query: 'status:open bucket:someday', sort: 'priority,plan,due', kind: 'tasks' },
    { key: '5', name: 'Projects', query: '', kind: 'projects' },
  ];

  const custom = (config.interactive?.views ?? [])
    .map((v): InteractiveView => ({ key: v.key, name: v.name, query: v.query, sort: v.sort, kind: 'tasks' }))
    .filter((v) => v.key.length === 1 && v.key >= '0' && v.key <= '9');

  const byKey = new Map<string, InteractiveView>();
  for (const v of builtins) byKey.set(v.key, v);
  for (const v of custom) byKey.set(v.key, v);

  const merged = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
  return merged;
}

function getFileMtimes(index: TaskIndex): Map<string, number> {
  const m = new Map<string, number>();
  for (const file of index.files) {
    try {
      m.set(file, fs.statSync(file).mtimeMs);
    } catch {
      // ignore
    }
  }
  return m;
}

function formatPriority(p: Priority | undefined): string {
  return formatPriorityShorthand(p) || '   ';
}

function truncate(s: string, max: number): string {
  if (max <= 0) return '';
  if (s.length <= max) return s;
  if (max <= 1) return s.slice(0, max);
  return s.slice(0, max - 1) + '…';
}

function truncateByWidth(s: string, maxWidth: number): string {
  if (maxWidth <= 0) return '';
  if (terminalKit.stringWidth(s) <= maxWidth) return s;
  return terminalKit.truncateString(s, maxWidth);
}

function orderMetadata(metadata: Record<string, string>): Record<string, string> {
  const ordered: Record<string, string> = {};
  if (metadata.id) ordered.id = metadata.id;
  const otherKeys = Object.keys(metadata)
    .filter((k) => k !== 'id')
    .sort();
  for (const key of otherKeys) {
    const value = metadata[key];
    if (value) ordered[key] = value;
  }
  return ordered;
}

const TASK_LINE_REGEX = /^(\s*)- \[([ xX])\]\s+(.+)$/;
const PROJECT_HEADING_REGEX = /^(#{1,6})\s+.+\[.*project:([^\s\]]+)/;

function findTaskLineNumberById(
  filePath: string,
  projectId: string,
  localId: string,
  hintLineNumber: number | null
): number | null {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  function lineMatches(line: string): boolean {
    const match = line.match(TASK_LINE_REGEX);
    if (!match?.[3]) return false;
    const { metadata } = parseMetadataBlock(match[3]);
    return metadata.id === localId;
  }

  if (hintLineNumber && hintLineNumber >= 1 && hintLineNumber <= lines.length) {
    const line = lines[hintLineNumber - 1];
    if (line && lineMatches(line)) {
      // Best effort: verify project context
      let currentProject: string | null = null;
      for (let i = 0; i < hintLineNumber; i++) {
        const m = lines[i]!.match(PROJECT_HEADING_REGEX);
        if (m?.[2]) currentProject = m[2];
      }
      if (!currentProject || currentProject === projectId) {
        return hintLineNumber;
      }
    }
  }

  let currentProject: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const projectMatch = line.match(PROJECT_HEADING_REGEX);
    if (projectMatch?.[2]) {
      currentProject = projectMatch[2];
      continue;
    }
    if (currentProject !== projectId) {
      continue;
    }
    if (lineMatches(line)) {
      return i + 1;
    }
  }

  return null;
}

function render(state: SessionState, term: Term): void {
  const width: number = term.width ?? process.stdout.columns ?? 80;
  const height: number = term.height ?? process.stdout.rows ?? 24;

  const style = {
    text: (s: string) => term(s),
    bold: (s: string) => (state.colorsDisabled ? term(s) : term.bold(s)),
    dim: (s: string) => (state.colorsDisabled ? term(s) : term.dim(s)),
    inverse: (s: string) => (state.colorsDisabled ? term(s) : term.inverse(s)),
    red: (s: string) => (state.colorsDisabled ? term(s) : term.red(s)),
    yellow: (s: string) => (state.colorsDisabled ? term(s) : term.yellow(s)),
    cyan: (s: string) => (state.colorsDisabled ? term(s) : term.cyan(s)),
    blue: (s: string) => (state.colorsDisabled ? term(s) : term.blue(s)),
    bucketToday: (s: string) => (state.colorsDisabled ? term(s) : term.bold.cyan(s)),
    queryAccent: (s: string) => (state.colorsDisabled ? term(s) : term.bold.yellow(s)),
  };

  function writeSegments(segments: { text: string; style: keyof typeof style }[], maxWidth: number): void {
    let remaining = maxWidth;
    for (const segment of segments) {
      if (remaining <= 0) break;
      if (!segment.text) continue;
      const segmentWidth = terminalKit.stringWidth(segment.text);
      if (segmentWidth <= remaining) {
        style[segment.style](segment.text);
        remaining -= segmentWidth;
      } else {
        const truncatedText = truncateByWidth(segment.text, remaining);
        style[segment.style](truncatedText);
        remaining = 0;
        break;
      }
    }
    if (remaining > 0) {
      term(' '.repeat(remaining));
    }
  }

  term.hideCursor();
  term.clear();

  const view = state.views[state.viewIndex]!;
  const isProjectsList = view.kind === 'projects' && !state.projects.drilldownProjectId;
  const modeTitle = isProjectsList
    ? 'Projects'
    : state.projects.drilldownProjectId
      ? `Project ${state.projects.drilldownProjectId}`
      : view.name;

  const header = `tmd – ${modeTitle}`;
  term.moveTo(1, 1);
  style.bold(header);

  // Tabs line
  term.moveTo(1, 2);
  if (state.colorsDisabled) {
    const tabs = state.views.map((v) => `[${v.key}] ${v.name}`).join(' ');
    term(tabs.length > width ? truncate(tabs, width) : tabs);
  } else {
    let remaining = width;
    for (let idx = 0; idx < state.views.length; idx++) {
      if (remaining <= 0) break;
      const v = state.views[idx]!;
      const active = idx === state.viewIndex;
      const label = `[${v.key}] ${v.name}`;
      const text = active ? ` ${label} ` : label;
      const w = terminalKit.stringWidth(text);

      const sep = idx === 0 ? '' : ' ';
      const sepW = terminalKit.stringWidth(sep);
      if (sepW > remaining) break;
      if (sep) {
        term(sep);
        remaining -= sepW;
      }

      if (w <= remaining) {
        if (active) term.bgBlue.white(text);
        else term(text);
        remaining -= w;
      } else {
        const truncated = truncateByWidth(text, remaining);
        if (active) term.bgBlue.white(truncated);
        else term(truncated);
        remaining = 0;
        break;
      }
    }
    if (remaining > 0) term(' '.repeat(remaining));
    term.styleReset();
  }

  const queryRaw = state.search.active ? state.search.input : state.query;
  const query = normalizeStatusInQuery(queryRaw, state.statusMode);
  const flags = state.statusMode === 'open' ? 'hide-done' : 'show-done';
  const queryLine = `View: ${modeTitle} (${view.key}) | Query: ${query} | Flags: ${flags}`;
  term.moveTo(1, 3);
  if (state.colorsDisabled) {
    style.dim(truncate(queryLine, width));
  } else {
    writeSegments(
      [
        { text: `View: ${modeTitle} (${view.key}) | Query: `, style: 'dim' },
        { text: query, style: 'queryAccent' },
        { text: ` | Flags: ${flags}`, style: 'dim' },
      ],
      width
    );
    term.styleReset();
  }

  // Separator
  term.moveTo(1, 4);
  if (state.groupBy === 'project' && !isProjectsList) {
    const label = getStickyHeaderLabel(state.renderRows, state.selection.scroll);
    if (!label) {
      style.dim('─'.repeat(width));
    } else {
      const prefix = `─ ${label} `;
      const prefixShown = truncateByWidth(prefix, width);
      const remaining = Math.max(0, width - terminalKit.stringWidth(prefixShown));
      style.dim(`${prefixShown}${'─'.repeat(remaining)}`);
    }
  } else {
    style.dim('─'.repeat(width));
  }

  // Footer uses:
  // - 1 separator line
  // - 3 details lines
  // - 1 separator line
  // - 2 help lines
  // - 1 status/message line
  const footerHeight = 8;
  const listTop = 5;
  const listHeight = Math.max(1, height - listTop - footerHeight);

  if (isProjectsList) {
    const projects = state.filteredProjects;
    const start = state.selection.scroll;
    const end = Math.min(projects.length, start + listHeight);
    for (let i = start; i < end; i++) {
      const row = i - start;
      const p = projects[i]!;
      const line = `${p.id}  ${p.name}${p.area ? `  (${p.area})` : ''}  ${p.filePath}:${p.lineNumber}`;
      const y = listTop + row;
      term.moveTo(1, y);
      const selected = i === state.selection.row;
      if (selected) style.inverse(truncate(line, width));
      else style.text(truncate(line, width));
    }
  } else {
    const rows = state.renderRows;
    const start = state.selection.scroll;
    const end = Math.min(rows.length, start + listHeight);
    for (let i = start; i < end; i++) {
      const row = i - start;
      const y = listTop + row;
      term.moveTo(1, y);
      const selected = i === state.selection.row;

      if (!state.colorsDisabled) {
        term.styleReset();
        if (selected) term.inverse();
      }

      const r = rows[i]!;
      if (r.kind === 'header') {
        const labelMax = Math.max(0, width);
        const label = truncateByWidth(r.label, labelMax);
        const pad = Math.max(0, width - terminalKit.stringWidth(label));
        if (state.colorsDisabled) {
          term(label);
          if (pad > 0) term(' '.repeat(pad));
        } else {
          term.styleReset();
          if (selected) term.inverse();
          term.bold.cyan(label);
          if (pad > 0) term(' '.repeat(pad));
        }
      } else {
        const t = r.task;
        const checkbox = t.completed ? '[x]' : '[ ]';
        const shorthandTokens = getTaskShorthandTokens(t.priority, t.bucket);

        const rightTokens: { text: string; style: keyof typeof style }[] = [];
        rightTokens.push({ text: t.globalId, style: 'dim' });
        if (t.plan) rightTokens.push({ text: `plan:${t.plan}`, style: 'cyan' });
        if (t.due) rightTokens.push({ text: `due:${t.due}`, style: 'cyan' });
        if (t.est) rightTokens.push({ text: t.est, style: 'dim' });

        const rightPlain = rightTokens.map((x) => x.text).join('  ');
        const rightWidth = terminalKit.stringWidth(rightPlain);
        const rightMax = Math.max(0, Math.min(width, Math.floor(width * 0.45)));
        const rightShown = rightWidth > rightMax ? truncateByWidth(rightPlain, rightMax) : rightPlain;

        const rightShownWidth = terminalKit.stringWidth(rightShown);
        const leftMax = Math.max(10, width - rightShownWidth - 2);

        const shorthandPlain = shorthandTokens.map((tok) => tok.text).join(' ');
        const leftPrefixPlain = shorthandPlain ? `${checkbox} ${shorthandPlain}  ` : `${checkbox}  `;
        const leftPrefixWidth = terminalKit.stringWidth(leftPrefixPlain);
        const textMax = Math.max(0, leftMax - leftPrefixWidth);
        const shownText = truncateByWidth(t.text, textMax);

        const priStyle: keyof typeof style =
          t.priority === 'high' ? 'red' : t.priority === 'low' ? 'dim' : 'text';
        const bucketStyle: keyof typeof style =
          t.bucket === 'today'
            ? 'bucketToday'
            : t.bucket === 'upcoming'
              ? 'blue'
              : t.bucket === 'someday'
                ? 'dim'
                : 'text';
        const textStyle: keyof typeof style = t.completed ? 'dim' : 'text';
        const checkboxStyle: keyof typeof style = t.completed ? 'dim' : 'text';

        const segments: { text: string; style: keyof typeof style }[] = [
          { text: checkbox, style: checkboxStyle },
          { text: ' ', style: 'text' },
        ];
        for (let idx = 0; idx < shorthandTokens.length; idx++) {
          const tok = shorthandTokens[idx]!;
          const tokStyle: keyof typeof style = tok.kind === 'priority' ? priStyle : bucketStyle;
          segments.push({ text: tok.text, style: tokStyle });
          segments.push({ text: ' ', style: 'text' });
        }
        // Always separate prefix from task text with two spaces (like a column).
        segments.push({ text: ' ', style: 'text' });
        segments.push({ text: shownText, style: textStyle });

        writeSegments(
          segments,
          leftMax
        );

        // Spacer between columns
        term('  ');

        // Render right column with lightweight styling: plan/due cyan, rest dim
        const rightBudget = width - leftMax - 2;
        if (rightBudget > 0) {
          // If truncated, we lose per-token styling; keep it simple in that case.
          if (rightShown !== rightPlain) {
            style.dim(rightShown);
            const pad = Math.max(0, rightBudget - terminalKit.stringWidth(rightShown));
            if (pad > 0) term(' '.repeat(pad));
          } else {
            const segments: { text: string; style: keyof typeof style }[] = [];
            for (let idx = 0; idx < rightTokens.length; idx++) {
              if (idx > 0) segments.push({ text: '  ', style: 'dim' });
              segments.push(rightTokens[idx]!);
            }
            writeSegments(segments, rightBudget);
          }
        }
      }

      if (!state.colorsDisabled) {
        term.styleReset();
      }
    }
  }

  // Footer separator
  const footerTop = listTop + listHeight;
  term.moveTo(1, footerTop);
  style.dim('─'.repeat(width));

  // Details footer (always shown)
  term.moveTo(1, footerTop + 1);
  const selectedTask = getSelectedTask(state);
  const selectedProject = getSelectedProject(state);
  if (selectedTask) {
    style.bold(truncate(selectedTask.text, width));
    term.moveTo(1, footerTop + 2);
    const metaSegments: { text: string; style: keyof typeof style }[] = [
      { text: 'project:', style: 'dim' },
      { text: `${selectedTask.projectId}  `, style: 'text' },
      { text: 'bucket:', style: 'dim' },
      {
        text: `${selectedTask.bucket ?? '-'}${
          selectedTask.bucket
            ? ` (sh: ${formatBucketSymbolShorthand(selectedTask.bucket)} / ${formatBucketTagShorthand(selectedTask.bucket)})`
            : ''
        }  `,
        style: selectedTask.bucket === 'today' ? 'bucketToday' : 'text',
      },
      { text: 'priority:', style: 'dim' },
      {
        text: `${selectedTask.priority ?? '-'}${selectedTask.priority ? ` (sh: ${formatPriorityShorthand(selectedTask.priority)})` : ''}  `,
        style: 'text',
      },
      { text: 'energy:', style: 'dim' },
      { text: `${selectedTask.energy ?? '-'}  `, style: 'text' },
      { text: 'plan:', style: 'dim' },
      { text: `${selectedTask.plan ?? '-'}  `, style: selectedTask.plan ? 'cyan' : 'text' },
      { text: 'due:', style: 'dim' },
      { text: `${selectedTask.due ?? '-'}  `, style: selectedTask.due ? 'cyan' : 'text' },
      { text: 'est:', style: 'dim' },
      { text: `${selectedTask.est ?? '-'}`, style: 'text' },
    ];
    writeSegments(metaSegments, width);
    term.moveTo(1, footerTop + 3);
    style.dim(truncate(`file: ${selectedTask.filePath}:${selectedTask.lineNumber}`, width));
  } else if (selectedProject) {
    style.bold(truncate(`${selectedProject.id} — ${selectedProject.name}`, width));
    term.moveTo(1, footerTop + 2);
    style.text(
      truncate(
        `area: ${selectedProject.area ?? '-'}  file: ${selectedProject.filePath}:${selectedProject.lineNumber}`,
        width
      )
    );
    term.moveTo(1, footerTop + 3);
    style.dim(truncate(`file: ${selectedProject.filePath}:${selectedProject.lineNumber}`, width));
  } else {
    style.dim(truncate('No selection', width));
    term.moveTo(1, footerTop + 2);
    style.dim(truncate('', width));
    term.moveTo(1, footerTop + 3);
    style.dim(truncate('', width));
  }

  // Separator between details and help
  term.moveTo(1, footerTop + 4);
  style.dim('─'.repeat(width));

  // Help footer (always shown, below details)
  term.moveTo(1, footerTop + 5);
  const help1 = '[j/k/↑/↓] move  [g/G] top/bot  [h/l/←/→] views  [/] search  [z] show/hide done  [q] quit';
  style.dim(truncate(help1, width));
  term.moveTo(1, footerTop + 6);
  const help2 = isProjectsList
    ? '[Enter] open project  [a] add project  [?] shorthands'
    : view.kind === 'projects' && state.projects.drilldownProjectId
      ? '[Esc/Backspace] back  [space/x] done  [p] pri  [b] bucket  [n] plan  [d] due  [e] edit  [a] add task  [r] remove'
      : '[space/x] toggle done  [p] priority  [b] bucket  [n] plan  [d] due  [e] edit (t/m)  [a] add (Tab project)  [r] remove  [?] shorthands';
  style.dim(truncate(help2, width));

  term.moveTo(1, footerTop + 7);
  if (state.message) {
    style.red(truncate(state.message, width));
  } else if (state.search.active) {
    const prompt = `Search (scope: ${state.search.scope}) [Enter apply, Esc cancel]: ${state.search.input}`;
    style.cyan(truncate(prompt, width));
  } else {
    style.dim(truncate(state.busy ? 'Working…' : '', width));
  }

  term.hideCursor();
}

function getEffectiveQuery(state: SessionState): string {
  const view = state.views[state.viewIndex]!;
  const base =
    view.kind === 'projects' && state.projects.drilldownProjectId
      ? `project:${state.projects.drilldownProjectId}`
      : view.kind === 'projects'
        ? ''
        : view.query;
  return normalizeStatusInQuery(base, state.statusMode);
}

function recompute(state: SessionState): void {
  const view = state.views[state.viewIndex]!;

  if (view.kind === 'projects' && !state.projects.drilldownProjectId) {
    const projects = Object.values(state.index.projects).sort((a, b) => a.id.localeCompare(b.id));
    state.filteredProjects = projects;
    state.filteredTasks = [];

    const maxRow = Math.max(0, projects.length - 1);
    state.selection.row = clamp(state.selection.row, 0, maxRow);
    state.selection.scroll = clamp(state.selection.scroll, 0, Math.max(0, projects.length - 1));
    state.selection.selectedId = projects[state.selection.row]?.id ?? null;
    return;
  }

  const inProjectDrilldown = view.kind === 'projects' && Boolean(state.projects.drilldownProjectId);

  const query = state.search.active ? state.search.input : state.query;
  const normalized = normalizeStatusInQuery(query, state.statusMode);
  const tokens = parseQueryString(normalized);
  const structured = tokens.filter((t) => parseFilterArg(t) !== null);
  const freeText = tokens.filter((t) => parseFilterArg(t) === null);

  const options = parseFilterArgs(structured);
  const filters = buildFiltersFromOptions(options);
  for (const word of freeText) {
    filters.push(filterByText(word));
  }
  const composed = composeFilters(filters);

  let tasks = Object.values(state.index.tasks).filter(composed);

  const sortSpec = inProjectDrilldown ? undefined : view.sort;
  const sortFields = parseSortSpec(sortSpec);
  const drilldownDefaultSort: SortField[] = ['priority', 'plan', 'due'];
  const fields = sortFields.length > 0 ? sortFields : inProjectDrilldown ? drilldownDefaultSort : defaultSortForView(view);
  if (fields.length > 0) {
    tasks = sortTasksByFields(tasks, fields);
  }

  state.filteredTasks = tasks;
  state.filteredProjects = [];
  state.renderRows = [];

  const taskRowIndexById = new Map<string, number>();
  if (state.groupBy === 'project' && tasks.length > 0) {
    const grouped = groupTasks(tasks, 'project');
    const keys = [...grouped.keys()].sort((a, b) => a.localeCompare(b));
    for (const projectId of keys) {
      const group = grouped.get(projectId) ?? [];
      const project = state.index.projects[projectId];
      const projectName = project?.name ?? '(unknown project)';
      const count = group.length;
      const headerLabel = `${projectId} — ${projectName} (${count} task${count === 1 ? '' : 's'})`;
      state.renderRows.push({ kind: 'header', projectId, label: headerLabel, count: group.length });
      for (const task of group) {
        const idx = state.renderRows.length;
        state.renderRows.push({ kind: 'task', task });
        taskRowIndexById.set(task.globalId, idx);
      }
    }
  } else {
    for (const task of tasks) {
      const idx = state.renderRows.length;
      state.renderRows.push({ kind: 'task', task });
      taskRowIndexById.set(task.globalId, idx);
    }
  }

  const selectedId = state.selection.selectedId;
  if (selectedId && taskRowIndexById.has(selectedId)) {
    state.selection.row = taskRowIndexById.get(selectedId)!;
    state.selection.selectedId = selectedId;
  } else {
    const firstTaskRow = state.renderRows.findIndex((r) => r.kind === 'task');
    if (firstTaskRow === -1) {
      state.selection.row = 0;
      state.selection.selectedId = null;
    } else {
      state.selection.row = firstTaskRow;
      const row = state.renderRows[firstTaskRow] as Extract<RenderRow, { kind: 'task' }>;
      state.selection.selectedId = row.task.globalId;
    }
  }

  state.selection.scroll = clamp(
    state.selection.scroll,
    0,
    Math.max(0, state.renderRows.length - 1)
  );
}

function getSelectedTask(state: SessionState): Task | null {
  const id = state.selection.selectedId;
  if (!id) return null;
  return state.index.tasks[id] ?? null;
}

function getSelectedProject(state: SessionState): Project | null {
  const view = state.views[state.viewIndex]!;
  if (view.kind !== 'projects' || state.projects.drilldownProjectId) return null;
  const id = state.filteredProjects[state.selection.row]?.id;
  if (!id) return null;
  return state.index.projects[id] ?? null;
}

async function confirmReload(term: Term, state: SessionState, filePath: string): Promise<boolean> {
  term.clear();
  term.moveTo(1, 1);
  (state.colorsDisabled ? term : term.bold)('File changed externally');
  term.moveTo(1, 3);
  term(`Detected external edits to: ${filePath}`);
  term.moveTo(1, 5);
  term('Reload from disk before writing? (y/n)');
  return await new Promise<boolean>((resolve) => {
    term.once('key', (name: string) => {
      const lower = name.toLowerCase();
      resolve(lower === 'y');
    });
  });
}

async function ensureFileFresh(
  term: Term,
  state: SessionState,
  filePath: string,
  refreshFromDisk: () => void
): Promise<{ ok: boolean; reloaded: boolean }> {
  const prev = state.fileMtimes.get(filePath);
  if (prev === undefined) {
    try {
      state.fileMtimes.set(filePath, fs.statSync(filePath).mtimeMs);
    } catch {
      return { ok: false, reloaded: false };
    }
    return { ok: true, reloaded: false };
  }

  let current: number;
  try {
    current = fs.statSync(filePath).mtimeMs;
  } catch {
    return { ok: false, reloaded: false };
  }

  if (current === prev) {
    return { ok: true, reloaded: false };
  }

  const shouldReload = await confirmReload(term, state, filePath);
  if (!shouldReload) {
    state.message = `Canceled: ${filePath} changed on disk`;
    return { ok: false, reloaded: false };
  }

  refreshFromDisk();
  return { ok: true, reloaded: true };
}

function refreshIndex(state: SessionState, files: string[]): void {
  const { index } = buildIndex(files);
  state.index = index;
  state.fileMtimes = getFileMtimes(index);
  recompute(state);
}

function updateTaskMetadataInFile(task: Task, changes: Record<string, string | null>): void {
  const filePath = task.filePath;
  const hint = task.lineNumber;
  const lineNumber = findTaskLineNumberById(filePath, task.projectId, task.localId, hint);
  if (!lineNumber) {
    throw new Error(`Failed to locate task line for ${task.globalId}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const line = lines[lineNumber - 1];
  if (!line) {
    throw new Error(`Line ${lineNumber} out of range for ${filePath}`);
  }

  const match = line.match(TASK_LINE_REGEX);
  if (!match?.[3]) {
    throw new Error(`Line ${lineNumber} is not a task`);
  }

  const indent = match[1] ?? '';
  const checkbox = match[2] ?? ' ';
  const taskContent = match[3];
  const { metadata, textWithoutMetadata } = parseMetadataBlock(taskContent);

  for (const [key, value] of Object.entries(changes)) {
    if (key === 'id') continue;
    if (value === null) {
      delete metadata[key];
    } else {
      metadata[key] = value;
    }
  }

  metadata.id = task.localId;
  metadata.updated = todayIso();

  if (metadata.tags === '') {
    delete metadata.tags;
  }

  const metadataStr = serializeMetadata(orderMetadata(metadata));
  lines[lineNumber - 1] = `${indent}- [${checkbox}] ${textWithoutMetadata}${metadataStr ? ` ${metadataStr}` : ''}`;
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
}

function rewriteTaskTextAndMetadataInFile(task: Task, newText: string, metadataBlock: string): void {
  const filePath = task.filePath;
  const lineNumber = findTaskLineNumberById(filePath, task.projectId, task.localId, task.lineNumber);
  if (!lineNumber) {
    throw new Error(`Failed to locate task line for ${task.globalId}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const line = lines[lineNumber - 1];
  if (!line) {
    throw new Error(`Line ${lineNumber} out of range for ${filePath}`);
  }

  const match = line.match(TASK_LINE_REGEX);
  if (!match?.[3]) {
    throw new Error(`Line ${lineNumber} is not a task`);
  }

  const indent = match[1] ?? '';
  const checkbox = match[2] ?? ' ';

  const combined = metadataBlock.trim() ? `${newText} ${metadataBlock.trim()}` : newText;
  const parsed = parseMetadataBlock(combined);
  const metadata = parsed.metadata;
  metadata.id = task.localId; // do not allow id changes
  metadata.updated = todayIso();

  const metadataStr = serializeMetadata(orderMetadata(metadata));
  lines[lineNumber - 1] = `${indent}- [${checkbox}] ${newText}${metadataStr ? ` ${metadataStr}` : ''}`;
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
}

function parseManualDateInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const normalized = parseRelativeDate(trimmed);
  if (normalized === trimmed && !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const date = parseDate(normalized);
    if (!date) return null;
    return formatDate(date);
  }
  return normalized;
}

export async function runInteractiveTui(options: TuiOptions): Promise<TaskIndex> {
  const term: Term = terminalKit.terminal;

  const state: SessionState = {
    index: options.index,
    views: buildViews(options.config),
    viewIndex: 1, // default Today
    statusMode: 'open',
    query: '',
    search: { active: false, scope: 'view', input: '' },
    selection: { row: 0, scroll: 0, selectedId: null },
    projects: { drilldownProjectId: null },
    fileMtimes: getFileMtimes(options.index),
    filteredTasks: [],
    renderRows: [],
    filteredProjects: [],
    message: null,
    busy: false,
    colorsDisabled: Boolean(options.config.interactive?.colors?.disable),
    groupBy: options.config.interactive?.groupBy === 'none' ? 'none' : 'project',
  };

  state.query = getEffectiveQuery(state);
  recompute(state);

  let resolveExit: (() => void) | null = null;
  const exitPromise = new Promise<void>((resolve) => {
    resolveExit = resolve;
  });

  let ctrlCArmedAt: number | null = null;
  let ctrlCResetTimer: ReturnType<typeof setTimeout> | null = null;

  function refreshFromDisk(): void {
    refreshIndex(state, options.files);
  }

  function setViewByKey(key: string): void {
    const idx = state.views.findIndex((v) => v.key === key);
    if (idx !== -1) {
      state.viewIndex = idx;
      state.projects.drilldownProjectId = null;
      state.search.active = false;
      state.search.input = '';
      state.query = getEffectiveQuery(state);
      state.selection = { row: 0, scroll: 0, selectedId: null };
      recompute(state);
    }
  }

  function setNextView(delta: number): void {
    const next = (state.viewIndex + delta + state.views.length) % state.views.length;
    state.viewIndex = next;
    state.projects.drilldownProjectId = null;
    state.search.active = false;
    state.search.input = '';
    state.query = getEffectiveQuery(state);
    state.selection = { row: 0, scroll: 0, selectedId: null };
    recompute(state);
  }

  function updateScrollForSelection(listSize: number, listHeight: number): void {
    state.selection.row = clamp(state.selection.row, 0, Math.max(0, listSize - 1));
    if (state.selection.row < state.selection.scroll) {
      state.selection.scroll = state.selection.row;
    } else if (state.selection.row >= state.selection.scroll + listHeight) {
      state.selection.scroll = Math.max(0, state.selection.row - listHeight + 1);
    }
  }

  function findTaskRowFrom(start: number, direction: -1 | 1): number | null {
    const rows = state.renderRows;
    if (rows.length === 0) return null;
    let i = clamp(start, 0, rows.length - 1);
    while (i >= 0 && i < rows.length) {
      if (rows[i]?.kind === 'task') return i;
      i += direction;
    }
    return null;
  }

  function firstTaskRow(): number | null {
    return findTaskRowFrom(0, 1);
  }

  function lastTaskRow(): number | null {
    return findTaskRowFrom(state.renderRows.length - 1, -1);
  }

  function selectTaskRow(rowIndex: number | null): void {
    if (rowIndex === null) {
      state.selection.row = 0;
      state.selection.selectedId = null;
      return;
    }
    state.selection.row = rowIndex;
    const row = state.renderRows[rowIndex];
    if (row?.kind === 'task') {
      state.selection.selectedId = row.task.globalId;
    } else {
      state.selection.selectedId = null;
    }
  }

  async function toggleDone(): Promise<void> {
    const selected = getSelectedTask(state);
    if (!selected) return;
    const rootId = selected.globalId;

    while (true) {
      const task = state.index.tasks[rootId];
      if (!task) return;

      const touchedIds: string[] = [];
      if (task.completed) {
        touchedIds.push(task.globalId);
      } else {
        const queue: string[] = [task.globalId];
        while (queue.length > 0) {
          const id = queue.shift()!;
          const t = state.index.tasks[id];
          if (!t) continue;
          if (!t.completed) touchedIds.push(id);
          for (const childId of t.childrenIds) queue.push(childId);
        }
      }

      const filesToCheck = new Set<string>();
      for (const id of touchedIds) {
        const t = state.index.tasks[id];
        if (t) filesToCheck.add(t.filePath);
      }

      let reloaded = false;
      for (const filePath of filesToCheck) {
        const res = await ensureFileFresh(term, state, filePath, refreshFromDisk);
        if (!res.ok) return;
        if (res.reloaded) {
          reloaded = true;
          break;
        }
      }
      if (reloaded) continue;

      // Apply edits
      if (task.completed) {
        markTaskUndone(task.filePath, task.lineNumber, task.text);
      } else {
        for (const id of touchedIds) {
          const t = state.index.tasks[id];
          if (!t) continue;
          markTaskDone(t.filePath, t.lineNumber, t.text);
        }
      }

      refreshFromDisk();
      state.selection.selectedId = rootId;
      recompute(state);
      return;
    }
  }

  async function setPriority(): Promise<void> {
    const selected = getSelectedTask(state);
    if (!selected) return;
    const taskId = selected.globalId;

    const choice = await showKeyMenu(
      term,
      `Set priority for: ${selected.text}`,
      ['[h] high', '[n] normal', '[l] low', '[c] clear'],
      ['h', 'n', 'l', 'c'],
      state.colorsDisabled
    );
    if (!choice) return;

    const res = await ensureFileFresh(term, state, selected.filePath, refreshFromDisk);
    if (!res.ok) return;

    const task = state.index.tasks[taskId];
    if (!task) return;

    const changes: Record<string, string | null> = {};
    if (choice === 'c') changes.priority = null;
    if (choice === 'h') changes.priority = 'high';
    if (choice === 'n') changes.priority = 'normal';
    if (choice === 'l') changes.priority = 'low';

    updateTaskMetadataInFile(task, changes);
    refreshFromDisk();
    state.selection.selectedId = taskId;
  }

  async function setBucket(): Promise<void> {
    const selected = getSelectedTask(state);
    if (!selected) return;
    const taskId = selected.globalId;

    const choice = await showKeyMenu(
      term,
      `Set bucket for: ${selected.text}`,
      ['[t] today', '[u] upcoming', '[a] anytime', '[s] someday', '[c] clear'],
      ['t', 'u', 'a', 's', 'c'],
      state.colorsDisabled
    );
    if (!choice) return;

    const res = await ensureFileFresh(term, state, selected.filePath, refreshFromDisk);
    if (!res.ok) return;

    const task = state.index.tasks[taskId];
    if (!task) return;

    const changes: Record<string, string | null> = {};
    if (choice === 'c') changes.bucket = null;
    if (choice === 't') changes.bucket = 'today';
    if (choice === 'u') changes.bucket = 'upcoming';
    if (choice === 'a') changes.bucket = 'anytime';
    if (choice === 's') changes.bucket = 'someday';

    if (choice === 't' && !task.plan) {
      changes.plan = todayIso();
    }

    updateTaskMetadataInFile(task, changes);
    refreshFromDisk();
    state.selection.selectedId = taskId;
  }

  async function setPlanOrDue(which: 'plan' | 'due'): Promise<void> {
    const selected = getSelectedTask(state);
    if (!selected) return;
    const taskId = selected.globalId;

    const choice = await showKeyMenu(
      term,
      `${which === 'plan' ? 'Plan date' : 'Due date'} for: ${selected.text}`,
      ['[t] today', '[m] manual (YYYY-MM-DD or +Nd/+Nw)', '[c] clear'],
      ['t', 'm', 'c'],
      state.colorsDisabled
    );
    if (!choice) return;

    const res = await ensureFileFresh(term, state, selected.filePath, refreshFromDisk);
    if (!res.ok) return;

    const task = state.index.tasks[taskId];
    if (!task) return;

    const changes: Record<string, string | null> = {};
    if (choice === 'c') {
      changes[which] = null;
    } else if (choice === 't') {
      changes[which] = todayIso();
    } else if (choice === 'm') {
      const input = await promptText(
        term,
        `${which === 'plan' ? 'Plan date' : 'Due date'} (manual)`,
        'Input:',
        task[which] ?? '',
        state.colorsDisabled
      );
      if (input === null) return;
      const parsed = parseManualDateInput(input);
      if (!parsed) {
        state.message = `Invalid date: ${input}`;
        return;
      }
      changes[which] = parsed;
    }

    updateTaskMetadataInFile(task, changes);
    refreshFromDisk();
    state.selection.selectedId = taskId;
  }

  async function editTaskInline(): Promise<void> {
    const selected = getSelectedTask(state);
    if (!selected) return;
    const taskId = selected.globalId;

    const res = await ensureFileFresh(term, state, selected.filePath, refreshFromDisk);
    if (!res.ok) return;

    const task = state.index.tasks[taskId];
    if (!task) return;

    const result = await runEditFlow({
      term,
      task,
      colorsDisabled: state.colorsDisabled,
      showKeyMenu,
      promptText,
    });

    if (!result.ok) {
      if ('error' in result) state.message = result.error;
      return;
    }

    rewriteTaskTextAndMetadataInFile(task, result.text, result.metadataBlock);
    refreshFromDisk();
    state.selection.selectedId = taskId;
  }

  async function addTaskFlow(): Promise<void> {
    const inboxProjectId = options.config.interactive?.defaultProject ?? 'inbox';
    const selectedTask = getSelectedTask(state);
    const decision = decideAddTargetProjectId({
      index: state.index,
      drilldownProjectId: state.projects.drilldownProjectId,
      filteredTasks: state.filteredTasks,
      selectedTask,
      inboxProjectId,
    });

    let targetProjectId = decision.projectId;
    if (!targetProjectId) {
      // No inferred project and no Inbox project exists; force explicit selection.
      const projects = Object.values(state.index.projects).sort((a, b) => a.id.localeCompare(b.id));
      const picked = await pickProjectTypeahead(
        term,
        'Choose project',
        projects.map((p) => ({ id: p.id, name: p.name, area: p.area })),
        '',
        state.colorsDisabled
      );
      if (!picked) return;
      targetProjectId = picked;
    }

    // Always show destination and allow changing it via Tab before entering text.
    while (true) {
      const project = state.index.projects[targetProjectId];
      if (!project) {
        state.message = `Project '${targetProjectId}' not found. Re-run index.`;
        return;
      }

      term.clear();
      term.moveTo(1, 1);
      const title = `Add task → ${project.id} — ${project.name}`;
      (state.colorsDisabled ? term : term.bold)(title);
      term.moveTo(1, 3);
      term('Press Enter to continue, Tab to change project, Esc to cancel');

      const choice = await new Promise<'continue' | 'change' | 'cancel'>((resolve) => {
        const handler = (name: string) => {
          if (name === 'ESCAPE') {
            term.removeListener('key', handler);
            resolve('cancel');
            return;
          }
          if (name === 'TAB') {
            term.removeListener('key', handler);
            resolve('change');
            return;
          }
          if (name === 'ENTER') {
            term.removeListener('key', handler);
            resolve('continue');
          }
        };
        term.on('key', handler);
      });

      if (choice === 'cancel') return;
      if (choice === 'change') {
        const projects = Object.values(state.index.projects).sort((a, b) => a.id.localeCompare(b.id));
        const picked = await pickProjectTypeahead(
          term,
          'Choose project',
          projects.map((p) => ({ id: p.id, name: p.name, area: p.area })),
          project.id,
          state.colorsDisabled
        );
        if (!picked) continue;
        targetProjectId = picked;
        continue;
      }

      break;
    }

    const targetProject = targetProjectId;

    const res = await ensureFileFresh(term, state, state.index.projects[targetProject]!.filePath, refreshFromDisk);
    if (!res.ok) return;

    const proj = state.index.projects[targetProject]!;
    const text = await promptText(term, `Add task → ${proj.id} — ${proj.name}`, 'Task text:', '', state.colorsDisabled);
    if (!text) return;

    const priorityKey = await showKeyMenu(
      term,
      'Priority',
      ['[h] high', '[n] normal', '[l] low', '[Enter] normal'],
      ['h', 'n', 'l'],
      state.colorsDisabled,
      { enter: '' }
    );
    const priority: Priority = priorityKey === 'h' ? 'high' : priorityKey === 'l' ? 'low' : 'normal';

    const bucketKey = await showKeyMenu(
      term,
      'Bucket',
      ['[t] today', '[u] upcoming', '[a] anytime', '[s] someday', '[Enter] none'],
      ['t', 'u', 'a', 's'],
      state.colorsDisabled,
      { enter: '' }
    );
    const bucket =
      bucketKey === 't'
        ? 'today'
        : bucketKey === 'u'
          ? 'upcoming'
          : bucketKey === 'a'
            ? 'anytime'
            : bucketKey === 's'
              ? 'someday'
              : undefined;

    const planInput = await promptText(
      term,
      'Plan date',
      'Plan (YYYY-MM-DD or +Nd/+Nw, empty for none):',
      '',
      state.colorsDisabled
    );
    if (planInput === null) return;
    const planParsed = parseManualDateInput(planInput) ?? undefined;

    const dueInput = await promptText(
      term,
      'Due date',
      'Due (YYYY-MM-DD or +Nd/+Nw, empty for none):',
      '',
      state.colorsDisabled
    );
    if (dueInput === null) return;
    const dueParsed = parseManualDateInput(dueInput) ?? undefined;

    const existingIds = getExistingIdsForProject(state.index.tasks, targetProject);
    const newId = generateNextId(existingIds);
    const created = todayIso();
    const metadata: TaskMetadata = {
      id: newId,
      created,
      priority,
      bucket,
      plan: bucket === 'today' && !planParsed ? created : planParsed,
      due: dueParsed,
    };

    const insertResult = insertTask(state.index, targetProject, text.trim(), metadata);
    if (!insertResult.success) {
      state.message = insertResult.error ?? 'Failed to insert task';
      return;
    }

    refreshFromDisk();
    state.selection.selectedId = `${targetProject}:${newId}`;
    recompute(state);
  }

  function slugifyProjectId(input: string): string {
    const lower = input.trim().toLowerCase();
    const replaced = lower.replace(/[^a-z0-9]+/g, '-');
    return replaced.replace(/^-+/, '').replace(/-+$/, '');
  }

  function defaultProjectHeadingLevelForFile(filePath: string): number {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const counts = new Map<number, number>();
      for (const line of lines) {
        const m = line.match(/^(#{1,6})\s+.+\[.*project:([^\s\]]+)/);
        if (!m?.[1]) continue;
        const level = m[1].length;
        counts.set(level, (counts.get(level) ?? 0) + 1);
      }
      const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
      return ranked[0]?.[0] ?? 1;
    } catch {
      return 1;
    }
  }

  function appendProjectHeadingToFile(args: {
    filePath: string;
    headingLevel: number;
    projectId: string;
    name: string;
    area?: string;
  }): void {
    const { filePath, headingLevel, projectId, name, area } = args;
    const hashes = '#'.repeat(clamp(headingLevel, 1, 6));
    const meta = area ? ` [project:${projectId} area:${area}]` : ` [project:${projectId}]`;
    const heading = `${hashes} ${name}${meta}`;

    const existing = fs.readFileSync(filePath, 'utf-8');
    const endsWithNewline = existing.endsWith('\n');
    const base = endsWithNewline ? existing : `${existing}\n`;
    const trimmedEnd = base.replace(/\s+$/, '');
    const sep = trimmedEnd.length === 0 ? '' : '\n\n';
    const next = `${trimmedEnd}${sep}${heading}\n\n`;
    fs.writeFileSync(filePath, next, 'utf-8');
  }

  async function addProjectFlow(): Promise<void> {
    const files = options.files;
    if (files.length === 0) {
      state.message = 'No input files configured';
      return;
    }

    let filePath: string;
    if (files.length <= 9) {
      const lines = files.map((f, idx) => `[${idx + 1}] ${f}`);
      const allowed = files.map((_, idx) => String(idx + 1));
      const chosen = await showKeyMenu(
        term,
        'Add project → choose file',
        [...lines, '', '[Enter] default (1)'],
        allowed,
        state.colorsDisabled,
        { enter: '1' }
      );
      if (!chosen) return;
      filePath = files[Number.parseInt(chosen, 10) - 1] ?? files[0]!;
    } else {
      const input = await promptText(
        term,
        'Add project → choose file',
        'File path:',
        files[0] ?? '',
        state.colorsDisabled
      );
      if (input === null) return;
      filePath = input.trim();
    }

    if (!filePath) return;
    if (!fs.existsSync(filePath)) {
      state.message = `File not found: ${filePath}`;
      return;
    }

    const suggestedLevel = defaultProjectHeadingLevelForFile(filePath);
    const levelChoice = await showKeyMenu(
      term,
      'Add project → heading level',
      ['[1] # (top-level)', '[2] ## (nested)', '', `[Enter] default (${suggestedLevel === 2 ? '##' : '#'})`],
      ['1', '2'],
      state.colorsDisabled,
      { enter: suggestedLevel === 2 ? '2' : '1' }
    );
    if (!levelChoice) return;
    const headingLevel = levelChoice === '2' ? 2 : 1;

    const nameInput = await promptText(term, 'Add project', 'Project name:', '', state.colorsDisabled);
    if (nameInput === null) return;
    const name = nameInput.trim();
    if (!name) {
      state.message = 'Project name is required';
      return;
    }

    const suggestedId = slugifyProjectId(name);
    const idInput = await promptText(
      term,
      'Add project',
      'Project id (slug):',
      suggestedId,
      state.colorsDisabled
    );
    if (idInput === null) return;
    const projectId = slugifyProjectId(idInput);
    if (!projectId || !/^[a-z0-9][a-z0-9-]*$/.test(projectId)) {
      state.message = `Invalid project id: ${idInput}`;
      return;
    }
    if (state.index.projects[projectId]) {
      state.message = `Project already exists: ${projectId}`;
      return;
    }

    const areaInput = await promptText(term, 'Add project', 'Area (optional):', '', state.colorsDisabled);
    if (areaInput === null) return;
    const area = areaInput.trim() || undefined;

    const res = await ensureFileFresh(term, state, filePath, refreshFromDisk);
    if (!res.ok) return;
    if (state.index.projects[projectId]) {
      state.message = `Project already exists: ${projectId}`;
      return;
    }

    appendProjectHeadingToFile({ filePath, headingLevel, projectId, name, area });
    refreshFromDisk();

    const projectsViewIdx = state.views.findIndex((v) => v.key === '5');
    if (projectsViewIdx !== -1) {
      state.viewIndex = projectsViewIdx;
    }
    state.projects.drilldownProjectId = projectId;
    state.search.active = false;
    state.search.input = '';
    state.query = getEffectiveQuery(state);
    state.selection = { row: 0, scroll: 0, selectedId: null };
    recompute(state);
    state.message = `Created project ${projectId}`;
  }

  function findNeighborTaskIdForDeletion(): string | null {
    const start = state.selection.row;
    const rows = state.renderRows;
    for (let i = start + 1; i < rows.length; i++) {
      const r = rows[i];
      if (r?.kind === 'task') return r.task.globalId;
    }
    for (let i = start - 1; i >= 0; i--) {
      const r = rows[i];
      if (r?.kind === 'task') return r.task.globalId;
    }
    return null;
  }

  async function deleteSelectedTask(): Promise<void> {
    const selected = getSelectedTask(state);
    if (!selected) return;

    const rootId = selected.globalId;
    const rootTask = state.index.tasks[rootId];
    if (!rootTask) return;

    // Count subtree tasks (root + descendants) for the confirmation prompt.
    const visited = new Set<string>();
    const queue: string[] = [rootId];
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id) continue;
      if (visited.has(id)) continue;
      visited.add(id);
      const t = state.index.tasks[id];
      if (!t) continue;
      for (const childId of t.childrenIds) queue.push(childId);
    }

    const ok = await confirmYesNo(
      term,
      'Delete task',
      [
        `Delete: ${selected.text}`,
        `ID: ${selected.globalId}`,
        `This will delete ${visited.size} task(s) (including any subtasks).`,
      ],
      state.colorsDisabled
    );
    if (!ok) return;

    const res = await ensureFileFresh(term, state, selected.filePath, refreshFromDisk);
    if (!res.ok) return;

    const task = state.index.tasks[rootId];
    if (!task) return;

    const neighborId = findNeighborTaskIdForDeletion();
    if (neighborId) state.selection.selectedId = neighborId;
    else state.selection.selectedId = null;

    const lineNumber = findTaskLineNumberById(task.filePath, task.projectId, task.localId, task.lineNumber);
    if (!lineNumber) {
      state.message = `Failed to locate task line for ${task.globalId} (try re-running index)`;
      return;
    }

    const del = deleteTaskSubtree(task.filePath, lineNumber, task.text);
    if (!del.success) {
      state.message = del.error ?? 'Failed to delete task';
      return;
    }

    refreshFromDisk();
    state.message = `Deleted ${del.deletedTaskCount ?? 1} task(s)`;
  }

  const keyHandler = async (name: string): Promise<void> => {
    if (name === 'CTRL_C') {
      const now = Date.now();
      if (ctrlCArmedAt !== null && now - ctrlCArmedAt <= 1000) {
        resolveExit?.();
        return;
      }

      ctrlCArmedAt = now;
      if (ctrlCResetTimer) clearTimeout(ctrlCResetTimer);
      ctrlCResetTimer = setTimeout(() => {
        ctrlCArmedAt = null;
        if (state.message === 'Press Ctrl+C again to quit') {
          state.message = null;
        }
      }, 1000);

      if (state.search.active) {
        state.search.active = false;
        state.search.input = '';
        recompute(state);
      }

      state.message = 'Press Ctrl+C again to quit';
      render(state, term);
      return;
    }

    // Allow quitting even if a flow is mid-flight (e.g. a stuck prompt).
    if (name === 'q') {
      resolveExit?.();
      return;
    }

    if (state.busy) return;
    state.message = null;

    if (ctrlCArmedAt !== null) {
      ctrlCArmedAt = null;
      if (ctrlCResetTimer) clearTimeout(ctrlCResetTimer);
      ctrlCResetTimer = null;
    }

    const view = state.views[state.viewIndex]!;
    const isProjectsList = view.kind === 'projects' && !state.projects.drilldownProjectId;
    const width: number = term.width ?? process.stdout.columns ?? 80;
    const height: number = term.height ?? process.stdout.rows ?? 24;
    const footerHeight = 8;
    const listTop = 5;
    const listHeight = Math.max(1, height - listTop - footerHeight);

    // Search mode
    if (state.search.active) {
      if (name === 'z') {
        state.statusMode = state.statusMode === 'open' ? 'all' : 'open';
        state.query = normalizeStatusInQuery(state.query, state.statusMode);
        state.search.input = normalizeStatusInQuery(state.search.input, state.statusMode);
        recompute(state);
        render(state, term);
        return;
      }
      if (name === 'ENTER') {
        state.query = normalizeStatusInQuery(state.search.input.trim(), state.statusMode);
        state.search.active = false;
        state.search.input = '';
        recompute(state);
        render(state, term);
        return;
      }
      if (name === 'ESCAPE') {
        state.search.active = false;
        state.search.input = '';
        recompute(state);
        render(state, term);
        return;
      }
      if (name === 'CTRL_SLASH' || name === '!') {
        if (state.search.scope === 'view') {
          // switch to global: strip base query if present
          const base = getEffectiveQuery(state);
          const current = state.search.input.trim();
          const stripped = current.startsWith(base) ? current.slice(base.length).trim() : current;
          state.search.scope = 'global';
          state.search.input = stripped;
        } else {
          const base = getEffectiveQuery(state);
          state.search.scope = 'view';
          state.search.input = `${base}${state.search.input ? ` ${state.search.input}` : ''}`.trim();
        }
        recompute(state);
        render(state, term);
        return;
      }
      if (name === 'BACKSPACE') {
        state.search.input = state.search.input.slice(0, -1);
        recompute(state);
        render(state, term);
        return;
      }
      if (isSpaceKeyName(name)) {
        state.search.input += ' ';
        recompute(state);
        render(state, term);
        return;
      }
      if (name.length === 1) {
        state.search.input += name;
        recompute(state);
        render(state, term);
        return;
      }
      return;
    }

    // Global quit
    if (name === 'q') {
      resolveExit?.();
      return;
    }

    // Enter search
    if (name === '/') {
      state.search.active = true;
      state.search.scope = 'view';
      state.search.input = ensureTrailingSpace(state.query);
      render(state, term);
      return;
    }

    // Shorthand help
    if (name === '?') {
      state.busy = true;
      render(state, term);
      try {
        await showKeyMenu(
          term,
          'Shorthand help',
          getShorthandHelpLines(),
          [],
          state.colorsDisabled,
          { enter: '' }
        );
      } finally {
        state.busy = false;
        recompute(state);
        render(state, term);
      }
      return;
    }

    // View navigation
    if (name === 'LEFT' || name === 'h') {
      setNextView(-1);
      render(state, term);
      return;
    }
    if (name === 'RIGHT' || name === 'l') {
      setNextView(1);
      render(state, term);
      return;
    }

    // Jump to view 0-9
    if (name.length === 1 && name >= '0' && name <= '9') {
      setViewByKey(name);
      render(state, term);
      return;
    }

    // Toggle show/hide done
    if (name === 'z') {
      state.statusMode = state.statusMode === 'open' ? 'all' : 'open';
      state.query = normalizeStatusInQuery(state.query, state.statusMode);
      recompute(state);
      render(state, term);
      return;
    }

    // Projects list: enter drilldown
    if (isProjectsList && name === 'ENTER') {
      const p = getSelectedProject(state);
      if (p) {
        state.projects.drilldownProjectId = p.id;
        state.query = getEffectiveQuery(state);
        state.selection = { row: 0, scroll: 0, selectedId: null };
        recompute(state);
        render(state, term);
      }
      return;
    }

    // Projects list: add project
    if (isProjectsList && name === 'a') {
      state.busy = true;
      render(state, term);
      try {
        await addProjectFlow();
      } finally {
        state.busy = false;
        recompute(state);
        render(state, term);
      }
      return;
    }

    // Exit project drilldown
    if (view.kind === 'projects' && state.projects.drilldownProjectId && (name === 'ESCAPE' || name === 'BACKSPACE')) {
      state.projects.drilldownProjectId = null;
      state.query = getEffectiveQuery(state);
      state.selection = { row: 0, scroll: 0, selectedId: null };
      recompute(state);
      render(state, term);
      return;
    }

    const listSize = isProjectsList ? state.filteredProjects.length : state.renderRows.length;

    // Movement
    if (name === 'DOWN' || name === 'j') {
      if (isProjectsList) {
        state.selection.row = clamp(state.selection.row + 1, 0, Math.max(0, listSize - 1));
        updateScrollForSelection(listSize, listHeight);
        state.selection.selectedId = state.filteredProjects[state.selection.row]?.id ?? null;
      } else {
        const next = findTaskRowFrom(state.selection.row + 1, 1) ?? lastTaskRow();
        selectTaskRow(next);
        updateScrollForSelection(listSize, listHeight);
      }
      render(state, term);
      return;
    }
    if (name === 'UP' || name === 'k') {
      if (isProjectsList) {
        state.selection.row = clamp(state.selection.row - 1, 0, Math.max(0, listSize - 1));
        updateScrollForSelection(listSize, listHeight);
        state.selection.selectedId = state.filteredProjects[state.selection.row]?.id ?? null;
      } else {
        const prev = findTaskRowFrom(state.selection.row - 1, -1) ?? firstTaskRow();
        selectTaskRow(prev);
        updateScrollForSelection(listSize, listHeight);
      }
      render(state, term);
      return;
    }
    if (name === 'g') {
      if (isProjectsList) {
        state.selection.row = 0;
        updateScrollForSelection(listSize, listHeight);
        state.selection.selectedId = state.filteredProjects[state.selection.row]?.id ?? null;
      } else {
        selectTaskRow(firstTaskRow());
        updateScrollForSelection(listSize, listHeight);
      }
      render(state, term);
      return;
    }
    if (name === 'G') {
      if (isProjectsList) {
        state.selection.row = Math.max(0, listSize - 1);
        updateScrollForSelection(listSize, listHeight);
        state.selection.selectedId = state.filteredProjects[state.selection.row]?.id ?? null;
      } else {
        selectTaskRow(lastTaskRow());
        updateScrollForSelection(listSize, listHeight);
      }
      render(state, term);
      return;
    }
    if (name === 'CTRL_U' || name === 'PAGE_UP') {
      if (isProjectsList) {
        state.selection.row = clamp(state.selection.row - Math.floor(listHeight / 2), 0, Math.max(0, listSize - 1));
        updateScrollForSelection(listSize, listHeight);
        state.selection.selectedId = state.filteredProjects[state.selection.row]?.id ?? null;
      } else {
        const target = clamp(state.selection.row - Math.floor(listHeight / 2), 0, Math.max(0, listSize - 1));
        const up = findTaskRowFrom(target, -1) ?? firstTaskRow();
        selectTaskRow(up);
        updateScrollForSelection(listSize, listHeight);
      }
      render(state, term);
      return;
    }
    if (name === 'CTRL_D' || name === 'PAGE_DOWN') {
      if (isProjectsList) {
        state.selection.row = clamp(state.selection.row + Math.floor(listHeight / 2), 0, Math.max(0, listSize - 1));
        updateScrollForSelection(listSize, listHeight);
        state.selection.selectedId = state.filteredProjects[state.selection.row]?.id ?? null;
      } else {
        const target = clamp(state.selection.row + Math.floor(listHeight / 2), 0, Math.max(0, listSize - 1));
        const down = findTaskRowFrom(target, 1) ?? lastTaskRow();
        selectTaskRow(down);
        updateScrollForSelection(listSize, listHeight);
      }
      render(state, term);
      return;
    }

    // Task actions (tasks mode only)
    if (!isProjectsList) {
      if (isSpaceKeyName(name) || name === 'x') {
        state.busy = true;
        render(state, term);
        try {
          await toggleDone();
        } finally {
          state.busy = false;
          recompute(state);
          render(state, term);
        }
        return;
      }
      if (name === 'r') {
        state.busy = true;
        render(state, term);
        try {
          await deleteSelectedTask();
        } finally {
          state.busy = false;
          recompute(state);
          render(state, term);
        }
        return;
      }
      if (name === 'p') {
        state.busy = true;
        render(state, term);
        try {
          await setPriority();
        } finally {
          state.busy = false;
          recompute(state);
          render(state, term);
        }
        return;
      }
      if (name === 'b') {
        state.busy = true;
        render(state, term);
        try {
          await setBucket();
        } finally {
          state.busy = false;
          recompute(state);
          render(state, term);
        }
        return;
      }
      if (name === 'n') {
        state.busy = true;
        render(state, term);
        try {
          await setPlanOrDue('plan');
        } finally {
          state.busy = false;
          recompute(state);
          render(state, term);
        }
        return;
      }
      if (name === 'd') {
        state.busy = true;
        render(state, term);
        try {
          await setPlanOrDue('due');
        } finally {
          state.busy = false;
          recompute(state);
          render(state, term);
        }
        return;
      }
      if (name === 'e') {
        state.busy = true;
        render(state, term);
        try {
          await editTaskInline();
        } finally {
          state.busy = false;
          recompute(state);
          render(state, term);
        }
        return;
      }
      if (name === 'a') {
        state.busy = true;
        render(state, term);
        try {
          await addTaskFlow();
        } finally {
          state.busy = false;
          recompute(state);
          render(state, term);
        }
        return;
      }
    }

    // Ignore
    void width;
  };

  const onKey = (name: string): void => {
    void keyHandler(name).catch((error: unknown) => {
      state.busy = false;
      state.search.active = false;
      state.search.input = '';
      ctrlCArmedAt = null;
      if (ctrlCResetTimer) clearTimeout(ctrlCResetTimer);
      ctrlCResetTimer = null;

      const msg = error instanceof Error ? error.message : String(error);
      state.message = `Error: ${msg}`;
      recompute(state);
      render(state, term);
    });
  };

  const onResize = (): void => {
    recompute(state);
    render(state, term);
  };

  term.fullscreen(true);
  term.grabInput({ mouse: false });
  process.stdout.on('resize', onResize);
  term.on('key', onKey);

  try {
    render(state, term);
    await exitPromise;
  } finally {
    if (ctrlCResetTimer) clearTimeout(ctrlCResetTimer);
    ctrlCResetTimer = null;
    ctrlCArmedAt = null;

    term.removeListener('key', onKey);
    process.stdout.removeListener('resize', onResize);
    term.grabInput(false);
    term.fullscreen(false);
    setCursorVisible(term, true);
    term.styleReset();
    term.clear();
  }

  // Rebuild index from disk on exit and return it (used for final todos.json).
  const { index } = buildIndex(options.files);
  return index;
}
