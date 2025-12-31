/**
 * tmd block-template - Generate sync block skeletons for copy-paste
 */

import { extractBooleanFlags, extractFlags } from './flag-utils.js';
import { CliUsageError } from './errors.js';

interface BlockTemplateOptions {
  query: string;
  name?: string;
}

// Built-in presets
const PRESETS: Record<string, { query: string; name: string }> = {
  now: { query: 'status:open bucket:now', name: 'now' },
  today: { query: 'status:open bucket:today', name: 'today' },
  upcoming: { query: 'status:open bucket:upcoming', name: 'upcoming' },
  anytime: { query: 'status:open bucket:anytime', name: 'anytime' },
  someday: { query: 'status:open bucket:someday', name: 'someday' },
  light: { query: 'status:open energy:low', name: 'light' },
  week: { query: 'status:open plan:this-week', name: 'week' },
  overdue: { query: 'status:open overdue:true', name: 'overdue' },
};

export function handleBlockTemplateCommand(args: string[]): void {
  const options = parseBlockTemplateFlags(args);
  runBlockTemplate(options);
}

function parseBlockTemplateFlags(args: string[]): BlockTemplateOptions {
  extractBooleanFlags(args, ['--global-config', '-G']);
  const valueFlags = extractFlags(args, ['--name']);

  // First positional argument is preset name or custom query
  if (args.length === 0) {
    throw new CliUsageError('Missing preset or query. Usage: tmd block-template <preset|query> [--name <name>]');
  }

  const input = args[0]!;
  const nameOverride = valueFlags['--name'];

  // Check if input is a preset
  if (PRESETS[input]) {
    const preset = PRESETS[input]!;
    return {
      query: preset.query,
      name: nameOverride ?? preset.name,
    };
  }

  // Treat as custom query
  return {
    query: input,
    name: nameOverride,
  };
}

function runBlockTemplate(options: BlockTemplateOptions): void {
  const { query, name } = options;

  let output: string;
  if (name) {
    output = `<!-- tmd:start name="${name}" query="${query}" -->
<!-- tmd:end -->`;
  } else {
    output = `<!-- tmd:start query="${query}" -->
<!-- tmd:end -->`;
  }

  console.log(output);
}

export function printBlockTemplateHelp(): void {
  console.log(`Usage: tmd block-template <preset|query> [options]

Generate a ready-to-paste sync block skeleton.

Arguments:
  <preset|query>        Built-in preset name OR custom query string

Built-in Presets:
  now         status:open bucket:now         Working right now
  today       status:open bucket:today       Today's focus tasks
  upcoming    status:open bucket:upcoming    Upcoming tasks
  anytime     status:open bucket:anytime     Flexible tasks
  someday     status:open bucket:someday     Someday/maybe
  light       status:open energy:low         Low energy tasks
  week        status:open plan:this-week     This week's planned
  overdue     status:open overdue:true       Overdue tasks

Options:
  --name <name>         Block name (for custom queries)

Examples:
  tmd block-template today
  tmd block-template light --name "quick-wins"
  tmd block-template 'status:open project:as-onb' --name "as-onb-tasks"
  tmd block-template 'status:open area:work energy:low' --name "work-light"

Output:
  <!-- tmd:start name="today" query="status:open bucket:today" -->
  <!-- tmd:end -->

Use Case:
  1. Run: tmd block-template today
  2. Copy output
  3. Paste into your markdown file
  4. Run: tmd sync to fill the block with tasks
`);
}
