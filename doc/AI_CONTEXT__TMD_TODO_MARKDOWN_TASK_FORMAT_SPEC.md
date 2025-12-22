# AI Context: Todo Markdown Task Format Spec (tmd)

This document describes the **Markdown file format** that `tmd` parses and edits.

## 1) Core idea

- Tasks are Markdown checklist items (`- [ ]` / `- [x]`).
- Projects are Markdown headings that carry a stable `project:` identifier.
- Extra task/project data is stored in a trailing metadata block: `[key:value key:value ...]`.

## 2) Project headings

A project is any Markdown heading that includes `project:<project-id>` in its metadata:

```md
# Autosenso onboarding [project:as-onb area:sidebiz]
```

Rules:
- `project:<id>` identifies the project; it should be stable even if the heading text changes.
- `area:<name>` is optional; it can be placed on a project heading or on an “area-only” heading (below).
- Only headings with `project:` establish a project context for tasks.

### 2.1) Project inheritance

- A task belongs to the **nearest heading above it** that has a `project:` key.
- Headings without `project:` are organizational only.

### 2.2) Area-only headings

A heading may have `area:` without `project:`:

```md
# Work [area:work]

## Acme Corp [project:acme]
- [ ] Fix bug [id:1]
```

Notes:
- Tasks cannot be “in” an area-only heading (no project means no global ID).
- Projects under an area-only heading inherit that area context.

## 3) Tasks

A task is a checklist item:

```md
- [ ] Draft welcome email [id:1 energy:normal est:60m]
- [x] Sent intro message [id:2]
```

Rules:
- `[ ]` means open; `[x]` means done.
- Indentation defines hierarchy (subtasks):

```md
- [ ] Parent [id:1]
  - [ ] Child [id:1.1]
```

### 3.1) Trackable tasks and IDs

`tmd` considers a task **trackable** when:
- it has `id:<local-id>` in metadata, and
- it is under a heading with `project:<project-id>`.

`tmd` constructs a **global ID** as:

```
<project-id>:<local-id>
```

Example: `project:as-onb` + `id:1.1` → `as-onb:1.1`

## 4) Metadata blocks

Metadata is a single bracket block at the end of the line:

```md
- [ ] Task text [id:1 due:2025-12-20 tags:urgent,admin]
```

Rules:
- Format is `key:value` pairs separated by spaces.
- Values must not contain spaces.
- `tags:` is comma-separated (no spaces): `tags:a,b,c`.

### 4.1) Canonical metadata keys (as indexed in `todos.json`)

Tasks may contain:
- `id:<local-id>` (required for trackable tasks)
- `energy:low|normal|high`
- `priority:high|normal|low`
- `est:<string>` (free-form, e.g. `30m`, `2h`)
- `due:YYYY-MM-DD`
- `plan:YYYY-MM-DD`
- `bucket:<string>` (common: `now`, `today`, `upcoming`, `anytime`, `someday`; custom allowed)
- `area:<string>`
- `tags:<comma-separated>`
- `created:YYYY-MM-DD`
- `updated:YYYY-MM-DD`

Projects may contain:
- `project:<project-id>` (required to define a project)
- `area:<string>` (optional)

## 5) Shorthands (expanded by `tmd enrich`)

`tmd enrich` can convert shorthand markers in task text into canonical metadata.

### 5.1) Priority shorthands (at the start of task text)

- `(A)` → `priority:high`
- `(B)` → `priority:normal`
- `(C)` → `priority:low`

### 5.2) Bucket shorthands

Symbol shorthands (at the start of task text, after optional priority):
- `* ` → `bucket:now`
- `! ` → `bucket:today` and sets `plan:` to today’s date
- `> ` → `bucket:upcoming`
- `~ ` → `bucket:anytime`
- `? ` → `bucket:someday`

Inline @tag shorthands (anywhere in the task text):
- `@now`, `@today`, `@upcoming`, `@anytime`, `@someday`

Behavior notes:
- Symbol bucket shorthands win over `@...` bucket tags if both are present.
- `tmd enrich --keep-shorthands` keeps the markers in the text; otherwise they’re removed after conversion.

