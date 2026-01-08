# Command: `tmd done`

**Tier**: 2 (Task Manipulation)
**Priority**: High - core workflow

---

## Purpose

Mark a task as completed by changing `- [ ]` to `- [x]` in the source markdown file.

---

## Usage

```bash
tmd done <global-id> [options]
```

## Arguments

| Argument | Description | Required |
|----------|-------------|----------|
| `<global-id>` | Task global ID (e.g., `as-onb:1.1`) | Yes |

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--json` | Output as JSON | `false` |
| `--no-reindex` | Don't update `todos.json` after edit | `false` |
| `--no-sync` | Don't run `tmd sync` after edit | `false` |

---

## Examples

```bash
# Mark task as done
tmd done as-onb:1.1

# Multiple tasks (repeat command)
tmd done as-onb:1.1
tmd done as-onb:1.2

# JSON output
tmd done inbox:1 --json

# Skip re-indexing (faster, but index out of sync)
tmd done as-onb:1 --no-reindex

# Skip auto-sync (don't update tmd:start/tmd:end blocks)
tmd done as-onb:1 --no-sync
```

---

## Output

### Text (default)

```
Marked as done: as-onb:1.1 (Subject lines A/B test)
  File: projects/autosenso.md:15
```

### With children (cascade)

```
Marked as done: as-onb:1 (Draft welcome email)
  Also marked done: 3 subtasks
    - as-onb:1.1 (Subject lines A/B test)
    - as-onb:1.2 (Write body copy)
    - as-onb:1.3 (Add tracking pixels)
  File: projects/autosenso.md:12
```

### Already done

```
Task already done: as-onb:1.1 (Subject lines A/B test)
```

### JSON (`--json`)

```json
{
  "success": true,
  "task": {
    "globalId": "as-onb:1.1",
    "text": "Subject lines A/B test",
    "previousStatus": "open",
    "newStatus": "done"
  },
  "cascaded": [
    {
      "globalId": "as-onb:1.1.1",
      "text": "Subtask example",
      "previousStatus": "open",
      "newStatus": "done"
    }
  ],
  "file": {
    "path": "projects/autosenso.md",
    "line": 15
  },
  "reindexed": true,
  "synced": true
}
```

---

## Behavior

1. Load `todos.json` to find task location
2. Read the source markdown file
3. Find the task line by line number
4. Verify it's the expected task (safety check)
5. Change `- [ ]` to `- [x]`
6. Update `updated:YYYY-MM-DD` in metadata (adds metadata block if missing)
7. **Cascade to children**: Find all descendant tasks and mark them as done too
8. Write file back
9. Re-run indexer to update `todos.json` (unless `--no-reindex`)
10. **Auto-sync**: Run `tmd sync` on configured files (unless `--no-sync`)

### Cascade Behavior

When marking a parent task as done, **all descendant tasks** (children, grandchildren, etc.) are automatically marked as done as well. This ensures task hierarchy consistency - a completed parent shouldn't have open subtasks.

- Cascade applies to all nesting levels
- Already-done children are skipped (no-op)
- Output lists all tasks that were marked done

### Auto-Sync Behavior

After marking task(s) as done:
- Automatically runs `tmd sync` to update any `tmd:start`/`tmd:end` blocks
- Sync runs on all configured files that have sync blocks
- Use `--no-sync` to skip this step (useful for batch operations)

---

## Safety Checks

Before modifying:
- Verify line number contains a checkbox
- Verify task text matches (in case file changed since last index)
- If mismatch, error and suggest re-indexing

---

## Error Handling

| Error | Behavior |
|-------|----------|
| `todos.json` not found | Error: "No index found. Run `tmd index` first." |
| Task ID not found | Error: "Task 'xxx' not found." |
| File not found | Error: "Source file not found: xxx" |
| Line mismatch | Error: "Task moved. Re-run `tmd index`." |
| Already done | Warning, no change made |
| File write error | Error with details |

---

## Implementation Plan

### Dependencies

- `indexer/index-file.ts` - Read `todos.json`
- `editor/task-editor.ts` - Modify task in markdown
- `cli/index-command.ts` - Re-index after edit

### Files to Create

```
src/
├── cli/
│   └── done-command.ts       # Command handler
└── editor/
    └── task-editor.ts        # Edit tasks in markdown files
```

### Implementation Steps

1. **Task editor** (`editor/task-editor.ts`)
   - `markTaskDone(filePath, lineNumber, expectedText)` → boolean
   - Read file, find line, validate, modify, write
   - Return success/failure

2. **Command handler** (`done-command.ts`)
   - Parse args
   - Load index, find task
   - Check if already done
   - Call task editor
   - Re-index (unless `--no-reindex`)
   - Print result

### Task Editor Implementation

```typescript
interface EditResult {
  success: boolean;
  error?: string;
  previousState?: 'open' | 'done';
  newState?: 'open' | 'done';
}

function markTaskDone(
  filePath: string,
  lineNumber: number,
  expectedText: string
): EditResult {
  // 1. Read file lines
  // 2. Get line at lineNumber (1-indexed)
  // 3. Check it matches pattern: /^(\s*)- \[ \] (.+)$/
  // 4. Verify text matches expectedText (fuzzy - ignore metadata)
  // 5. Replace [ ] with [x]
  // 6. Write file
  // 7. Return result
}
```

### Testing Strategy

- Test marking open task as done
- Test task already done (no-op)
- Test line number mismatch
- Test file not found
- Test write permissions
- Integration: edit → verify file changed → re-index → verify index updated

---

## Related

- `05-undone.md` - Reverse operation
- `03-show.md` - View task before marking done
