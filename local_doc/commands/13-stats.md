# Command: `tmd stats`

**Tier**: 3 (Analysis)
**Priority**: Medium - performance metrics

---

## Purpose

Show task statistics and completion metrics. Answer "how am I doing?"

---

## Usage

```bash
tmd stats [filters...] [options]
```

## Filters

Same `key:value` filters as `tmd list` to scope stats:
- `project:`, `area:`, `bucket:`, `plan:`, `status:`, etc.

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--period <period>` | Focus on: `today`, `last-7d`, `last-30d`, `this-week` | `last-7d` |
| `--by <field>` | Group by: `project`, `area`, `bucket`, `energy` | `project` |
| `--json` | Output as JSON | `false` |

---

## Examples

```bash
# Overall stats
tmd stats

# Stats for work area
tmd stats area:work

# Stats for specific project
tmd stats project:as-onb

# This week's completion
tmd stats --period this-week

# Group by bucket
tmd stats --by bucket

# JSON output
tmd stats --json
```

---

## Output

### Text (default)

```
Task Stats (last 7 days)
========================

Overview:
  Total: 45 tasks
  Open: 32 | Done: 13

By Bucket (open):
  today:     5
  upcoming:  8
  anytime:  12
  someday:   7

By Energy (open):
  low:      10
  normal:   18
  high:      4

Completed:
  today:       2
  last 7 days: 13
  last 30 days: 28

  2025-12-04: 3
  2025-12-05: 1
  2025-12-06: 0
  2025-12-07: 5
  2025-12-08: 2
  2025-12-09: 1
  2025-12-10: 1

Top Projects (open):
  as-onb:  7 open (2 due this week)
  life:    5 open (1 overdue)
  bw-ads:  3 open

Overdue: 3 tasks
  life:   1
  as-onb: 2
```

### JSON

```json
{
  "period": "last-7d",
  "overview": {
    "total": 45,
    "open": 32,
    "done": 13
  },
  "byBucket": {
    "today": 5,
    "upcoming": 8,
    "anytime": 12,
    "someday": 7
  },
  "byEnergy": {
    "low": 10,
    "normal": 18,
    "high": 4
  },
  "completed": {
    "today": 2,
    "last7d": 13,
    "last30d": 28,
    "byDay": {
      "2025-12-04": 3,
      "2025-12-05": 1,
      "2025-12-06": 0,
      "2025-12-07": 5,
      "2025-12-08": 2,
      "2025-12-09": 1,
      "2025-12-10": 1
    }
  },
  "topProjects": [
    { "id": "as-onb", "open": 7, "dueThisWeek": 2 },
    { "id": "life", "open": 5, "overdue": 1 },
    { "id": "bw-ads", "open": 3 }
  ],
  "overdue": {
    "total": 3,
    "byProject": { "life": 1, "as-onb": 2 }
  }
}
```

---

## Metrics

### v1 Metrics

1. **Counts**: total, open, done
2. **By bucket** (open): today, upcoming, anytime, someday, other
3. **By energy** (open): low, normal, high
4. **Completed**: today, last 7d, last 30d, daily histogram
5. **Top projects**: by open count, with overdue/due-this-week flags
6. **Overdue**: count and breakdown by project

### Future Metrics

- Average task age
- Completion velocity (tasks/day trend)
- Stuck tasks (open > 30 days, no activity)
- Area breakdown

---

## Behavior

1. Load `todos.json`
2. Apply filters (if any)
3. Calculate metrics based on `--period`
4. Group by `--by` field where applicable
5. Format and output

---

## Implementation Notes

- Uses `completedAt` when present; falls back to `updated`
- Completion date inferred from `updated` when `completedAt` is missing

---

## Related

- `02-list.md` - filter engine
- `11-enrich.md` - sets updated field
