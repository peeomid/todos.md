# Todo Format Spec (v1)

This document explains how I write todos in my Markdown notes so that:

* They are easy to read as normal text.
* A script or AI can parse them and build a `todos.json` index (configurable).
* I can generate daily/weekly/light-task views from them later.

Everything stays in plain-text Markdown.

---

## 0. File frontmatter (format version)

For files that are mainly about tasks (or for a central spec file), I can use a simple **YAML-style frontmatter** at the top:

```markdown
---
task_format_version: 1
---
```

* This tells tools: “I’m using version 1 of this todo format.”
* I don’t *have* to put this in every file, but it’s useful in:

  * A main spec/reference file.
  * Any “special” task files (e.g. main planning docs, generated views).

---

## 1. Overall structure

* All todos live in **Markdown (`.md`) files**.
* I use:

  * **Headings** for projects.
  * **Checkbox list items** for tasks.
  * **Indentation** for subtasks.
  * A **metadata block** at the end of the line inside square brackets:

    * `[...]`
    * Inside: `key:value` pairs separated by spaces.

Example:

```markdown
---
task_format_version: 1
---

# Autosenso onboarding [project:as-onb area:sidebiz]

- [ ] Draft welcome email [id:1 energy:normal est:60m]
  - [ ] Subject lines A/B test [id:1.1 energy:low est:30m]
  - [ ] Body copy variants      [id:1.2 energy:normal est:45m]

- [ ] Implement tracking code [id:2 energy:normal est:45m due:2025-12-20]
```

---

## 2. Projects

### 2.1. Project heading syntax

A project is a Markdown heading with optional metadata:

```markdown
# Autosenso onboarding [project:as-onb area:sidebiz]
```

Rules:

* Text before `[` is the **project name**:

  * `Autosenso onboarding`
* Text inside `[...]` is metadata in `key:value` form, space-separated:

  * `project:as-onb` → **project ID** (short, stable code).
  * `area:sidebiz`   → optional high-level area.

Project ID rules:

* Short, lowercase-ish is good: `as-onb`, `life`, `bw-ads`.
* Should be **stable** even if I rename the heading text.

### 2.2. Project inheritance

* All tasks under a heading "belong" to that project.
* Tasks inherit from the **nearest heading above them that has a `project:` key**.
* Headings without `project:` are ignored for inheritance (they're just organizational).

Example:

```markdown
# Autosenso [project:as]

## Onboarding flow [project:as-onb]

- [ ] Draft email [id:1]
```

Here:

* Project ID for `Draft email` is `as-onb`, because that's the nearest heading with a `project:` key.

### 2.3. Area-only headings

A heading can have `area:` without `project:`. This sets the area context for nested projects:

```markdown
# Work [area:work]

## Acme Corp [project:acme]
- [ ] Fix bug [id:1]                → acme:1, inherits area:work

## Internal Tools [project:tools]
- [ ] Update scripts [id:1]         → tools:1, inherits area:work
```

Key points:
* `# Work [area:work]` has no project ID, only area
* Tasks cannot belong directly to `# Work` (they need a project for global ID)
* Child headings with `project:` inherit `area:work`

### 2.4. Organizational headings (no metadata)

Headings without any metadata are purely organizational:

```markdown
## Acme Corp [project:acme area:work]

### Current Sprint
- [ ] Fix auth bug [id:1]           → acme:1
- [ ] Design API [id:2]             → acme:2

### Backlog
- [ ] Refactor DB [id:10]           → acme:10
```

* `### Current Sprint` and `### Backlog` have no `[...]` block
* They're just organizational groupings
* Tasks still belong to `acme` (nearest heading with `project:`)
* In `tmd interactive`, these headings are indexed as **section headings** and can render as collapsible separators inside the project task list.

### 2.5. Multi-level heading hierarchies

You can nest headings as deep as you like. Only headings with `project:` matter for task assignment:

```markdown
# Work [area:work]

## Acme Corp [project:acme]

### Current Sprint
- [ ] Fix bug [id:1]                → acme:1

### Q&A Site Project
- [ ] Analyze content [id:10]       → acme:10
  - [ ] Document structure [id:10.1] → acme:10.1
  - [ ] Map categories [id:10.2]    → acme:10.2

### Backlog
- [ ] Improve caching [id:20]       → acme:20

---

# Life [area:life]

## Fitness [project:fit]

### Running
- [ ] Sign up for race [id:1]       → fit:1

### Gym
- [ ] Research programs [id:2]      → fit:2

## Reading
- [ ] Finish book                   → no project! (lint warning)
```

Key points:
* `# Work` has area but no project - it's a grouping for work-related projects
* `### Current Sprint`, `### Backlog`, etc. are organizational (no metadata)
* Tasks inherit project from nearest heading with `project:`
* `## Reading` has no metadata - tasks under it have no project context (lint warning)
* `---` horizontal rules are visual separators, don't affect parsing

---

## 3. Tasks

### 3.1. Task syntax

A task is a Markdown checklist line:

```markdown
- [ ] Do something [id:1 energy:low est:30m]
- [x] Already done  [id:2 energy:normal]
```

Structure:

1. Optional **indentation** (spaces before `-`).
2. `- [ ]` or `- [x]`:

   * `[ ]` → open task.
   * `[x]` → completed task.
3. **Task text** in normal language.
4. Optional **metadata block** at the end in square brackets: `[ ... ]`.

### 3.2. Subtasks and hierarchy

Indentation defines parent/child:

```markdown
- [ ] Task 1 [id:1]
  - [ ] Subtask 1.1 [id:1.1]
  - [ ] Subtask 1.2 [id:1.2]
- [ ] Task 2 [id:2]
```

* `Task 1` (`id:1`) is a top-level task.
* `Subtask 1.1` (`id:1.1`) and `Subtask 1.2` (`id:1.2`) are children of `Task 1`.
* `Task 2` (`id:2`) is a separate top-level task.

Parser rules:

* Count indentation (spaces before `-`) for each task.
* Use a stack of tasks by indent level to find `parent_id` and `children_ids`.

### 3.3. Trackable vs non-trackable tasks

* Any checkbox line **without** metadata is allowed:

  ```markdown
  - [ ] Quick note to self
  ```

* Only tasks with an `id:` in the metadata block are **trackable**:

  ```markdown
  - [ ] Proper task [id:1]
  ```

Scripts and AI tools:

* Only treat tasks with `id` as part of the official task index.
* Ignore checkbox lines without `id` for indexing (they’re just scratch tasks).

---

## 4. Metadata keys (canonical fields)

Metadata always lives inside the square bracket block at the end of the task line:

```markdown
- [ ] Draft welcome email [id:1 energy:normal est:60m plan:2025-12-08 bucket:today due:2025-12-10 priority:high]
```

Inside `[...]` everything is `key:value` separated by spaces.

### Required for trackable tasks

* `id` – **local task ID** within the project.

  * Examples: `id:1`, `id:1.1`, `id:2`.
  * Must be unique inside that project.
  * The system (tmd) will build a **global ID** as `<project-id>:<local-id>` in the index (e.g. `as-onb:1.1`).

### Date-related keys

All dates use `YYYY-MM-DD`.

* `plan` – **planned work date** (when I intend to do this).

  * Example: `plan:2025-12-08`
  * Always a real date. No `plan:today`, no relative values in canonical form.
* `due` – **deadline date** (must be done by this date).

  * Example: `due:2025-12-10`
* `created` – when this task was created.

  * Example: `created:2025-12-08`
* `updated` – last time this task was updated.

  * Example: `updated:2025-12-09`

### Planning bucket key

* `bucket` – a **free-form planning bucket**.

  * Examples:

    * System-style buckets:
      `bucket:now`, `bucket:today`, `bucket:upcoming`, `bucket:anytime`, `bucket:someday`
    * User/custom buckets:
      `bucket:errands`, `bucket:focus`, `bucket:deepwork`
  * If I write `bucket:` myself, I can use any value I want.
  * tmd may also set `bucket` automatically from shorthands (`@today`, `!`, etc.). This will take precedence over values defined in the metadata block when enrich runs.

### Priority key

* `priority` – how important the task is relative to others.

  * Values: `priority:high`, `priority:normal`, `priority:low`
  * Used for sorting tasks within buckets and views.
  * Optional – tasks without explicit priority are treated as lower than `priority:low` in sorting.

### Other recommended keys

These are optional but useful:

* `area` – broad area/category.

  * Examples: `area:work`, `area:sidebiz`, `area:life`, `area:learning`.
  * Often set on the project heading and inherited.
* `energy` – energy required:

  * `energy:low`, `energy:normal`, `energy:high`
* `est` – estimated time:

  * Examples: `est:15m`, `est:30m`, `est:45m`, `est:1h`, `est:90m`
* `tags` – extra tags as a comma-separated list (no spaces):

  * Example: `tags:email,admin`

### Custom keys

* Any other `key:value` pairs are allowed.
* Tools should read known keys and **ignore unknown ones** instead of failing.

---

## 5. Shorthands for planning (human-friendly input)

These are **optional shortcuts** to make editing in Markdown faster.
They are meant for humans. The canonical form is still `plan`, `bucket`, `due` inside `[...]`.

tmd (via `tmd enrich`) can look for these shorthands and convert them into proper metadata.

### Shorthand A – `@tags` in task text

Supported tags:

* `@now`
* `@today`
* `@upcoming`
* `@anytime`
* `@someday`

You can write them at the end of the task text, before the metadata block:

```markdown
- [ ] Draft welcome email @today [id:1 energy:normal est:60m]
- [ ] Refactor onboarding flow @upcoming [id:2]
- [ ] Deep refactor @someday [id:3]
- [ ] Small copy tweak @anytime [id:4]
```

Or even on tasks without a metadata block yet:

```markdown
- [ ] Some vague idea @someday
```

**tmd enrich behavior (suggested):**

On a given day (e.g. 2025-12-08):

* `@now`
  → set `bucket:now`
* `@today`
  → set `bucket:today` and, if `plan` is empty, set `plan:2025-12-08`
* `@upcoming`
  → set `bucket:upcoming`
* `@anytime`
  → set `bucket:anytime`
* `@someday`
  → set `bucket:someday`

You can choose whether `tmd enrich` **removes** the `@tag` from the text after converting, or keeps it for visual preference.

---

### Shorthand B – symbols before the task text

Supported symbols as the **first token** after the checkbox (or after an optional priority shorthand):

* `*` → now
* `!` → today
* `>` → upcoming
* `~` → anytime
* `?` → someday

Example:

```markdown
- [ ] ! Draft welcome email [id:1 energy:normal est:60m]
- [ ] > Refactor onboarding flow [id:2]
- [ ] ~ Small copy tweak [id:3]
- [ ] ? Full redesign experiment [id:4]
```

**tmd enrich behavior (suggested):**

On a given day (e.g. 2025-12-08):

* `*`
  → set `bucket:now`
* `!`
  → set `bucket:today` and, if `plan` is empty, set `plan:2025-12-08`
* `>`
  → set `bucket:upcoming`
* `~`
  → set `bucket:anytime`
* `?`
  → set `bucket:someday`

Again, you can decide whether `tmd enrich` strips the symbol from the text after processing or leaves it in place as a visual marker.

---

### Shorthand C – `(A)/(B)/(C)` priority at line start

Borrowing from todo.txt: priorities like `(A)`, `(B)`, `(C)` immediately after the checkbox are widely used and easy to type.

**Syntax:**

`(A)`, `(B)`, or `(C)` appears immediately after `- [ ]` or `- [x]`, followed by a space:

```markdown
- [ ] (A) Draft launch email [id:1 bucket:today]
- [ ] (B) Update onboarding docs [id:2]
- [ ] (C) Clean up old notes [id:3]
- [ ] Fix typo on page
```

**Mapping:**

| Shorthand | Converts To |
|-----------|-------------|
| `(A)` | `priority:high` |
| `(B)` | `priority:normal` |
| `(C)` | `priority:low` |

If there is no `(X)`, the task has no explicit priority.

---

### Full line structure

A "max complexity" line can have:

1. Checkbox (`- [ ]` or `- [x]`)
2. Priority shorthand `(A)`/`(B)`/`(C)` (optional)
3. Bucket shorthand `!`/`>`/`~`/`?` (optional)
4. Task text
5. `@tags` at end of text (optional)
6. Metadata block `[...]` (optional)

Examples:

```markdown
- [ ] (A) ! Draft welcome email @today [id:1 energy:high est:60m]
- [ ] (B) > Refactor onboarding flow [id:2]
- [ ] ~ Small copy tweak @anytime
- [ ] ? Big experimental refactor @someday [id:3]
```

---

### Parsing order (for `tmd enrich`)

When processing a task line, `tmd enrich` parses shorthands in this order:

**Step 1 – Detect priority shorthand `(A)`/`(B)`/`(C)`**

Look immediately after `- [ ]`/`- [x]` for `(X)`:
* `(A)` → `priority:high`
* `(B)` → `priority:normal`
* `(C)` → `priority:low`

**Step 2 – Detect bucket shorthand symbols `*`/`!`/`>`/`~`/`?`**

Next, look for the bucket symbol (after optional priority):
* `*` → `bucket:now`
* `!` → `bucket:today` + `plan:<today-date>` if plan is empty
* `>` → `bucket:upcoming`
* `~` → `bucket:anytime`
* `?` → `bucket:someday`

**Step 3 – Detect `@tag` shorthands in text**

Scan text for `@today`, `@upcoming`, `@anytime`, `@someday`.

**Precedence:** If both symbol (`!`/`>`/`~`/`?`) and `@tag` are present, the symbol takes priority.

---

### Example: from shorthand to canonical

**What I might type while planning:**

```markdown
# Autosenso onboarding [project:as-onb area:sidebiz]

- [ ] (A) ! Draft welcome email @today [id:1 energy:normal est:60m]
- [ ] (B) > Refactor onboarding flow @upcoming [id:2]
- [ ] (C) ~ Small copy tweak [id:3]
- [ ] ? Deep refactor @someday [id:4]
```

**After running `tmd enrich` on 2025-12-08 (and stripping shorthands):**

```markdown
# Autosenso onboarding [project:as-onb area:sidebiz]

- [ ] Draft welcome email [id:1 energy:normal est:60m plan:2025-12-08 bucket:today priority:high]
- [ ] Refactor onboarding flow [id:2 bucket:upcoming priority:normal]
- [ ] Small copy tweak [id:3 bucket:anytime priority:low]
- [ ] Deep refactor [id:4 bucket:someday]
```

Canonical rules remain:

* `plan` is always a real date (`YYYY-MM-DD`).
* `bucket` is any string (default system ones: `now`, `today`, `upcoming`, `anytime`, `someday`).
* `due` is an optional deadline date, separated from `plan`.
* `priority` is `high`, `normal`, or `low`.


---

## 6. Inbox and non-project tasks

### 6.1. Inbox project

For general tasks that don’t belong to a specific project yet, use a special **Inbox** heading:

```markdown
# Inbox [project:inbox area:life]

- [ ] Random task [id:1 energy:low]
- [ ] Another idea [id:2 est:10m]
```

* This follows the same rules as any other project.
* Project ID here is `inbox`.

---

## 7. Auto-generated blocks

Some files (like daily or weekly views) will be generated by scripts.

### 7.1. Block markers

Use clear markers around any auto-generated content:

```markdown
## Today – Focus

<!-- tmd:start query="status:open bucket:today" -->
- [ ] Draft welcome email [id:1 energy:normal est:60m]
- [ ] Call bank about card [id:life-1 energy:low est:15m]
<!-- tmd:end -->

## Notes

- Manual notes here...
```

Rules:

* Markers use HTML comments (hidden in rendered Markdown)
* Lines between `<!-- tmd:start ... -->` and `<!-- tmd:end -->`:

  * Can be replaced by scripts.
* Lines outside that block:

  * Must not be modified by scripts.
* The `query` attribute uses the same filter syntax as `tmd list`:
  * e.g., `query="status:open bucket:today"`, `query="energy:low"`, etc.


---

## 8. Dates

* All date values use:

  ```text
  YYYY-MM-DD
  ```

Examples:

* `2025-12-08`
* `2025-03-01`

Applies to:

* `due`
* `created`
* `updated`

This makes it easy to sort or compare dates in scripts.

---

## 9. Summary (short rules)

* **Projects**:

  * Heading: `# Project Name [project:code area:area]`
  * Tasks under a heading inherit that project (and often `area`).

* **Tasks**:

  * Checkbox lines: `- [ ]` or `- [x]`.
  * Indentation defines subtasks.
  * Metadata at end: `[key:value key2:value2 ...]`.

* **Tracking**:

  * Only tasks with `id:<something>` are part of the official task index.
  * `id` is unique within a project.
  * Global ID = `<project-id>:<local-id>` (built by code, not written in Markdown).

* **Metadata**:

  * Use `key:value` format inside `[...]`.
  * Common keys: `id`, `project` (on headings), `area`, `energy`, `est`, `due`, `plan`, `bucket`, `priority`, `created`, `updated`, `tags`.
  * `priority`: `high`, `normal`, `low`.
  * Dates = `YYYY-MM-DD`.

* **Sync blocks**:

  * Wrapped between `<!-- tmd:start query="..." -->` and `<!-- tmd:end -->`.
  * Only that block is overwritten by scripts.
  * Query uses `key:value` filter syntax (e.g., `status:open bucket:today`).

* **Format version**:

  * Use frontmatter like:

    ```markdown
    ---
    task_format_version: 1
    ---
    ```

  * Mainly in spec/central files or important task docs.

---

If you want, next we can design the **parser structure** (what functions, what outputs) so you can hand it to your local AI and say “implement this parser + indexer according to the spec.”
