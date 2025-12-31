# Command: `tmd search`

**Tier**: 2 (Query)
**Priority**: Medium - convenience layer over list

---

## Purpose

Full-text search for tasks. Thin wrapper over `tmd list` with implicit `text:` filter.

---

## Usage

```bash
tmd search <text> [filters...] [options]
```

## Arguments

| Arg | Description | Required |
|-----|-------------|----------|
| `<text>` | Search string (matches task text, project name) | Yes |

## Filters

Same `key:value` filters as `tmd list` (supports `|` / `OR` with parentheses for grouping):
- `project:`, `area:`, `energy:`, `status:`, `bucket:`, `plan:`, `due:`, `tags:`, `overdue:true`, etc.

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--json` | Output as JSON | `false` |
| `--format <fmt>` | compact, full | `compact` |

---

## Examples

```bash
# Search all tasks for "stripe"
tmd search "stripe"

# Search within a project
tmd search "welcome email" project:as-onb

# Search completed tasks
tmd search "invoice" status:done

# Search with date filter
tmd search "google ads" plan:last-7d area:work

# OR filters with grouping
tmd search "bank" "(bucket:today | plan:today) priority:high"

# JSON output
tmd search "onboarding" --json
```

---

## Output

Same as `tmd list`, showing matching tasks with file location.

### Text (default)

```
[as-onb:1] Draft welcome email
  file: projects/autosenso.md:23
  plan:2025-12-08  bucket:today  energy:normal

[as-onb:1.1] Subject lines A/B test
  file: projects/autosenso.md:25
  bucket:anytime  energy:low

2 tasks found
```

### JSON

```json
{
  "query": "welcome email",
  "filters": { "project": "as-onb" },
  "filterGroups": [["project:as-onb", "status:open"]],
  "tasks": [...],
  "count": 2
}
```

---

## Behavior

1. Parse search text and filters
2. Applies the same filter engine as `tmd list` (OR/grouping included)
3. `text:` filter matches against:
   - Task text (case-insensitive substring)
   - Project name
4. Return filtered results

---

## Implementation Notes

- Add `text:` filter to list-filters.ts
- `tmd search` is sugar: parses args then delegates to list command logic
- No separate query engine needed

---

## Related

- `02-list.md` - underlying filter engine
