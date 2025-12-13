# Command: `tmd edit`

**Tier**: 3 (Advanced Editing)
**Priority**: Medium - modify task metadata

---

## Purpose

Edit task metadata (energy, due date, estimate, tags, etc.) without changing the task text. Modifies the `[key:value ...]` block in the source markdown.

---

## Usage

```bash
tmd edit <global-id> [options]
```

## Arguments

| Argument | Description | Required |
|----------|-------------|----------|
| `<global-id>` | Task global ID (e.g., `as-onb:1.1`) | Yes |

## Options

| Flag | Description |
|------|-------------|
| `--energy <level>` | Set energy (low, normal, high) |
| `--est <duration>` | Set estimate (15m, 30m, 1h, etc.) |
| `--due <date>` | Set due date (YYYY-MM-DD, or `none` to remove) |
| `--plan <date>` | Set planned work date (YYYY-MM-DD, `today`, `tomorrow`, or `none` to remove) |
| `--bucket <name>` | Set planning bucket (today, upcoming, anytime, someday, custom, or `none` to remove) |
| `--area <name>` | Set area |
| `--tags <tags>` | Set tags (comma-separated, or `none` to remove) |
| `--add-tag <tag>` | Add a single tag |
| `--remove-tag <tag>` | Remove a single tag |
| `--json` | Output as JSON |
| `--no-reindex` | Don't update `todos.json` after edit |
| `--no-sync` | Don't run `tmd sync` after edit |

---

## Examples

```bash
# Set due date
tmd edit as-onb:1.1 --due 2025-12-20

# Change energy level
tmd edit inbox:1 --energy high

# Move task to "today" bucket (daily planning category)
tmd edit inbox:1 --bucket today

# Set planned work date (resolves "today" to actual date like 2025-12-09)
tmd edit as-onb:1 --plan today

# Set specific planned work date
tmd edit as-onb:1 --plan 2025-12-15

# Move task to "today" bucket AND set plan date
tmd edit inbox:1 --bucket today --plan today

# Move task to upcoming bucket
tmd edit inbox:1 --bucket upcoming

# Remove plan date
tmd edit inbox:1 --plan none

# Set multiple fields
tmd edit as-onb:2 --due 2025-12-25 --energy normal --est 2h

# Remove due date
tmd edit inbox:1 --due none

# Add a tag
tmd edit as-onb:1 --add-tag urgent

# Remove a tag
tmd edit as-onb:1 --remove-tag urgent

# Replace all tags
tmd edit inbox:1 --tags email,admin

# Skip auto-sync (don't update tmd:start/tmd:end blocks)
tmd edit as-onb:1 --due 2025-12-25 --no-sync
```

---

## Output

### Text (default)

```
Updated: as-onb:1.1 (Subject lines A/B test)
  Changed: due (none → 2025-12-20)
  File: projects/autosenso.md:15
```

### Multiple changes

```
Updated: as-onb:2 (Implement tracking code)
  Changed: due (2025-12-15 → 2025-12-25)
  Changed: energy (low → normal)
  Added: est (2h)
  File: projects/autosenso.md:22
```

### JSON (`--json`)

```json
{
  "success": true,
  "task": {
    "globalId": "as-onb:1.1",
    "text": "Subject lines A/B test"
  },
  "changes": [
    {
      "field": "due",
      "previousValue": null,
      "newValue": "2025-12-20"
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

## Metadata Block Handling

### Adding new field

Before:
```markdown
- [ ] Task text [id:1 energy:low]
```

After `--due 2025-12-20`:
```markdown
- [ ] Task text [id:1 energy:low due:2025-12-20]
```

### Modifying existing field

Before:
```markdown
- [ ] Task text [id:1 energy:low due:2025-12-15]
```

After `--due 2025-12-20`:
```markdown
- [ ] Task text [id:1 energy:low due:2025-12-20]
```

### Removing field

Before:
```markdown
- [ ] Task text [id:1 energy:low due:2025-12-15]
```

After `--due none`:
```markdown
- [ ] Task text [id:1 energy:low]
```

### Tag operations

Before:
```markdown
- [ ] Task text [id:1 tags:email,phone]
```

After `--add-tag urgent`:
```markdown
- [ ] Task text [id:1 tags:email,phone,urgent]
```

After `--remove-tag email`:
```markdown
- [ ] Task text [id:1 tags:phone,urgent]
```

---

## Behavior

1. Load `todos.json` to find task
2. Read source file
3. Parse the task line's metadata block
4. Apply changes
5. Rebuild metadata block
6. Write file
7. Re-index (unless `--no-reindex`)
8. **Auto-sync**: Run `tmd sync` on configured files (unless `--no-sync`)

### Auto-Sync Behavior

After editing a task:
- Automatically runs `tmd sync` to update any `tmd:start`/`tmd:end` blocks
- Sync runs on all configured files that have sync blocks
- Use `--no-sync` to skip this step (useful for batch operations)

---

## Error Handling

| Error | Behavior |
|-------|----------|
| `todos.json` not found | Error: "No index found. Run `tmd index` first." |
| Task not found | Error: "Task 'xxx' not found." |
| Invalid value (e.g., bad date) | Error with specific message |
| No changes specified | Error: "No changes specified." |
| File write error | Error with details |

---

## Implementation Plan

### Dependencies

- `indexer/index-file.ts` - Read `todos.json`
- `editor/task-editor.ts` - Modify task in markdown
- `parser/metadata-parser.ts` - Parse and rebuild metadata

### Files to Create/Modify

```
src/
├── cli/
│   └── edit-command.ts       # Command handler
└── editor/
    └── metadata-editor.ts    # Edit metadata in task line
```

### Implementation Steps

1. **Metadata editor** (`editor/metadata-editor.ts`)
   ```typescript
   interface MetadataChange {
     field: string;
     value: string | null;  // null = remove
   }

   function editTaskMetadata(
     filePath: string,
     lineNumber: number,
     changes: MetadataChange[]
   ): EditResult
   ```

2. **Metadata rebuilder**
   - Parse existing `[key:value ...]` block
   - Apply changes (add/modify/remove)
   - Rebuild block string
   - Preserve field order (id first, then alphabetical)

3. **Command handler** (`edit-command.ts`)
   - Parse args and flags
   - Build change list
   - Validate values
   - Call metadata editor
   - Re-index
   - Print changes

### Testing Strategy

- Add new field
- Modify existing field
- Remove field
- Tag operations (add, remove, replace)
- Multiple changes at once
- Invalid values rejected
- Integration: edit → re-index → verify

---

## Related

- `03-show.md` - View task before editing
- `04-done.md` - Uses similar editing approach
