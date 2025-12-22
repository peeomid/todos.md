# AI Context: `tmd` CLI Tool & Command Reference (non-interactive)

This document describes how to use the `tmd` CLI (Todo Markdown CLI) in **non-interactive** workflows.

## 0) Mental model

- Source of truth: your Markdown task files (default `todos.md`).
- Derived artifact: `todos.json` index (default `todos.json`).
- Typical loop:
  1) `tmd enrich` (normalize shorthands / ensure IDs)
  2) `tmd index` (build `todos.json`)
  3) `tmd list` / `tmd search` / `tmd show` (query)
  4) `tmd done` / `tmd undone` / `tmd add` / `tmd edit` (modify markdown)
  5) optional `tmd sync` (regenerate view files)

## 0.1) How to get help

- Summary help: `tmd --help` (or `tmd help`)
- Per-command help: `tmd <command> --help`
- Non-command topics:
  - `tmd help topics`
  - `tmd help <topic>` where `<topic>` is one of: `concepts`, `config`, `workflows`, `shorthands`, `format`

## 1) Config & defaults

### 1.1) Config file discovery

By default, `tmd` loads config from (first match wins):
- an explicit `--config <path>` / `-c <path>`
- the nearest `.todosmd.json` found by walking up from the current working directory
- the global config at `~/.config/todosmd/config.json`

### 1.2) Config schema (commonly used keys)

```json
{
  "files": ["todos.md"],
  "output": "todos.json",
  "views": ["00-daily-focus.md", "weekly-plan.md"],
  "defaults": { "area": "work", "energy": "normal" }
}
```

Meaning:
- `files`: Markdown task files to parse/edit (defaults to `["todos.md"]`).
- `output`: index file path (defaults to `todos.json`).
- `views`: optional Markdown “view files” used by `tmd sync`.
- `defaults`: defaults used by some commands (e.g. task insertion defaults).

### 1.3) Global flags (supported by multiple commands)

- `--file, -f <path>`: input file (repeatable); overrides `config.files`
- `--output, -o <path>`: override `config.output`
- `--config, -c <path>`: choose config file
- `--json`: output machine-readable JSON (when supported)

## 2) Important behaviors / gotchas

### 2.1) Index required for query commands

Commands like `tmd list`, `tmd search`, `tmd show`, `tmd stats`, and `tmd sync` read from the index file (default `todos.json`).
If the index is missing or stale, run `tmd index` first.

### 2.2) Auto reindex + auto sync after edits

These commands edit Markdown source files:
- `tmd done`, `tmd undone`, `tmd add`, `tmd edit`

By default they:
- rebuild the index after the edit (equivalent to running `tmd index`), and
- if `views` are configured, run a **push-only** sync to regenerate view blocks.

You can disable these steps per invocation:
- `--no-reindex`
- `--no-sync`

### 2.3) Done cascade vs undone non-cascade

- `tmd done <id>` cascades: marks all descendant subtasks as done too.
- `tmd undone <id>` does **not** cascade: only the target task is toggled open.

## 3) Command reference

### `tmd lint`

Validate Markdown files for format issues.

Key options:
- `--fix`: auto-fix some issues
- `--quiet, -q`: only errors
- `--json`
- `--file, -f <path>` (repeatable), `--config, -c <path>`

### `tmd enrich`

Normalize shorthands into canonical metadata (see `doc/AI_CONTEXT__TMD_TODO_MARKDOWN_TASK_FORMAT_SPEC.md`).

Key options:
- `--keep-shorthands`: keep shorthand markers in text
- `--dry-run`: show changes without writing files
- `--file, -f <path>` (repeatable), `--config, -c <path>`, `--json`

### `tmd index`

Parse markdown files and generate/update the index (`todos.json`).

Key options:
- `--file, -f <path>` (repeatable)
- `--output, -o <path>`
- `--quiet, -q`
- `--json`

### `tmd list [filters...]`

Query tasks from the index using `key:value` filters (tokens separated by spaces).

Common filters:
- `project:<id>`, `area:<name>`
- `status:open|done|all` (default is `open`)
- `bucket:<name>`
- `due:<date>` / `plan:<date>`: `today`, `tomorrow`, `this-week`, `next-week`, `YYYY-MM-DD`, or `YYYY-MM-DD:YYYY-MM-DD`
- `energy:low|normal|high`, `priority:high|normal|low`
- `overdue:true`
- `tags:a,b,c`
- `text:<query>`

Display options:
- `--format, -f compact|full|markdown`
- `--group-by, -g project|area|due|bucket|none`
- `--sort, -s due|created|project|energy|priority|bucket`
- `--limit, -l <n>`
- `--json`

### `tmd search <text> [filters...]`

Full-text search across task text (wrapper over `tmd list` with a required text query).

Key options:
- `--format, -f compact|full`
- `--json`

### `tmd show <global-id>`

Show details for one task.

Key options:
- `--output, -o <path>`: choose index file path
- `--config, -c <path>`
- `--json`

### `tmd done <global-id>`

Mark a task as completed (and cascade done to descendants).

Key options:
- `--no-reindex`
- `--no-sync`
- `--file, -f <path>` (repeatable; used for reindexing when enabled)
- `--config, -c <path>`
- `--output, -o <path>`
- `--json`

### `tmd undone <global-id>`

Mark a task as incomplete (no cascade).

Key options:
- `--no-reindex`
- `--no-sync`
- `--file, -f <path>` (repeatable; used for reindexing when enabled)
- `--config, -c <path>`
- `--output, -o <path>`
- `--json`

### `tmd add <project-id> <text>`

Add a new task under a project.

Key options:
- `--parent <local-id>`: create as a subtask (e.g. `--parent 1` → `1.1`, `1.2`, ...)
- `--energy low|normal|high`
- `--est <string>`
- `--due <date>`: `YYYY-MM-DD`, `today`, `tomorrow`, `+Nd`, or `+Nw`
- `--plan <date>`: `YYYY-MM-DD`, `today`, `tomorrow`, `+Nd`, or `+Nw`
- `--bucket <name>`: common buckets or custom
- `--area <name>`
- `--tags <a,b,c>` (comma-separated)
- `--file, -f <path>` (repeatable; used for reindexing when enabled)
- `--no-reindex`, `--no-sync`, `--config, -c`, `--output, -o`, `--json`

### `tmd edit <global-id> [field updates...]`

Edit metadata for an existing task (without changing the task text).

Key options (same shape as `tmd add`):
- `--energy`, `--priority`, `--est`
- `--due`, `--plan`, `--bucket`, `--area`
- `--tags`, `--add-tag`, `--remove-tag`
- `--file, -f <path>` (repeatable; used for reindexing when enabled)
- `--no-reindex`, `--no-sync`, `--config, -c`, `--output, -o`, `--json`

### `tmd stats [filters...]`

Show completion statistics and metrics.

Key options:
- `--period today|last-7d|last-30d|this-week` (default `last-7d`)
- `--by project|area|bucket|energy` (default `project`)
- `--json`

### `tmd sync`

Bidirectional sync between source files and “view files”.

How it works:
- Pull phase: read done/undone changes from view files and apply them back to source tasks.
- Push phase: query the index and regenerate the task blocks inside view files.

Key options:
- `--file, -f <path>`: view file to sync (repeatable); if omitted, uses `config.views`
- `--push-only` / `--pull-only`
- `--dry-run`
- `--json`

View block format:

```md
<!-- tmd:start name="today" query="status:open bucket:today" -->
... tasks rendered here ...
<!-- tmd:end -->
```

### `tmd block-template <preset|query>`

Generate a ready-to-paste sync block skeleton.

Key options:
- `--name <name>` (for custom queries)

### `tmd config <subcommand>`

Manage configuration.

Subcommands:
- `init`
- `get <key>` (dot paths supported)
- `set <key> <value>` (dot paths supported)
- `list`
- `path`
