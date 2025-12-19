# `tmd interactive` – Implementation Details

This document describes the concrete implementation of the TUI specified in `local_doc/tui_specs.md`.

## Entry Points

- CLI command: `src/cli/interactive-command.ts`
  - `tmd interactive` and alias `tmd i`
  - Startup: runs `enrich` → runs `index` → loads `todos.json` into memory
  - Exit: runs `index` again and then runs `sync` once (only if `views` are configured)
- TUI runtime: `src/tui/interactive.ts`
  - Uses `terminal-kit` to manage full-screen mode + keyboard input

## Startup / Exit Lifecycle

Startup (in `src/cli/interactive-command.ts`):
- Validates input files exist (resolved from config + `--file/-f` overrides)
- Runs `enrichFiles(files, { dryRun:false })` to ensure every task has an `id:`
- Builds index in-process (`buildIndex(files)`) and writes `todos.json`
- Loads the written index and hands control to the TUI loop

Exit:
- TUI returns a fresh `TaskIndex` rebuilt from disk (`buildIndex(files)`)
- CLI writes it to the configured output path
- If `config.views` is present, runs `tmd sync` once (push/pull behavior unchanged from the CLI command)

## Config Surface Area

Config lives in `.todosmd.json` (loaded by `src/config/loader.ts`).

Added keys:
- `interactive.views[]`: custom views
  - `{ key: "6", name: "Work", query: "status:open area:work", sort?: "bucket,plan,due" }`
- `interactive.groupBy`: task list grouping
  - `"project"` (default): group all task lists by project with header rows
  - `"none"`: disable grouping and render a flat list
- `interactive.colors.disable`: disables ANSI styling in the TUI (best-effort)
- `interactive.defaultProject`: Inbox project id fallback used by `a` (add task) only when the destination cannot be inferred from list context

Built-in views:
- `0` All: `status:open`
- `1` Today: `status:open bucket:today`
- `2` Upcoming: `status:open bucket:upcoming`
- `3` Anytime: `status:open bucket:anytime`
- `4` Someday: `status:open bucket:someday`
- `5` Projects: project list + drilldown

## Query / Filtering / Sorting

Shared query logic:
- `src/query/filters.ts` contains the filter parsing, filter composition, grouping, and sorting logic.
- `src/cli/list-filters.ts` now re-exports from `src/query/filters.ts` to keep existing CLI imports stable.

Query string rules:
- The UI treats the displayed query as the single source of truth.
- `status:any` is normalized to `status:all`.
- The `z` toggle is implemented as “query rewrite” by removing any existing `status:*` tokens and injecting either `status:open` or `status:all`.

Sorting:
- Supports stable multi-field sorting via `sortTasksByFields()` (left-to-right priority).
- Custom views can set `sort: "bucket,plan,due"`.

## Screen Model / State

`src/tui/interactive.ts` keeps a single `SessionState` with:
- `views`, `viewIndex`, `projects.drilldownProjectId`
- `statusMode` (`open` vs `all`) and `search` state (active/scope/input)
- selection + scroll (`row`, `scroll`, `selectedId`)
- `fileMtimes` to detect external edits
- `filteredTasks` or `filteredProjects` as the current render list

Rendering:
- Full-screen redraw on every state change (simple + reliable)
- Resize handler recomputes list height and scroll window
- Task lists are rendered as `renderRows` (project headers + task rows); selection skips headers (headers are not selectable/collapsible).
- Task rows display bucket + priority shorthands to help users learn the todo-format shorthands:
  - priority: `(A)/(B)/(C)` (high/normal/low)
  - bucket: `!/>/~/?` (today/upcoming/anytime/someday)
- Help is always rendered at the bottom, below the details lines.
- The current view tab is rendered with a distinct background color in the tabs row.

## Keybindings (v1)

Global:
- `q` quit
- `0–9` jump to view
- `h/l` or `←/→` previous/next view
- `z` show/hide done (query rewrite)
- `/` enter live search (prefilled with current query + a trailing space)
- `?` shorthand help (priority/bucket)
- in search: type filters or plain words (plain words are treated as `text:` filters)
- in search: `Enter` applies and returns to list; `Esc`/`Ctrl+C` cancels; `!`/`Ctrl+/` toggles scope; `z` toggles status mode

Movement:
- `j/k` or `↑/↓` move
- `g/G` top/bottom
- `Ctrl+U`/`Ctrl+D` half-page
- `PgUp`/`PgDn` half-page (best-effort; depends on terminal-kit key mapping)

Task actions:
- `space` toggle done (done cascades to all descendants; undone does not cascade)
- `x` toggle done (alias for `space`)
- `r` delete task (with confirmation; deletes subtasks too)
- `p` priority menu (h/n/l/c) — shorthands: `h` high, `n` normal, `l` low
- `b` bucket menu (t/u/a/s/c) — shorthands: `t` today, `u` upcoming, `a` anytime, `s` someday
  - plus rule: if bucket becomes `today` and `plan` is empty, set `plan` to today
- `n` plan menu (today/manual/clear)
- `d` due menu (today/manual/clear)
- `e` edit menu:
  - `t` edits task text only
  - `m` edits metadata block only (`[key:value ...]`)
- `a` add task flow (choose destination project → text → priority → bucket → plan → due)
  - Defaults destination by context: project drilldown → single-project list → selected task’s project → `interactive.defaultProject`
  - `Tab` opens a typeahead project picker before entering task text

Projects view:
- `Enter` drills down into a project (shows that project’s tasks)
- `Esc`/`Backspace` exits drilldown

## Write Path / Safety

External edit protection:
- `fileMtimes` are captured at session start and refreshed after rebuilds.
- Before any write, the UI checks current `mtime` and prompts `y/n` to reload if it changed.
- If reload is chosen, the in-memory index is rebuilt from disk before retrying the operation.

Task line localization:
- Writes locate the task by `metadata.id` within the current project context.
- Uses `lineNumber` from the index as a hint, but falls back to scanning the file if verification fails.

Metadata rewrites:
- Uses `parseMetadataBlock()` / `serializeMetadata()` and preserves ordering rules:
  - `id` first, then alphabetical
- Always updates `updated:<today>`
- Prevents changing `id` via the inline editor

## Date Shortcuts

`src/cli/date-utils.ts`:
- `parseRelativeDate()` now supports `+Nd` and `+Nw` and returns canonical `YYYY-MM-DD`.
- Used by:
  - TUI manual plan/due input
  - CLI `tmd add --plan/--due`

Tests:
- `tests/cli/date-utils.test.ts`

## Dependencies / TypeScript Notes

- `terminal-kit` added as a dependency.
- Minimal TS shim: `src/types/terminal-kit.d.ts` (treats the package as `any` for v1).

## Known Limitations (v1)

- No `$EDITOR` integration for `e` (inline editor only).
- No `r` refresh command; the UI rebuilds index only when prompted due to `mtime` changes (and on exit).
- Rendering is full redraw (simple but not the most flicker-free).
- TUI behavior is mostly manual-tested; automated tests cover shared primitives (date parsing, filters, etc.), not interactive key flows.

## How To Run

If `pnpm` isn’t on PATH:
- `corepack pnpm tmd i`

To make `pnpm` available as a command:
- `corepack enable` (then restart your shell)
