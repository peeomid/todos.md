# TMD TUI Architecture (`tmd interactive`)

This document is the technical architecture reference for the interactive TUI. It complements:
- `tui_specs.md` (requirements/spec)
- `tui_implementation_details.md` (implementation map / file-level notes)

---

## 1. Entry Points and Lifecycle

- CLI command: `src/cli/interactive-command.ts`
  - Startup: `enrich → index → load todos.json → run TUI`
  - Exit: rebuild index from disk → write output → optionally run `sync`
- TUI runtime: `src/tui/interactive.ts`
  - Uses `terminal-kit` fullscreen + key events
  - Performs full-screen redraw on state changes (simple + reliable)

---

## 2. Data Model (Source of Truth)

- Canonical data: Markdown task files (`todos.md` + configured files).
- Derived cache: `todos.json` (built via `buildIndex(files)`).
- During a TUI session:
  - Reads/searches operate on an in-memory `TaskIndex`.
  - Writes mutate Markdown files directly.
  - After each write, the TUI rebuilds the in-memory `TaskIndex` from disk (`refreshIndex`).

---

## 3. State Model

The TUI keeps one `SessionState` (in `src/tui/interactive.ts`) containing:

- View state: `views[]`, `viewIndex`, `projects.drilldownProjectId`
- Query state:
  - `query`: the currently active query string (persists after search is applied)
  - `statusMode`: `open` vs `all` (implemented as query rewrite to `status:open|all`)
  - `search`: `{ active, scope, input }`
    - `active` enables “live filtering as you type”
    - `Enter` applies `search.input` into `query` and exits search
    - `Esc` cancels search edits (keeps previous `query`)
- Selection state: `selection.{row,scroll,selectedId}`
- Derived render lists: `filteredTasks`, `renderRows` (headers + tasks), `filteredProjects`
- Safety: `fileMtimes` for external-edit detection prompts before writes

---

## 4. Query Parsing and Live Filtering

The TUI shares the same filter semantics as `tmd list` via `src/query/filters.ts`.

Filtering pipeline (in `recompute()`):

1. Choose the active query string:
   - If searching: use `search.input`
   - Otherwise: use `state.query`
2. Normalize status token based on `statusMode` (`status:open` or `status:all`).
3. Tokenize by whitespace.
4. Split tokens into:
   - **Structured** tokens: `key:value` (recognized by `parseFilterArg`)
   - **Free-text** tokens: anything else (each treated as `text:<token>`)
5. Build predicate filters and apply them to `index.tasks`.
6. Sort tasks by view sort spec (or default sort).
7. Render:
   - optionally grouped by project with visual header rows
   - headers are not selectable; selection is always on a task row

---

## 5. Write Path and Safety Guarantees

Before any write to a Markdown file:

- The TUI checks the file `mtime` against `fileMtimes`.
- If it changed, the user is prompted to reload from disk before proceeding.

Edits are “locate then mutate”:

- The TUI locates tasks via `metadata.id` within the project context (with a line-number hint).
- After writing, the TUI rebuilds the index from disk to keep state consistent.

---

## 6. Delete Task Design

TUI delete is implemented as:

- `r` keybinding in the task list (not in the Projects list).
- Confirmation prompt (yes/no) before deleting.
- Deletion removes the selected task plus its indented subtree from the Markdown file.

Implementation:

- Confirm prompt: `confirmYesNo()` in `src/tui/prompts.ts`
- File edit: `deleteTaskSubtree()` in `src/editor/task-deleter.ts`
  - Verifies the target line is a task line
  - Verifies expected task text (ignoring trailing metadata)
  - Deletes the task line and subsequent indented lines until indentation returns to the parent level

---

## 7. Keybindings (Summary)

Navigation:
- `0–9` jump views, `h/l` or `←/→` view cycle
- `j/k` or `↑/↓` move, `g/G` top/bottom, `Ctrl+U/Ctrl+D` half-page

Search:
- `/` enter search (prefilled with current query + trailing space)
- `Enter` apply search to `query` and return to list
- `Esc`/`Ctrl+C` cancel
- `!`/`Ctrl+/` toggle view vs global scope
- `?` show shorthand help overlay

Task actions:
- `space` toggle done (done cascades; undone does not)
- `x` toggle done (alias for `space`)
- `r` delete (with confirmation; deletes subtree)
- `p/b/n/d/e/a` (priority/bucket/plan/due/edit/add)

Add destination:
- `a` chooses a destination project by context: project drilldown → single-project list → selected task’s project → Inbox fallback (`interactive.defaultProject`, default `"inbox"`).
- Before entering task text, `Tab` opens a typeahead project picker to change the destination, and the add header always shows `Add task → <projectId> — <project name>`.
