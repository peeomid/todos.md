# Command: `tmd config`

**Tier**: 5 (Configuration)
**Priority**: Lower - setup and management

---

## Purpose

Configuration management subcommands: initialize config files, get/set values.

---

## Subcommands

| Subcommand | Description |
|------------|-------------|
| `tmd config init` | Create a new config file |
| `tmd config get <key>` | Get a config value |
| `tmd config set <key> <value>` | Set a config value |
| `tmd config list` | Show all config values |
| `tmd config path` | Show config file path being used |

---

## `tmd config init`

Create a new `.todosmd.json` configuration file.

### Usage

```bash
tmd config init [options]
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--global` | Create global config instead of project | `false` |
| `--force` | Overwrite existing config | `false` |

### Examples

```bash
# Create project config in current directory
tmd config init

# Create global config
tmd config init --global

# Overwrite existing
tmd config init --force
```

### Output

```
Created: .todosmd.json

Default configuration:
{
  "files": ["todos.md"],
  "output": "todos.json"
}
```

### Behavior

1. Determine target path (project or global)
2. Check if file exists (error unless `--force`)
3. Write default config
4. Print confirmation

---

## `tmd config get`

Get a configuration value.

### Usage

```bash
tmd config get <key> [options]
```

### Options

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON |

### Examples

```bash
# Get files list
tmd config get files

# Get output file
tmd config get output

# Get nested value
tmd config get defaults.area

# JSON output
tmd config get files --json
```

### Output

```
files: ["todos.md", "projects/work.md"]
```

### JSON

```json
{
  "key": "files",
  "value": ["todos.md", "projects/work.md"],
  "source": ".todosmd.json"
}
```

---

## `tmd config set`

Set a configuration value.

### Usage

```bash
tmd config set <key> <value> [options]
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--global` | Set in global config | `false` |

### Examples

```bash
# Set output file
tmd config set output tasks.json

# Set nested value
tmd config set defaults.area personal

# Set in global config
tmd config set defaultProject notes --global
```

### Output

```
Set output = tasks.json
  File: .todosmd.json
```

---

## `tmd config list`

Show all configuration values and their sources.

### Usage

```bash
tmd config list [options]
```

### Options

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON |

### Output

```
Configuration (merged from 2 sources):

files: ["todos.md", "projects/work.md"]
  Source: .todosmd.json

output: todos.json
  Source: .todosmd.json

defaults.area: work
  Source: .todosmd.json

defaultProject: notes
  Source: ~/.config/todosmd/config.json (global)
```

---

## `tmd config path`

Show which config file is being used.

### Usage

```bash
tmd config path
```

### Output

```
Project config: ~/notes/.todosmd.json
Global config: ~/.config/todosmd/config.json

Active: ~/notes/.todosmd.json
```

---

## Config File Format

### Project config (`.todosmd.json`)

```json
{
  "files": ["todos.md"],
  "output": "todos.json",
  "defaults": {
    "area": "work",
    "energy": "normal"
  }
}
```

Or with multiple files:

```json
{
  "files": ["todos.md", "projects/work.md", "projects/personal.md"],
  "output": "todos.json"
}
```

### Global config (`~/.config/todosmd/config.json`)

```json
{
  "defaultProject": "notes",
  "projects": {
    "notes": {
      "files": ["~/notes/todos.md"],
      "output": "~/notes/todos.json"
    },
    "work": {
      "files": ["~/work/tasks.md", "~/work/projects.md"],
      "output": "~/work/todos.json"
    }
  }
}
```

---

## Config Keys

| Key | Type | Description |
|-----|------|-------------|
| `files` | string[] | List of markdown files to parse (paths relative to CWD) |
| `output` | string | Output file for index |
| `defaults.area` | string | Default area for new tasks |
| `defaults.energy` | string | Default energy for new tasks |
| `defaultProject` | string | Default project name (global only) |
| `projects.<name>` | object | Named project config (global only) |

---

## Error Handling

| Error | Behavior |
|-------|----------|
| Config file not found (get/set) | Error: "No config file found. Run `tmd config init`." |
| Config already exists (init) | Error: "Config already exists. Use --force to overwrite." |
| Invalid key | Error: "Unknown config key: xxx" |
| Invalid value | Error with specific message |

---

## Implementation Plan

### Dependencies

- `config/loader.ts` - Load config files
- `config/resolver.ts` - Merge configs
- `schema/config.ts` - Validate config

### Files to Create

```
src/cli/config/
├── init.ts               # tmd config init
├── get.ts                # tmd config get
├── set.ts                # tmd config set
├── list.ts               # tmd config list
├── path.ts               # tmd config path
└── help.ts               # Config subcommand help
```

### Implementation Steps

1. **Config schema** (`schema/config.ts`)
   - Zod schema for project config
   - Zod schema for global config
   - Validation functions

2. **Config loader** (`config/loader.ts`)
   - Find config files (project, global)
   - Load and parse JSON
   - Validate with schema

3. **Config resolver** (`config/resolver.ts`)
   - Merge project + global configs
   - Apply defaults
   - Handle `--project` flag for global projects

4. **Subcommand handlers**
   - `init`: Write default config
   - `get`: Load config, extract key, print
   - `set`: Load config, modify, validate, write
   - `list`: Load all, show with sources
   - `path`: Show file paths

5. **Config command router**
   - Parse subcommand
   - Dispatch to handler

### Testing Strategy

- Init creates valid config
- Get returns correct values
- Set modifies config correctly
- Nested keys work
- Global vs project config
- Config merging

---

## Related

- `cli-architecture.md` - Config resolution order
