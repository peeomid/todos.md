# MVP Plan

## Phase 1: Bootstrap [DONE]
- [x] `pnpm init` + install deps (zod, ora, commander, es-toolkit)
- [x] Config files (tsconfig, biome, gitignore)
- [x] Minimal src/cli.ts entry point

## Phase 2: Core Parser [DONE]
- [x] metadata-parser.ts - parse `[key:value ...]`
- [x] markdown-parser.ts - extract projects & tasks
- [x] hierarchy.ts - parent/child from indentation

## Phase 3: Index Command [DONE]
- [x] Zod schemas (task, project, index)
- [x] indexer.ts - build todos.json
- [x] index-command.ts - CLI handler

## Phase 4: Lint Command [DONE]
- [x] Lint rules (13 rules per lint-rules.md)
- [x] linter.ts - orchestrator
- [x] lint-command.ts - CLI handler

## Phase 4.5: Spec Updates [DONE]
Recent spec changes implemented:

### Index Command Updates
- [x] Add inherited values during indexing:
  - `area`: inherit from project if not set on task
  - `energy`: default to `normal` if not set
  - `created`: set to today's date if not set
- [x] These values go in todos.json only, NOT written to markdown

### Lint Command Updates
- [x] Remove `invalid-week-format` rule (week field removed from spec)
- [x] Update `missing-id` rule: warning only, not fixable (use enrich instead)
- [x] Update lint rule count: 12 rules (was 13)

### New Enrich Command
- [x] Parse shorthands: `@today`, `@upcoming`, `@anytime`, `@someday`
- [x] Parse symbols: `!` (today), `>` (upcoming), `~` (anytime), `?` (someday)
- [x] Convert to `bucket:` and `plan:` metadata
- [x] Auto-generate missing `id:` for tasks
- [x] Add `created:` date for new tasks
- [x] Set `updated:` when modifying tasks
- [x] `--keep-shorthands` flag to preserve visual markers
- [x] `--dry-run` flag for preview
- [x] `--json` flag for JSON output

## Phase 5: List & Show Commands [DONE]
- [x] `tmd list` - query tasks with filters (project, area, energy, due, overdue, status, tags)
- [x] Display options (json, compact/full format, group-by, sort, limit)
- [x] Date utilities for parsing "today", "tomorrow", "this-week", "next-week"
- [x] `tmd show <id>` - show task details

## Phase 5.5: Spec Updates (Done/Undone/Add/Edit) [DONE]

### Done Command Updates
- [x] Add `--no-sync` flag to skip auto-sync
- [x] Add cascade behavior: marking parent done marks all children done
- [x] Add auto-sync: runs `tmd sync` after marking done (unless `--no-sync`)
- [x] Update JSON output to include `cascaded` array and `synced` field

### Undone Command Updates
- [x] Add `--no-sync` flag to skip auto-sync
- [x] Document NO cascade behavior (children stay as-is)
- [x] Add auto-sync: runs `tmd sync` after marking undone (unless `--no-sync`)
- [x] Update JSON output to include `synced` field

### Add Command Updates
- [x] Add `--no-sync` flag to skip auto-sync
- [x] Add auto-sync: runs `tmd sync` after adding task (unless `--no-sync`)
- [x] Update JSON output to include `synced` field
- [x] Add `--plan` flag for planned work date (YYYY-MM-DD, `today`, `tomorrow`)
- [x] Add `--bucket` flag for planning bucket (today, upcoming, anytime, someday, or custom)

### Edit Command Updates
- [x] Add `--no-sync` flag to skip auto-sync
- [x] Add auto-sync: runs `tmd sync` after editing task (unless `--no-sync`)
- [x] Update JSON output to include `synced` field
- [x] Add `--plan` flag for planned work date (YYYY-MM-DD, `today`, `tomorrow`, or `none`)
- [x] Add `--bucket` flag for planning bucket (today, upcoming, anytime, someday, custom, or `none`)

## Phase 6: Done/Undone/Add Commands [DONE]
- [x] `tmd done <id>` - mark task complete with cascade to children
- [x] `tmd undone <id>` - mark task incomplete (no cascade per spec)
- [x] `tmd add <project> "<text>"` - add new task with ID generation
- [x] Editor module: task-editor.ts, id-generator.ts, task-inserter.ts
- [x] Fixed hierarchy.ts childrenLocalIds bug

## Phase 6.5: Spec Updates (Sync & Filters)
- [x] Sync markers: `<!-- tmd:start query="..." -->` / `<!-- tmd:end -->` (HTML comments)
- [x] Filter syntax: unified key:value format for CLI and sync blocks (e.g., `status:open bucket:today`)

## Phase 7: Filters, Search, Edit, Stats, Sync [DONE]
- [x] `tmd list` - updated to use key:value filter syntax (project:, area:, status:, bucket:, priority:, plan:, text:, etc.)
- [x] Priority field added to schema, parser, and enrich command with (A)/(B)/(C) shorthands
- [x] `tmd search` - full-text search (thin wrapper over list with text: filter)
- [x] `tmd edit <id>` - edit task metadata (energy, priority, due, plan, bucket, area, tags, --add-tag, --remove-tag)
- [x] `tmd stats` - task statistics and completion metrics (by project/area/bucket/energy, period filtering)
- [x] `tmd sync` - bidirectional sync (pull done from views, push to regenerate view blocks)
- [x] `tmd block-template` - generate sync block skeletons with presets (today, upcoming, anytime, someday, light, week, overdue)
- [x] `--fix` support in lint for duplicate-tags rule

## Phase 8: Interactive TUI [DONE]
- [x] `tmd interactive` command + `tmd i` alias
- [x] Built-in views `0–5` + custom views via config (`interactive.views[]`)
- [x] Live search (`/`) with scope toggle, and `z` show/hide done query rewrite
- [x] Search UX: `/` prefill includes trailing space; plain words behave like `text:`; `Enter` applies query; `Esc` cancels
- [x] Task actions: toggle done (with cascade), priority/bucket/plan/due menus, inline edit, add flow
- [x] Task delete: `x` with confirmation (deletes indented subtree)
- [x] External edit protection via `mtime` prompt before writes
- [x] Exit behavior: reindex and run `sync` once (if views are configured)
- [x] TUI: group all task lists by project with header rows (`projectId — project name (N task(s))`)
- [x] TUI: improved color usage (task text vs metadata, priority/status accents)
- [x] TUI: footer always shows details + help, with separators
- [x] TUI: active view tab highlighted in header

## Next Steps
- [ ] `tmd init` - scaffold workspace (todos.md, config defaults, daily view, quickstart output)
- [ ] TUI v2: `$EDITOR` integration for `e` (open file at line)
- [ ] TUI v2: `r` refresh to reload index without restarting
- [ ] TUI v2: smoother rendering (buffered/diff rendering to reduce flicker)
- [ ] TUI v2: project view sorting and project stats summary


## Test Cases: Multi-Level Project Hierarchies

Parser should correctly handle deeply nested headings with mixed metadata.

### Sample Test File Structure

```markdown
# Inbox [project:in]

- [ ] Read article on productivity [id:1 energy:low est:30m]
- [ ] Review insurance documents [id:2 energy:normal]

---

# Work [area:work]

## Acme Corp [project:acme area:work]

### Current Sprint
- [ ] Fix authentication bug [id:1 energy:normal]
- [ ] Design API endpoints [id:2 energy:high est:2h]
  - [ ] Document request/response formats [id:2.1 energy:normal est:1h]
  - [ ] Review with team [id:2.2 energy:low est:30m]

### Backlog
- [ ] Refactor database layer [id:10 energy:high]
- [ ] Add caching mechanism [id:11 energy:normal]

## Internal Tools [project:tools area:work]

- [ ] Update deployment scripts [id:1 energy:normal est:1h]

---

# Life [area:life]

## Fitness [project:fit area:life]

### Running
- [ ] Sign up for 5K race [id:1 energy:low est:15m]
- [ ] Buy new running shoes [id:2 energy:low est:30m]

### Gym
- [ ] Research workout programs [id:3 energy:normal est:1h]

## Reading
- [ ] Finish current book [id:1 energy:low]

---

# Someday/Maybe [project:someday]

- [ ] Learn piano [id:1 energy:high]
- [ ] Build a side project [id:2 energy:high]
```

### Test Cases

#### Case 1: Top-level project (Inbox pattern)
```markdown
# Inbox [project:in]
- [ ] Read article [id:1]
```
- Task belongs to `in`, global ID = `in:1`

#### Case 2: Area-only heading with nested project
```markdown
# Work [area:work]
## Acme Corp [project:acme area:work]
### Current Sprint
- [ ] Fix bug [id:1]
```
- `# Work` has no project, only area
- Task belongs to `acme` (nearest project), global ID = `acme:1`
- Task inherits `area:work`

#### Case 3: Organizational headings (no metadata)
```markdown
## Acme Corp [project:acme]
### Current Sprint
- [ ] Task A [id:1]
### Backlog
- [ ] Task B [id:10]
```
- `### Current Sprint` and `### Backlog` have no metadata
- Both tasks belong to `acme`
- Global IDs: `acme:1`, `acme:10`

#### Case 4: Task directly under area-only heading (edge case)
```markdown
# Life [area:life]
## Reading
- [ ] Finish book [id:1]
```
- `# Life` has area but no project
- `## Reading` has no metadata
- Task has no project → **lint warning: missing project context**
- Task should still be parsed but flagged

#### Case 5: Sibling projects under same area
```markdown
# Work [area:work]
## Acme Corp [project:acme]
- [ ] Task A [id:1]
## Internal Tools [project:tools]
- [ ] Task B [id:1]
```
- Task A → `acme:1` with `area:work`
- Task B → `tools:1` with `area:work`
- Same local ID (1) is OK because different projects

#### Case 6: Deep nesting with subtasks
```markdown
## Acme Corp [project:acme]
### Sprint
- [ ] Design API [id:2]
  - [ ] Document formats [id:2.1]
  - [ ] Review with team [id:2.2]
```
- All belong to `acme`
- Parent/child relationships preserved
- Global IDs: `acme:2`, `acme:2.1`, `acme:2.2`

#### Case 7: Horizontal rules as section separators
```markdown
# Inbox [project:in]
- [ ] Task [id:1]

---

# Work [area:work]
```
- `---` is just visual separator, doesn't affect parsing
- Projects are determined by headings only
