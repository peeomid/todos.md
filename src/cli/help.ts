import { boldText, dimText, supportsAnsiColor } from './terminal.js';

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
    dimText('Run `tmd <command> --help` for command-specific help.'),
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
