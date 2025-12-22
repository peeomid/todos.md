# todos.md - Todo Markdown CLI

## Quick Reference
```bash
pnpm tmd <cmd> --help  # Command help
pnpm test              # Run tests
pnpm typecheck         # Type check
./script/build-and-link-global.sh  # Build + link `tmd` globally
```

## Documentation (local_doc/)
| File | Description |
|------|-------------|
| `CLAUDE.md` | **Full agent guide** - implementation patterns, key decisions, file locations |
| `plan.md` | **Current progress** - what's done, what's next |
| `cli-commands.md` | **Command summary** - all commands with status |
| `cli-architecture.md` | **Architecture** - project structure, config, ID system, index schema |
| `local-dev-guide.md` | **Local dev** - run via `pnpm tmd`, build (`pnpm build`), and global install/link (`npm link` / `pnpm link --global`). |
| `todo-format-spec.md` | **Task format** - markdown syntax, metadata keys, shorthands |
| `commands/*.md` | **Command specs** - detailed spec per command |
| `tui.md` | **TUI overview** - interactive mode summary and UX notes |
| `tui_specs.md` | **TUI requirements** - expected behaviors, layout, keybindings |
| `tui-architecture.md` | **TUI architecture** - state model, rendering, input handling |
| `tui_implementation_details.md` | **TUI implementation map** - entry points, safety, keybindings |
| `tui_implementation_plan.md` | **TUI milestones** - non-goals, phases |

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
src/tui/         # Terminal UI (interactive)
```

## "Update docs" means

When a change affects user-facing behavior, requirements, or design decisions, update the relevant docs in addition to code:

- **Requirements/behavior**: update `local_doc/*_specs.md` (or `local_doc/commands/*.md` if it's a command).
- **Technical changes**: update the relevant `local_doc/*architecture*.md` / `*_implementation_details.md` when key flow/state/keybindings change.
- **Progress/changelog**:
  - update `local_doc/plan.md` if the change materially advances the roadmap
  - update the changelog section in the relevant doc (e.g. `local_doc/tui.md`) when the UX/keybindings change
