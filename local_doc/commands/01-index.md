# Command: `tmd index`

**Tier**: 1 (Core)
**Priority**: Highest - must be implemented first

---

## Purpose

Parse specified markdown files, extract tasks and projects following the format spec, and generate a structured `todos.json` index file.

This is the foundation command - all other commands depend on the index.

---

## Usage

```bash
tmd index [options]
```

## Options

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--file <path>` | `-f` | Input file (repeatable) | From config or `todos.md` |
| `--output <path>` | `-o` | Output file path | `todos.json` |
| `--quiet` | `-q` | Suppress output except errors | `false` |
| `--json` | | Output summary as JSON | `false` |

---

## Examples

```bash
# Default - parse todos.md, output todos.json
tmd index

# Specify single file
tmd index --file todos.md

# Multiple files (todos.md first)
tmd index -f todos.md -f projects/work.md -f projects/personal.md

# Specify output file
tmd index --output my-tasks.json

# Quiet mode for scripts
tmd index --quiet

# JSON output for programmatic use
tmd index --json
```

---

## File Resolution

1. If `--file` flags provided → use those files
2. Else if `files` in config → use config files
3. Else → default to `todos.md`

All paths are relative to current working directory.

---

## Output

### Text (default)

```
Parsing 3 file(s)...
  - todos.md
  - projects/work.md
  - projects/personal.md
Found 3 projects, 47 tasks (38 open, 9 done)
Written to: todos.json
```

### JSON (`--json`)

```json
{
  "success": true,
  "files": [
    "todos.md",
    "projects/work.md",
    "projects/personal.md"
  ],
  "output": "todos.json",
  "stats": {
    "filesParsed": 3,
    "projects": 3,
    "tasks": {
      "total": 47,
      "open": 38,
      "done": 9
    }
  }
}
```

---

## Behavior

1. Resolve input files (from `--file` flags, config, or default `todos.md`)
2. For each file:
   - Check file exists
   - Parse frontmatter (check `task_format_version`)
   - Extract project headings with `[project:...]` metadata
   - Extract tasks (checkbox items with `[id:...]`)
   - Build parent/child hierarchy from indentation
3. Construct global IDs (`project:localId`)
4. Validate uniqueness of global IDs
5. Apply inherited values (see below)
6. Write `todos.json` to output path

---

## Inherited Values

When building the index, certain values are inherited from the project if not explicitly set on the task. This keeps the markdown clean while providing complete data in the index.

| Field | Inheritance Rule |
|-------|------------------|
| `area` | If task has no `area:`, inherit from project heading's `area:` |
| `energy` | If task has no `energy:`, default to `normal` in index |
| `created` | If task has no `created:`, set to today's date in index |

**Important**: These inherited/default values are only set in `todos.json`, NOT written back to the markdown files. The markdown stays minimal.

---

## Error Handling

| Error | Behavior |
|-------|----------|
| File not found | Error: "File not found: xxx" |
| No files specified (and no default) | Error: "No input files. Use --file or configure 'files'" |
| Parse error in file | Warning, skip file, continue |
| Duplicate global ID | Warning, include both with note |
| Output path not writable | Exit with error |

---

## Implementation Plan

### Dependencies

- `parser/markdown-parser.ts` - Parse single markdown file
- `parser/metadata-parser.ts` - Parse `[key:value ...]` blocks
- `parser/frontmatter.ts` - Parse YAML frontmatter
- `parser/hierarchy.ts` - Build parent/child from indentation
- `indexer/indexer.ts` - Orchestrate full indexing
- `indexer/index-file.ts` - Write `todos.json`
- `schema/index.ts` - Zod schema for output validation

### Files to Create

```
src/
├── cli/
│   └── index-command.ts      # Command handler
├── parser/
│   ├── markdown-parser.ts
│   ├── metadata-parser.ts
│   ├── frontmatter.ts
│   ├── hierarchy.ts
│   └── types.ts
├── indexer/
│   ├── indexer.ts
│   ├── index-file.ts
│   └── types.ts
└── schema/
    ├── task.ts
    ├── project.ts
    └── index.ts
```

### Implementation Steps

1. **Schema definitions** (`schema/`)
   - Define Zod schemas for Task, Project, TaskIndex
   - Export TypeScript types

2. **Metadata parser** (`parser/metadata-parser.ts`)
   - Parse `[key:value key2:value2]` format
   - Handle edge cases (empty, malformed)
   - Return typed metadata object

3. **Frontmatter parser** (`parser/frontmatter.ts`)
   - Parse YAML frontmatter between `---` markers
   - Extract `task_format_version`

4. **Markdown parser** (`parser/markdown-parser.ts`)
   - Read file content
   - Find project headings (`# ... [project:...]`)
   - Find task lines (`- [ ]` or `- [x]` with `[id:...]`)
   - Extract text, metadata, line numbers, indent levels

5. **Hierarchy builder** (`parser/hierarchy.ts`)
   - Take flat list of parsed tasks
   - Build parent/child relationships from indentation
   - Assign `parentId` and `childrenIds`

6. **Indexer** (`indexer/indexer.ts`)
   - Take list of file paths
   - For each file: parse → extract → hierarchy
   - Merge results across files
   - Validate (duplicate IDs, etc.)
   - Collect stats (files, projects, tasks)

7. **Index file writer** (`indexer/index-file.ts`)
   - Serialize TaskIndex to JSON
   - Write atomically (temp file → rename)

8. **Command handler** (`cli/index-command.ts`)
   - Parse `--file` flags
   - Resolve files (flags → config → default)
   - Call indexer
   - Format and print output

### Testing Strategy

- Unit tests for metadata parser (various formats)
- Unit tests for hierarchy builder (nested tasks)
- Integration test: sample files → expected `todos.json`
- Edge cases: missing file, no tasks, malformed files, default file

---

## Related

- `todo-format-spec.md` - Format specification being parsed
- `cli-architecture.md` - Overall architecture
- Schema for `todos.json` output in `schema/index.ts`
