# Specs Change Log

Track specification changes that affect implementation.

---

## 2025-12-10: Multi-Level Project Hierarchies (Clarification)

### New Sections in todo-format-spec.md

**Section 2.3: Area-only headings**
- Headings can have `area:` without `project:` (e.g., `# Work [area:work]`)
- Sets area context for nested projects
- Tasks cannot belong directly to area-only headings (need a project for global ID)

**Section 2.4: Organizational headings**
- Headings without any metadata (e.g., `### Current Sprint`, `### Backlog`)
- Purely for visual organization
- Tasks inherit project from nearest ancestor with `project:`

**Section 2.5: Multi-level hierarchies**
- Comprehensive example showing real-world structure
- Deep nesting with subtasks
- Horizontal rules (`---`) as visual separators

### Files Updated
- `todo-format-spec.md` - Added sections 2.3, 2.4, 2.5

---

## 2025-12-10: Bidirectional Sync

### Overview
`tmd sync` is now bidirectional - it pulls done tasks from view files back to source files before regenerating views.

### Flow
1. **Pull phase**: Read all view files, find tasks marked `[x]`, update source files
2. **Reindex**: Run `tmd index` to update `todos.json`
3. **Push phase**: Regenerate view blocks from index (existing behavior)

### "Done Wins" Rule
If a task is marked done in ANY location (view or source), it's treated as done. This eliminates conflicts.

### New Options
- `--push-only`: Skip pull phase, only regenerate views
- `--pull-only`: Skip push phase, only pull done tasks
- `--file` is now optional if `views` is configured

### Config: View Files
```json
{
  "files": ["todos.md"],
  "output": "todos.json",
  "views": [
    "00-daily-focus.md",
    "weekly-plan.md"
  ]
}
```

### Files Updated
- `commands/09-sync.md` - Complete rewrite with bidirectional sync

---

## 2025-12-10: Priority System

### New `priority` Metadata Key
- **Values**: `priority:high`, `priority:normal`, `priority:low`
- **Purpose**: Indicate task importance relative to others
- **Sorting**: Used for ordering tasks within buckets/views

### New Priority Shorthand `(A)`/`(B)`/`(C)`
- Syntax: `- [ ] (A) Task text` immediately after checkbox
- Mapping:
  - `(A)` → `priority:high`
  - `(B)` → `priority:normal`
  - `(C)` → `priority:low`
- Inspired by todo.txt convention

### Full Line Structure
A max-complexity task line now follows this order:
1. Checkbox (`- [ ]` or `- [x]`)
2. Priority shorthand `(A)`/`(B)`/`(C)` (optional)
3. Bucket shorthand `!`/`>`/`~`/`?` (optional)
4. Task text
5. `@tags` at end of text (optional)
6. Metadata block `[...]` (optional)

Example: `- [ ] (A) ! Draft welcome email @today [id:1 energy:high est:60m]`

### Parsing Order for `tmd enrich`
1. Check for `(A)`/`(B)`/`(C)` immediately after checkbox → set `priority`
2. Check for `!`/`>`/`~`/`?` after optional priority → set `bucket` (and `plan` for `!`)
3. Check for `@today`/`@upcoming`/`@anytime`/`@someday` in text → set `bucket` (if not already set)

### Sorting Rules
Default sort within bucket views:
1. bucket (today → upcoming → anytime → someday → custom → none)
2. plan/due (earlier dates first)
3. priority (high → normal → low → no priority)
4. id (stable ordering)

### New Filter and Sort Options
- `tmd list priority:high` - Filter by priority
- `tmd list --sort priority` - Sort by priority
- `tmd stats priority:high` - Stats for high priority tasks

### Files Updated
- `todo-format-spec.md` - Section 4 (priority key), new Shorthand C section, parsing order, examples
- `cli-architecture.md` - Section 7.1 (index schema: added priority, plan, bucket)
- `commands/11-enrich.md` - Priority shorthand parsing, updated examples, implementation steps
- `commands/02-list.md` - Priority filter, sort options, sorting rules section

---

## 2025-12-10: Sync Markers & Filter Syntax

### Sync Block Markers
- **Old**: `<--AUTO-GENERATED:START query="--due today"-->`
- **New**: `<!-- tmd:start query="status:open bucket:today" -->` / `<!-- tmd:end -->`
- **Rationale**: HTML comments are hidden in rendered Markdown (GitHub, Obsidian), shorter/memorable prefix

### Filter Syntax (Unified)
- **Old**: CLI flags (`--due today --energy low`)
- **New**: Key:value pairs (`due:today energy:low`)
- **Applies to**: `tmd list` CLI args AND `query="..."` in sync blocks
- **Available filters**: `project:`, `area:`, `energy:`, `due:`, `status:`, `tags:`, `bucket:`, `plan:`, `overdue:true`, `top-level:true`, `parent:`

### Files Updated
- `commands/09-sync.md` - main sync spec
- `commands/02-list.md` - filter syntax
- `cli-architecture.md` - Section 9
- `todo-format-spec.md` - Section 7.1, summary
- `todo-system-requirements.md` - Section 7
- `local_doc/CLAUDE.md` - Important Patterns
- `commands/04-done.md`, `05-undone.md`, `06-add.md`, `08-edit.md` - auto-sync references
- `cli-commands.md`, `plan.md` - descriptions

---

## 2025-12-10: New Commands (search, stats, block-template)

### `tmd search`
- Full-text search for tasks
- Thin wrapper over `tmd list` with implicit `text:` filter
- Usage: `tmd search "stripe" project:as-onb`
- Spec: `commands/12-search.md`

### `tmd stats`
- Task statistics and completion metrics
- Counts, completion over time, by project/bucket/energy
- Usage: `tmd stats --period last-7d --by project`
- Spec: `commands/13-stats.md`

### `tmd block-template`
- Generate sync block skeletons for copy-paste
- Built-in presets: today, upcoming, anytime, someday, light, week, overdue
- Usage: `tmd block-template today` or `tmd block-template 'status:open project:x' --name x`
- Spec: `commands/14-block-template.md`

---

## 2025-12-10: Workspace Init Command

### Overview
- Added spec for `tmd init` to scaffold a new workspace with markdown, config, and view files.
- Defines default config keys (`files`, `output`, `views`, `defaults`) and starter quickstart checklist output.
- Includes optional `todos.json` stub, sync-ready `views/daily.md`, and behavior for dry-run/force/global config delegation.

### Files Created
- `commands/15-init.md` — new command spec with options, outputs, behavior, and error handling.

### Files Updated
- `cli-commands.md` — command summary and tier plan updated with `tmd init`.
- `cli-architecture.md` — project structure and default config notes mention `tmd init`.

---

## 2025-12-10: Lint Rule — Project Heading Without ID

### Overview
- Allow structural headings that only set `area:` metadata without requiring a `project:` ID.
- Rule still errors when other metadata (e.g., `energy:`) appears without a project ID.

### Files Updated
- `lint-rules.md` — documented the relaxed behavior.

---

## 2025-12-19: TUI Task List Grouping + Stronger Color Guidance

### Overview
- All task lists in `tmd interactive` are grouped by project with a visual header row: `projectId — project name (count)`.
- Color guidance is tightened to clearly distinguish task text vs metadata (IDs/dates/estimates), while keeping done tasks dim.
- Help display is always-on at the bottom, shown below task details.

### Files Updated
- `tui_specs.md` — updated the layout example and color usage section

---

## 2025-12-22: TUI Priority Order Toggle + Fold/Unfold All

### Overview
- Added `o` to toggle priority ordering: high-first → low-first → off.
- Added `f` to fold/unfold the selected row, and `F` to fold/unfold everything (reliable across terminals).
- Header “Flags” line now surfaces the current priority ordering mode alongside hide/show done.
- Projects view: changed default “type to filter” to an explicit `/`-activated filter mode to avoid collisions with `0–9` view switching.

### Files Updated
- `tui_specs.md` — keybindings + header/help examples updated

---

## 2025-12-19: TUI Search Apply/Cancel + Delete Action + TUI Architecture Doc

### Overview
- Search behavior clarified and implemented: `/` prefills with a trailing space, plain words behave like `text:` filters, `Enter` applies the query and returns to the list, and `Esc` cancels search edits.
- Added a delete action (`x`) with confirmation that removes the selected task and its indented subtree.
- Added a dedicated technical architecture document for the TUI.

### Files Updated
- `tui_specs.md`
- `tui_implementation_details.md`
- `tui.md`
- `tui-architecture.md`

---

## 2025-12-22: TUI Area Headings + Folding + Index Schema v2

### Overview
- Task lists in `tmd interactive` can now render **area-only headings** (e.g. `# Work [area:work]`) above their nested projects, in every view.
- Area headers only render when there is at least one matching task in the current view (no empty area sections).
- Added folding/unfolding via `Enter` for:
  - area headers
  - project headers
  - tasks with subtasks (hides all descendants)
- Projects view is “type-to-filter” by default; adding a project is now `Ctrl+N` (so typing never triggers create).

### Index Schema Changes
- Bumped `todos.json` schema version to `2`.
- Added `areas` to the index (keyed by area id, stores heading text + location).
- Added `parentArea` to projects to capture nearest area-only heading above a project heading (used for UI grouping and area inheritance).

### Files Updated
- `tui_specs.md`
- `tui.md`
- `tui_implementation_details.md`
- `cli-architecture.md`

---

## 2025-12-19: TUI Shorthand Help Overlay (`?`)

### Overview
- Added a dedicated shorthand help overlay (`?`) so users can quickly learn the row shorthands shown in the task list (priority `(A)/(B)/(C)` and bucket `!/>/~/?`).

### Files Updated
- `tui_specs.md`
- `tui_implementation_details.md`
- `tui-architecture.md`

---

## 2025-12-19: TUI Keybindings — `r` Remove and `x` Toggle Done

### Overview
- Changed the delete keybinding from `x` to `r` (remove) to reduce accidental deletes.
- `x` is now an alias for toggle done (same as `space`).

### Files Updated
- `tui_specs.md`
- `tui_implementation_details.md`
- `tui-architecture.md`

---

## 2025-12-19: TUI QoL — Double `Ctrl+C` Quit, Header Query Highlight, Add Project

### Overview
- `Ctrl+C` is now a safe quit shortcut: first press shows a prompt; second press (within a short window) quits.
- The header’s `Query:` value is highlighted to make the active query more noticeable.
- Projects view adds an `[a]` action to create a new project heading and immediately switch into that project’s drilldown view.

### Files Updated
- `tui_specs.md`
- `tui_implementation_details.md`
- `tui.md`

---

## 2025-12-19: TUI Add Project Flow — Use Current File + Clearer Key Menu Guidance

### Overview
- Add-project no longer asks the user to pick a project file: it writes to the current context file (selected project’s file, else selected task’s file, else first configured input file).
- Add-project no longer prompts for heading level: it auto-picks `#` vs `##` based on the destination file.
- Key menus now show an explicit footer hint indicating selection keys (e.g. `[1-9] choose`, `[h/n/l] choose`) to reduce first-run confusion.

### Files Updated
- `tui_specs.md`
- `src/tui/interactive.ts`
- `src/tui/prompts.ts`

---

## 2025-12-20: TUI Search Autocomplete + Input Field Cursor Visibility

### Overview
- Fixed search autocomplete visibility and correctness:
  - Autocomplete panel now reserves screen space while search is active (so it doesn't render off-screen).
  - Accepting a filter-key suggestion no longer inserts a trailing space (so `bucket:` immediately triggers value suggestions).
- Improved input UX across the TUI:
  - Search, text prompts, and project picker now render a consistent bracketed input field with a clearly visible cursor.
  - Input field styling uses a subtle dark background (better for iTerm/dark themes).

### Files Updated
- `tui_specs.md`
- `tui_implementation_details.md`
- `src/tui/interactive.ts`
- `src/tui/autocomplete.ts`
- `src/tui/layout.ts`
- `src/tui/input-render.ts`
- `src/tui/prompts.ts`

---

## 2025-12-20: TUI Cursor Editing + Project Field Display

### Overview
- Input fields (search + add/edit modals + prompts) now support cursor movement and mid-string editing, including word/line navigation and word/line deletion (best-effort across terminals; macOS Option/Cmd patterns supported where possible).
- Add-task modal: when a project is selected, the Project field displays `projectId — project name` (instead of only the id).
- Projects view: project rows display aligned `id — name` and no longer show file paths.

### Files Updated
- `tui.md`
- `tui_specs.md`
- `tui-architecture.md`
- `tui_implementation_details.md`
- `src/tui/input-render.ts`
- `src/tui/interactive.ts`
- `src/tui/prompts.ts`
- `src/tui/text-input.ts`

---

## 2025-12-22: TUI “Now” Bucket + Rekeyed Views

### Overview
- Added `bucket:now` for “working on right now”.
- Built-in view keys are now: `0` All, `1` Now, `2` Today, `3` Upcoming, `4` Anytime, `5` Someday, `6` Projects.
- Keybindings:
  - `n` toggles `bucket:now` on the selected task.
  - Plan menu moved from `n` to `t`.
- Shorthands:
  - `*` (symbol) and `@now` map to `bucket:now` via `tmd enrich`.

### Files Updated
- `tui.md`
- `tui_specs.md`
- `tui_implementation_details.md`
- `todo-format-spec.md`
- `commands/11-enrich.md`
- `commands/14-block-template.md`
- `src/tui/interactive.ts`
- `src/enricher/shorthand-parser.ts`
