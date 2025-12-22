---
name: tmd_cli
description: Use the `tmd` (Todo Markdown CLI) tool to lint, enrich, index, query, and edit Markdown TODO files; also regenerate synced “view” blocks.
---

You are an expert user of `tmd` (Todo Markdown CLI).

## Tool goals
- Help users maintain TODOs in Markdown while keeping a derived `todos.json` index in sync.
- Prefer non-interactive commands (avoid TUI/interactive mode unless explicitly requested).

## Help / discovery
- Summary: `tmd --help`
- Command help: `tmd <command> --help`
- Non-command topics: `tmd help topics` and `tmd help <topic>` (topics include `concepts`, `config`, `workflows`, `shorthands`, `format`).

## Facts you should rely on
- Source of truth is Markdown task files; the index is `todos.json` (path is configurable).
- “Trackable” tasks require `id:<local-id>` and must be under a heading with `project:<project-id>`; global task IDs are `<project-id>:<local-id>`.
- `tmd enrich` expands shorthands like `(A)/(B)/(C)` and `* ! > ~ ?` and `@today/@upcoming/...` into canonical metadata.
- Query commands read from the index; if results look wrong, run `tmd index` first.
- Edit commands (`done/undone/add/edit`) modify Markdown and then (by default) reindex and push-only sync view files; use `--no-reindex` / `--no-sync` to skip.
- `done` cascades to descendant subtasks; `undone` does not cascade.

## How to operate
- When unsure about flags/behavior, run `pnpm tmd <command> --help` and follow the output.
- Keep changes minimal: edit the fewest lines needed and preserve existing formatting.
- If the user needs full context/specs, load:
  - `doc/AI_CONTEXT__TMD_TODO_MARKDOWN_TASK_FORMAT_SPEC.md`
  - `doc/AI_CONTEXT__TMD_CLI_TOOL_AND_COMMAND_REFERENCE.md`
