# `tmd interactive` (TUI) – Implementation Plan

Source spec: `local_doc/tui_specs.md`.

This plan describes how to implement the interactive full-screen terminal UI for `tmd` while preserving the existing “Markdown is canonical” workflow.

**Status:** Implemented on 2025-12-19. See `local_doc/tui_implementation_details.md`.

---

## Goals (v1)

- Full-screen TUI launched via `tmd interactive` and shortcut alias `tmd i`.
- Startup ensures tasks have IDs: run `tmd enrich` before indexing.
- Views: built-ins `0–5` + custom views from config; view cycling via `h/l` and arrows.
- In-view live search (`/`) with scope toggle (view/global), live filtering on each keypress.
- Global show/hide done toggle (`z`) rewrites the current query (`status:open` ↔ `status:all`).
- Task list rendering is grouped by project in all task views, using a header row: `projectId — project name (count)`.
- Task actions: toggle done (space), set priority (`p`), bucket (`b`), plan (`n`), due (`d`), edit (`e`), add (`a`).
- Edits write to Markdown files immediately, update in-memory tasks immediately, and reindex again on exit.
- Soft protection: detect external file edits with `mtime` and prompt before writing.
- Sync runs once on exit (not after every edit): run `tmd sync` after the final reindex.

---

## Non-goals (v1)

- External editor integration for `e` (open `$EDITOR` at line) – defer to v2.
- Key remapping config – defer to v2.
- `r` refresh (reload `todos.json` without restart) – optional v2.
- Fancy theming / configurable palette beyond a minimal default (leave hooks for later).

---

## Constraints / Invariants

- Markdown files are the single source of truth; `todos.json` is derived.
- TUI must not rewrite non-task content.
- All write operations must go through safe task identification (via `globalId` + verified file context) and avoid blind line edits.
- Session startup runs `enrich` then index; exit runs index again.
- Session exit runs `sync` once after reindex.

---

## Proposed Technical Approach

### TUI library

Decision: use `terminal-kit` for v1.

Rationale:
- Minimal deps and good performance.
- Imperative rendering fits a “small + stable” TUI.
- Testability comes from keeping input/state logic pure and isolating terminal rendering behind an interface.

Implementation approach (terminal-kit):
- Enter full-screen / alternate screen and grab input on start; always restore terminal on exit (including crash paths).
- Render is a pure function of state + terminal size:
  - `render(state, viewport)` draws header, list, details/help, and optional search bar.
  - Re-render on state change and on terminal resize.
- Keep a small input dispatcher that maps keypresses → domain actions (e.g. `ToggleDone`, `SetBucket('today')`, `EnterSearch`, `SearchAppendChar('a')`).
- Keep domain state transitions separate from file IO (helps unit testing).

Rendering strategy (terminal-kit):
- Prefer buffered rendering to reduce flicker:
  - Use a single off-screen buffer per frame (e.g. ScreenBuffer-like approach), then blit/draw once.
  - Only fall back to direct `term.moveTo()`/`term.erase*()` style drawing if complexity stays very low.
- Treat the terminal as a “viewport”:
  - Always compute visible rows from `selection` + scroll offset.
  - Never assume a fixed terminal size; redraw on resize.
- Keep rendering dumb:
  - Rendering reads state and prints.
  - Rendering does not parse filters, touch files, or mutate state.

### Data model

- Load index from output (`todos.json` by default; configurable via `output`).
- Keep an in-memory array of tasks for filtering/sorting/rendering.
- Keep session state:
  - `viewIndex`, `views[]` (built-ins + config)
  - `query`: string (single source of truth for what’s shown)
  - `mode`: `tasks` | `projects`
  - `search`: `{ active, scope: 'view'|'global', input }`
  - `selection`: `{ rowIndex, taskGlobalId? }`
  - `fileMtimes: Map<filePath, mtimeMs>`
  - `taskLocatorByFile: Map<filePath, Map<globalId, lineNumber>>` (rebuilt on demand)

### Query/filtering

Reuse the existing filter syntax from `tmd list`:
- Parse query string into filter options.
- Apply filters in memory.

Refactor target:
- Move filter parsing/building into a non-CLI module (e.g. `src/query/filters.ts`) so both `tmd list` and the TUI use the same logic.
- Add a thin adapter for spec differences:
  - spec `status:any` → existing `status:all`
  - `z` is expressed by rewriting the query (`status:open` ↔ `status:all`), per updated spec.

### Sorting

Spec wants multi-field sorting for custom views: `sort: "bucket,plan,due"`.

Plan:
- Implement stable multi-sort (left-to-right priority): compare by each field until non-zero.
- Extend existing sort support to include `plan` and `due` together.
- Use consistent “missing value last” semantics (define explicitly).

### Editing

Prefer shared “edit primitives” used by both CLI and TUI:
- Status toggle logic (including done cascade-to-children, undone no cascade).
- Metadata editing (priority/bucket/plan/due etc) that preserves metadata ordering rules and updates `updated:<today>`.
- Task line rewrite should:
  - locate task by `globalId` (i.e. `projectId:localId`)
  - fast path: use in-memory `lineNumber` as a hint and verify before writing
  - fallback: if verification fails or `mtime` changed, re-parse the file to rebuild `globalId -> lineNumber` mapping, then retry
  - rewrite only that single task line

---

## Milestones

### Milestone 0 — CLI wiring + alias

- Add new command `interactive` and alias `i` (both map to the same handler).
- Add `tmd interactive --help` output and show it in top-level `tmd --help`.
- Ensure “not implemented” errors are clear until Milestone 2+.

Acceptance:
- `tmd interactive --help` and `tmd i --help` work.

### Milestone 1 — Config + views

- Extend config schema to support interactive-specific settings in JSON:
  - `interactive.views[]`: `{ key, name, query, sort? }`
  - `interactive.groupBy`: `"project"` (default) | `"none"`
  - `interactive.colors.disable` (optional)
- Implement built-in views `0–5`:
  - `0 All`: `status:open` (default); `z` toggles to `status:all`
  - `1 Today`: `status:open bucket:today`
  - `2 Upcoming`: `status:open bucket:upcoming`
  - `3 Anytime`: `status:open bucket:anytime`
  - `4 Someday`: `status:open bucket:someday`
  - `5 Projects`: project list mode
- Merge custom views into the view cycle.

Acceptance:
- Views load from config and can be switched by key.

### Milestone 2 — UI skeleton

- Full-screen layout:
  - Header tabs (current view name + shortcuts)
  - Main list
  - Details/help footer
  - Optional search bar overlay
- Startup status: show progress text while running `enrich`, `index`, and loading `todos.json`.
- Robust terminal lifecycle:
  - enter full-screen mode on start
  - restore terminal on exit and on exceptions
- Render task rows with:
  - checkbox status
  - priority indicator
  - text
  - global id
  - plan/est snippets when present

Acceptance:
- Basic render + navigation works with a read-only dataset (and terminal is restored cleanly).

### Milestone 3 — Navigation + filtering + search

- Keybindings:
  - `j/k/↑/↓`, `g/G`, `Ctrl+U/Ctrl+D`, PgUp/PgDn
  - view switching `0–9`, `h/l/←/→`
  - `z` rewrites query `status:open` ↔ `status:all`
- Live search:
  - `/` enters search, prefilled with current view base query
  - updates filter on every keypress
  - `!` or `Ctrl+/` toggles scope view/global
  - `Esc`/`Ctrl+C` exits and restores base view
- Header displays the effective query string (single source of truth).

Acceptance:
- Task list updates live, and selection stays stable when possible.

### Milestone 4 — Task actions (write path)

- Implement writes to Markdown and immediate in-memory updates for:
  - `space`: toggle done (open→done cascades; undone doesn’t cascade)
  - `p`: priority popup (h/n/l/c)
  - `b`: bucket popup (t/u/a/s/c), with “if bucket=today and plan empty, set plan=today”
  - `n`: plan popup (today/manual/clear)
  - `d`: due popup (today/manual/clear)
- Extend date parsing to support manual shortcuts:
  - `YYYY-MM-DD`
  - `+Nd` and `+Nw` (convert to canonical date)

Acceptance:
- Each action updates the right Markdown line and the UI updates immediately.

### Milestone 5 — `e` inline editor (v1 choice)

- Popup editor with two fields:
  - task text
  - metadata block (raw `[key:value ...]` or parsed UI; v1 can be raw with validation)
- Save rewrites the task line and updates in-memory data.

Acceptance:
- Editing doesn’t corrupt metadata ordering rules and keeps task mapping stable.

### Milestone 6 — `a` add task flow

- Multi-prompt flow as spec:
  1) task text
  2) priority
  3) bucket
  4) plan
  5) due
- Determine target project:
  - if in project view: current project
  - otherwise: configured `defaultProject` (or `inbox` fallback)
- Append under correct project heading and generate next ID.

Acceptance:
- Newly created tasks appear immediately in the current view if they match.

### Milestone 7 — Soft protection (mtime) + incremental reload

- On TUI start: record `mtimeMs` for each parsed file.
- Before writing to a file:
  - if `mtime` changed, prompt reload y/n
  - if yes: re-parse file and reconcile task mapping; then apply edit if still valid
  - if no: cancel write and warn
- After each write:
  - update recorded mtime
  - re-parse only the modified file to refresh line numbers (preferred)
  - never run `index`/`sync` on each edit (those run on exit only)

Acceptance:
- External edits are detected and do not get overwritten silently.

### Milestone 8 — Exit behavior

- On quit (`q`):
  - show exit progress text (`reindexing…`, `syncing…`)
  - run `tmd index` logic again (call indexer directly)
  - write `todos.json`
  - run `tmd sync` once (call sync logic directly)
  - exit cleanly (restore terminal)

Acceptance:
- Index file matches the final Markdown state.

---

## Testing / Validation Plan

- Unit tests:
  - date parsing for `+Nd/+Nw`
  - query parsing adapter for `status:any` → `status:all` (if implemented)
  - cascade done behavior (parent → descendants)
  - metadata rewrite (preserves line format, updates `updated`)
- Manual smoke tests:
  - open/quit without changes
  - press `z` to set `status:open`, then toggle done and verify task disappears from the list
  - edit priority/bucket/plan/due and verify Markdown edits are minimal
  - mtime prompt by editing the file externally during session

---

## Open Questions (to resolve before Milestone 1–2)

- Config format: spec shows YAML examples, but project config is JSON; implement as JSON under `.todosmd.json` (recommended).
- Projects view details:
  - sorting projects (by id/name/area)
  - what the “project task list” default sort should be

## Implementation Notes (What Landed)

- Command wiring: `tmd interactive` + alias `tmd i`.
- Config: `interactive.views[]`, `interactive.groupBy`, `interactive.colors.disable`, `interactive.defaultProject`.
- Shared query logic extracted to `src/query/filters.ts` and re-used by the TUI.
- Implemented navigation, live search, status toggle (`z`), project drilldown, and all v1 task actions.
- Implemented `mtime` protection prompt before any write.
- Exit behavior: reindex in-process and run `sync` once if `views` are configured.
