# TMD CLI Architecture

This document captures the agreed architecture and structure for the `tmd` (Todo Markdown) CLI tool.

---

## 1. Overview

`tmd` is a CLI tool that:

- Parses Markdown files containing tasks (following the format in `todo-format-spec.md`)
- Generates a structured `todos.json` index
- Provides commands to list, filter, add, edit, and complete tasks
- Generates view files (daily, weekly, light-tasks) from the index
- Lints markdown files for format issues

The tool follows patterns from [mcporter](https://github.com/steipete/mcporter), including:
- Custom argument parsing (not relying heavily on commander.js)
- Data-driven help system
- Smart command inference
- Terminal color support with `NO_COLOR`/`FORCE_COLOR` respect

---

## 2. Design Principles

1. **Markdown-first**: Tasks live in `.md` files, not a database
2. **Index is derived**: `todos.json` is generated from markdown, not the source of truth
3. **Zero-config friendly**: Works with sensible defaults, no setup required
4. **Readable output**: Human-friendly text by default, `--json` for machine use
5. **AI-friendly**: Structured output for local AI agent integration

---

## 3. Project Structure

```
todosmd/
├── src/
│   ├── cli.ts                     # Entry point, command routing
│   ├── cli/
│   │   ├── cli-factory.ts         # Global context builder
│   │   ├── command-inference.ts   # Smart command routing
│   │   ├── flag-utils.ts          # Flag extraction helpers
│   │   ├── terminal.ts            # ANSI colors, TTY detection
│   │   ├── errors.ts              # Custom error classes
│   │   ├── help.ts                # Help system
│   │   │
│   │   ├── index-command.ts       # tmd index
│   │   ├── list-command.ts        # tmd list
│   │   ├── show-command.ts        # tmd show <id>
│   │   ├── lint-command.ts        # tmd lint
│   │   ├── sync-command.ts        # tmd sync --file <path>
│   │   ├── add-command.ts         # tmd add
│   │   ├── done-command.ts        # tmd done <id>
│   │   ├── edit-command.ts        # tmd edit <id>
│   │   ├── init-command.ts        # tmd init (workspace scaffold)
│   │   │
│   │   └── config/
│   │       ├── init.ts            # tmd config init
│   │       ├── get.ts             # tmd config get
│   │       ├── set.ts             # tmd config set
│   │       └── help.ts
│   │
│   ├── parser/
│   │   ├── markdown-parser.ts     # Parse single .md file
│   │   ├── metadata-parser.ts     # Parse [key:value ...] blocks
│   │   ├── frontmatter.ts         # Parse YAML frontmatter
│   │   ├── hierarchy.ts           # Build parent/child relationships
│   │   └── types.ts               # ParsedTask, ParsedProject, etc.
│   │
│   ├── indexer/
│   │   ├── indexer.ts             # Build full task index
│   │   ├── index-file.ts          # Read/write todos.json
│   │   └── types.ts               # TaskIndex, IndexedTask, etc.
│   │
│   ├── sync/
│   │   ├── tmd-block.ts           # Parse/replace tmd:start/tmd:end blocks
│   │   └── task-renderer.ts       # Render tasks as markdown list
│   │
│   ├── linter/
│   │   ├── linter.ts              # Main linter
│   │   └── rules/                 # Individual lint rules
│   │       └── ...                # (see lint-rules.md)
│   │
│   ├── editor/
│   │   ├── task-editor.ts         # Edit tasks in-place in .md files
│   │   ├── task-inserter.ts       # Add new tasks to correct location
│   │   └── id-generator.ts        # Generate next available ID
│   │
│   ├── schema/
│   │   ├── task.ts                # Zod schemas for tasks
│   │   ├── project.ts             # Zod schemas for projects
│   │   ├── config.ts              # Zod schemas for config
│   │   └── index.ts               # Zod schema for todos.json
│   │
│   ├── config/
│   │   ├── loader.ts              # Config discovery & loading
│   │   ├── resolver.ts            # Merge configs, apply defaults
│   │   ├── defaults.ts            # Default config values
│   │   └── paths.ts               # Config path utilities
│   │
│   └── index.ts                   # Library exports
│
├── local_doc/                     # Design documents
│   ├── todo-format-spec.md        # Task format specification
│   ├── todo-system-requirements.md
│   ├── cli-architecture.md        # This file
│   ├── cli-commands.md            # Command reference (TBD)
│   └── lint-rules.md              # Lint rules spec (TBD)
│
├── package.json
├── tsconfig.build.json
└── biome.json
```

---

## 4. Configuration

### 4.1 Config File Format

JSON format (following mcporter pattern).

**Project config**: `.todosmd.json` in current directory (or walk up to find)
**Global config**: `~/.config/todosmd/config.json`

### 4.2 Config Resolution Order

1. CLI flags (`--file`, `--config`, `--output`)
2. Project config (`.todosmd.json` in current dir, or walk up to find)
3. Global config (`~/.config/todosmd/config.json`)
4. Smart defaults

### 4.3 Config Schema

```json
{
  "files": [
    "todos.md"
  ],
  "output": "todos.json",
  "views": [
    "00-daily-focus.md",
    "weekly-plan.md"
  ],
  "defaults": {
    "area": "work",
    "energy": "normal"
  }
}
```

Or with multiple files:

```json
{
  "files": [
    "todos.md",
    "projects/work.md",
    "projects/personal.md"
  ],
  "output": "todos.json",
  "views": [
    "views/daily.md",
    "views/light-tasks.md"
  ]
}
```

**Notes:**
- `files`: Source markdown files to parse (paths relative to CWD)
- `views`: View files containing `tmd:start`/`tmd:end` blocks for `tmd sync`
- If `files` not specified and no `--file` flag, defaults to `todos.md`

### 4.4 Global Config with Multiple Projects

```json
{
  "defaultProject": "notes",
  "projects": {
    "notes": {
      "files": ["~/notes/todos.md"],
      "output": "~/notes/todos.json"
    },
    "work": {
      "files": ["~/work/tasks.md", "~/work/projects.md"],
      "output": "~/work/todos.json"
    }
  }
}
```

### 4.5 Default Behavior (Zero Config)

When no config is found and no `--file` flags:
- `files`: `["todos.md"]` (single file in current directory)
- `output`: `todos.json` (in current directory)
- `views`: empty array (until user configures) — `tmd init` seeds this with `"views/daily.md"`
- Defaults come from `config/defaults.ts`; `tmd init` writes the same structure to `.todosmd.json`

---

## 5. Global CLI Flags

| Flag | Short | Description |
|------|-------|-------------|
| `--file <path>` | `-f` | Input file (repeatable for multiple files) |
| `--config <path>` | `-c` | Path to config file |
| `--project <name>` | `-p` | Use named project from global config |
| `--output <path>` | `-o` | Override output file path |
| `--json` | | Output JSON format |
| `--help` | `-h` | Show help |
| `--version` | | Show version |
| `--log-level <level>` | | debug, info, warn, error |

---

## 6. ID System

### 6.1 Local vs Global IDs

- **Local ID**: Stored in markdown (`id:1`, `id:1.1`)
- **Global ID**: Constructed as `<project-id>:<local-id>` (e.g., `as-onb:1.1`)

### 6.2 ID Generation Rules

When adding a new task:
1. Find the parent context (project or parent task)
2. Look at existing sibling IDs
3. Continue the sequence:
   - Top-level in project with IDs `1`, `2` → next is `3`
   - Under task `1` with children `1.1`, `1.2` → next is `1.3`
4. Flexible nesting allowed: `1.1.1`, `1.1.2`, etc.

### 6.3 ID Uniqueness

- Local IDs must be unique within a project section
- Global IDs (`project:local`) are globally unique across all configured files

---

## 7. Index File (`todos.json`)

### 7.1 Schema

```typescript
interface TaskIndex {
  version: 2;
  generatedAt: string;           // ISO timestamp
  files: string[];               // List of source files

  areas: {
    [area: string]: {
      area: string;              // "work"
      name: string;              // Heading text (e.g. "Work")
      filePath: string;
      lineNumber: number;
      headingLevel: number;
    };
  };

  projects: {
    [projectId: string]: {
      id: string;
      name: string;
      area?: string;
      parentArea?: string;       // Nearest area-only heading above the project (if any)
      filePath: string;
      lineNumber: number;
    };
  };

  tasks: {
    [globalId: string]: {
      globalId: string;          // "as-onb:1.1"
      localId: string;           // "1.1"
      projectId: string;         // "as-onb"
      text: string;              // Human-readable text
      completed: boolean;

      // Metadata
      energy?: "low" | "normal" | "high";
      priority?: "high" | "normal" | "low";
      est?: string;              // "30m", "1h"
      due?: string;              // "YYYY-MM-DD"
      plan?: string;             // "YYYY-MM-DD"
      bucket?: string;           // "today", "upcoming", "anytime", "someday", etc.
      area?: string;
      tags?: string[];
      created?: string;
      updated?: string;

      // Location
      filePath: string;
      lineNumber: number;
      indentLevel: number;

      // Hierarchy
      parentId: string | null;   // Global ID of parent task
      childrenIds: string[];     // Global IDs of children
    };
  };
}
```

---

## 8. Dependencies

Following mcporter's dependency choices:

| Package | Purpose |
|---------|---------|
| `zod` | Schema validation |
| `ora` | Terminal spinners |
| `commander` | CLI parsing (minimal use) |
| `es-toolkit` | Utility functions |

Additional:
| Package | Purpose |
|---------|---------|
| `gray-matter` | Frontmatter parsing (or custom) |
| `glob` / `fast-glob` | File scanning |

---

## 9. Sync Block Format

The `tmd sync` command updates `tmd:start`/`tmd:end` blocks in markdown files.

### Block Format

Uses HTML comments (hidden in rendered Markdown):

```markdown
<!-- tmd:start query="status:open bucket:today" -->
... tasks inserted here ...
<!-- tmd:end -->
```

### Query Syntax

The `query` attribute uses the same `key:value` syntax as `tmd list` filters:
- `status:open bucket:today` - Open tasks in today bucket
- `energy:low` - Low energy tasks
- `project:inbox` - Tasks from inbox project
- `overdue:true` - Overdue tasks
- `due:this-week area:work` - Due this week in work area

Both CLI and embedded queries use the same filter engine.

See `commands/09-sync.md` for full details.

---

## 10. Resolved Decisions

| Decision | Choice |
|----------|--------|
| List default output | Grouped by project |
| Config file format | JSON (`.todosmd.json`) |
| CLI name | `tmd` |

## 11. Open Questions

These items need further discussion:

1. **Lint rules**: See `lint-rules.md` for detailed questions

---

## 12. Related Documents

- `AGENTS.md` - Quick reference for AI agents working on this project
- `todo-format-spec.md` - Markdown task format specification
- `todo-system-requirements.md` - System requirements and context
- `cli-commands.md` - Command summary and priority list
- `lint-rules.md` - Lint rules specification with final decisions
- `commands/` - Detailed specifications for each command:
  - `01-index.md` - Parse markdown files and generate index
  - `02-list.md` - Query and list tasks
  - `03-show.md` - Show single task details
  - `04-done.md` - Mark task as done
  - `05-undone.md` - Mark task as undone
  - `06-add.md` - Add new task
  - `07-lint.md` - Validate format
  - `08-edit.md` - Edit task metadata
  - `09-sync.md` - Sync tmd:start/tmd:end blocks
  - `10-config.md` - Configuration management
