# `tmd interactive` (TUI)

`tmd interactive` (alias: `tmd i`) launches a full-screen terminal UI for browsing, searching, and editing tasks while keeping Markdown (`todos.md`, plus any configured task files) as the single source of truth.

## Where to look

- Requirements/spec: `local_doc/tui_specs.md`
- Technical architecture: `local_doc/tui-architecture.md`
- Implementation plan (milestones, non-goals): `local_doc/tui_implementation_plan.md`
- Implementation map (entry points, config, keybindings, safety): `local_doc/tui_implementation_details.md`

## What’s already implemented (v1)

- Command wiring: `tmd interactive` and alias `tmd i` (`src/cli/interactive-command.ts`)
- CLI params: `--file/--input/-f` and `--output/--out/-o` to choose input/output paths
- Startup/exit lifecycle: start runs `enrich → index → load`, exit runs `index → (optional) sync` once
- Views: built-ins `0–5` + custom views via `interactive.views[]` in config
- Navigation + toggles: `0–9`, `h/l` or arrows, `z` show/hide done (query rewrite), `/` live search with scope toggle and inline autocomplete
- Quit ergonomics: `Ctrl+C` twice quits (first press shows a prompt)
- Task actions: toggle done (with cascade on done), set priority/bucket/plan/due, inline edit, add task flow
- Project actions: in Projects view, `[a]` adds a new project and auto-switches into that project’s drilldown view
- Rendering/grouping: task lists grouped by project headers (or `interactive.groupBy: "none"`)
- Row shorthands: task rows show the todo-format shorthands (priority `(A)/(B)/(C)` and bucket `!/>/~/?`) so users can learn them
- Header emphasis: the active query is highlighted in the header line
- Safety: external edit detection via file `mtime` prompts before writing
- Small screens: footer help auto-condenses (shows the most important keys and an ellipsis), and `?` opens a scrollable help overlay with keybindings + shorthands

## Changelog

- 2025-12-19: Initial `tmd interactive` v1 implemented (see `local_doc/tui_implementation_details.md`).
- 2025-12-19: Added double-`Ctrl+C` quit, header query highlight, I/O flag aliases, and "add project" flow.
- 2025-12-19: TUI freeze hardening: `q`/double-`Ctrl+C` work even if UI is "busy", and async key errors are surfaced instead of wedging.
- 2025-12-19: Added inline autocomplete for search mode: Tab completes filter keys and values, Up/Down navigate suggestions, dynamic values from task index.
- 2025-12-20: Improved modal UX: clearer titles/instructions, more obvious input cursor, and key menus that explicitly tell users how to choose.
- 2025-12-20: Editing: `e` opens a 2-field edit modal (Text + Meta). Enter advances/saves; ↑/↓ switches fields; Tab/Enter applies meta autocomplete.
- 2025-12-20: Adding: `a` opens a 3-field add modal (Project + Text + Meta) with the same autocomplete semantics and shared suggestion UI.
