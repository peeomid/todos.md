## 1. Context

* My **knowledge base and todos** live in a single **Markdown vault**:

  * Stored in an **Obsidian vault folder**.
  * Versioned via **Git/GitHub**.
  * Synced via **iCloud** so it’s available on mobile.
* **Desktop workflow**:

  * I mainly use **VS Code** to edit notes and todos.
  * I do *not* normally use Obsidian on desktop.
* **Mobile workflow**:

  * I use the **Obsidian mobile app** primarily to **read** Markdown files.
  * I don’t rely on Obsidian plugins on mobile (or in general).
* I use a **local AI agent** that:

  * Reads the Markdown files directly.
  * Helps me manage knowledge, notes, and todos.
  * Can be extended to use a structured task index (`todos.json`, configurable) and simple APIs/CLI tools.

---

## 2. High-level goals for the todo system

* Everything must stay **plain text**, **portable**, and **tool-agnostic**:

  * No lock-in to a specific app or SaaS.
  * Future-proof: in 5–10 years I should still be able to open and understand these files with any editor.
* **Tasks live inside normal notes**, not in a separate database:

  * Project docs and their todos are in the same files.
  * No separate “task-only” backend unless it’s derived from Markdown (e.g., a generated JSON index).
* The system must work well with:

  * **VS Code** as the main editor.
  * **Obsidian mobile** as a read-only-ish viewer.
  * A **local AI agent** that parses and manipulates tasks.

---

## 3. Structural preferences

* **Projects as headings**:

  * Each project lives inside a Markdown file and is represented by `#` (or `##`) headings.
  * Headings may carry project metadata (e.g., `[project:as-onb]`).
  * Tasks under a heading inherit that project context.
* **Tasks as checkboxes**:

  * Tasks are written as standard Markdown checklist items:

    * `- [ ]` for open tasks.
    * `- [x]` for completed tasks.
* **Hierarchy by indentation**:

  * Nested tasks (subtasks) are represented by indentation under parent tasks:

    ```markdown
    # Project

    - [ ] Task 1
      - [ ] Subtask 1.1
      - [ ] Subtask 1.2
    - [ ] Task 2
    ```
  * Indentation level defines parent/child relationships.

---

## 4. Metadata and readability preferences

* **Inline metadata on the same line**:

  * All structured info is kept **on the same line** as the task, not on the next line.
* **Metadata separated from human text**:

  * The “human-readable sentence” of the task comes first.
  * Machine-readable metadata is grouped at the **end of the line** in a bracket cluster:

    ```markdown
    - [ ] Draft email [id:1.1 energy:low est:30m]
    ```
* **Bracketed `key:value` tokens**:

  * Inside the brackets, metadata is `key:value` pairs separated by spaces.
  * Examples: `id:1.1`, `energy:low`, `est:30m`, `due:2025-12-10`.
* Aim: **readable first, structured second**:

  * When reading on mobile or in VS Code, I should be able to skim “Draft email” and mentally ignore `[id:1.1 energy:low est:30m]` unless I care about it.

---

## 5. Task IDs and identity

* Every **trackable** task can have a local **numeric ID**:

  * Example: `[id:1]`, `[id:1.1]`, `[id:2]`, etc.
  * IDs are **local within a project section**, not global across the entire vault.
* **Local vs global IDs**:

  * In Markdown: only the **local ID** is stored (`id:1.1`).
  * In scripts / task index:

    * A **global ID** can be constructed as `<project-id>:<local-id>`.
    * Example: project `as-onb` + `id:1.1` → global id `as-onb:1.1`.
* **Uniqueness expectations**:

  * `id` must be unique within a project section.
  * The combination `(project-id, local-id)` is globally unique.
* **Soft requirement**:

  * A checkbox line *may* be a task without `id:` (quick scratch task).
  * Only tasks with `id:` are considered **canonical trackable tasks** for scripts and AI.

---

## 6. Core metadata vocabulary

I want a small, consistent set of standard keys, plus flexibility for custom ones.

* **Required (for trackable tasks)**:

  * `id` – local identifier (string, usually numeric path like `1`, `1.1`, etc.)
* **Recommended common keys**:

  * `project` (on headings) – stable project code (e.g. `as-onb`, `life`, `bw-ads`).
  * `area` – broad area/category (e.g. `work`, `sidebiz`, `life`, `learning`).
  * `energy` – rough energy level (`low`, `normal`, `high`), used for “light tasks” lists.
  * `est` – time estimate (`30m`, `1h`, `90m`).
  * `due` – due date in `YYYY-MM-DD`.
  * `created` – creation date (`YYYY-MM-DD`).
  * `updated` (optional) – last update date (`YYYY-MM-DD`).
  * `tags` (optional) – extra tags as a comma-separated list (e.g. `tags:email,admin`).
* **Date format**:

  * All dates use **`YYYY-MM-DD`** for consistency and easy sorting.
* Any other keys are allowed as **custom fields** and should be ignored gracefully by tools that don’t care.

---

## 7. Auto-generated vs manual content

* Some files (e.g. `00-daily-focus.md`, `01-weekly-execution.md`, `10-plan-lighttasks.md`) will have **auto-generated sections** built from the task index.
* I want a clear convention to separate:

  * Machine-owned blocks (safe for scripts to overwrite),
  * Human-written notes (never touched by scripts).
* **Sync block markers** (HTML comments, hidden in rendered Markdown):

  ```markdown
  <!-- tmd:start query="status:open bucket:today" -->
  ... generated tasks here ...
  <!-- tmd:end -->
  ```
* Tools may:

  * Replace only the content between these markers.
  * Leave everything else in the file untouched.

---

## 8. Inbox and non-project tasks

* Most tasks live under a project heading and inherit the project ID.
* I also need a place for tasks that are not tied to a project yet:

  * Use a special **Inbox project** heading, e.g.:

    ```markdown
    # Inbox [project:inbox]
    ```
  * Tasks under `Inbox` follow the same rules (`id`, `energy`, etc.).
* This keeps the rule simple:

  * Tasks always inherit `project` from the nearest heading (including `Inbox`).

---

## 9. Automation & tooling expectations

* I’m okay writing and maintaining small tools/scripts:

  * A **parser** to scan Markdown and build a `todos.json` index (configurable).
  * A **view generator** to create/update daily/weekly/light-tasks Markdown files.
  * A **linter** to check for format issues (duplicate IDs, bad dates, malformed metadata clusters).
* My **local AI agent** is expected to:

  * Read the Markdown files directly.
  * Optionally read `todos.json` for structured queries.
  * Possibly interact with a small CLI or local API that:

    * Lists tasks,
    * Updates task status/metadata,
    * Regenerates views.
* The system should remain usable even **without** these tools:

  * If all scripts disappear, the Markdown should still be readable and meaningful by itself.

---

## 10. Versioning of the format

* The todo format might evolve over time.

* I want a **lightweight version marker**, for example in a central doc or top of key task files:

  ```markdown
  <!-- task-format-version: 1 -->
  ```

* This allows future scripts and AI tools to:

  * Adapt to changes in the spec.
  * Handle old vs new patterns safely.
