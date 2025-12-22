import fs from 'node:fs';
import path from 'node:path';
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
  sortTasksByFieldsWithOverrides,
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
import { getFooterHeight } from './layout.js';
import { renderLabeledInputField } from './input-render.js';
import {
  formatBucketSymbolShorthand,
  formatBucketTagShorthand,
  formatPriorityShorthand,
  getTaskShorthandTokens,
} from './task-shorthands.js';
import { confirmYesNo, promptAddTaskModal, promptEditTaskModal, promptText, showKeyMenu } from './prompts.js';
import { setCursorVisible } from './term-cursor.js';
import { decideAddTargetProjectId } from './add-target.js';
import { getShorthandHelpLines } from './shorthand-help.js';
import { readCurrentMetadataBlockString } from './edit-flow.js';
import {
  getAutocompleteContext,
  generateSuggestions,
  applySuggestion,
  type AutocompleteState,
} from './autocomplete.js';
import { renderAutocompleteSuggestionsBox } from './autocomplete-render.js';
import { applyTextInputKey, createTextInput, toCodeUnitCursor, toCodepointCursor, type TextInputState } from './text-input.js';

type Term = any;

type PriorityOrderMode = 'high' | 'low' | 'none';

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
  priorityOrder: PriorityOrderMode;
  query: string;
  command: {
    active: boolean;
    kind: 'gotoLine' | null;
    input: TextInputState;
  };
  search: {
    active: boolean;
    scope: 'view' | 'global';
    input: TextInputState;
    autocomplete: AutocompleteState;
  };
  selection: { row: number; scroll: number; selectedId: string | null };
  projects: { drilldownProjectId: string | null };
  projectsList: { active: boolean; input: TextInputState; staged: TextInputState };
  collapsedProjects: Set<string>;
  collapsedTasks: Set<string>;
  collapsedAreas: Set<string>;
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
  | { kind: 'area'; area: string; label: string; count: number }
  | { kind: 'header'; projectId: string; label: string; count: number; indent: number }
  | { kind: 'task'; task: Task; indent: number };

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

function describePriorityOrderMode(mode: PriorityOrderMode): string {
  switch (mode) {
    case 'high':
      return 'pri:high-first';
    case 'low':
      return 'pri:low-first';
    case 'none':
      return 'pri:off';
    default:
      return 'pri:high-first';
  }
}

function cyclePriorityOrderMode(mode: PriorityOrderMode): PriorityOrderMode {
  if (mode === 'high') return 'low';
  if (mode === 'low') return 'none';
  return 'high';
}

function applyPriorityOrder(
  fields: SortField[],
  mode: PriorityOrderMode
): { fields: SortField[]; priorityOrderOverride: 'low-first' | null } {
  const seen = new Set<SortField>();
  const withoutDupes = fields.filter((f) => {
    if (seen.has(f)) return false;
    seen.add(f);
    return true;
  });

  if (mode === 'none') {
    return { fields: withoutDupes.filter((f) => f !== 'priority'), priorityOrderOverride: null };
  }

  if (withoutDupes.includes('priority')) {
    return { fields: withoutDupes, priorityOrderOverride: mode === 'low' ? 'low-first' : null };
  }

  const insertAt = withoutDupes[0] === 'project' ? 1 : 0;
  const next: SortField[] = [...withoutDupes.slice(0, insertAt), 'priority', ...withoutDupes.slice(insertAt)];
  return { fields: next, priorityOrderOverride: mode === 'low' ? 'low-first' : null };
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
    case '5':
      return ['priority', 'plan', 'due'];
    default:
      return ['priority', 'plan', 'due'];
  }
}

function buildViews(config: Config): InteractiveView[] {
  const builtins: InteractiveView[] = [
    { key: '0', name: 'All', query: 'status:open', sort: 'project,priority,plan,due', kind: 'tasks' },
    { key: '1', name: 'Now', query: 'status:open bucket:now', sort: 'priority,plan,due', kind: 'tasks' },
    { key: '2', name: 'Today', query: 'status:open bucket:today', sort: 'priority,plan,due', kind: 'tasks' },
    { key: '3', name: 'Upcoming', query: 'status:open bucket:upcoming', sort: 'priority,plan,due', kind: 'tasks' },
    { key: '4', name: 'Anytime', query: 'status:open bucket:anytime', sort: 'priority,plan,due', kind: 'tasks' },
    { key: '5', name: 'Someday', query: 'status:open bucket:someday', sort: 'priority,plan,due', kind: 'tasks' },
    { key: '6', name: 'Projects', query: '', kind: 'projects' },
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

function joinHelpChunks(chunks: string[], width: number): string {
  if (width <= 0) return '';
  const sep = '  ';
  let out = '';
  let used = 0;

  for (const chunk of chunks) {
    const next = out ? `${out}${sep}${chunk}` : chunk;
    if (terminalKit.stringWidth(next) <= width) {
      out = next;
      used++;
      continue;
    }
    break;
  }

  if (!out) {
    const first = chunks[0] ?? '';
    return truncateByWidth(first, width);
  }

  if (used < chunks.length) {
    const dots = `${sep}…`;
    if (terminalKit.stringWidth(out + dots) <= width) out += dots;
    else if (terminalKit.stringWidth(out + '…') <= width) out += '…';
  }

  return truncateByWidth(out, width);
}

function getFooterHelpLines(
  state: SessionState,
  view: InteractiveView,
  isProjectsList: boolean,
  width: number
): { line1: string; line2: string } {
  if (isProjectsList) {
    const globalFull = ['[↑/↓] move', '[0–9] views', '[/] filter', '[?] help', '[q] quit'];
    const globalCompact = ['[/] filter', '[q] quit'];
    const line1 = width < 60 ? joinHelpChunks(globalCompact, width) : joinHelpChunks(globalFull, width);

    const full = state.projectsList.active
      ? ['type = filter', '[Enter] done', '[Esc] cancel']
      : ['[/] filter', '[Enter] open project', '[Ctrl+N] add project'];
    const compact = state.projectsList.active ? ['type = filter', '[Enter] done'] : ['[/] filter', '[Enter] open', '[Ctrl+N] add'];
    return { line1, line2: joinHelpChunks(width < 60 ? compact : full, width) };
  }

  const globalFull = [
    '[j/k/↑/↓] move',
    '[g/G] top/bot',
    '[h/l/←/→] views',
    '[/] search',
    '[z] show/hide done',
    '[o] pri order',
    '[F] fold all',
    '[?] help',
    '[q] quit',
  ];
  const globalCompact = ['[?] help', '[/] search', '[q] quit'];

  const line1 = width < 60 ? joinHelpChunks(globalCompact, width) : joinHelpChunks(globalFull, width);

  if (view.kind === 'projects' && state.projects.drilldownProjectId) {
    const full = [
      '[Esc/Backspace] back',
      '[f] fold',
      '[F] fold all',
      '[:] goto line',
      '[space/x] done',
      '[p] pri',
      '[b] bucket',
      '[n] now',
      '[t] plan',
      '[d] due',
      '[e] edit',
      '[a] add task',
      '[r] remove',
      '[?] help',
    ];
    const compact = ['[Esc] back', '[space] done', '[e] edit', '[a] add', '[?] help'];
    return { line1, line2: joinHelpChunks(width < 80 ? compact : full, width) };
  }

  const tasksFull = [
    '[f] fold',
    '[F] fold all',
    '[:] goto line',
    '[space/x] done',
    '[p] priority',
    '[b] bucket',
    '[n] now',
    '[t] plan',
    '[d] due',
    '[e] edit',
    '[a] add',
    '[r] remove',
    '[?] help',
  ];
  const tasksCompact = ['[space] done', '[e] edit', '[a] add', '[?] help'];
  return { line1, line2: joinHelpChunks(width < 80 ? tasksCompact : tasksFull, width) };
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
    bucketNow: (s: string) => (state.colorsDisabled ? term(s) : term.bold.green(s)),
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

  const queryRaw = state.search.active ? state.search.input.value : state.query;
  const query = normalizeStatusInQuery(queryRaw, state.statusMode);
  const flags = state.statusMode === 'open' ? 'hide-done' : 'show-done';
  const queryLine = `View: ${modeTitle} (${view.key}) | Query: ${query} | Flags: ${flags}, ${describePriorityOrderMode(state.priorityOrder)}`;
  term.moveTo(1, 3);
  if (state.colorsDisabled) {
    style.dim(truncate(queryLine, width));
  } else {
    writeSegments(
      [
        { text: `View: ${modeTitle} (${view.key}) | Query: `, style: 'dim' },
        { text: query, style: 'queryAccent' },
        { text: ` | Flags: ${flags}, ${describePriorityOrderMode(state.priorityOrder)}`, style: 'dim' },
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

  const footerHeight = getFooterHeight({ searchActive: state.search.active });

  // Footer uses (base):
  // - 1 separator line
  // - 3 details lines
  // - 1 separator line
  // - 2 help lines
  // - 1 status/message line
  const listTop = 5;
  const listHeight = Math.max(1, height - listTop - footerHeight);

  if (isProjectsList) {
    const projects = state.filteredProjects;
    const numberWidth = Math.max(2, String(Math.max(1, projects.length)).length);
    const numberSep = '│ ';
    const numberColWidth = numberWidth + terminalKit.stringWidth(numberSep);
    const start = state.selection.scroll;
    const end = Math.min(projects.length, start + listHeight);
    const idColMax = 18;
    const idColMin = 8;
    const visible = projects.slice(start, end);
    const maxIdWidth = visible.reduce((max, p) => Math.max(max, terminalKit.stringWidth(p.id)), 0);
    const idColWidth = Math.max(idColMin, Math.min(idColMax, maxIdWidth));
    const sep = ' — ';
    for (let i = start; i < end; i++) {
      const row = i - start;
      const p = projects[i]!;
      const idShown = p.id.padEnd(idColWidth);
      const line = `${idShown}${sep}${p.name}${p.area ? ` (${p.area})` : ''}`;
      const y = listTop + row;
      term.moveTo(1, y);
      const selected = i === state.selection.row;

      if (!state.colorsDisabled) {
        term.styleReset();
        if (selected) term.inverse();
      }

      const n = String(i + 1).padStart(numberWidth);
      if (state.colorsDisabled) term(`${n}${numberSep}`);
      else term.dim(`${n}${numberSep}`);

      const contentWidth = Math.max(0, width - numberColWidth);
      const shown = truncateByWidth(line, contentWidth);
      term(shown);
      const pad = Math.max(0, contentWidth - terminalKit.stringWidth(shown));
      if (pad > 0) term(' '.repeat(pad));

      if (!state.colorsDisabled) term.styleReset();
    }
  } else {
    const rows = state.renderRows;
    const numberWidth = Math.max(2, String(Math.max(1, rows.length)).length);
    const numberSep = '│ ';
    const numberColWidth = numberWidth + terminalKit.stringWidth(numberSep);
    const start = state.selection.scroll;
    const end = Math.min(rows.length, start + listHeight);
    for (let i = start; i < end; i++) {
      const row = i - start;
      const y = listTop + row;
      term.moveTo(1, y);
      const selected = i === state.selection.row;

      const r = rows[i]!;
      if (!state.colorsDisabled) {
        term.styleReset();
        if (selected) {
          term.inverse();
        } else if (r.kind === 'task' && r.task.bucket === 'now') {
          // Subtle background to make "now" tasks stand out.
          term.bgColorRgb(0, 70, 30);
        }
      }

      const n = String(i + 1).padStart(numberWidth);
      if (state.colorsDisabled) term(`${n}${numberSep}`);
      else term.dim(`${n}${numberSep}`);

      const contentWidth = Math.max(0, width - numberColWidth);
      if (r.kind === 'area') {
        const icon = state.collapsedAreas.has(r.area) ? '▸' : '▾';
        const labelMax = Math.max(0, contentWidth);
        const label = truncateByWidth(`${icon} ${r.label}`, labelMax);
        const pad = Math.max(0, contentWidth - terminalKit.stringWidth(label));
        if (state.colorsDisabled) {
          term(label);
          if (pad > 0) term(' '.repeat(pad));
        } else {
          term.styleReset();
          if (selected) term.inverse();
          term.bold.magenta(label);
          if (pad > 0) term(' '.repeat(pad));
        }
      } else if (r.kind === 'header') {
        const icon = state.collapsedProjects.has(r.projectId) ? '▸' : '▾';
        const indentPrefix = '  '.repeat(r.indent);
        const labelMax = Math.max(0, contentWidth);
        const label = truncateByWidth(`${indentPrefix}${icon} ${r.label}`, labelMax);
        const pad = Math.max(0, contentWidth - terminalKit.stringWidth(label));
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
        const structuralIndent = '  '.repeat(r.indent);
        const depth = Math.max(0, Math.floor((t.indentLevel ?? 0) / 2));
        const subtreeIndent = depth > 0 ? `${'  '.repeat(depth - 1)}  └─ ` : '';
        const indentPrefix = `${structuralIndent}${subtreeIndent}`;
        const hasChildren = (t.childrenIds?.length ?? 0) > 0;
        const foldIcon = hasChildren ? (state.collapsedTasks.has(t.globalId) ? '▸' : '▾') : ' ';
        const checkbox = t.completed ? '[x]' : '[ ]';
        const shorthandTokens = getTaskShorthandTokens(t.priority, t.bucket);

        const rightTokens: { text: string; style: keyof typeof style }[] = [];
        rightTokens.push({ text: t.globalId, style: 'dim' });
        if (t.plan) rightTokens.push({ text: `plan:${t.plan}`, style: 'cyan' });
        if (t.due) rightTokens.push({ text: `due:${t.due}`, style: 'cyan' });
        if (t.est) rightTokens.push({ text: t.est, style: 'dim' });

        const rightPlain = rightTokens.map((x) => x.text).join('  ');
        const rightWidth = terminalKit.stringWidth(rightPlain);
        const rightMax = Math.max(0, Math.min(contentWidth, Math.floor(contentWidth * 0.45)));
        const rightShown = rightWidth > rightMax ? truncateByWidth(rightPlain, rightMax) : rightPlain;

        const rightShownWidth = terminalKit.stringWidth(rightShown);
        const leftMax = Math.max(10, contentWidth - rightShownWidth - 2);

        const shorthandPlain = shorthandTokens.map((tok) => tok.text).join(' ');
        const leftPrefixPlain = shorthandPlain
          ? `${indentPrefix}${foldIcon} ${checkbox} ${shorthandPlain}  `
          : `${indentPrefix}${foldIcon} ${checkbox}  `;
        const leftPrefixWidth = terminalKit.stringWidth(leftPrefixPlain);
        const textMax = Math.max(0, leftMax - leftPrefixWidth);
        const shownText = truncateByWidth(t.text, textMax);

        const priStyle: keyof typeof style =
          t.priority === 'high' ? 'red' : t.priority === 'low' ? 'dim' : 'text';
        const bucketStyle: keyof typeof style =
          t.bucket === 'now'
            ? 'bucketNow'
            : t.bucket === 'today'
              ? 'bucketToday'
              : t.bucket === 'upcoming'
                ? 'blue'
                : t.bucket === 'someday'
                  ? 'dim'
                  : 'text';
        const textStyle: keyof typeof style = t.completed ? 'dim' : 'text';
        const checkboxStyle: keyof typeof style = t.completed ? 'dim' : 'text';

        const segments: { text: string; style: keyof typeof style }[] = [
          { text: indentPrefix, style: 'dim' },
          { text: foldIcon, style: hasChildren ? 'cyan' : 'dim' },
          { text: ' ', style: 'text' },
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
        const rightBudget = contentWidth - leftMax - 2;
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
        style: selectedTask.bucket === 'now' ? 'bucketNow' : selectedTask.bucket === 'today' ? 'bucketToday' : 'text',
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
        `area: ${selectedProject.area ?? '-'}`,
        width
      )
    );
    term.moveTo(1, footerTop + 3);
    style.dim(truncate('', width));
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

  // Help footer (shown when not in autocomplete mode)
  if (!state.search.active || !state.search.autocomplete.active) {
    term.moveTo(1, footerTop + 5);
    const help = getFooterHelpLines(state, view, isProjectsList, width);
    style.dim(help.line1);
    term.moveTo(1, footerTop + 6);
    style.dim(help.line2);
  } else {
    // Clear help lines when showing autocomplete
    term.moveTo(1, footerTop + 5);
    term.eraseLineAfter();
    term.moveTo(1, footerTop + 6);
    term.eraseLineAfter();
  }

  // Search prompt/message line
  term.moveTo(1, footerTop + 7);
  if (state.message) {
    style.red(truncateByWidth(state.message, width));
  } else if (state.search.active) {
    const scopeLabel = state.search.scope === 'view' ? 'view' : 'global';
    const label = `Search (${scopeLabel}) `;
    term.eraseLineAfter();
    const { cursorCol } = renderLabeledInputField(term, {
      label,
      value: state.search.input.value,
      cursorIndex: state.search.input.cursor,
      width,
      colorsDisabled: state.colorsDisabled,
      placeholder: 'type filters (e.g. bucket:today) …',
    });
    term.eraseLineAfter();

    // Also show the real terminal cursor (some terminals/themes make painted cursors hard to see).
    term.moveTo(cursorCol, footerTop + 7);
    setCursorVisible(term, true);
  } else if (state.command.active) {
    term.eraseLineAfter();
    const { cursorCol } = renderLabeledInputField(term, {
      label: ': ',
      value: state.command.input.value,
      cursorIndex: state.command.input.cursor,
      width,
      colorsDisabled: state.colorsDisabled,
      placeholder: 'line number',
    });
    term.eraseLineAfter();
    term.moveTo(cursorCol, footerTop + 7);
    setCursorVisible(term, true);
  } else if (isProjectsList) {
    term.eraseLineAfter();
    if (state.projectsList.active) {
      const { cursorCol } = renderLabeledInputField(term, {
        label: 'Projects ',
        value: state.projectsList.input.value,
        cursorIndex: state.projectsList.input.cursor,
        width,
        colorsDisabled: state.colorsDisabled,
        placeholder: 'type to filter…',
      });
      term.eraseLineAfter();
      term.moveTo(cursorCol, footerTop + 7);
      setCursorVisible(term, true);
    } else {
      style.dim(truncateByWidth('Projects: press / to filter', width));
      term.hideCursor();
    }
  } else {
    style.dim(truncateByWidth(state.busy ? 'Working…' : '', width));
  }

  // Render autocomplete suggestions BELOW the search prompt
  if (state.search.active && state.search.autocomplete.active) {
    // Start rendering suggestions right below the search prompt
    // This will occupy footerTop + 8 onwards (up to 6 more lines: border + 4 suggestions + hint)
    renderAutocompleteSuggestionsBox(term, {
      suggestions: state.search.autocomplete.suggestions,
      selectedIndex: state.search.autocomplete.selectedIndex,
      startRow: footerTop + 8,
      width,
      colorsDisabled: state.colorsDisabled,
    });
  }

  if (!state.search.active && !state.command.active && !(isProjectsList && state.projectsList.active)) {
    term.hideCursor();
  }
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
    const all = Object.values(state.index.projects).sort((a, b) => a.id.localeCompare(b.id));
    const q = state.projectsList.input.value.trim().toLowerCase();
    const projects = all
      .map((p) => {
        const hay = `${p.id} ${p.name} ${p.area ?? ''}`.toLowerCase();
        const ok = q === '' ? true : hay.includes(q);
        const score = q && p.id.toLowerCase().startsWith(q) ? 2 : q && hay.includes(q) ? 1 : 0;
        return { p, ok, score };
      })
      .filter((x) => x.ok)
      .sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id))
      .map((x) => x.p);

    const prevSelectedId = state.selection.selectedId;
    state.filteredProjects = projects;
    state.filteredTasks = [];

    const idx = prevSelectedId ? projects.findIndex((p) => p.id === prevSelectedId) : -1;
    if (idx >= 0) state.selection.row = idx;
    const maxRow = Math.max(0, projects.length - 1);
    state.selection.row = clamp(state.selection.row, 0, maxRow);
    state.selection.scroll = clamp(state.selection.scroll, 0, Math.max(0, projects.length - 1));
    state.selection.selectedId = projects[state.selection.row]?.id ?? null;
    return;
  }

  const inProjectDrilldown = view.kind === 'projects' && Boolean(state.projects.drilldownProjectId);

  const queryString = state.search.active ? state.search.input.value : state.query;
  const normalized = normalizeStatusInQuery(queryString, state.statusMode);
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
  const baseFields =
    sortFields.length > 0 ? sortFields : inProjectDrilldown ? drilldownDefaultSort : defaultSortForView(view);
  const { fields, priorityOrderOverride } = applyPriorityOrder(baseFields, state.priorityOrder);
  if (fields.length > 0) {
    tasks =
      priorityOrderOverride === 'low-first'
        ? sortTasksByFieldsWithOverrides(tasks, fields, { priorityOrder: 'low-first' })
        : sortTasksByFields(tasks, fields);
  }

  state.filteredTasks = tasks;
  state.filteredProjects = [];
  const prevSelectedId = state.selection.selectedId;
  const prevRow = state.renderRows[state.selection.row];
  const prevHeaderProjectId = prevRow?.kind === 'header' ? prevRow.projectId : null;
  const prevArea = prevRow?.kind === 'area' ? prevRow.area : null;
  const prevTaskProjectId = prevSelectedId ? state.index.tasks[prevSelectedId]?.projectId ?? null : null;
  state.renderRows = [];

  const areaRowIndexByArea = new Map<string, number>();
  const headerRowIndexByProjectId = new Map<string, number>();
  const taskRowIndexById = new Map<string, number>();

  if (state.groupBy === 'project') {
    const grouped = groupTasks(tasks, 'project');

    const isHiddenByCollapsedAncestor = (task: Task): boolean => {
      let current = task.parentId;
      const seen = new Set<string>();
      while (current) {
        if (seen.has(current)) return false;
        seen.add(current);
        if (state.collapsedTasks.has(current)) return true;
        const parent = state.index.tasks[current];
        current = parent?.parentId ?? null;
      }
      return false;
    };

    const explicitProjectId =
      (inProjectDrilldown ? state.projects.drilldownProjectId : null) ?? options.project ?? null;

    const projectIdsToRender: string[] =
      explicitProjectId ? [explicitProjectId] : [...grouped.keys()].sort((a, b) => a.localeCompare(b));

    const projectsByArea = new Map<string | null, string[]>();
    const areaTaskCounts = new Map<string, number>();

    for (const projectId of projectIdsToRender) {
      const group = grouped.get(projectId) ?? [];
      const project = state.index.projects[projectId];

      // No "empty" area headers: if a project has 0 matching tasks, don't attach it to an area header.
      let areaKey: string | null = null;
      if (group.length > 0) {
        const candidate = project?.parentArea ?? project?.area;
        if (candidate && state.index.areas?.[candidate]) {
          areaKey = candidate;
          areaTaskCounts.set(candidate, (areaTaskCounts.get(candidate) ?? 0) + group.length);
        }
      }

      const arr = projectsByArea.get(areaKey) ?? [];
      arr.push(projectId);
      projectsByArea.set(areaKey, arr);
    }

    const areaKeys = [...projectsByArea.keys()]
      .filter((k): k is string => typeof k === 'string' && Boolean(k))
      .sort((a, b) => {
        const an = state.index.areas?.[a]?.name ?? a;
        const bn = state.index.areas?.[b]?.name ?? b;
        return an.localeCompare(bn) || a.localeCompare(b);
      });

    for (const area of areaKeys) {
      const count = areaTaskCounts.get(area) ?? 0;
      if (count <= 0) continue;

      const areaHeading = state.index.areas?.[area];
      const areaName = areaHeading?.name ?? area;
      const label = `${areaName} [area:${area}] (${count} task${count === 1 ? '' : 's'})`;
      const areaIdx = state.renderRows.length;
      state.renderRows.push({ kind: 'area', area, label, count });
      areaRowIndexByArea.set(area, areaIdx);

      if (state.collapsedAreas.has(area)) continue;

      const projectIds = (projectsByArea.get(area) ?? []).sort((a, b) => a.localeCompare(b));
      for (const projectId of projectIds) {
        const group = grouped.get(projectId) ?? [];
        const project = state.index.projects[projectId];
        const projectName = project?.name ?? '(unknown project)';
        const pCount = group.length;
        const headerLabel = `${projectId} — ${projectName} (${pCount} task${pCount === 1 ? '' : 's'})`;
        const headerIdx = state.renderRows.length;
        state.renderRows.push({ kind: 'header', projectId, label: headerLabel, count: pCount, indent: 1 });
        headerRowIndexByProjectId.set(projectId, headerIdx);

        if (state.collapsedProjects.has(projectId)) continue;
        for (const task of group) {
          if (isHiddenByCollapsedAncestor(task)) continue;
          const idx = state.renderRows.length;
          state.renderRows.push({ kind: 'task', task, indent: 2 });
          taskRowIndexById.set(task.globalId, idx);
        }
      }
    }

    // Ungrouped projects (no area heading)
    const ungrouped = (projectsByArea.get(null) ?? []).sort((a, b) => a.localeCompare(b));
    for (const projectId of ungrouped) {
      const group = grouped.get(projectId) ?? [];
      const project = state.index.projects[projectId];
      const projectName = project?.name ?? '(unknown project)';
      const pCount = group.length;

      // In explicit project mode, show the project header even if empty.
      if (!explicitProjectId && pCount <= 0) continue;

      const headerLabel = `${projectId} — ${projectName} (${pCount} task${pCount === 1 ? '' : 's'})`;
      const headerIdx = state.renderRows.length;
      state.renderRows.push({ kind: 'header', projectId, label: headerLabel, count: pCount, indent: 0 });
      headerRowIndexByProjectId.set(projectId, headerIdx);

      if (state.collapsedProjects.has(projectId)) continue;
      for (const task of group) {
        if (isHiddenByCollapsedAncestor(task)) continue;
        const idx = state.renderRows.length;
        state.renderRows.push({ kind: 'task', task, indent: 0 });
        taskRowIndexById.set(task.globalId, idx);
      }
    }
  } else {
    for (const task of tasks) {
      const idx = state.renderRows.length;
      state.renderRows.push({ kind: 'task', task, indent: 0 });
      taskRowIndexById.set(task.globalId, idx);
    }
  }

  if (prevSelectedId && taskRowIndexById.has(prevSelectedId)) {
    state.selection.row = taskRowIndexById.get(prevSelectedId)!;
    state.selection.selectedId = prevSelectedId;
  } else {
    const headerFallback = prevHeaderProjectId ?? prevTaskProjectId;
    if (headerFallback && headerRowIndexByProjectId.has(headerFallback)) {
      state.selection.row = headerRowIndexByProjectId.get(headerFallback)!;
      state.selection.selectedId = null;
    } else if (prevArea && areaRowIndexByArea.has(prevArea)) {
      state.selection.row = areaRowIndexByArea.get(prevArea)!;
      state.selection.selectedId = null;
    } else {
      const firstTaskRow = state.renderRows.findIndex((r) => r.kind === 'task');
      if (firstTaskRow >= 0) {
        state.selection.row = firstTaskRow;
        const row = state.renderRows[firstTaskRow] as Extract<RenderRow, { kind: 'task' }>;
        state.selection.selectedId = row.task.globalId;
      } else {
        state.selection.row = 0;
        state.selection.selectedId = null;
      }
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

/**
 * Update autocomplete state based on current search input
 */
function updateAutocomplete(state: SessionState): void {
  const input = state.search.input.value;
  const cursorPos = toCodeUnitCursor(state.search.input.value, state.search.input.cursor);
  const allTasks = Object.values(state.index.tasks);

  const context = getAutocompleteContext(input, cursorPos);
  const suggestions = generateSuggestions(context, allTasks);

  state.search.autocomplete = {
    active: suggestions.length > 0,
    suggestions,
    selectedIndex: 0,
    context,
  };
}

export async function runInteractiveTui(options: TuiOptions): Promise<TaskIndex> {
  const term: Term = terminalKit.terminal;

  const state: SessionState = {
    index: options.index,
    views: buildViews(options.config),
    viewIndex: 2, // default Today
    statusMode: 'open',
    priorityOrder: 'high',
    query: '',
    command: { active: false, kind: null, input: createTextInput('') },
    search: {
      active: false,
      scope: 'view',
      input: createTextInput(''),
      autocomplete: {
        active: false,
        suggestions: [],
        selectedIndex: 0,
        context: null,
      },
    },
    selection: { row: 0, scroll: 0, selectedId: null },
    projects: { drilldownProjectId: null },
    projectsList: { active: false, input: createTextInput(''), staged: createTextInput('') },
    collapsedProjects: new Set<string>(),
    collapsedTasks: new Set<string>(),
    collapsedAreas: new Set<string>(),
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
      state.search.input = createTextInput('');
      state.command.active = false;
      state.command.kind = null;
      state.command.input = createTextInput('');
      if (state.views[idx]?.kind === 'projects') {
        state.projectsList.active = false;
        state.projectsList.input = createTextInput('');
        state.projectsList.staged = createTextInput('');
      }
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
    state.search.input = createTextInput('');
    state.command.active = false;
    state.command.kind = null;
    state.command.input = createTextInput('');
    if (state.views[next]?.kind === 'projects') {
      state.projectsList.active = false;
      state.projectsList.input = createTextInput('');
      state.projectsList.staged = createTextInput('');
    }
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

  function selectRenderRow(rowIndex: number): void {
    state.selection.row = rowIndex;
    const row = state.renderRows[rowIndex];
    state.selection.selectedId = row?.kind === 'task' ? row.task.globalId : null;
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
      `Set priority — ${selected.globalId}`,
      [`Task: ${selected.text}`, '', '[h] high', '[n] normal', '[l] low', '[c] clear'],
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
      `Set bucket — ${selected.globalId}`,
      [`Task: ${selected.text}`, '', '[n] now', '[t] today', '[u] upcoming', '[a] anytime', '[s] someday', '[c] clear'],
      ['n', 't', 'u', 'a', 's', 'c'],
      state.colorsDisabled
    );
    if (!choice) return;

    const res = await ensureFileFresh(term, state, selected.filePath, refreshFromDisk);
    if (!res.ok) return;

    const task = state.index.tasks[taskId];
    if (!task) return;

    const changes: Record<string, string | null> = {};
    if (choice === 'c') changes.bucket = null;
    if (choice === 'n') changes.bucket = 'now';
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

  async function toggleNowBucket(): Promise<void> {
    const selected = getSelectedTask(state);
    if (!selected) return;
    const taskId = selected.globalId;

    const res = await ensureFileFresh(term, state, selected.filePath, refreshFromDisk);
    if (!res.ok) return;

    const task = state.index.tasks[taskId];
    if (!task) return;

    const changes: Record<string, string | null> = {};
    changes.bucket = task.bucket === 'now' ? null : 'now';

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
      `Set ${which === 'plan' ? 'plan date' : 'due date'} — ${selected.globalId}`,
      [
        `Task: ${selected.text}`,
        '',
        '[t] today',
        '[m] manual (YYYY-MM-DD or +Nd/+Nw)',
        '[c] clear',
      ],
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
        `Set ${which === 'plan' ? 'plan date' : 'due date'} (manual) — ${selected.globalId}`,
        'Date (YYYY-MM-DD or +Nd/+Nw):',
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

    const currentMeta = readCurrentMetadataBlockString(task);
    const result = await promptEditTaskModal({
      term,
      title: `Edit task — ${task.globalId}`,
      taskLine: `Task: ${task.text}`,
      initialText: task.text,
      initialMetadata: currentMeta,
      allTasks: Object.values(state.index.tasks),
      colorsDisabled: state.colorsDisabled,
    });
    if (!result) return;

    rewriteTaskTextAndMetadataInFile(task, result.text.trim(), result.metadataBlock.trim());
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

    const projects = Object.values(state.index.projects).sort((a, b) => a.id.localeCompare(b.id));
    if (projects.length === 0) {
      state.message = 'No projects found';
      return;
    }

    const initialProjectId = decision.projectId ?? null;
    const picked = await promptAddTaskModal({
      term,
      title: 'Add task',
      projects: projects.map((p) => ({ id: p.id, name: p.name, area: p.area })),
      initialProjectId,
      allTasks: Object.values(state.index.tasks),
      colorsDisabled: state.colorsDisabled,
    });
    if (!picked) return;

    const targetProject = picked.projectId;
    const proj = state.index.projects[targetProject];
    if (!proj) {
      state.message = `Project '${targetProject}' not found. Re-run index.`;
      return;
    }

    const res = await ensureFileFresh(term, state, proj.filePath, refreshFromDisk);
    if (!res.ok) return;

    const { metadata: rawMeta } = parseMetadataBlock(picked.metadataInner ? `[${picked.metadataInner}]` : '');

    const priorityRaw = rawMeta.priority;
    const energyRaw = rawMeta.energy;
    const bucketRaw = rawMeta.bucket;
    const estRaw = rawMeta.est;
    const areaRaw = rawMeta.area;
    const tagsRaw = rawMeta.tags;
    const planRaw = rawMeta.plan;
    const dueRaw = rawMeta.due;

    const priority: TaskMetadata['priority'] =
      priorityRaw === 'high' || priorityRaw === 'normal' || priorityRaw === 'low' ? priorityRaw : undefined;
    if (priorityRaw && !priority) {
      state.message = `Invalid priority: ${priorityRaw}`;
      return;
    }

    const energy: TaskMetadata['energy'] =
      energyRaw === 'high' || energyRaw === 'normal' || energyRaw === 'low' ? energyRaw : undefined;
    if (energyRaw && !energy) {
      state.message = `Invalid energy: ${energyRaw}`;
      return;
    }

    const bucket =
      bucketRaw === 'today' || bucketRaw === 'upcoming' || bucketRaw === 'anytime' || bucketRaw === 'someday'
        ? bucketRaw
        : undefined;
    if (bucketRaw && !bucket) {
      state.message = `Invalid bucket: ${bucketRaw}`;
      return;
    }

    const planParsed = planRaw ? (parseManualDateInput(planRaw) ?? undefined) : undefined;
    if (planRaw && !planParsed) {
      state.message = `Invalid plan date: ${planRaw}`;
      return;
    }

    const dueParsed = dueRaw ? (parseManualDateInput(dueRaw) ?? undefined) : undefined;
    if (dueRaw && !dueParsed) {
      state.message = `Invalid due date: ${dueRaw}`;
      return;
    }

    const existingIds = getExistingIdsForProject(state.index.tasks, targetProject);
    const newId = generateNextId(existingIds);
    const created = todayIso();

    const metadata: TaskMetadata = {
      id: newId,
      created,
      priority: priority ?? 'normal',
      energy,
      est: estRaw || undefined,
      bucket,
      plan: bucket === 'today' && !planParsed ? created : planParsed,
      due: dueParsed,
      area: areaRaw || undefined,
      tags: tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
    };

    const insertResult = insertTask(state.index, targetProject, picked.text.trim(), metadata);
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

    const selectedProject = getSelectedProject(state);
    const selectedTask = getSelectedTask(state);
    const filePath = selectedProject?.filePath ?? selectedTask?.filePath ?? files[0]!;

    if (!filePath) return;
    if (!fs.existsSync(filePath)) {
      state.message = `File not found: ${filePath}`;
      return;
    }

    const headingLevel = defaultProjectHeadingLevelForFile(filePath);

    const title = `Add project → ${path.basename(filePath)}`;
    const nameInput = await promptText(term, `${title} (1/3)`, 'Project name:', '', state.colorsDisabled);
    if (nameInput === null) return;
    const name = nameInput.trim();
    if (!name) {
      state.message = 'Project name is required';
      return;
    }

    const suggestedId = slugifyProjectId(name);
    const idInput = await promptText(
      term,
      `${title} (2/3)`,
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

    const areaInput = await promptText(term, `${title} (3/3)`, 'Area (optional):', '', state.colorsDisabled);
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

    const projectsViewIdx = state.views.findIndex((v) => v.key === '6');
    if (projectsViewIdx !== -1) {
      state.viewIndex = projectsViewIdx;
    }
    state.projects.drilldownProjectId = projectId;
    state.search.active = false;
    state.search.input = createTextInput('');
    state.query = getEffectiveQuery(state);
    state.selection = { row: 0, scroll: 0, selectedId: null };
    recompute(state);
    state.message = `Created project ${projectId} in ${path.basename(filePath)}`;
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
        state.search.input = createTextInput('');
        recompute(state);
      }
      if (state.command.active) {
        state.command.active = false;
        state.command.kind = null;
        state.command.input = createTextInput('');
        recompute(state);
      }
      {
        const view = state.views[state.viewIndex]!;
        const isProjectsList = view.kind === 'projects' && !state.projects.drilldownProjectId;
        if (isProjectsList && state.projectsList.active) {
          state.projectsList.active = false;
          state.projectsList.input = state.projectsList.staged;
          state.projectsList.staged = createTextInput('');
          state.selection = { row: 0, scroll: 0, selectedId: null };
          recompute(state);
        }
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
    const footerHeight = getFooterHeight({ searchActive: state.search.active });
    const listTop = 5;
    const listHeight = Math.max(1, height - listTop - footerHeight);

    // Search mode
    if (state.search.active) {
      // TAB: Apply autocomplete suggestion
      if (name === 'TAB') {
        if (
          state.search.autocomplete.active &&
          state.search.autocomplete.suggestions.length > 0
        ) {
          const selected =
            state.search.autocomplete.suggestions[state.search.autocomplete.selectedIndex]!;
          const context = state.search.autocomplete.context!;

          const cursorPos = toCodeUnitCursor(state.search.input.value, state.search.input.cursor);
          const { newInput, newCursorPos } = applySuggestion(
            state.search.input.value,
            cursorPos,
            selected,
            context
          );

          state.search.input = { value: newInput, cursor: toCodepointCursor(newInput, newCursorPos) };

          // Regenerate autocomplete for new position
          updateAutocomplete(state);
          recompute(state);
          render(state, term);
          return;
        }
      }

      // UP/DOWN: Navigate autocomplete suggestions
      if (name === 'UP' && state.search.autocomplete.active) {
        state.search.autocomplete.selectedIndex = Math.max(
          0,
          state.search.autocomplete.selectedIndex - 1
        );
        render(state, term);
        return;
      }

      if (name === 'DOWN' && state.search.autocomplete.active) {
        state.search.autocomplete.selectedIndex = Math.min(
          state.search.autocomplete.suggestions.length - 1,
          state.search.autocomplete.selectedIndex + 1
        );
        render(state, term);
        return;
      }

      if (name === 'z') {
        state.statusMode = state.statusMode === 'open' ? 'all' : 'open';
        state.query = normalizeStatusInQuery(state.query, state.statusMode);
        state.search.input = createTextInput(normalizeStatusInQuery(state.search.input.value, state.statusMode));
        updateAutocomplete(state);
        recompute(state);
        render(state, term);
        return;
      }
      if (name === 'ENTER') {
        state.query = normalizeStatusInQuery(state.search.input.value.trim(), state.statusMode);
        state.search.active = false;
        state.search.input = createTextInput('');
        state.search.autocomplete.active = false;
        recompute(state);
        render(state, term);
        return;
      }
      if (name === 'ESCAPE') {
        state.search.active = false;
        state.search.input = createTextInput('');
        state.search.autocomplete.active = false;
        recompute(state);
        render(state, term);
        return;
      }
      if (name === 'CTRL_SLASH' || name === '!') {
        if (state.search.scope === 'view') {
          // switch to global: strip base query if present
          const base = getEffectiveQuery(state);
          const current = state.search.input.value.trim();
          const stripped = current.startsWith(base) ? current.slice(base.length).trim() : current;
          state.search.scope = 'global';
          state.search.input = createTextInput(stripped);
        } else {
          const base = getEffectiveQuery(state);
          state.search.scope = 'view';
          const current = state.search.input.value;
          state.search.input = createTextInput(`${base}${current ? ` ${current}` : ''}`.trim());
        }
        updateAutocomplete(state);
        recompute(state);
        render(state, term);
        return;
      }
      const applied = applyTextInputKey(state.search.input, name);
      if (applied) {
        state.search.input = applied.state;
        updateAutocomplete(state);
        if (applied.didChangeValue) recompute(state);
        render(state, term);
        return;
      }
      return;
    }

    // Command mode (":" → go to line)
    if (state.command.active) {
      if (name === 'ESCAPE') {
        state.command.active = false;
        state.command.kind = null;
        state.command.input = createTextInput('');
        render(state, term);
        return;
      }
      if (name === 'ENTER') {
        const raw = state.command.input.value.trim();
        const n = Number.parseInt(raw, 10);
        const listSize = state.renderRows.length;
        if (!Number.isFinite(n) || n <= 0) {
          state.message = `Invalid line: ${raw || '(empty)'}`;
        } else if (listSize <= 0) {
          state.message = 'No rows';
        } else {
          const target = clamp(n - 1, 0, Math.max(0, listSize - 1));
          selectRenderRow(target);
          updateScrollForSelection(listSize, listHeight);
        }
        state.command.active = false;
        state.command.kind = null;
        state.command.input = createTextInput('');
        render(state, term);
        return;
      }

      // Accept digits + normal text editing keys; sanitize to digits.
      const applied = applyTextInputKey(state.command.input, name);
      if (applied) {
        const digits = applied.state.value.replace(/\D/g, '');
        state.command.input = createTextInput(digits);
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

    // Projects list filter mode (activated via "/")
    if (isProjectsList && state.projectsList.active) {
      if (name === 'ENTER') {
        state.projectsList.active = false;
        state.projectsList.staged = createTextInput('');
        recompute(state);
        render(state, term);
        return;
      }
      if (name === 'ESCAPE') {
        state.projectsList.active = false;
        state.projectsList.input = state.projectsList.staged;
        state.projectsList.staged = createTextInput('');
        state.selection = { row: 0, scroll: 0, selectedId: null };
        recompute(state);
        render(state, term);
        return;
      }
      const applied = applyTextInputKey(state.projectsList.input, name);
      if (applied && applied.didChangeValue) {
        state.projectsList.input = applied.state;
        recompute(state);
        render(state, term);
        return;
      }
      if (applied) {
        state.projectsList.input = applied.state;
        render(state, term);
        return;
      }
      return;
    }

    // Enter search
    if (!isProjectsList && name === '/') {
      state.search.active = true;
      state.search.scope = 'view';
      state.search.input = createTextInput(ensureTrailingSpace(state.query));
      updateAutocomplete(state);
      render(state, term);
      return;
    }

    // Projects list: activate filter input
    if (isProjectsList && name === '/') {
      state.projectsList.active = true;
      state.projectsList.staged = state.projectsList.input;
      state.projectsList.input = createTextInput(state.projectsList.input.value);
      recompute(state);
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
          'Help',
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
    if (!isProjectsList && (name === 'LEFT' || name === 'h')) {
      setNextView(-1);
      render(state, term);
      return;
    }
    if (!isProjectsList && (name === 'RIGHT' || name === 'l')) {
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

    // Priority ordering toggle: high-first → low-first → off
    if (!isProjectsList && (name === 'o' || name === 'O')) {
      state.priorityOrder = cyclePriorityOrderMode(state.priorityOrder);
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
        state.projectsList.active = false;
        state.projectsList.staged = createTextInput('');
        recompute(state);
        render(state, term);
      }
      return;
    }

    // Projects list: add project (Ctrl+N)
    if (isProjectsList && name === 'CTRL_N') {
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

    // Task list: ":" go to line (vim-style)
    if (!isProjectsList && name === ':') {
      state.command.active = true;
      state.command.kind = 'gotoLine';
      state.command.input = createTextInput('');
      render(state, term);
      return;
    }

    // Task list: Fold/unfold everything.
    // Use `F` (Shift+f) so it pairs with `Enter` (fold one row) and works reliably in most terminals.
    if (!isProjectsList && name === 'F') {
      const areaKeys = new Set<string>();
      const projectIds = new Set<string>();
      const taskIds = new Set<string>();

      for (const row of state.renderRows) {
        if (row.kind === 'area') areaKeys.add(row.area);
        if (row.kind === 'header') projectIds.add(row.projectId);
        if (row.kind === 'task') {
          const hasChildren = (row.task.childrenIds?.length ?? 0) > 0;
          if (hasChildren) taskIds.add(row.task.globalId);
        }
      }

      const foldableCount = areaKeys.size + projectIds.size + taskIds.size;
      if (foldableCount > 0) {
        const allCollapsed =
          [...areaKeys].every((a) => state.collapsedAreas.has(a)) &&
          [...projectIds].every((p) => state.collapsedProjects.has(p)) &&
          [...taskIds].every((t) => state.collapsedTasks.has(t));

        if (allCollapsed) {
          state.collapsedAreas.clear();
          state.collapsedProjects.clear();
          state.collapsedTasks.clear();
        } else {
          for (const a of areaKeys) state.collapsedAreas.add(a);
          for (const p of projectIds) state.collapsedProjects.add(p);
          for (const t of taskIds) state.collapsedTasks.add(t);
        }

        recompute(state);
        updateScrollForSelection(state.renderRows.length, listHeight);
        render(state, term);
      }
      return;
    }

    // Task list: "f" toggles fold/unfold on the selected row
    if (!isProjectsList && name === 'f') {
      const row = state.renderRows[state.selection.row];
      if (row?.kind === 'area') {
        const area = row.area;
        if (state.collapsedAreas.has(area)) state.collapsedAreas.delete(area);
        else state.collapsedAreas.add(area);
        recompute(state);
        const areaIndex = state.renderRows.findIndex((r) => r.kind === 'area' && r.area === area);
        if (areaIndex >= 0) selectRenderRow(areaIndex);
        updateScrollForSelection(state.renderRows.length, listHeight);
        render(state, term);
      }
      if (row?.kind === 'header') {
        const projectId = row.projectId;
        if (state.collapsedProjects.has(projectId)) state.collapsedProjects.delete(projectId);
        else state.collapsedProjects.add(projectId);
        recompute(state);
        // Keep selection on the same header if it still exists.
        const headerIndex = state.renderRows.findIndex((r) => r.kind === 'header' && r.projectId === projectId);
        if (headerIndex >= 0) selectRenderRow(headerIndex);
        updateScrollForSelection(state.renderRows.length, listHeight);
        render(state, term);
      }
      if (row?.kind === 'task') {
        const task = row.task;
        const hasChildren = (task.childrenIds?.length ?? 0) > 0;
        if (!hasChildren) return;
        if (state.collapsedTasks.has(task.globalId)) state.collapsedTasks.delete(task.globalId);
        else state.collapsedTasks.add(task.globalId);
        // Preserve selection on the same task.
        state.selection.selectedId = task.globalId;
        recompute(state);
        const taskIndex = state.renderRows.findIndex((r) => r.kind === 'task' && r.task.globalId === task.globalId);
        if (taskIndex >= 0) selectRenderRow(taskIndex);
        updateScrollForSelection(state.renderRows.length, listHeight);
        render(state, term);
      }
      return;
    }

    // Movement
    if (name === 'DOWN' || name === 'j') {
      if (isProjectsList) {
        state.selection.row = clamp(state.selection.row + 1, 0, Math.max(0, listSize - 1));
        updateScrollForSelection(listSize, listHeight);
        state.selection.selectedId = state.filteredProjects[state.selection.row]?.id ?? null;
      } else {
        const next = clamp(state.selection.row + 1, 0, Math.max(0, listSize - 1));
        selectRenderRow(next);
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
        const prev = clamp(state.selection.row - 1, 0, Math.max(0, listSize - 1));
        selectRenderRow(prev);
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
        selectRenderRow(0);
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
        selectRenderRow(Math.max(0, listSize - 1));
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
        const up = clamp(state.selection.row - Math.floor(listHeight / 2), 0, Math.max(0, listSize - 1));
        selectRenderRow(up);
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
        const down = clamp(state.selection.row + Math.floor(listHeight / 2), 0, Math.max(0, listSize - 1));
        selectRenderRow(down);
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
          await toggleNowBucket();
        } finally {
          state.busy = false;
          recompute(state);
          render(state, term);
        }
        return;
      }
      if (name === 't') {
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
      state.search.input = createTextInput('');
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
