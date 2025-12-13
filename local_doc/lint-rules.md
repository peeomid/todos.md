# TMD Lint Rules

This document defines lint rules for `tmd lint`. Rules are categorized by severity and fixability.

**Please review and answer the questions marked with `[Q]`.**

---

## Severity Levels

- **error**: Must be fixed. Blocks correct parsing or causes data issues.
- **warning**: Should be fixed. Best practice violations or potential issues.
- **info**: Optional. Suggestions for improvement.

---

## Proposed Rules

### 1. `duplicate-id`

**Severity**: error
**Fixable**: No

Two tasks in the same project have the same local ID, resulting in duplicate global IDs.

**Example**:
```markdown
# Project [project:inbox]

- [ ] Task A [id:1]
- [ ] Task B [id:1]  <!-- ERROR: duplicate id:1 -->
```

**Message**: `Duplicate ID 'inbox:1' (first seen on line 5)`

---

### 2. `invalid-date-format`

**Severity**: error
**Fixable**: No

Date value not in `YYYY-MM-DD` format.

**Applies to**: `due`, `created`, `updated`

**Example**:
```markdown
- [ ] Task [id:1 due:12-25-2025]  <!-- ERROR: should be 2025-12-25 -->
- [ ] Task [id:2 created:2025/12/08]  <!-- ERROR: wrong separator -->
```

**Message**: `Invalid date format '12-25-2025' in 'due' (expected YYYY-MM-DD)`

---

### 3. `invalid-energy-value`

**Severity**: error
**Fixable**: No

Energy value not one of: `low`, `normal`, `high`.

**Example**:
```markdown
- [ ] Task [id:1 energy:medium]  <!-- ERROR: should be normal -->
```

**Message**: `Invalid energy value 'medium' (expected: low, normal, high)`

---

### 4. `invalid-estimate-format`

**Severity**: error
**Fixable**: No

Estimate value not in recognized duration format.

**Valid formats**: `15m`, `30m`, `1h`, `1.5h`, `90m`, `2h`

**Example**:
```markdown
- [ ] Task [id:1 est:2 hours]  <!-- ERROR -->
- [ ] Task [id:2 est:1h30m]  <!-- ERROR? -->
```

**Message**: `Invalid estimate format '2 hours' (expected: 15m, 30m, 1h, etc.)`

**[Q] Should `1h30m` be valid, or only single-unit formats like `90m` or `1.5h`?**

> Your answer: That should be valid, this should be more flexibleyy

---

### 5. `malformed-metadata`

**Severity**: error
**Fixable**: No

Metadata block `[...]` cannot be parsed.

**Example**:
```markdown
- [ ] Task [id:1 energy:]  <!-- ERROR: empty value -->
- [ ] Task [id:1 energy]  <!-- ERROR: missing colon -->
- [ ] Task [id:1 energy:low est]  <!-- ERROR: est has no value -->
```

**Message**: `Malformed metadata: empty value for 'energy'`

---

### 6. `orphan-subtask`

**Severity**: error
**Fixable**: No

Subtask ID implies a parent that doesn't exist.

**Example**:
```markdown
# Project [project:inbox]

- [ ] Task [id:1]
- [ ] Subtask [id:3.1]  <!-- ERROR: no task with id:3 -->
```

**Message**: `Orphan subtask: ID '3.1' implies parent '3' which doesn't exist`

**[Q] Should this be an error, or just a warning? Some users might use dotted IDs without strict hierarchy.**

> Your answer: Just warning is ok, I don't want id number checking, it's sth for user to see only

---

### 7. `missing-id`

**Severity**: warning
**Fixable**: No (use `tmd enrich` instead)

Checkbox task without `id:` in metadata. Task won't be tracked.

**Example**:
```markdown
- [ ] Quick note without ID
```

**Message**: `Task without ID (not trackable). Run 'tmd enrich' to auto-generate IDs.`

**Note**: Auto-generating IDs is handled by `tmd enrich`, not lint. Lint only warns about missing IDs.

---

### 8. `missing-created-date`

**Severity**: warning
**Fixable**: Yes (add today's date)

Trackable task (has `id:`) without `created:` date.

**Example**:
```markdown
- [ ] Task [id:1 energy:low]  <!-- WARNING: no created date -->
```

**Message**: `Missing 'created' date on task inbox:1`

**Fix**: Add `created:YYYY-MM-DD` with today's date.

**[Q] Should this be a warning or just info? Is `created` important to you?**

> Your answer: Not important, cli should auto fill if I don't specify in index, but not a lint thing

---

### 9. `project-heading-without-id`

**Severity**: warning
**Fixable**: No

Heading that looks like a project but has no `project:` ID. Area-only headings (e.g. `# Work [area:work]`) are allowed.

**Example (allowed)**:
```markdown
# Work [area:work]  <!-- OK: structural heading sets area context -->
```

**Example (error)**:
```markdown
# My Project [area:work energy:high]  <!-- ERROR: has non-area metadata but no project: -->

- [ ] Task [id:1]
```

**Message**: `Heading 'My Project' has metadata but no 'project:' ID`

**[Q] Should tasks under such headings be indexed? Currently spec says project ID is required.**

> Your answer: This is important, should be an error

---

### 10. `task-outside-project`

**Severity**: warning
**Fixable**: No

Task appears before any project heading.

**Example**:
```markdown
<!-- No heading yet -->
- [ ] Task [id:1]  <!-- WARNING: no project context -->

# Inbox [project:inbox]
```

**Message**: `Task on line 2 has no project context`

**[Q] Should we allow tasks outside projects, maybe assigning them to a virtual "orphan" project?**

> Your answer: SHould be a warning, cli will potentially add to Inbox

---

### 11. `inconsistent-subtask-indent`

**Severity**: warning
**Fixable**: No

Subtasks use inconsistent indentation (mix of 2 and 4 spaces).

**Example**:
```markdown
- [ ] Parent [id:1]
  - [ ] Child A [id:1.1]  <!-- 2 spaces -->
    - [ ] Child B [id:1.2]  <!-- 4 spaces - inconsistent -->
```

**Message**: `Inconsistent indentation: expected 2 spaces, found 4`

**[Q] Should we enforce specific indent size (2 spaces), or just warn about inconsistency?**

> Your answer: Just warning is enough. Even with inconsistency, the cli should still be able to index

---

### 12. `past-due-date`

**Severity**: info
**Fixable**: No

Task has a due date in the past and is not completed.

**Example**:
```markdown
- [ ] Task [id:1 due:2025-01-01]  <!-- INFO: overdue -->
```

**Message**: `Task 'inbox:1' is overdue (due: 2025-01-01)`

**[Q] Should this be part of lint, or is `tmd list --overdue` sufficient?**

> Your answer: This is not a lint thing, should be list

---

### 13. `empty-project`

**Severity**: info
**Fixable**: No

Project heading with no tasks under it.

**Example**:
```markdown
# Empty Project [project:empty]

# Next Project [project:next]
- [ ] Task [id:1]
```

**Message**: `Project 'empty' has no tasks`

**[Q] Useful to warn about, or noise?**

> Your answer: Warning only

---

### 14. `duplicate-tags`

**Severity**: info
**Fixable**: Yes (deduplicate)

Same tag appears multiple times.

**Example**:
```markdown
- [ ] Task [id:1 tags:email,urgent,email]
```

**Message**: `Duplicate tag 'email' in task inbox:1`

---

## Summary Table (Final)

| Rule | Severity | Fixable | Status | Notes |
|------|----------|---------|--------|-------|
| `duplicate-id` | error | No | enabled | |
| `invalid-date-format` | error | No | enabled | |
| `invalid-energy-value` | error | No | enabled | |
| `invalid-estimate-format` | error | No | enabled | Flexible: `1h30m`, `90m`, `1.5h` all valid |
| `malformed-metadata` | error | No | enabled | |
| `project-heading-without-id` | error | No | enabled | Upgraded from warning |
| `orphan-subtask` | warning | No | enabled | No strict ID hierarchy checking |
| `missing-id` | warning | No | enabled | Use `tmd enrich` to auto-generate IDs |
| `task-outside-project` | warning | No | enabled | CLI may add to Inbox |
| `inconsistent-subtask-indent` | warning | No | enabled | Warn only, still index |
| `empty-project` | warning | No | enabled | |
| `duplicate-tags` | info | Yes | enabled | |
| `missing-created-date` | - | - | **removed** | CLI auto-fills on index, not a lint rule |
| `past-due-date` | - | - | **removed** | Use `tmd list --overdue` instead |

---

## Global Questions

**[Q] Should `tmd lint --fix` require confirmation before modifying files, or just do it?**

> Your answer: No need for confirmation

**[Q] Any other rules you want to add?**

> Your answer: Not for now

**[Q] Should rules be configurable (enable/disable per project)?**

> Your answer: Not for now

---

## Rule Configuration (Future)

If we support per-project rule config:

```json
{
  "lint": {
    "rules": {
      "missing-created-date": "off",
      "past-due-date": "warning"
    }
  }
}
```

**[Q] Is this level of configurability needed, or keep it simple?**

> Your answer: No support for config for now
