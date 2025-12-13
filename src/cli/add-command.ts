import { readIndexFile, writeIndexFile } from '../indexer/index-file.js';
import { buildIndex } from '../indexer/indexer.js';
import { generateNextId, getExistingIdsForProject } from '../editor/id-generator.js';
import { insertTask, type TaskMetadata } from '../editor/task-inserter.js';
import { loadConfig, resolveFiles, resolveOutput, type Config } from '../config/loader.js';
import { extractBooleanFlags, extractFlags, extractMultipleFlags } from './flag-utils.js';
import { CliUsageError } from './errors.js';
import { greenText } from './terminal.js';
import { parseRelativeDate } from './date-utils.js';
import { runAutoSyncIfNeeded } from './auto-sync.js';

interface AddOptions {
  projectId: string;
  text: string;
  parent?: string;
  energy?: 'low' | 'normal' | 'high';
  est?: string;
  due?: string;
  plan?: string;
  bucket?: string;
  area?: string;
  tags?: string[];
  json: boolean;
  noReindex: boolean;
  noSync: boolean;
  output: string;
  files: string[];
  config: Config;
  configPath?: string | null;
}

export function handleAddCommand(args: string[]): void {
  const options = parseAddFlags(args);
  runAdd(options);
}

export function printAddHelp(): void {
  console.log(`Usage: tmd add <project-id> "<task text>" [options]

Add a new task to a project.

Arguments:
  <project-id>      Project to add task to (e.g., inbox, as-onb)
  <task text>       Task description text

Options:
  --parent <id>     Add as subtask under this local ID
  --energy <level>  Set energy level (low, normal, high)
  --est <duration>  Set estimate (15m, 30m, 1h, etc.)
  --due <date>      Set due date (YYYY-MM-DD)
  --plan <date>     Set planned work date (YYYY-MM-DD, today, tomorrow)
  --bucket <name>   Set planning bucket (today, upcoming, anytime, someday, or custom)
  --area <name>     Override area
  --tags <tags>     Add tags (comma-separated)
  --json            Output as JSON
  --no-reindex      Don't update todos.json after add
  --no-sync         Don't run tmd sync after add
  -c, --config      Path to config file
  -o, --output      Override output file path
  -h, --help        Show this help

Examples:
  tmd add inbox "Call bank about card"
  tmd add inbox "Call bank" --energy low --est 15m
  tmd add as-onb "Write docs" --est 2h
  tmd add as-onb "Test email variants" --parent 1
  tmd add inbox "Pay rent" --due 2025-12-31
  tmd add inbox "Review PR" --tags code,urgent
  tmd add inbox "Call bank" --bucket today
  tmd add inbox "Urgent call" --plan today
`);
}

function parseAddFlags(args: string[]): AddOptions {
  const boolFlags = extractBooleanFlags(args, ['--json', '--no-reindex', '--no-sync']);
  const valueFlags = extractFlags(args, [
    '--config',
    '-c',
    '--output',
    '-o',
    '--parent',
    '--energy',
    '--est',
    '--due',
    '--plan',
    '--bucket',
    '--area',
    '--tags',
  ]);
  const fileFlags = extractMultipleFlags(args, ['--file', '-f']);

  const configPath = valueFlags['--config'] ?? valueFlags['-c'] ?? null;
  const config = loadConfig(configPath ?? undefined);
  const output = resolveOutput(config, valueFlags['--output'] ?? valueFlags['-o']);
  const files = resolveFiles(config, fileFlags);

  // Positional arguments: project-id and task text
  if (args.length < 2) {
    throw new CliUsageError('Usage: tmd add <project-id> "<task text>" [options]');
  }

  const projectId = args[0]!;
  const text = args[1]!;

  // Validate energy
  const energy = valueFlags['--energy'] as 'low' | 'normal' | 'high' | undefined;
  if (energy && !['low', 'normal', 'high'].includes(energy)) {
    throw new CliUsageError(`Invalid energy level: '${energy}'. Must be 'low', 'normal', or 'high'.`);
  }

  // Parse tags
  const tagsRaw = valueFlags['--tags'];
  const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : undefined;

  // Parse plan date
  let plan = valueFlags['--plan'];
  if (plan) {
    if (plan === 'today' || plan === 'tomorrow') {
      plan = parseRelativeDate(plan);
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(plan)) {
      throw new CliUsageError(`Invalid plan date: '${plan}'. Use YYYY-MM-DD, 'today', or 'tomorrow'.`);
    }
  }

  // Validate due date format
  const due = valueFlags['--due'];
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    throw new CliUsageError(`Invalid due date: '${due}'. Use YYYY-MM-DD format.`);
  }

  return {
    projectId,
    text,
    parent: valueFlags['--parent'],
    energy,
    est: valueFlags['--est'],
    due,
    plan,
    bucket: valueFlags['--bucket'],
    area: valueFlags['--area'],
    tags,
    json: boolFlags.has('--json'),
    noReindex: boolFlags.has('--no-reindex'),
    noSync: boolFlags.has('--no-sync'),
    output,
    files,
    config,
    configPath,
  };
}

function runAdd(options: AddOptions): void {
  const {
    projectId,
    text,
    parent,
    json,
    noReindex,
    output,
    files,
    config,
    configPath,
    noSync,
  } = options;

  // Load index
  const index = readIndexFile(output);
  if (!index) {
    throw new CliUsageError(`No index found. Run \`tmd index\` first.`);
  }

  // Validate project exists
  const project = index.projects[projectId];
  if (!project) {
    const availableProjects = Object.keys(index.projects).join(', ');
    throw new CliUsageError(
      `Project '${projectId}' not found. Available projects: ${availableProjects || '(none)'}`
    );
  }

  // Validate parent if specified
  if (parent) {
    const parentGlobalId = `${projectId}:${parent}`;
    if (!index.tasks[parentGlobalId]) {
      throw new CliUsageError(`Parent task '${parent}' not found in project '${projectId}'.`);
    }
  }

  // Generate next ID
  const existingIds = getExistingIdsForProject(index.tasks, projectId);
  const newId = generateNextId(existingIds, parent);
  const globalId = `${projectId}:${newId}`;

  // Build metadata
  const today = new Date().toISOString().split('T')[0]!;
  const metadata: TaskMetadata = {
    id: newId,
    energy: options.energy,
    est: options.est,
    due: options.due,
    plan: options.plan,
    bucket: options.bucket,
    area: options.area,
    tags: options.tags,
    created: today,
  };

  // Insert task
  const result = insertTask(index, projectId, text, metadata, parent);
  if (!result.success) {
    throw new CliUsageError(result.error ?? 'Failed to insert task');
  }

  // Reindex
  let reindexed = false;
  if (!noReindex) {
    const { index: newIndex } = buildIndex(files);
    writeIndexFile(newIndex, output);
    reindexed = true;
  }

  const synced = runAutoSyncIfNeeded({
    config,
    configPath,
    output,
    noSync,
  });

  // Output
  if (json) {
    const outputData: Record<string, unknown> = {
      success: true,
      task: {
        globalId,
        localId: newId,
        projectId,
        text,
        metadata: Object.fromEntries(
          Object.entries(metadata).filter(([_, v]) => v !== undefined)
        ),
      },
      file: {
        path: project.filePath,
        line: result.lineNumber,
      },
      reindexed,
      synced,
    };
    if (parent) {
      (outputData.task as Record<string, unknown>).parentId = `${projectId}:${parent}`;
    }
    console.log(JSON.stringify(outputData, null, 2));
  } else {
    console.log(`${greenText('Added:')} ${globalId} (${text})`);
    if (parent) {
      const parentTask = index.tasks[`${projectId}:${parent}`];
      console.log(`  Parent: ${projectId}:${parent} (${parentTask?.text ?? 'unknown'})`);
    }
    console.log(`  File: ${project.filePath}`);
    console.log(`  Line: ${result.lineNumber}`);
  }
}
