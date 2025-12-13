# todos.md - Todo Markdown CLI

A CLI tool (`tmd`) for managing tasks in Markdown files. Parse, validate, and index your todo lists while keeping everything in plain text.

## Installation

```bash
pnpm install
pnpm build
```

## Usage

```bash
# Validate markdown format
tmd lint

# Generate todos.json index
tmd index

# With options
tmd lint -f todos.md --json
tmd index -f todos.md -f projects/work.md -o tasks.json
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
