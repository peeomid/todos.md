# Command: `tmd init`

**Tier**: 5 (Setup & Scaffolding)  
**Priority**: Lower — workspace bootstrap utility

---

## Purpose

Scaffold a new todosmd workspace. Creates the primary markdown file, optional config/index files, and documents the next steps so users can run CLI commands immediately.

---

## Usage

```bash
tmd init [options]
```

---

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--file <path>` | Path for the primary todo file | `todos.md` |
| `--output <path>` | Path for generated index file (`tmd index`) | `todos.json` |
| `--config <path>` | Path for project config file | `.todosmd.json` |
| `--no-config` | Skip creating project config | `false` |
| `--global-config` | Also initialize global config (`tmd config init --global`) | `false` |
| `--with-index` | Create an empty index file scaffold | `false` |
| `--force` | Overwrite existing targets | `false` |
| `--dry-run` | Show actions without writing files | `false` |

---

## Examples

```bash
# Minimal: create todos.md and .todosmd.json
tmd init

# Custom file names
tmd init --file projects/tasks.md --output projects/todos.json

# Skip config and include index scaffold
tmd init --no-config --with-index

# Initialize both project and global configs
tmd init --global-config
```

---

## Outputs

### `todos.md` scaffold

```markdown
# Tasks

## Inbox

- [ ] Example task
  <!-- Metadata: [id:1 energy:normal est:30m area:inbox] -->
  [id:1 energy:normal est:30m area:inbox]
```

The scaffold includes:
- Heading structure (`# Tasks`, `## Inbox`) to demonstrate grouping
- A starter task with canonical metadata format for quick reference
- Inline comment reminding users of metadata syntax

### `.todosmd.json` (optional)

```json
{
  "files": ["todos.md"],
  "output": "todos.json",
  "views": ["views/daily.md"],
  "defaults": {
    "area": "inbox",
    "energy": "normal"
  }
}
```

### `todos.json` (optional)

```json
{
  "projects": [],
  "tasks": []
}
```

### `views/daily.md`

```markdown
<!-- tmd:start name="daily" query="bucket:today status:open" -->
<!-- tmd:end -->
```

Scaffold includes markers only; running `tmd sync` fills the block.

### Quickstart checklist (console output)

```
Next steps:
  pnpm tmd index
  pnpm tmd list --json
  pnpm tmd sync
```

All created files are validated against the same schema used by other commands.

---

## Behavior

1. Resolve target paths using CLI flags or defaults.
2. Detect existing files:
   - Abort with `Config already exists` / `File already exists` unless `--force`.
3. Generate scaffold content:
   - `todos.md`: Markdown template with starter sections and inline comments explaining metadata syntax.
   - `.todosmd.json`: Calls shared config defaults (used by `tmd config init`) to ensure schema compliance, including `files`, `output`, `views`, and `defaults`.
   - `views/daily.md`: Starter sync block matching the config entry.
   - `todos.json`: Empty index in canonical format when `--with-index`.
4. Write files (skip when `--dry-run`) and print per-file status.
5. When `--global-config`, delegate to `tmd config init --global` and surface any errors.
6. Print quickstart checklist (`pnpm tmd index`, `pnpm tmd list`, `pnpm tmd sync`) so users know how to continue.

---

## Errors

| Condition | Message |
|-----------|---------|
| Target markdown file exists without `--force` | `File already exists: <path>. Use --force to overwrite.` |
| Config exists without `--force` | `Config already exists at <path>.` |
| Global config exists without `--force` | Pass-through from `tmd config init --global` |
| Invalid path (directory missing) | `Cannot create file. Directory not found: <path>` |
| View directory missing without `--force` | Same as invalid path (recommend creating with quick tip) |
| Dry run but path invalid | Warn instead of throwing; exit code 0 |

---

## Implementation Notes

- Reuse helpers from `src/config/` (`defaults`, `resolver`) to avoid duplicate config schemas.
- Move markdown scaffold into `src/templates/init.ts` for reuse in tests.
- Ensure `--file` paths update config defaults when config is generated, including adjusting `views` when a custom directory is provided in future flags.
- Write a small utility for creating directories so `views/daily.md` can be generated safely.
- Provide human-readable console output similar to other commands (`Created: <path>`).
- Add unit tests covering dry run, overwrite behavior, custom paths, and delegating to global config init.
- Snapshot the quickstart checklist output to keep messaging consistent.

---

## Related

- `tmd config init` — invoked internally for project/global config creation.
- `tmd index` — recommended follow-up command after scaffolding.
