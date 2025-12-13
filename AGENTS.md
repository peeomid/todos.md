# todos.md - Todo Markdown CLI

## Quick Reference
```bash
pnpm tmd <cmd> --help  # Command help
pnpm test              # Run tests
pnpm typecheck         # Type check
```

## Documentation (local_doc/)
| File | Description |
|------|-------------|
| `CLAUDE.md` | **Full agent guide** - implementation patterns, key decisions, file locations |
| `plan.md` | **Current progress** - what's done, what's next |
| `cli-commands.md` | **Command summary** - all commands with status |
| `cli-architecture.md` | **Architecture** - project structure, config, ID system, index schema |
| `todo-format-spec.md` | **Task format** - markdown syntax, metadata keys, shorthands |
| `commands/*.md` | **Command specs** - detailed spec per command |

## Key Concepts
- **Global ID**: `<project-id>:<local-id>` (e.g., `as-onb:1.1`)
- **Metadata**: `[id:1 energy:low est:30m due:2025-12-20 bucket:today plan:2025-12-10]`
- **bucket**: planning category (today, upcoming, anytime, someday, or custom)
- **plan**: actual work date (YYYY-MM-DD, resolves `today`/`tomorrow` to real dates)

## Task Modification Behavior
- `done`: cascades to children (all subtasks marked done)
- `undone`: NO cascade (only target task changed)
- `done/undone/add/edit`: auto-runs `sync` after (use `--no-sync` to skip)

## Structure
```
src/cli/         # Command handlers
src/parser/      # Markdown parsing
src/indexer/     # Build todos.json
src/editor/      # Task editing (done/undone/add)
src/linter/rules # 12 lint rules
src/schema/      # Zod schemas
```
