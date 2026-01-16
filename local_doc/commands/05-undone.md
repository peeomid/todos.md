# Command: `tmd undone`

**Tier**: 2 (Task Manipulation)
**Priority**: High - undo capability

---

## Purpose

Mark a task as incomplete by changing `- [x]` to `- [ ]` in the source markdown file. Reverse of `tmd done`.

---

## Usage

```bash
tmd undone <global-id> [options]
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
# Mark task as undone
tmd undone as-onb:1.1

# JSON output
tmd undone inbox:1 --json

# Skip auto-sync (don't update tmd:start/tmd:end blocks)
tmd undone as-onb:1 --no-sync
```

---

## Output

### Text (default)

```
Marked as undone: as-onb:1.1 (Subject lines A/B test)
  File: projects/autosenso.md:15
```

### Already open

```
Task already open: as-onb:1.1 (Subject lines A/B test)
```

### JSON (`--json`)

```json
{
  "success": true,
  "task": {
    "globalId": "as-onb:1.1",
    "text": "Subject lines A/B test",
    "previousStatus": "done",
    "newStatus": "open"
  },
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
5. Change `- [x]` to `- [ ]`
6. Update `updated:YYYY-MM-DD` in metadata (adds metadata block if missing)
7. Clear `completedAt` if present
8. Write file back
9. Re-run indexer to update `todos.json` (unless `--no-reindex`)
10. **Auto-sync**: Run `tmd sync` on configured files (unless `--no-sync`)

### No Cascade Behavior

Unlike `tmd done`, marking a task as undone does **NOT** cascade to children. Only the specified task is marked as undone; children remain in their current state.

Rationale: When reopening a parent task, you may only need to redo part of it. The children's completion status reflects actual work done and shouldn't be automatically reverted.

### Auto-Sync Behavior

After marking task as undone:
- Automatically runs `tmd sync` to update any `tmd:start`/`tmd:end` blocks
- Sync runs on all configured files that have sync blocks
- Use `--no-sync` to skip this step (useful for batch operations)

---

## Error Handling

Same as `tmd done`.

---

## Implementation Plan

### Dependencies

- Reuses `editor/task-editor.ts` from `done` command

### Files to Create

```
src/cli/
└── undone-command.ts         # Command handler
```

### Implementation Steps

1. Add `markTaskUndone()` to `task-editor.ts`
   - Or generalize to `setTaskStatus(filePath, line, status)`

2. Command handler (nearly identical to `done`)
   - Parse args
   - Load index
   - Check if already open
   - Call editor
   - Re-index
   - Print result

### Shared Implementation

Consider refactoring `done` and `undone` to share code:

```typescript
// task-editor.ts
function setTaskStatus(
  filePath: string,
  lineNumber: number,
  expectedText: string,
  newStatus: 'open' | 'done'
): EditResult

// done-command.ts
setTaskStatus(path, line, text, 'done')

// undone-command.ts
setTaskStatus(path, line, text, 'open')
```

---

## Related

- `04-done.md` - Reverse operation
