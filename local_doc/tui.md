# `tmd interactive` (TUI)

`tmd interactive` (alias: `tmd i`) launches a full-screen terminal UI for browsing, searching, and editing tasks while keeping Markdown (`todos.md`, plus any configured task files) as the single source of truth.

## Where to look

- Requirements/spec: `local_doc/tui_specs.md`
- Technical architecture: `local_doc/tui-architecture.md`
- Implementation plan (milestones, non-goals): `local_doc/tui_implementation_plan.md`
- Implementation map (entry points, config, keybindings, safety): `local_doc/tui_implementation_details.md`

## What’s already implemented (v1)

- Command wiring: `tmd interactive` and alias `tmd i` (`src/cli/interactive-command.ts`)
- Startup/exit lifecycle: start runs `enrich → index → load`, exit runs `index → (optional) sync` once
- Views: built-ins `0–5` + custom views via `interactive.views[]` in config
- Navigation + toggles: `0–9`, `h/l` or arrows, `z` show/hide done (query rewrite), `/` live search with scope toggle
- Task actions: toggle done (with cascade on done), set priority/bucket/plan/due, inline edit, add task flow
- Rendering/grouping: task lists grouped by project headers (or `interactive.groupBy: "none"`)
- Row shorthands: task rows show the todo-format shorthands (priority `(A)/(B)/(C)` and bucket `!/>/~/?`) so users can learn them
- Safety: external edit detection via file `mtime` prompts before writing

## Changelog

- 2025-12-19: Initial `tmd interactive` v1 implemented (see `local_doc/tui_implementation_details.md`).
