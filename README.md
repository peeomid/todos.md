# todos.md - Todo Markdown CLI

A CLI tool (`tmd`) for managing tasks in Markdown files. Parse, validate, and index your todo lists while keeping everything in plain text.

## Installation

```bash
pnpm install
pnpm build
```

### Install system-wide (so `tmd` works anywhere)

```bash
# Recommended (build + link globally)
./script/build-and-link-global.sh

# Manual option A (works out of the box for most Node setups)
npm link

# Manual option B (pnpm global link) — requires pnpm global bin dir in PATH
pnpm setup
pnpm link --global
```

## Usage

```bash
# Initialize a new workspace (creates todos.md, views/daily.md, and .todosmd.json)
tmd init

# Validate markdown format
tmd lint

# Generate todos.json index
tmd index

# With options
tmd lint -f todos.md --json
tmd index -f todos.md -f projects/work.md -o todos.json
```

## Quick Example

```markdown
# My Project [project:myproj area:work]

- [ ] Write documentation [id:1 energy:low est:30m]
  - [ ] Add examples [id:1.1]
- [ ] Review PR [id:2 due:2025-12-20]
- [x] Setup repo [id:3]
```

## Configuration

Create `.todosmd.json` in your project root:

```json
{
  "files": ["todos.md", "projects/work.md"],
  "output": "todos.json"
}
```

### Config discovery (precedence)

`tmd` loads config from the first match:

1. `--config <path>` / `-c <path>`
2. nearest `.todosmd.json` walking up from cwd
3. global config: `~/.config/todosmd/config.json`

See: `tmd help config`

### Custom views (interactive TUI)

`tmd interactive` supports custom views via `interactive.views` in `.todosmd.json`:

```json
{
  "interactive": {
    "views": [
      { "key": "7", "name": "Today (Work)", "query": "status:open area:work bucket:today", "sort": "priority,plan,due" },
      { "key": "8", "name": "High Impact", "query": "status:open priority:high", "sort": "bucket,plan,due" }
    ]
  }
}
```

OR tip: for some filters you can pass multiple values (e.g. `project:sy,in` or `project:sy project:in`).

Note: top-level `views` is for `tmd sync` view files; `interactive.views` is for `tmd interactive`.

## Format Specification

See [docs/specs.md](docs/specs.md) for the complete task format specification.

### Key Concepts

- **Projects**: Headings with `[project:id]` metadata
- **Tasks**: Checkbox items (`- [ ]` / `- [x]`) with optional `[key:value]` metadata
- **Hierarchy**: Indentation defines parent/child relationships
- **IDs**: Local IDs become global as `project:localId`

### Metadata Keys

| Key | Format | Example |
|-----|--------|---------|
| `id` | string | `id:1`, `id:1.1` |
| `energy` | low/normal/high | `energy:low` |
| `est` | duration | `est:30m`, `est:1h30m` |
| `due` | YYYY-MM-DD | `due:2025-12-20` |
| `plan` | YYYY-MM-DD | `plan:2025-12-08` |
| `bucket` | string | `bucket:today` |
| `area` | string | `area:work` |
| `tags` | csv | `tags:email,urgent` |

## Testing

### Manual Testing

```bash
# Lint your todos.md
pnpm tmd lint

# Generate index
pnpm tmd index

# View generated JSON
cat todos.json

# JSON output
pnpm tmd lint --json
pnpm tmd index --json
```

### Automated Tests

```bash
pnpm test          # Run all tests
pnpm test --watch  # Watch mode
```

Tests cover: parser, indexer, linter, enricher, sync, filters, and editor (136 tests).

## Development

```bash
pnpm tmd <args>    # Run CLI in dev mode
pnpm typecheck     # Type check
pnpm lint:biome    # Lint code
pnpm test          # Run tests
pnpm build         # Build to dist/
```

For detailed instructions on building, installing globally, and publishing to npm, see [local_doc/local-dev-guide.md](local_doc/local-dev-guide.md).

## License

MIT
