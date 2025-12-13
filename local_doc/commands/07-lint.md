# Command: `tmd lint`

**Tier**: 1 (Core)
**Priority**: Highest - validate format before indexing

---

## Purpose

Validate markdown files for format issues according to the task format spec. Reports errors and warnings, optionally auto-fixes issues.

---

## Usage

```bash
tmd lint [options]
```

## Options

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--file <path>` | `-f` | Input file (repeatable) | From config or `todos.md` |
| `--fix` | | Auto-fix issues where possible | `false` |
| `--json` | | Output as JSON | `false` |
| `--quiet` | `-q` | Only show errors, not warnings | `false` |

---

## Examples

```bash
# Lint default file (todos.md)
tmd lint

# Lint specific file
tmd lint --file todos.md

# Lint multiple files (todos.md first)
tmd lint -f todos.md -f projects/work.md -f projects/personal.md

# Show only errors
tmd lint --quiet

# Auto-fix where possible
tmd lint --fix

# JSON output for tooling
tmd lint --json
```

---

## File Resolution

Same as `tmd index`:
1. If `--file` flags provided → use those files
2. Else if `files` in config → use config files
3. Else → default to `todos.md`

---

## Output

### Text (default)

```
projects/autosenso.md
  Line 12: error: Duplicate ID 'as-onb:1' (first seen on line 8)
  Line 15: warning: Missing 'created' date on task as-onb:1.1
  Line 22: error: Invalid date format '12-20-2025' in due (expected YYYY-MM-DD)

inbox.md
  Line 5: warning: Task without ID (not trackable)
  Line 8: error: Orphan subtask - parent ID '99' not found

Found 3 errors, 2 warnings in 2 files
```

### JSON (`--json`)

```json
{
  "success": false,
  "files": [
    {
      "path": "projects/autosenso.md",
      "issues": [
        {
          "line": 12,
          "severity": "error",
          "rule": "duplicate-id",
          "message": "Duplicate ID 'as-onb:1' (first seen on line 8)",
          "fixable": false
        },
        {
          "line": 15,
          "severity": "warning",
          "rule": "missing-created",
          "message": "Missing 'created' date on task as-onb:1.1",
          "fixable": true
        }
      ]
    }
  ],
  "summary": {
    "filesChecked": 5,
    "filesWithIssues": 2,
    "errors": 3,
    "warnings": 2
  }
}
```

### After fix (`--fix`)

```
projects/autosenso.md
  Line 15: fixed: Added 'created:2025-12-08' to task as-onb:1.1

inbox.md
  Line 5: fixed: Generated ID 'inbox:1' for task

Fixed 2 issues. 3 errors remain (not auto-fixable).
```

---

## Lint Rules

See `lint-rules.md` for detailed rule specifications.

### Error-level rules

| Rule | Description | Fixable |
|------|-------------|---------|
| `duplicate-id` | Same global ID appears twice | No |
| `invalid-date` | Date not in YYYY-MM-DD format | No |
| `invalid-metadata` | Malformed `[key:value]` block | No |
| `orphan-subtask` | Subtask references non-existent parent | No |
| `invalid-energy` | Energy not one of: low, normal, high | No |

### Warning-level rules

| Rule | Description | Fixable |
|------|-------------|---------|
| `missing-id` | Checkbox task without `id:` | Yes |
| `missing-created` | Task without `created:` date | Yes |
| `project-without-id` | Project heading without `project:` | No |

---

## Behavior

1. Resolve input files (from `--file` flags, config, or default `todos.md`)
2. Parse each file
3. Run all lint rules
4. Collect issues by file
5. If `--fix`, apply fixable changes
6. Report results
7. Exit code: 0 if no errors, 1 if errors

---

## Error Handling

| Error | Behavior |
|-------|----------|
| File not found | Error: "File not found: xxx" |
| No files specified (and no default) | Error: "No input files. Use --file or configure 'files'" |
| File parse error | Report as lint error, continue |
| Fix write error | Error with details |

---

## Implementation Plan

### Dependencies

- `parser/*` - Parse markdown files
- `linter/rules/*` - Individual rule implementations

### Files to Create

```
src/
├── cli/
│   └── lint-command.ts       # Command handler
└── linter/
    ├── linter.ts             # Main linter orchestrator
    ├── types.ts              # LintIssue, LintResult types
    └── rules/
        ├── index.ts          # Export all rules
        ├── duplicate-id.ts
        ├── invalid-date.ts
        ├── invalid-metadata.ts
        ├── orphan-subtask.ts
        ├── missing-id.ts
        └── missing-created.ts
```

### Implementation Steps

1. **Types** (`linter/types.ts`)
   ```typescript
   type Severity = 'error' | 'warning';

   interface LintIssue {
     file: string;
     line: number;
     severity: Severity;
     rule: string;
     message: string;
     fixable: boolean;
     fix?: () => void;
   }

   interface LintResult {
     issues: LintIssue[];
     fixed: number;
   }
   ```

2. **Rule interface**
   ```typescript
   interface LintRule {
     name: string;
     severity: Severity;
     check(context: LintContext): LintIssue[];
   }

   interface LintContext {
     filePath: string;
     content: string;
     tasks: ParsedTask[];
     projects: ParsedProject[];
     allTasks: Map<string, ParsedTask>;  // For cross-file checks
   }
   ```

3. **Individual rules**
   - Each rule is a separate file
   - Implements `LintRule` interface
   - Returns array of issues

4. **Linter orchestrator** (`linter/linter.ts`)
   - Load all rules
   - For each file: parse → run rules → collect issues
   - Cross-file rules (duplicate-id) run after all files parsed
   - Apply fixes if requested

5. **Command handler** (`lint-command.ts`)
   - Parse flags
   - Call linter
   - Format output
   - Set exit code

### Testing Strategy

- Unit test each rule with sample inputs
- Test fix application
- Integration: sample files with known issues → expected output
- Edge cases: missing file, no tasks, malformed files

---

## Related

- `lint-rules.md` - Detailed rule specifications (TBD - user input needed)
- `01-index.md` - Re-index after lint fix
