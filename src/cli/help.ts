import { boldText, dimText, supportsAnsiColor } from './terminal.js';
import { HELP_TOPICS } from './help-topics.js';

export function printHelp(message?: string): void {
  if (message) {
    console.error(message);
    console.error('');
  }

  const title = supportsAnsiColor
    ? `${boldText('tmd')} ${dimText('— Todo Markdown CLI')}`
    : 'tmd — Todo Markdown CLI';

  const lines = [
    title,
    '',
    'Usage: tmd <command> [options]',
    '',
    formatSection('Commands', [
      ['help', 'Show this help'],
      ['lint', 'Validate markdown files for format issues'],
      ['index', 'Parse files and generate todos.json'],
      ['enrich', 'Convert shorthands and auto-generate IDs'],
      ['list', 'List and filter tasks'],
      ['search', 'Full-text search across tasks'],
      ['interactive (i)', 'Full-screen interactive TUI'],
      ['show <id>', 'Show single task details'],
      ['done <id>', 'Mark task as completed'],
      ['undone <id>', 'Mark task as incomplete'],
      ['add', 'Add new task'],
      ['edit <id>', 'Edit task metadata'],
      ['stats', 'Show task statistics'],
      ['config', 'Manage configuration'],
      ['sync', 'Bidirectional sync with view files'],
      ['block-template', 'Generate sync block skeleton'],
    ]),
    '',
    formatSection('Global flags', [
      ['--file, -f <path>', 'Input file (repeatable)'],
      ['--config, -c <path>', 'Path to config file'],
      ['--output, -o <path>', 'Output file path'],
      ['--json', 'Output as JSON'],
      ['--help, -h', 'Show help'],
      ['--version', 'Show version'],
    ]),
    '',
    formatSection('Help topics', [
      ['help topics', 'List help topics'],
      ['help <topic>', `Deep help: ${Object.keys(HELP_TOPICS).join(', ')}`],
    ]),
    '',
    formatSection('Concepts', [
      ['Tasks', 'Markdown checkbox lines: - [ ] / - [x]'],
      ['Trackable task', 'Has [id:<local-id>] and is under a heading with [project:<id>]'],
      ['Global ID', '<project-id>:<local-id> (example: as-onb:1.1)'],
      ['Metadata', 'Trailing [key:value ...] (keys include energy/priority/est/due/plan/bucket/area/tags)'],
      ['Shorthands', 'tmd enrich expands (A)/(B)/(C), * ! > ~ ?, and @today/@upcoming/... into metadata'],
    ]),
    '',
    formatSection('Config', [
      ['Project config', 'Nearest .todosmd.json (walks up from cwd)'],
      ['Global config', '~/.config/todosmd/config.json'],
      ['Key fields', 'files (inputs), output (index path), views (sync targets)'],
    ]),
    '',
    formatSection('Common workflows', [
      ['Initialize index', 'tmd enrich && tmd index'],
      ['Query tasks', 'tmd list ... | tmd search ... | tmd show <id>'],
      ['Edit tasks', 'tmd done/undone/add/edit (auto reindex + auto sync unless --no-...)'],
      ['Regenerate views', 'tmd sync (requires views configured)'],
    ]),
    '',
    dimText('Run `tmd <command> --help` for command-specific help.'),
    dimText('Run `tmd help <topic>` for deeper help on non-command topics.'),
  ];

  console.error(lines.join('\n'));
}

function formatSection(title: string, entries: [string, string][]): string {
  const header = supportsAnsiColor ? boldText(title) : title;
  const maxLen = Math.max(...entries.map(([name]) => name.length));
  const formatted = entries.map(([name, desc]) => {
    const paddedName = name.padEnd(maxLen);
    const renderedName = supportsAnsiColor ? boldText(paddedName) : paddedName;
    const summary = supportsAnsiColor ? dimText(desc) : desc;
    return `  ${renderedName}  ${summary}`;
  });
  return [header, ...formatted].join('\n');
}

export function printVersion(version: string): void {
  console.log(version);
}
