# Command: `tmd add`

**Tier**: 2 (Task Manipulation)
**Priority**: High - create tasks via CLI

---

## Purpose

Add a new task to a project in the source markdown file. Automatically generates the next available ID based on existing tasks.

---

## Usage

```bash
tmd add <project-id> "<task text>" [options]
```

## Arguments

| Argument | Description | Required |
|----------|-------------|----------|
| `<project-id>` | Project to add task to (e.g., `inbox`, `as-onb`) | Yes |
| `<task text>` | Task description text | Yes |

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--parent <id>` | Add as subtask under this local ID | none (top-level) |
| `--energy <level>` | Set energy level (low, normal, high) | none |
| `--est <duration>` | Set estimate (15m, 30m, 1h, etc.) | none |
| `--due <date>` | Set due date (YYYY-MM-DD) | none |
| `--plan <date>` | Set planned work date (YYYY-MM-DD, or `today`, `tomorrow`) | none |
| `--bucket <name>` | Set planning bucket (today, upcoming, anytime, someday, or custom) | none |
| `--area <name>` | Override area | inherited from project |
| `--tags <tags>` | Add tags (comma-separated) | none |
| `--json` | Output as JSON | `false` |
| `--no-reindex` | Don't update `todos.json` after add | `false` |
| `--no-sync` | Don't run `tmd sync` after add | `false` |

---

## Examples

```bash
# Add to inbox (simplest case)
tmd add inbox "Call bank about card"

# Add with metadata
tmd add inbox "Call bank about card" --energy low --est 15m

# Add to specific project
tmd add as-onb "Write documentation" --est 2h

# Add as subtask
tmd add as-onb "Test email variants" --parent 1

# Add with due date
tmd add inbox "Pay rent" --due 2025-12-31

# Add with tags
tmd add inbox "Review PR" --tags code,urgent

# Add task to "today" bucket (daily planning category)
tmd add inbox "Call bank" --bucket today

# Add task with specific planned work date
tmd add inbox "Review docs" --plan 2025-12-15

# Add task planned for today (resolves to actual date like 2025-12-09)
tmd add inbox "Urgent call" --plan today

# Add task to "today" bucket AND set plan date to today
tmd add inbox "Must do now" --bucket today --plan today

# Skip auto-sync (don't update tmd:start/tmd:end blocks)
tmd add inbox "Quick task" --no-sync
```

---

## Output

### Text (default)

```
Added: as-onb:3 (Write documentation)
  File: projects/autosenso.md
  Line: 28
```

### As subtask

```
Added: as-onb:1.3 (Test email variants)
  Parent: as-onb:1 (Draft welcome email)
  File: projects/autosenso.md
  Line: 18
```

### JSON (`--json`)

```json
{
  "success": true,
  "task": {
    "globalId": "as-onb:3",
    "localId": "3",
    "projectId": "as-onb",
    "text": "Write documentation",
    "metadata": {
      "est": "2h"
    }
  },
  "file": {
    "path": "projects/autosenso.md",
    "line": 28
  },
  "reindexed": true,
  "synced": true
}
```

---

## ID Generation

### Top-level task

1. Find all top-level tasks in the project
2. Extract their local IDs (e.g., `1`, `2`, `5`)
3. Find max numeric ID
4. New ID = max + 1

Example: existing `1`, `2`, `3` → new task gets `4`

### Subtask (with `--parent`)

1. Find all children of parent task
2. Extract their local IDs (e.g., `1.1`, `1.2`)
3. Find max suffix
4. New ID = parent + "." + (max + 1)

Example: parent `1` has children `1.1`, `1.2` → new subtask gets `1.3`

### Edge cases

- First task in project → ID is `1`
- First subtask → parent ID + `.1`
- Gaps allowed (don't reuse deleted IDs)

---

## Insertion Location

### Top-level task

- Find the project heading
- Find the last top-level task in that project
- Insert after it (or after heading if no tasks)

### Subtask

- Find the parent task line
- Find the last sibling at same indent level
- Insert after it (maintaining correct indentation)

---

## Generated Line Format

```markdown
- [ ] Task text [id:X key:value ...]
```

With correct indentation for subtasks.

Example:
```markdown
- [ ] Write documentation [id:3 est:2h]
```

Subtask:
```markdown
  - [ ] Test email variants [id:1.3]
```

---

## Behavior

1. Load `todos.json` to find project and context
2. Validate project exists
3. If `--parent`, validate parent exists
4. Generate next ID
5. Build task line with metadata
6. Find insertion point in source file
7. Insert line
8. Re-index (unless `--no-reindex`)
9. **Auto-sync**: Run `tmd sync` on configured files (unless `--no-sync`)

### Auto-Sync Behavior

After adding a task:
- Automatically runs `tmd sync` to update any `tmd:start`/`tmd:end` blocks
- Sync runs on all configured files that have sync blocks
- Use `--no-sync` to skip this step (useful for batch operations)

---

## Error Handling

| Error | Behavior |
|-------|----------|
| `todos.json` not found | Error: "No index found. Run `tmd index` first." |
| Project not found | Error: "Project 'xxx' not found." |
| Parent task not found | Error: "Parent task 'xxx' not found." |
| Invalid metadata value | Error with specific message |
| File write error | Error with details |

---

## Implementation Plan

### Dependencies

- `indexer/index-file.ts` - Read `todos.json`
- `editor/task-inserter.ts` - Insert task into markdown
- `editor/id-generator.ts` - Generate next ID

### Files to Create

```
src/
├── cli/
│   └── add-command.ts        # Command handler
└── editor/
    ├── task-inserter.ts      # Insert tasks into markdown files
    └── id-generator.ts       # Generate next available ID
```

### Implementation Steps

1. **ID generator** (`editor/id-generator.ts`)
   ```typescript
   function generateNextId(
     existingIds: string[],
     parentId?: string
   ): string
   ```
   - Parse existing IDs
   - Find max
   - Return next

2. **Task inserter** (`editor/task-inserter.ts`)
   ```typescript
   interface InsertResult {
     success: boolean;
     lineNumber: number;
     error?: string;
   }

   function insertTask(
     filePath: string,
     projectId: string,
     taskLine: string,
     options: {
       afterLine?: number;      // Insert after this line
       indentLevel?: number;    // For subtasks
     }
   ): InsertResult
   ```

3. **Line builder**
   ```typescript
   function buildTaskLine(
     text: string,
     id: string,
     metadata: Record<string, string>,
     indentLevel: number
   ): string
   ```

4. **Command handler** (`add-command.ts`)
   - Parse args and flags
   - Load index
   - Validate project/parent
   - Generate ID
   - Build line
   - Find insertion point
   - Insert
   - Re-index
   - Print result

### Testing Strategy

- Add to empty project
- Add to project with existing tasks
- Add subtask
- Add deeply nested subtask
- Add with various metadata combinations
- Test ID generation edge cases
- Integration: add → re-index → verify in index

---

## Related

- `04-done.md` - Mark added task as done
- `08-edit.md` - Edit task after adding
