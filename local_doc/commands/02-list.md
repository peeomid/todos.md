# Command: `tmd list`

**Tier**: 1 (Core)
**Priority**: Highest - primary query interface

---

## Purpose

List and query tasks from the index with various filters. This is the primary way to view and search tasks.

---

## Usage

```bash
tmd list [filters...] [options]
```

## Filter Syntax

Filters use a unified `key:value` syntax. Spaces are AND. Use `|` or `OR` for OR, with parentheses for grouping.

| Filter | Description | Example |
|--------|-------------|---------|
| `project:<id>` | Filter by project ID | `project:as-onb` |
| `area:<name>` | Filter by area | `area:work` |
| `energy:<level>` | Filter by energy level | `energy:low` |
| `priority:<level>` | Filter by priority (high, normal, low) | `priority:high` |
| `due:<date>` | Filter by due date | `due:today` |
| `overdue:true` | Show only overdue tasks | `overdue:true` |
| `status:<status>` | open, done, all | `status:done` |
| `tags:<tags>` | Filter by tags (comma-separated) | `tags:email,urgent` |
| `bucket:<bucket>` | Filter by bucket | `bucket:today` |
| `plan:<date>` | Filter by plan date | `plan:today` |
| `updated:<date>` | Filter by updated date | `updated:yesterday` |
| `completed:<date>` | Filter by completed date (`completedAt`) | `completed:yesterday` |
| `parent:<id>` | Show children of a task | `parent:as-onb:1` |
| `top-level:true` | Show only top-level tasks | `top-level:true` |

Date specs (for `due`, `plan`, `updated`, `completed`):
- `today`, `yesterday`, `tomorrow`
- `this-week`, `next-week`
- `last-7d`, `last-30d`
- `YYYY-MM-DD`, `YYYY-MM-DD:YYYY-MM-DD`

Boolean logic:
- Space = AND
- `|` or `OR` = OR (use parentheses to group)

Shortcut:
- `tmd list today` expands to `(bucket:today | plan:today | due:today)`
- Status shorthands: `done`, `open`, `all` → `status:done|open|all`
- When `done` is present, a bare date spec maps to `completed:<date>` (e.g. `done yesterday`)

## Display Options

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--json` | | Output as JSON | `false` |
| `--format <fmt>` | `-f` | compact, full, markdown | `compact` |
| `--group-by <field>` | `-g` | project, area, due, bucket, none | `project` |
| `--sort <field>` | `-s` | due, created, project, energy, priority | `project` |
| `--limit <n>` | `-l` | Limit number of results | unlimited |

---

## Examples

```bash
# List all open tasks (default: status:open)
tmd list

# Today shortcut (bucket/plan/due)
tmd list today

# Filter by project
tmd list project:as-onb

# Filter by energy (light tasks)
tmd list energy:low

# Today's tasks by bucket
tmd list bucket:today

# Tasks planned for today
tmd list plan:today

# Tasks due today
tmd list due:today

# This week's tasks
tmd list due:this-week

# Overdue tasks
tmd list overdue:true

# Completed tasks
tmd list status:done

# Completed yesterday (shorthand)
tmd list done yesterday

# Combine filters (AND logic)
tmd list project:inbox energy:low status:open

# OR with grouping
tmd list "(bucket:today | plan:today) priority:high"

# Multiple filters for daily planning view
tmd list status:open bucket:today

# High priority tasks only
tmd list priority:high

# High priority tasks due today
tmd list priority:high bucket:today

# Sort by priority within bucket
tmd list bucket:today --sort priority

# Group by project
tmd list --group-by project

# JSON output for AI
tmd list --json

# Full format with details
tmd list --format full

# Markdown output (same format as sync blocks)
tmd list bucket:today --format markdown

# Limit results
tmd list --limit 10
```

---

## Output

### Compact format (default, grouped by project)

```
## as-onb (Autosenso onboarding)

as-onb:1    Draft welcome email [energy:normal est:60m]
as-onb:1.1  └─ Subject lines A/B test [energy:low est:30m]
as-onb:1.2  └─ Body copy variants [energy:normal est:45m]
as-onb:2    Implement tracking code [due:2025-12-20]

## inbox

inbox:1     Call bank about card [energy:low est:15m]

5 tasks (5 open)
```

### Full format (`--format full`)

```
as-onb:1 - Draft welcome email
  Project: as-onb (Autosenso onboarding)
  Status: open
  Energy: normal | Est: 60m
  Children: 2

as-onb:1.1 - Subject lines A/B test
  Project: as-onb (Autosenso onboarding)
  Status: open
  Energy: low | Est: 30m
  Parent: as-onb:1

...

5 tasks (5 open)
```

### Flat list (`--group-by none`)

```
as-onb:1    Draft welcome email [energy:normal est:60m]
as-onb:1.1  └─ Subject lines A/B test [energy:low est:30m]
as-onb:1.2  └─ Body copy variants [energy:normal est:45m]
as-onb:2    Implement tracking code [due:2025-12-20]
inbox:1     Call bank about card [energy:low est:15m]

5 tasks (5 open)
```

### JSON (`--json`)

```json
{
  "tasks": [
    {
      "globalId": "as-onb:1",
      "localId": "1",
      "projectId": "as-onb",
      "text": "Draft welcome email",
      "completed": false,
      "energy": "normal",
      "est": "60m",
      "childrenIds": ["as-onb:1.1", "as-onb:1.2"]
    },
    ...
  ],
  "summary": {
    "total": 5,
    "open": 5,
    "done": 0
  },
  "filters": {
    "status": "open"
  },
  "filterGroups": [["status:open"]],
  "query": "status:open"
}
```

---

## Date Filter Values

The `due:`, `plan:`, and other date filters accept special values:

| Value | Meaning |
|-------|---------|
| `today` | Due/planned today |
| `tomorrow` | Due/planned tomorrow |
| `this-week` | Within current week (Mon-Sun) |
| `next-week` | Within next week |
| `YYYY-MM-DD` | Exact date |
| `YYYY-MM-DD:YYYY-MM-DD` | Date range |

---

## Behavior

1. Load `todos.json` from configured path
2. Backfill `completedAt` for done tasks missing it (writes source + reindexes)
3. Apply filters in order
4. Sort results
5. Group if requested
6. Format output
7. Print summary

---

## Sorting Rules

When sorting tasks, the following order applies:

### Default sort (within bucket views)

1. **bucket** (today → upcoming → anytime → someday → custom → no bucket)
2. **plan/due** (earlier dates first, no date last)
3. **priority** (high → normal → low → no priority)
4. **id** (for stable ordering within same group)

### Priority sort (`--sort priority`)

When explicitly sorting by priority:
1. `priority:high` first
2. `priority:normal` second
3. `priority:low` third
4. Tasks without priority last

### Suggested bucket views with priority

```markdown
<!-- tmd:start name="today-high" query="status:open bucket:today priority:high" -->
<!-- tmd:end -->

<!-- tmd:start name="today-all" query="status:open bucket:today" -->
<!-- tmd:end -->
```

---

## Error Handling

| Error | Behavior |
|-------|----------|
| `todos.json` not found | Error: "No index found. Run `tmd index` first." |
| Invalid filter value | Error with specific message |
| No tasks match filters | Empty result with "0 tasks found" |

---

## Implementation Plan

### Dependencies

- `indexer/index-file.ts` - Read `todos.json`
- `schema/index.ts` - Validate index structure
- `cli/terminal.ts` - Colors and formatting

### Files to Create

```
src/cli/
├── list-command.ts           # Command handler
├── list-filters.ts           # Filter logic
├── list-formatters.ts        # Output formatters
└── date-utils.ts             # Date parsing helpers
```

### Implementation Steps

1. **Index loader**
   - Read and parse `todos.json`
   - Validate with Zod schema
   - Handle missing file error

2. **Filter functions** (`list-filters.ts`)
   - `parseFilterString(filterStr)` - Parse `key:value` into filter object
   - `filterByProject(tasks, projectId)`
   - `filterByArea(tasks, area)`
   - `filterByEnergy(tasks, level)`
   - `filterByPriority(tasks, level)` - Filter by priority (high, normal, low)
   - `filterByDue(tasks, dateSpec)`
   - `filterByStatus(tasks, status)`
   - `filterByTags(tasks, tags)`
   - `filterByBucket(tasks, bucket)`
   - `filterByPlan(tasks, dateSpec)`
   - `filterOverdue(tasks)`
   - Compose filters with AND logic inside groups, OR between groups
   - Same filter engine used by `tmd list` CLI and `tmd sync` embedded queries

3. **Date utilities** (`date-utils.ts`)
   - Parse `today`, `tomorrow`, `this-week`, etc.
   - Parse date ranges
   - Compare dates

4. **Sort functions**
   - Sort by due date, created, project, energy, priority
   - Priority order: high → normal → low → no priority
   - Handle missing values (tasks without field go last)

5. **Grouping logic**
   - Group by project, area, or due date
   - Maintain sort within groups

6. **Output formatters** (`list-formatters.ts`)
   - Compact text format
   - Full text format
   - JSON format
   - Subtask tree rendering (└─ prefix)

7. **Command handler** (`list-command.ts`)
   - Parse flags
   - Load index
   - Apply filters → sort → group → format
   - Print output

### Testing Strategy

- Unit tests for each filter function
- Unit tests for date parsing
- Integration test: sample index → expected output
- Edge cases: empty results, all done, no index

---

## Related

- `01-index.md` - Generates the index this command reads
- `03-show.md` - Shows single task (uses same formatters)
