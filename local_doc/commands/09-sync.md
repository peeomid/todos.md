# Command: `tmd sync`

**Tier**: 4 (File Sync)
**Priority**: Lower - auto-generated content

---

## Purpose

Bidirectional sync between source files (`todos.md`) and view files containing `tmd:start`/`tmd:end` blocks.

1. **Pull**: Read done tasks from view files → update source files
2. **Push**: Query index → regenerate view file blocks

This allows you to check off tasks in a daily planning view and have those changes propagate back to the source file.

---

## Usage

```bash
tmd sync [options]
```

## Options

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--file <path>` | `-f` | View file to sync (repeatable) | From config `views` |
| `--push-only` | | Skip pull phase, only regenerate views | `false` |
| `--pull-only` | | Skip push phase, only pull done tasks | `false` |
| `--dry-run` | | Show what would change, don't write | `false` |
| `--json` | | Output as JSON | `false` |

---

## Config: View Files

View files can be configured in `.todosmd.json`:

```json
{
  "files": ["todos.md"],
  "output": "todos.json",
  "views": [
    "00-daily-focus.md",
    "weekly-plan.md",
    "views/light-tasks.md"
  ]
}
```

When `views` is configured, `tmd sync` (without `--file`) syncs all view files.

---

## Examples

```bash
# Sync all configured view files (bidirectional)
tmd sync

# Sync specific file
tmd sync --file 00-daily-focus.md

# Sync multiple specific files
tmd sync -f daily.md -f weekly.md

# Preview changes without writing
tmd sync --dry-run

# Only pull done tasks from views (no regeneration)
tmd sync --pull-only

# Only regenerate views (no pulling)
tmd sync --push-only

# JSON output
tmd sync --json
```

---

## Block Marker Format

The target file must contain a block with start and end markers using HTML comments:

```markdown
## Today's Focus

Some intro text here...

<!-- tmd:start query="status:open bucket:today" -->
... this content will be replaced ...
<!-- tmd:end -->

## Notes

Manual content here is preserved...
```

### Why HTML Comments?

- **Hidden in rendered Markdown** - markers don't appear on GitHub, Obsidian, or other viewers
- **Short and memorable** - `tmd:start` / `tmd:end`
- **Standard syntax** - real HTML comments (`<!-- ... -->`)

### Query Syntax

The `query` attribute uses the same key:value syntax as `tmd list` filters:

```markdown
<!-- tmd:start query="status:open bucket:today" -->
<!-- tmd:start query="energy:low" -->
<!-- tmd:start query="project:inbox status:open" -->
<!-- tmd:start query="due:this-week area:work" -->
<!-- tmd:start query="overdue:true" -->
<!-- tmd:start query="(bucket:today | plan:today) priority:high" -->
```

Both double and single quotes are accepted:

```markdown
<!-- tmd:start query="status:open" -->
<!-- tmd:start query='status:open' -->
```

### Multiple Blocks

A file can have multiple tmd blocks:

```markdown
## High Priority

<!-- tmd:start query="bucket:today energy:high" -->
...
<!-- tmd:end -->

## Low Energy Tasks

<!-- tmd:start query="energy:low" -->
...
<!-- tmd:end -->
```

---

## Output

### Text (default)

```
Syncing 2 view files...

Phase 1: Pulling done tasks from views
  00-daily-focus.md
    ✓ inbox:1 - marked done in source (Call bank)
    ✓ as-onb:2 - marked done in source (Review PR)
  weekly-plan.md
    · inbox:1 - already done in source
  Reindexing...

Phase 2: Regenerating view blocks
  00-daily-focus.md
    Block 1: status:open bucket:today → 3 tasks
  weekly-plan.md
    Block 1: status:open bucket:upcoming → 5 tasks

Summary:
  Tasks marked done: 2
  Views updated: 2
```

### Dry run

```
Syncing 2 view files... (dry run)

Phase 1: Would pull done tasks
  00-daily-focus.md
    → inbox:1 - would mark done in todos.md:15 (Call bank)
    → as-onb:2 - would mark done in todos.md:28 (Review PR)

Phase 2: Would regenerate view blocks
  00-daily-focus.md
    Block 1: status:open bucket:today → 3 tasks

No files modified (dry run).
```

### JSON (`--json`)

```json
{
  "success": true,
  "pull": {
    "tasksMarkedDone": [
      {
        "globalId": "inbox:1",
        "text": "Call bank",
        "sourceFile": "todos.md",
        "sourceLine": 15,
        "foundInView": "00-daily-focus.md"
      },
      {
        "globalId": "as-onb:2",
        "text": "Review PR",
        "sourceFile": "todos.md",
        "sourceLine": 28,
        "foundInView": "00-daily-focus.md"
      }
    ],
    "alreadyDone": ["inbox:1"],
    "indexed": true
  },
  "push": {
    "files": [
      {
        "path": "00-daily-focus.md",
        "blocks": [
          {
            "query": "status:open bucket:today",
            "taskCount": 3
          }
        ]
      }
    ]
  },
  "dryRun": false
}
```

---

## Generated Content Format

Tasks are rendered as checkbox items with global ID and key metadata:

```markdown
<!-- tmd:start query="bucket:today" -->
- [ ] Draft welcome email [id:as-onb:1 energy:normal est:60m]
- [ ] Call bank about card [id:inbox:1 energy:low est:15m due:2025-12-08]
- [x] Review PR [id:work:3 energy:normal]
<!-- tmd:end -->
```

Notes:
- Uses global ID (not local) for clarity
- Includes relevant metadata
- Preserves completion status
- No hierarchy/indentation (flat list)

---

## Behavior

Sync runs in two phases:

### Phase 1: PULL (done wins)

1. Resolve view files (from `--file` flags or config `views`)
2. For each view file:
   - Find all `tmd:start`/`tmd:end` blocks
   - Parse tasks within each block
   - Find tasks marked `[x]` (done)
3. For each done task found in views:
   - Look up by global ID in index
   - If source file has `[ ]` (open):
     - Mark as `[x]` in source file (same logic as `tmd done`)
   - If source file is already `[x]` and `completedAt` is missing:
     - Backfill `completedAt:YYYY-MM-DD` as today
4. Run `tmd index` to update `todos.json`

**"Done wins" rule**: If a task is marked done in ANY view file OR source file, it's treated as done. This prevents conflicts and matches user intent (you don't accidentally un-complete tasks).

### Phase 2: PUSH (regenerate views)

5. For each view file:
   - Find all `tmd:start`/`tmd:end` blocks
   - Parse query from each block's start marker
   - Execute query against `todos.json` (same engine as `tmd list`)
   - Generate task list content
   - Replace block content
6. Write modified files (unless `--dry-run`)

### Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     tmd sync                            │
├─────────────────────────────────────────────────────────┤
│  PHASE 1: PULL                                          │
│  ┌───────────────┐    ┌───────────────┐                │
│  │  view1.md     │    │  view2.md     │                │
│  │  - [x] task A │    │  - [x] task B │                │
│  │  - [ ] task C │    │  - [ ] task A │                │
│  └───────┬───────┘    └───────┬───────┘                │
│          │    done tasks      │                        │
│          └────────┬───────────┘                        │
│                   ▼                                    │
│          ┌───────────────┐                             │
│          │   todos.md    │  ← mark done: A, B          │
│          └───────┬───────┘                             │
│                  │                                     │
│                  ▼                                     │
│          ┌───────────────┐                             │
│          │  tmd index    │  → todos.json updated       │
│          └───────────────┘                             │
├─────────────────────────────────────────────────────────┤
│  PHASE 2: PUSH                                          │
│          ┌───────────────┐                             │
│          │  todos.json   │                             │
│          └───────┬───────┘                             │
│                  │ query                               │
│                  ▼                                     │
│          ┌───────────────┐    ┌───────────────┐        │
│          │  view1.md     │    │  view2.md     │        │
│          │  (regenerated)│    │  (regenerated)│        │
│          └───────────────┘    └───────────────┘        │
└─────────────────────────────────────────────────────────┘
```

---

## Error Handling

| Error | Behavior |
|-------|----------|
| No view files | Error: "No view files specified. Use --file or configure 'views'" |
| View file not found | Error: "File not found: xxx" |
| No tmd:start block | Warning: "No tmd:start block found in xxx" (skip file) |
| Invalid query in marker | Error: "Invalid query in xxx: yyy" |
| Malformed block (no tmd:end) | Error: "Malformed block in xxx: missing tmd:end marker" |
| `todos.json` not found | Error: "No index found. Run `tmd index` first." |
| Task ID in view not found in index | Warning: "Task xxx not found in index" (skip task) |
| Source file write error | Error with details, abort |

---

## Implementation Plan

### Dependencies

- `indexer/index-file.ts` - Read `todos.json`
- `indexer/indexer.ts` - Run indexing after pull
- `cli/list-filters.ts` - Reuse filter logic
- `editor/task-editor.ts` - Reuse done marking logic

### Files to Create

```
src/
├── cli/
│   └── sync-command.ts       # Command handler
└── sync/
    ├── tmd-block.ts          # Parse/replace tmd:start/tmd:end blocks
    ├── view-parser.ts        # Parse tasks from view blocks
    ├── pull-done.ts          # Pull done tasks from views to source
    └── task-renderer.ts      # Render tasks as markdown
```

### Implementation Steps

#### Phase 1: Pull

1. **View parser** (`sync/view-parser.ts`)
   ```typescript
   interface ViewTask {
     globalId: string;     // From [id:xxx] in the line
     completed: boolean;   // [x] or [ ]
     line: number;
   }

   function parseTasksInBlock(blockContent: string): ViewTask[]
   ```

2. **Pull done logic** (`sync/pull-done.ts`)
   ```typescript
   interface PullResult {
     markedDone: Array<{
       globalId: string;
       sourceFile: string;
       sourceLine: number;
       foundInView: string;
     }>;
     alreadyDone: string[];  // globalIds that were already done
   }

   async function pullDoneTasks(
     viewFiles: string[],
     index: TaskIndex
   ): Promise<PullResult>
   ```
   - For each view file, find tmd blocks
   - Parse tasks in blocks
   - Find tasks with `[x]`
   - Look up in index by global ID
   - If source has `[ ]`, mark as done (reuse `tmd done` logic)

3. **Reindex**
   - After all done tasks are marked in source files
   - Run `tmd index` to update `todos.json`

#### Phase 2: Push

4. **Block parser** (`sync/tmd-block.ts`)
   ```typescript
   interface TmdBlock {
     startLine: number;
     endLine: number;
     query: string;
     content: string;  // Current content between markers
   }

   function findTmdBlocks(content: string): TmdBlock[]
   function replaceBlockContent(
     content: string,
     block: TmdBlock,
     newContent: string
   ): string
   ```

5. **Query parser**
   - Parse query string from marker (key:value pairs)
   - Convert to filter options (reuse from `list`)
   - Same filter engine for CLI and embedded queries

6. **Task renderer** (`sync/task-renderer.ts`)
   ```typescript
   function renderTasksAsMarkdown(tasks: Task[]): string
   ```
   - Render each task as checkbox line
   - Include global ID and metadata

7. **Command handler** (`sync-command.ts`)
   ```typescript
   async function syncCommand(options: SyncOptions) {
     // Resolve view files
     const viewFiles = options.files.length > 0
       ? options.files
       : config.views || [];

     if (!options.pushOnly) {
       // Phase 1: Pull
       const pullResult = await pullDoneTasks(viewFiles, index);
       if (pullResult.markedDone.length > 0) {
         await runIndex();  // Reindex
       }
     }

     if (!options.pullOnly) {
       // Phase 2: Push
       for (const viewFile of viewFiles) {
         await regenerateViewBlocks(viewFile, index);
       }
     }
   }
   ```

### Testing Strategy

**Pull tests:**
- View has done task, source has open → mark done in source
- View has done task, source already done → no change
- View has open task, source has open → no change
- Multiple views with same task done → mark once
- Task ID not found → skip with warning

**Push tests:**
- Single block file
- Multiple blocks file
- Empty query result
- Invalid query
- Missing tmd:end marker

**Integration tests:**
- Full cycle: edit view → sync → verify source updated → verify view regenerated
- Dry run shows correct changes
- `--pull-only` and `--push-only` work correctly

---

## Future Enhancements (Low Priority)

1. **Named views with query in config**
   ```json
   {
     "views": {
       "00-daily-focus.md": { "query": "bucket:today" },
       "light-tasks.md": { "query": "energy:low status:open" }
     }
   }
   ```

2. **Sync metadata changes** (not just checkbox)
   - Pull back changes to `bucket:`, `plan:`, `priority:`
   - More complex conflict resolution needed

3. **Watch mode**
   ```bash
   tmd sync --watch
   ```
   - Auto-sync when view files change

---

## Related

- `02-list.md` - Query syntax and filters
- `cli-architecture.md` - Auto-generated block spec
