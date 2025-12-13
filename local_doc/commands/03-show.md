# Command: `tmd show`

**Tier**: 1 (Core)
**Priority**: High - essential for debugging and inspection

---

## Purpose

Display detailed information about a single task by its global ID. Useful for inspecting task metadata, location, and hierarchy.

---

## Usage

```bash
tmd show <global-id> [options]
```

## Arguments

| Argument | Description | Required |
|----------|-------------|----------|
| `<global-id>` | Task global ID (e.g., `as-onb:1.1`) | Yes |

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--json` | Output as JSON | `false` |

---

## Examples

```bash
# Show task details
tmd show as-onb:1.1

# JSON output
tmd show inbox:1 --json

# Show parent task with children
tmd show as-onb:1
```

---

## Output

### Text (default)

```
Task: as-onb:1.1
Text: Subject lines A/B test
Status: open

Project: as-onb (Autosenso onboarding)
Area: sidebiz

Metadata:
  energy: low
  est: 30m
  created: 2025-12-08

Location:
  File: projects/autosenso.md
  Line: 15

Hierarchy:
  Parent: as-onb:1 (Draft welcome email)
  Children: none
```

### With children

```
Task: as-onb:1
Text: Draft welcome email
Status: open

Project: as-onb (Autosenso onboarding)
Area: sidebiz

Metadata:
  energy: normal
  est: 60m

Location:
  File: projects/autosenso.md
  Line: 12

Hierarchy:
  Parent: none (top-level)
  Children:
    - as-onb:1.1 (Subject lines A/B test)
    - as-onb:1.2 (Body copy variants)
```

### JSON (`--json`)

```json
{
  "globalId": "as-onb:1.1",
  "localId": "1.1",
  "projectId": "as-onb",
  "text": "Subject lines A/B test",
  "completed": false,
  "metadata": {
    "energy": "low",
    "est": "30m",
    "created": "2025-12-08"
  },
  "project": {
    "id": "as-onb",
    "name": "Autosenso onboarding",
    "area": "sidebiz"
  },
  "location": {
    "filePath": "projects/autosenso.md",
    "lineNumber": 15
  },
  "hierarchy": {
    "parentId": "as-onb:1",
    "parentText": "Draft welcome email",
    "childrenIds": []
  }
}
```

---

## Behavior

1. Load `todos.json`
2. Look up task by global ID
3. Fetch related info (project, parent, children)
4. Format and display

---

## Error Handling

| Error | Behavior |
|-------|----------|
| `todos.json` not found | Error: "No index found. Run `tmd index` first." |
| Task ID not found | Error: "Task 'xxx' not found." |
| Invalid ID format | Error: "Invalid task ID format. Expected 'project:localId'." |

---

## Implementation Plan

### Dependencies

- `indexer/index-file.ts` - Read `todos.json`
- `schema/index.ts` - Validate index
- `cli/terminal.ts` - Colors and formatting

### Files to Create

```
src/cli/
└── show-command.ts           # Command handler
```

### Implementation Steps

1. **Parse arguments**
   - Extract global ID from args
   - Validate format (contains `:`)

2. **Load and lookup**
   - Load index
   - Find task by globalId
   - Find project info
   - Find parent task (if parentId exists)
   - Get children texts

3. **Format output**
   - Text formatter with sections
   - JSON formatter

4. **Command handler**
   - Parse args/flags
   - Lookup
   - Format
   - Print or error

### Testing Strategy

- Test valid ID lookup
- Test invalid ID format
- Test missing task
- Test task with children
- Test top-level task (no parent)

---

## Related

- `02-list.md` - Lists multiple tasks
- `08-edit.md` - Edit task after viewing
