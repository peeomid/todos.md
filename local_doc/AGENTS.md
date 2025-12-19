# AGENTS.md

This document provides guidance for AI agents working on the `tmd` (Todo Markdown) CLI project.

---

## Project Overview

`tmd` is a CLI tool that:
- Parses Markdown files containing tasks
- Generates a structured `todos.json` index
- Provides commands to list, filter, add, edit, and complete tasks
- Syncs auto-generated task lists in markdown files
- Lints markdown files for format issues

The tool follows patterns from [mcporter](https://github.com/steipete/mcporter).

---

## Documentation Structure

**When specs/docs change, update the trackers (only when relevant):**
- `specs-change-log.md` — log the spec change itself and list only spec files that changed.
- `plan.md` — touch only if the change adds/removes pending implementation work.
- `PROGRESS.md` — add a one-line entry only after work/spec is actually completed.

### Core Specifications

| Document | Description |
|----------|-------------|
| `todo-format-spec.md` | **Task format specification**. Defines how tasks are written in Markdown: checkbox syntax, metadata blocks `[key:value]`, project headings, subtask hierarchy, and sync block markers. Read this first to understand the data format. |
| `todo-system-requirements.md` | **System requirements and context**. Explains the user's workflow: Obsidian vault, VS Code editing, mobile viewing, local AI agent integration. Defines high-level goals and constraints. |

### Architecture & CLI

| Document | Description |
|----------|-------------|
| `cli-architecture.md` | **Overall architecture**. Project structure, config resolution, ID system, index schema, dependencies. The main technical reference for implementation decisions. |
| `cli-commands.md` | **Command summary**. Quick reference of all CLI commands with priorities (Tier 1-6). Start here to understand what commands exist. |

### Interactive TUI (`tmd interactive`)

| File | Description |
|------|-------------|
| `tui_specs.md` | **TUI requirements/spec**: screen layout, views, keybindings, color guidance, and grouping rules. |
| `tui-architecture.md` | **TUI technical architecture**: state model, query/filter pipeline, write safety, and delete semantics. |
| `tui_implementation_plan.md` | **Implementation plan + rationale** for the TUI (milestones, non-goals, approach). |
| `tui_implementation_details.md` | **Implementation map**: entry points, config keys, state model, rendering, keybindings, write path. |

### Command Specifications

Each command has a detailed spec in `commands/`:

| File | Command | Priority |
|------|---------|----------|
| `commands/07-lint.md` | `tmd lint` | Tier 1 - Validate format first |
| `commands/01-index.md` | `tmd index` | Tier 1 - Parse and index |
| `commands/11-enrich.md` | `tmd enrich` | Tier 1 - Convert shorthands, auto-generate IDs |
| `commands/02-list.md` | `tmd list` | Tier 1 - Primary query interface |
| `commands/03-show.md` | `tmd show` | Tier 1 - View single task |
| `commands/04-done.md` | `tmd done` | Tier 2 - Mark task complete |
| `commands/05-undone.md` | `tmd undone` | Tier 2 - Mark task incomplete |
| `commands/06-add.md` | `tmd add` | Tier 2 - Add new task |
| `commands/08-edit.md` | `tmd edit` | Tier 3 - Edit task metadata |
| `commands/09-sync.md` | `tmd sync` | Tier 4 - Update tmd:start/tmd:end blocks |
| `commands/10-config.md` | `tmd config` | Tier 5 - Configuration management |
| `commands/15-init.md` | `tmd init` | Tier 5 - Workspace scaffolding |
| `commands/12-search.md` | `tmd search` | Tier 2 - Full-text search (wrapper over list) |
| `commands/13-stats.md` | `tmd stats` | Tier 3 - Task statistics and metrics |
| `commands/14-block-template.md` | `tmd block-template` | Tier 4 - Generate sync block skeletons |

### TUI Code Entry Points (for implementation work)

| File | Notes |
|------|------|
| `src/cli/interactive-command.ts` | CLI wiring: `tmd interactive` / `tmd i`; startup (enrich→index→load) and exit (reindex→sync). |
| `src/tui/interactive.ts` | TUI runtime: rendering, grouping, key handling, file edits, safety prompts. |
| `src/query/filters.ts` | Shared query parsing/filtering/sorting; includes `groupTasks()` used by CLI and TUI. |
| `src/config/loader.ts` | Config schema; interactive keys live under `interactive.*` (e.g. `views`, `groupBy`, `colors.disable`). |

### Lint Rules

| Document | Description |
|----------|-------------|
| `lint-rules.md` | **Lint rule specifications**. Defines all validation rules with severity levels, fixability, and user decisions on behavior. |

### Change Tracking

| Document | Description |
|----------|-------------|
| `PROGRESS.md` | **Implementation progress**. One-line entries of completed work. |
| `plan.md` | **Implementation plan**. Phases with checkboxes tracking what's done/pending. |
| `specs-change-log.md` | **Spec change history**. Detailed log of spec changes with rationale and affected files. |

---

## Key Decisions Made

| Decision | Choice |
|----------|--------|
| CLI name | `tmd` |
| Config format | JSON (`.todosmd.json`) |
| List default grouping | By project |
| Estimate format | Flexible (supports `1h30m`, `90m`, `1.5h`) |
| ID validation | No strict hierarchy checking (warning only) |
| Auto-fix behavior | No confirmation required |

---

## Implementation Order

1. **Phase 1**: `lint`, `index`, `enrich`, `list`, `show` (validation & read-only foundation) ✅
2. **Phase 2**: `done`, `undone`, `add`, `search` (write operations + search) ✅
3. **Phase 3**: `edit`, `stats` (advanced editing + analytics) ✅
4. **Phase 4**: `sync`, `block-template` (file sync + views) ✅
5. **Phase 5**: `init`, `config` subcommands (pending)

---

## Important Patterns

### Metadata Block Format
```markdown
- [ ] Task text [id:1 energy:low est:30m due:2025-12-20 priority:high]
```

### Project Heading Format
```markdown
# Project Name [project:proj-id area:work]
```

### Sync Block Format
Uses HTML comments (hidden in rendered Markdown):
```markdown
<!-- tmd:start query="status:open bucket:today" -->
... tasks inserted here ...
<!-- tmd:end -->
```

### Filter Syntax (unified for CLI and sync blocks)
```bash
# CLI usage
tmd list status:open bucket:today energy:low

# Embedded in sync blocks
<!-- tmd:start query="status:open bucket:today" -->
```

Available filters: `project:`, `area:`, `energy:`, `priority:`, `due:`, `status:`, `tags:`, `bucket:`, `plan:`, `overdue:true`, `top-level:true`, `parent:`

### Priority Shorthand (todo.txt style)
```markdown
- [ ] (A) High priority task [id:1]     → priority:high
- [ ] (B) Normal priority task [id:2]   → priority:normal
- [ ] (C) Low priority task [id:3]      → priority:low
```

### Full Line Structure (all shorthands)
```markdown
- [ ] (A) ! Task text @today [id:1 energy:high est:60m]
      │   │           │      └─ metadata block
      │   │           └─ @tag shorthand (bucket)
      │   └─ bucket shorthand (! = today)
      └─ priority shorthand (A = high)
```

### Global ID Format
```
<project-id>:<local-id>
Example: as-onb:1.1
```

---

## File Locations

| Item | Path |
|------|------|
| Default input | `todos.md` (if no config/flags) |
| Project config | `.todosmd.json` (in CWD or walk up) |
| Global config | `~/.config/todosmd/config.json` |
| Index output | `todos.json` (configurable) |

## Config Schema

```json
{
  "files": ["todos.md"],
  "output": "todos.json"
}
```

Or with multiple files and views:

```json
{
  "files": ["todos.md", "projects/work.md", "projects/personal.md"],
  "output": "todos.json",
  "views": ["00-daily-focus.md", "weekly-plan.md"]
}
```

- `files`: Explicit list of markdown files to parse (paths relative to CWD)
- `output`: Path to output JSON index file (default: `todos.json`)
- `views`: View files containing `tmd:start`/`tmd:end` blocks for `tmd sync`
- Default file if none specified: `todos.md`
- No directory scanning - files must be explicitly listed

---

## When Implementing

1. **Read the command spec first** - Each command file in `commands/` has detailed implementation plans
2. **Follow mcporter patterns** - Check mcporter source for CLI patterns, flag handling, terminal output
3. **Use Zod for schemas** - All data structures should be validated with Zod
4. **Support `--json` output** - Every command should have JSON output option for AI integration
5. **Handle errors gracefully** - See error handling section in each command spec

## When Modifying Specs

When you make changes to command specifications in `commands/` or other spec files:

1. **Update `plan.md`** - Add a note about what changed so it gets implemented later
2. **Check related docs** - Changes often affect multiple files (e.g., removing a field requires updating specs, lint rules, schemas, commands)
3. **Keep specs in sync** - If you change behavior in one place, grep for related references

---

## Related External Resources

- [mcporter](https://github.com/steipete/mcporter) - Reference CLI project for patterns
- Task format follows standard Markdown checkbox syntax compatible with Obsidian/GitHub
