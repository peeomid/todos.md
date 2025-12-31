import { supportsAnsiColor, boldText, dimText } from './terminal.js';

export type HelpTopicId = 'topics' | 'concepts' | 'config' | 'workflows' | 'shorthands' | 'format';

type TopicDef = {
  id: HelpTopicId;
  title: string;
  summary: string;
  lines: string[];
};

function heading(text: string): string {
  return supportsAnsiColor ? boldText(text) : text;
}

function subtle(text: string): string {
  return supportsAnsiColor ? dimText(text) : text;
}

export const HELP_TOPICS: Record<Exclude<HelpTopicId, 'topics'>, TopicDef> = {
  concepts: {
    id: 'concepts',
    title: 'Help: Concepts',
    summary: 'Core `tmd` concepts: tasks, projects, IDs, metadata, index.',
    lines: [
      'Core concepts used by `tmd`.',
      '',
      heading('Projects'),
      '  - A project is a Markdown heading that includes `project:<project-id>` metadata.',
      '  - Tasks inherit the nearest heading above them with `project:`.',
      '',
      heading('Tasks'),
      '  - A task is a checkbox list item: `- [ ]` (open) or `- [x]` (done).',
      '  - Indentation defines subtasks.',
      '',
      heading('IDs'),
      '  - Trackable tasks have `id:<local-id>` metadata and are under a project.',
      '  - Global task IDs are `<project-id>:<local-id>` (example: `as-onb:1.1`).',
      '',
      heading('Metadata'),
      '  - Trailing `[key:value ...]` on a task line.',
      '  - Common keys: energy, priority, est, due, plan, bucket, area, tags, created, updated.',
      '',
      heading('Index'),
      '  - `tmd index` builds an index file (default `todos.json`).',
      '  - Query commands read from the index; if results look wrong, rebuild the index.',
    ],
  },
  config: {
    id: 'config',
    title: 'Help: Config',
    summary: 'Config discovery, precedence, and key settings.',
    lines: [
      'How `tmd` loads configuration.',
      '',
      heading('Discovery order (first match wins)'),
      '  1) `--global-config` / `-G` (force global config)',
      '  2) `--config <path>` / `-c <path>` (explicit)',
      '  3) nearest `.todosmd.json` found by walking up from the current directory',
      '  4) global config: `~/.config/todosmd/config.json`',
      '',
      heading('Inspect config from the CLI'),
      '  - `tmd config path`           Show config paths and active source',
      '  - `tmd config list --json`    Show effective config as JSON',
      '  - `tmd config get files`      Get a specific value (dot paths supported)',
      '',
      heading('Common config keys'),
      '  - `files`: input Markdown task files (default `["todos.md"]`)',
      '  - `output`: index path (default `"todos.json"`) ',
      '  - `views`: view files used by `tmd sync` (optional)',
      '  - `interactive.views`: custom views in `tmd interactive` (optional)',
      '  - `interactive.groupBy`: task list grouping in the TUI (`project` | `none`)',
      '',
      heading('OR filters'),
      '  - Boolean OR: use `|` or `OR`, group with parentheses.',
      '    Example: `(bucket:today | plan:today) priority:high`',
      '  - Multi-value OR: use commas or repeat the same key:',
      '    `project:sy,in` or `project:sy project:in`.',
      '',
      heading('Minimal example (.todosmd.json)'),
      '  {',
      '    "files": ["todos.md"],',
      '    "output": "todos.json",',
      '    "views": ["00-daily-focus.md"]',
      '  }',
      '',
      heading('Custom interactive views example'),
      '  {',
      '    "interactive": {',
      '      "views": [',
      '        { "key": "7", "name": "Today (Work)", "query": "status:open area:work bucket:today", "sort": "priority,plan,due" },',
      '        { "key": "8", "name": "High Impact", "query": "status:open priority:high", "sort": "bucket,plan,due" }',
      '      ]',
      '    }',
      '  }',
    ],
  },
  workflows: {
    id: 'workflows',
    title: 'Help: Workflows',
    summary: 'Common command sequences for day-to-day use.',
    lines: [
      'Common non-interactive workflows.',
      '',
      heading('First-time / normalize + index'),
      '  tmd enrich',
      '  tmd index',
      '',
      heading('Query'),
      '  tmd list bucket:today',
      '  tmd search "invoice" project:work',
      '  tmd show as-onb:1.1',
      '',
      heading('Edit tasks (auto reindex + auto sync by default)'),
      '  tmd done as-onb:1.1',
      '  tmd undone as-onb:1.1',
      '  tmd add inbox "Call bank" --due tomorrow',
      '  tmd edit inbox:1 --bucket today --plan today',
      subtle('  Tip: use --no-reindex and/or --no-sync to skip follow-up actions.'),
      '',
      heading('Views / sync blocks'),
      '  tmd sync                    # sync configured view files',
      '  tmd sync -f weekly.md        # sync specific view file',
      '  tmd block-template today     # generate a sync block skeleton',
    ],
  },
  shorthands: {
    id: 'shorthands',
    title: 'Help: Shorthands (enrich)',
    summary: 'Shorthand markers expanded by `tmd enrich`.',
    lines: [
      'Shorthands expanded by `tmd enrich` into canonical metadata.',
      '',
      heading('Priority shorthands (start of task text)'),
      '  (A) → priority:high',
      '  (B) → priority:normal',
      '  (C) → priority:low',
      '',
      heading('Bucket shorthands (start of task text)'),
      '  *  → bucket:now',
      '  !  → bucket:today + sets plan:<today>',
      '  >  → bucket:upcoming',
      '  ~  → bucket:anytime',
      '  ?  → bucket:someday',
      '',
      heading('@tag bucket shorthands (anywhere in task text)'),
      '  @now/@today/@upcoming/@anytime/@someday → bucket:<...> (and @today sets plan:<today>)',
      '',
      heading('Notes'),
      '  - Symbol bucket shorthands win over @tags when both are present.',
      '  - Use `tmd enrich --keep-shorthands` to keep markers in task text.',
      '  - Use `tmd enrich --dry-run` to preview changes.',
    ],
  },
  format: {
    id: 'format',
    title: 'Help: Task File Format (quick)',
    summary: 'Quick task-format overview; points to full spec doc.',
    lines: [
      'Quick overview of the Markdown format that `tmd` parses.',
      '',
      heading('Projects'),
      '  # Project name [project:proj-id area:work]',
      '',
      heading('Tasks'),
      '  - [ ] Task text [id:1 energy:low est:30m due:2025-12-20]',
      '    - [ ] Subtask [id:1.1]',
      '',
      heading('Metadata rules'),
      '  - Metadata is a single trailing bracket block: `[key:value key:value ...]`.',
      '  - Values must not contain spaces.',
      '  - `tags:` uses comma-separated values: `tags:a,b,c`.',
      '',
      heading('Full spec'),
      '  - See: doc/AI_CONTEXT__TMD_TODO_MARKDOWN_TASK_FORMAT_SPEC.md',
      '  - Also: local_doc/todo-format-spec.md',
    ],
  },
};

export function printHelpTopicsIndex(): void {
  const topicLines = Object.values(HELP_TOPICS).map((t) => `  ${t.id.padEnd(10)} ${t.summary}`);
  const lines = [
    heading('Help topics'),
    ...topicLines,
    '',
    'Usage:',
    '  tmd help <topic>',
    '  tmd help topics',
  ];
  console.log(lines.join('\n'));
}

export function printHelpTopic(topic: string): boolean {
  const normalized = topic.trim().toLowerCase();
  if (normalized === 'topics') {
    printHelpTopicsIndex();
    return true;
  }

  const def = (HELP_TOPICS as Record<string, TopicDef | undefined>)[normalized];
  if (!def) {
    return false;
  }

  const lines = [heading(def.title), '', ...def.lines, '', subtle('Tip: `tmd help topics` lists all help topics.')];
  console.log(lines.join('\n'));
  return true;
}
