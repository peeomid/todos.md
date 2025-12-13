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
