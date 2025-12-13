# TMD CLI Commands

This document lists all planned CLI commands for `tmd`, organized by priority tier.

For detailed specifications, see individual files in the `commands/` folder.

---

## Command Summary

| Command | Description | Tier | Status |
|---------|-------------|------|--------|
| `tmd lint` | Validate markdown format and report issues | 1 | ✅ Done |
| `tmd index` | Parse markdown files and generate `todos.json` index | 1 | ✅ Done |
| `tmd enrich` | Convert shorthands to canonical metadata, auto-generate IDs | 1 | ✅ Done |
| `tmd list` | List and query tasks with filters (key:value syntax) | 1 | ✅ Done |
| `tmd show <id>` | Show detailed info for a single task | 1 | ✅ Done |
| `tmd done <id>` | Mark a task as completed | 2 | ✅ Done |
| `tmd undone <id>` | Mark a task as incomplete | 2 | ✅ Done |
| `tmd add` | Add a new task to a project | 2 | ✅ Done |
| `tmd search` | Full-text search (wrapper over list with text: filter) | 2 | ✅ Done |
| `tmd edit <id>` | Edit task metadata | 3 | ✅ Done |
| `tmd stats` | Show task statistics and completion metrics | 3 | ✅ Done |
| `tmd sync` | Bidirectional sync with view files | 4 | ✅ Done |
| `tmd block-template` | Generate sync block skeleton for copy-paste | 4 | ✅ Done |
| `tmd init` | Scaffold markdown, config, and view files for a workspace | 5 | ⏳ Pending |
| `tmd config` | Configuration subcommands (init, get, set) | 5 | ⏳ Pending |

---

## Tier 1: Core (Must Have First)

Foundation commands - everything else depends on these.

### `tmd lint`

Validate markdown files for format issues: duplicate IDs, invalid dates, malformed metadata.

```bash
tmd lint
tmd lint --file todos.md
tmd lint -f todos.md -f projects/work.md
tmd lint --fix
```

### `tmd index`

Parse specified markdown files, extract tasks and projects, generate `todos.json`.

```bash
tmd index
tmd index --file todos.md
tmd index -f todos.md -f projects/work.md
tmd index --output my-tasks.json
```

### `tmd enrich`

Convert human-friendly shorthands (`@today`, `!`, `>`, etc.) to canonical metadata. Auto-generates missing IDs and adds `created` dates.

```bash
tmd enrich
tmd enrich --file todos.md
tmd enrich --dry-run
tmd enrich --keep-shorthands
```

### `tmd list`

Query and display tasks with various filters. Primary way to interact with tasks.

```bash
tmd list
tmd list --project as-onb
tmd list --energy low
tmd list --due today
tmd list --json
```

### `tmd show <id>`

Display detailed information about a single task by its global ID.

```bash
tmd show as-onb:1.1
tmd show inbox:1 --json
```

---

## Tier 2: Task Manipulation

Core workflow - modify task state.

### `tmd done <id>`

Mark a task as completed by changing `- [ ]` to `- [x]` in the source markdown.

```bash
tmd done as-onb:1.1
```

### `tmd undone <id>`

Mark a task as incomplete by changing `- [x]` to `- [ ]` in the source markdown.

```bash
tmd undone as-onb:1.1
```

### `tmd add`

Add a new task to a project. Auto-generates the next available ID.

```bash
tmd add inbox "Call bank about card" --energy low
tmd add as-onb "Write tests" --parent 1 --est 2h
```

### `tmd search`

Full-text search for tasks. Thin wrapper over `tmd list` with implicit `text:` filter.

```bash
tmd search "stripe"
tmd search "welcome email" project:as-onb
tmd search "invoice" status:done --json
```

---

## Tier 3: Advanced Editing

More sophisticated task manipulation.

### `tmd edit <id>`

Edit task metadata (energy, due date, estimate, etc.) without changing the task text.

```bash
tmd edit as-onb:1.1 --due 2025-12-20
tmd edit inbox:1 --energy high --est 1h
```

### `tmd stats`

Show task statistics and completion metrics.

```bash
tmd stats
tmd stats area:work
tmd stats --period last-7d --by project
tmd stats --json
```

---

## Tier 4: File Sync

Update auto-generated content in markdown files.

### `tmd sync`

Find `<!-- tmd:start query="..." -->` blocks in a file, read query from marker, fill with matching tasks.

```bash
tmd sync --file 00-daily-focus.md
tmd sync -f weekly-plan.md --dry-run
```

### `tmd block-template`

Generate sync block skeleton for copy-paste into markdown files.

```bash
tmd block-template today
tmd block-template 'status:open project:as-onb' --name "as-onb-tasks"
```

---

## Tier 5: Configuration & Setup

Bootstrap and manage workspace configuration.

### `tmd init`

Scaffold a new workspace with starter files.

```bash
tmd init
tmd init --with-index
```

Creates `todos.md`, optional `.todosmd.json`, and a starter view file so core commands can run immediately. Supports dry-run, force overwrite, and delegating to global config initialization.

### `tmd config init`

Create a new `.todosmd.json` configuration file.

```bash
tmd config init
tmd config init --global
```

### `tmd config get <key>`

Get a configuration value.

```bash
tmd config get files
tmd config get output
```

### `tmd config set <key> <value>`

Set a configuration value.

```bash
tmd config set output tasks.json
```

---

## Global Flags

Available on all commands:

| Flag | Short | Description |
|------|-------|-------------|
| `--file <path>` | `-f` | Input file (repeatable) |
| `--config <path>` | `-c` | Path to config file |
| `--project <name>` | `-p` | Use named project from global config |
| `--json` | | Output as JSON |
| `--help` | `-h` | Show help |
| `--version` | | Show version |

---

## Implementation Order

1. **Phase 1**: `lint`, `index`, `enrich`, `list`, `show` (validation & read-only foundation) ✅
2. **Phase 2**: `done`, `undone`, `add`, `search` (write operations + search) ✅
3. **Phase 3**: `edit`, `stats` (advanced editing + analytics) ✅
4. **Phase 4**: `sync`, `block-template` (file sync + views) ✅
5. **Phase 5**: `init`, `config` subcommands (pending)
