# `tmd interactive` – Implementation Details

This document describes the concrete implementation of the TUI specified in `local_doc/tui_specs.md`.

## Entry Points

- CLI command: `src/cli/interactive-command.ts`
  - `tmd interactive` and alias `tmd i`
  - Startup: runs `enrich` → runs `index` → loads `todos.json` into memory
  - Exit: runs `index` again and then runs `sync` once (only if `views` are configured)
- TUI runtime: `src/tui/interactive.ts`
  - Uses `terminal-kit` to manage full-screen mode + keyboard input
- Autocomplete logic: `src/tui/autocomplete.ts`
  - Filter key/value suggestions
  - Context detection (typing key vs value)
  - Dynamic value extraction from task index

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
- `1` Now: `status:open bucket:now`
- `2` Today: `status:open bucket:today`
- `3` Upcoming: `status:open bucket:upcoming`
- `4` Anytime: `status:open bucket:anytime`
- `5` Someday: `status:open bucket:someday`
- `6` Projects: project list + drilldown

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

## Autocomplete (Search Enhancement)

Implementation in `src/tui/autocomplete.ts`:

**Data structures:**
- `AutocompleteSuggestion`: represents a single suggestion (type: key/value, text, display)
- `AutocompleteContext`: tracks what user is typing (current token, filter key if typing value, cursor position)
- `AutocompleteState`: manages active suggestions, selected index, current context
- `FILTER_SPECS`: registry of all available filter keys with their valid values

**Core functions:**
- `getAutocompleteContext(input, cursorPos)`: analyzes input to determine if user is typing a filter key or value
- `generateSuggestions(context, allTasks)`: produces suggestions based on current context
  - Filter key suggestions: matches partial input against known filter keys
  - Static value suggestions: returns predefined values (e.g., `bucket: now/today/upcoming/anytime/someday`)
  - Dynamic value suggestions: extracts unique values from task index (e.g., project IDs, areas, tags)
  - Date suggestions: provides `today`, `tomorrow`, and format hints
- `applySuggestion(input, cursorPos, suggestion, context)`: replaces current token with selected suggestion

**Integration with search mode:**
- Autocomplete state added to `TUIState.search.autocomplete`
- Search input tracks both `value` and `cursor` (so autocomplete is context-aware even when editing in the middle)
- `updateAutocomplete(state, allTasks)` called on every input/cursor change in search mode
- Tab key applies selected suggestion
- Up/Down arrows navigate suggestions (when autocomplete is active)
- Suggestions render in an inline panel below the search prompt with `renderAutocompleteSuggestions()`

**Dynamic value extraction:**
- Projects: extracted from `task.project` across all tasks
- Areas: extracted from `task.area` across all tasks
- Tags: extracted from `task.tags[]` across all tasks
- Parents: extracted from `task.parent` across all tasks
- Limited to 10 suggestions for performance

## Screen Model / State

`src/tui/interactive.ts` keeps a single `SessionState` with:
- `views`, `viewIndex`, `projects.drilldownProjectId`
- `statusMode` (`open` vs `all`) and `search` state (active/scope/input with cursor)
- selection + scroll (`row`, `scroll`, `selectedId`)
- `fileMtimes` to detect external edits
- `filteredTasks` or `filteredProjects` as the current render list

Input editing helpers:
- `src/tui/text-input.ts` provides a small single-line editor used by search and modal fields (cursor movement, word/line jumps, deletions).

Rendering:
- Full-screen redraw on every state change (simple + reliable)
- Resize handler recomputes list height and scroll window
- Task lists are rendered as `renderRows` (area headers + project headers + task rows); headers are selectable and can be folded/unfolded (area/project/task collapse state stored in session state).
- Task rows display bucket + priority shorthands to help users learn the todo-format shorthands:
  - priority: `(A)/(B)/(C)` (high/normal/low)
  - bucket: `*/!/>/~/?` (now/today/upcoming/anytime/someday)
- Help is always rendered at the bottom, below the details lines.
- The current view tab is rendered with a distinct background color in the tabs row.

## Keybindings (v1)

Global:
- `q` quit
- `Ctrl+C` quits if pressed twice (first press shows a prompt)
- `0–9` jump to view
- `h/l` or `←/→` previous/next view
- `z` show/hide done (query rewrite)
- `/` enter live search (prefilled with current query + a trailing space)
- `?` shorthand help (priority/bucket)
- in search: type filters or plain words (plain words are treated as `text:` filters)
- in search: `Enter` applies and returns to list; `Esc`/`Ctrl+C` cancels; `!`/`Ctrl+/` toggles scope; `z` toggles status mode
- in search (autocomplete): `Tab` accepts suggestion; `↑/↓` navigate suggestions; typing filters suggestions in real-time

Movement:
- `j/k` or `↑/↓` move
- `g/G` top/bottom
- `Ctrl+U`/`Ctrl+D` half-page
- `PgUp`/`PgDn` half-page (best-effort; depends on terminal-kit key mapping)
- `:` go to line (row-number jump in task list)
- `Enter` toggles fold/unfold on area headers, project headers, and tasks with children

Task actions:
- `space` toggle done (done cascades to all descendants; undone does not cascade)
- `x` toggle done (alias for `space`)
- `r` delete task (with confirmation; deletes subtasks too)
- `p` priority menu (h/n/l/c) — shorthands: `h` high, `n` normal, `l` low
- `b` bucket menu (n/t/u/a/s/c) — shorthands: `n` now, `t` today, `u` upcoming, `a` anytime, `s` someday
  - plus rule: if bucket becomes `today` and `plan` is empty, set `plan` to today
- `n` toggle `bucket:now` on/off for the selected task
- `t` plan menu (today/manual/clear)
- `d` due menu (today/manual/clear)
- `e` edit modal (Text + Meta):
  - Multi-field, command-line-style UX
  - `Tab`: apply autocomplete if a list is open, otherwise move to next field
  - `Shift+Tab`: previous field (best-effort; terminal support varies)
  - `Enter`: apply suggestion if list is open; otherwise next field / save on final field
  - `↑/↓`: navigate suggestions if list is open; otherwise move between fields
- `a` add task modal (Project + Text + Meta):
  - Same key semantics as `e`
  - Default destination still inferred by context (project drilldown → single-project list → selected task’s project → `interactive.defaultProject`), but the modal always starts focused on Project so the destination is explicit/editable
  - Metadata uses shared autocomplete UI (same renderer as `/` search)

Projects view:
- `Enter` drills down into a project (shows that project’s tasks)
- Projects list supports “type to filter” by default (live substring match on id/name/area); list navigation uses arrow keys (↑/↓), not vim keys.
- `Ctrl+N` adds a new project (writes a new project heading and switches into that project’s drilldown view)
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
