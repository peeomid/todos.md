# Command: `tmd enrich`

**Tier**: 1 (Core)
**Priority**: High - transforms human-friendly input to canonical format

---

## Purpose

Enrich markdown task files by converting human-friendly shorthands into canonical metadata format. This is the command you run after quickly jotting down tasks to normalize them.

---

## Usage

```bash
tmd enrich [options]
```

## Options

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--file <path>` | `-f` | Input file (repeatable) | From config or `todos.md` |
| `--keep-shorthands` | | Don't strip shorthands from text after conversion | `false` |
| `--dry-run` | | Show what would change without modifying files | `false` |
| `--json` | | Output as JSON | `false` |

---

## Examples

```bash
# Enrich default file (todos.md)
tmd enrich

# Enrich specific file
tmd enrich --file todos.md

# Preview changes without writing
tmd enrich --dry-run

# Keep visual markers in task text
tmd enrich --keep-shorthands

# JSON output for tooling
tmd enrich --json
```

---

## What Enrich Does

### 1. Convert Shorthands to Canonical Metadata

Shorthands are parsed in a specific order to handle combinations correctly.

#### Parsing Order

**Step 1 – Priority shorthand `(A)`/`(B)`/`(C)`**

Look immediately after `- [ ]`/`- [x]` for priority marker:

| Shorthand | Converts To |
|-----------|-------------|
| `(A)` | `priority:high` |
| `(B)` | `priority:normal` |
| `(C)` | `priority:low` |

**Step 2 – Bucket shorthand symbols `*`/`!`/`>`/`~`/`?`**

Look for bucket symbol after optional priority:

| Symbol | Converts To |
|--------|-------------|
| `*` | `bucket:now` |
| `!` | `bucket:today` + `plan:YYYY-MM-DD` (today's date) |
| `>` | `bucket:upcoming` |
| `~` | `bucket:anytime` |
| `?` | `bucket:someday` |

**Step 3 – `@tags` in task text**

Scan task text for @tags:

| Shorthand | Converts To |
|-----------|-------------|
| `@now` | `bucket:now` |
| `@today` | `bucket:today` + `plan:YYYY-MM-DD` (today's date) |
| `@upcoming` | `bucket:upcoming` |
| `@anytime` | `bucket:anytime` |
| `@someday` | `bucket:someday` |

**Precedence:** If both symbol (`!`/`>`/`~`/`?`) and `@tag` are present, the symbol takes priority for bucket.

### 2. Auto-generate Missing IDs

Tasks without `id:` get the next available ID **within their parent context**, based on indentation:

- **Top-level tasks** (no indentation relative to the current list block) get the next integer ID in the project: `1`, `2`, `3`, …
- **Subtasks** (indented under a parent task) get the next dotted ID under that parent: `8.1`, `8.2`, …
- **Deeper nesting** continues the pattern: `8.2.1`, `8.2.2`, …

Enrich uses **indentation** to determine parent/child relationships when generating missing IDs.

### 3. Add `created` Date

Tasks with `id:` but no `created:` get today's date.

### 4. Set `updated` Timestamp

When enrich modifies a task's metadata, it sets `updated:` to today's date.

---

## Transformation Examples

### Before enrich (what you type quickly):

```markdown
# Inbox [project:inbox area:life]

- [ ] (A) ! Call bank about card
- [ ] (B) Buy groceries @today
- [ ] (A) > Review quarterly goals
- [ ] (C) ~ Organize photos
- [ ] ? Learn a new language
- [ ] Task without any shorthand
```

### After `tmd enrich` (on 2025-12-09):

```markdown
# Inbox [project:inbox area:life]

- [ ] Call bank about card [id:1 created:2025-12-09 plan:2025-12-09 bucket:today priority:high]
- [ ] Buy groceries [id:2 created:2025-12-09 plan:2025-12-09 bucket:today priority:normal]
- [ ] Review quarterly goals [id:3 created:2025-12-09 bucket:upcoming priority:high]
- [ ] Organize photos [id:4 created:2025-12-09 bucket:anytime priority:low]
- [ ] Learn a new language [id:5 created:2025-12-09 bucket:someday]
- [ ] Task without any shorthand [id:6 created:2025-12-09]
```

### With `--keep-shorthands`:

```markdown
- [ ] (A) ! Call bank about card [id:1 created:2025-12-09 plan:2025-12-09 bucket:today priority:high]
- [ ] (B) Buy groceries @today [id:2 created:2025-12-09 plan:2025-12-09 bucket:today priority:normal]
```

---

## Output

### Text (default)

```
Enriched: todos.md
  Tasks modified: 6
  - inbox:1 - Added id, created, plan, bucket, priority (from (A) !)
  - inbox:2 - Added id, created, plan, bucket, priority (from (B) @today)
  - inbox:3 - Added id, created, bucket, priority (from (A) >)
  - inbox:4 - Added id, created, bucket, priority (from (C) ~)
  - inbox:5 - Added id, created, bucket (from ?)
  - inbox:6 - Added id, created
```

### Dry run

```
Would enrich: todos.md
  Tasks to modify: 6
  - Line 5: "(A) ! Call bank" → add id:1, created, plan, bucket, priority
  - Line 6: "(B) Buy groceries @today" → add id:2, created, plan, bucket, priority
  ...

No files modified (dry run).
```

### JSON (`--json`)

```json
{
  "success": true,
  "files": [
    {
      "path": "todos.md",
      "tasksModified": 6,
      "changes": [
        {
          "line": 5,
          "taskText": "Call bank about card",
          "added": ["id:1", "created:2025-12-09", "plan:2025-12-09", "bucket:today", "priority:high"],
          "shorthandsFound": ["(A)", "!"]
        }
      ]
    }
  ],
  "summary": {
    "filesProcessed": 1,
    "totalTasksModified": 6
  },
  "dryRun": false
}
```

---

## Behavior

1. Resolve input files (from `--file` flags, config, or default `todos.md`)
2. Parse each file to find tasks
3. For each task:
   - Check for priority shorthand (`(A)`, `(B)`, `(C)`) immediately after checkbox
   - If priority shorthand found: set `priority:high|normal|low`
   - Check for symbol shorthand (`!`, `>`, `~`, `?`) after optional priority
   - Check for `@tag` shorthand (`@today`, `@upcoming`, `@anytime`, `@someday`) in text
   - If bucket shorthand found: set `bucket:` and optionally `plan:`
   - If no `id:`: generate next available ID
   - If has `id:` but no `created:`: add `created:` with today's date
   - If any metadata changed: set `updated:` to today's date
   - Strip shorthands from text (unless `--keep-shorthands`)
4. Write modified files (unless `--dry-run`)

---

## Shorthand Priority

If both symbol and @tag are present, the symbol takes priority:

```markdown
- [ ] ! Task @someday [id:1]
```

Result: `bucket:today`, `plan:2025-12-09` (symbol `!` wins over `@someday`)

---

## Error Handling

| Error | Behavior |
|-------|----------|
| File not found | Error: "File not found: xxx" |
| No files specified | Error: "No input files. Use --file or configure 'files'" |
| Parse error in file | Warning, skip file, continue |
| File write error | Error with details |

---

## Implementation Plan

### Dependencies

- `parser/markdown-parser.ts` - Parse markdown files
- `parser/metadata-parser.ts` - Parse and rebuild metadata blocks
- `editor/id-generator.ts` - Generate next available ID

### Files to Create

```
src/
├── cli/
│   └── enrich-command.ts      # Command handler
└── enricher/
    ├── enricher.ts            # Main enrichment logic
    ├── shorthand-parser.ts    # Parse shorthands from task text
    └── types.ts               # EnrichResult, EnrichChange types
```

### Implementation Steps

1. **Shorthand parser** (`enricher/shorthand-parser.ts`)
   ```typescript
   interface ShorthandResult {
     priority?: 'high' | 'normal' | 'low';
     bucket?: string;
     plan?: string;        // Only for today shorthands
     cleanedText: string;  // Text with shorthand removed
     shorthandsFound: string[];  // e.g., ['(A)', '!'] or ['@today']
   }

   function parseShorthands(text: string, keepShorthands: boolean): ShorthandResult
   ```

   Parsing order:
   1. Check for `(A)`/`(B)`/`(C)` immediately after checkbox
   2. Check for `!`/`>`/`~`/`?` after optional priority
   3. Check for `@today`/`@upcoming`/`@anytime`/`@someday` in text

2. **Enricher** (`enricher/enricher.ts`)
   ```typescript
   interface EnrichOptions {
     keepShorthands: boolean;
     dryRun: boolean;
   }

   interface EnrichResult {
     filePath: string;
     changes: EnrichChange[];
     content: string;  // Modified content (if not dry run)
   }

   function enrichFile(filePath: string, options: EnrichOptions): EnrichResult
   ```

3. **Command handler** (`cli/enrich-command.ts`)
   - Parse flags
   - Resolve files
   - Call enricher for each file
   - Write files (unless dry-run)
   - Format and print output

### Testing Strategy

- Unit tests for shorthand parser (all shorthand types)
  - Priority shorthands: `(A)`, `(B)`, `(C)`
  - Bucket shorthands: `!`, `>`, `~`, `?`
  - @tag shorthands: `@today`, `@upcoming`, `@anytime`, `@someday`
  - Combinations: `(A) !`, `(B) @today`, etc.
- Unit tests for ID generation
- Integration test: sample file → expected enriched output
- Test `--keep-shorthands` flag
- Test `--dry-run` flag
- Test bucket precedence (symbol wins over @tag)

---

## Related

- `07-lint.md` - Lint warns about missing IDs, enrich fixes them
- `01-index.md` - Run after enrich to update todos.json
- `todo-format-spec.md` - Shorthand definitions
