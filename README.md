# todos.md

[![npm version](https://img.shields.io/npm/v/todosmd.svg)](https://www.npmjs.com/package/todosmd)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**A terminal-based task manager for Markdown files with vim keybindings.**

Manage todos across multiple projects in plain text. Query tasks like a database, edit with familiar vim motions, and integrate with AI agents via JSON output.

> Vibe coded with [Codex](https://openai.com/index/codex/) and [Claude Code](https://claude.com/claude-code)

![todos.md interactive TUI demo](demo/demo.gif)

## Features

- **Just Markdown** — Your todos are plain `.md` files. Open them in any editor, read on mobile, edit with AI, or process with other tools
- **Interactive TUI** — Full-screen terminal UI with vim-style navigation (`j/k`, `h/l`, `g/G`)
- **Inline Views** — Embed live task lists in any markdown file with auto-sync
- **Powerful filters** — Query by project, due date, energy level, tags, and more
- **Multi-project** — Manage todos across multiple files and projects from one place
- **AI-ready** — Every command supports `--json` for LLM and automation workflows
- **Obsidian-friendly** — Works seamlessly with Obsidian vaults and knowledge bases
- **Sync anywhere** — Commit to git, sync via iCloud/Dropbox, access from any device

## Why I Built This

I use AI agents to manage my knowledge base, projects, and ideas across an Obsidian vault. Each project has its own markdown file with todos, notes, and context.

The problem: **todos are scattered everywhere**. I needed a way to:

- **Query todos centrally** — find all tasks across projects with filters like `bucket:today energy:low`
- **Keep context local** — todos stay in their project files, not a separate app
- **Work with AI** — structured `--json` output for AI agents to read and manipulate
- **Stay in plain text** — no database, no lock-in, just Markdown

## It's Just Markdown

Your todos are stored in plain markdown files — nothing proprietary:

```markdown
# Mobile App [project:app area:work]

- [ ] Fix login bug on iOS [id:1 priority:high due:2025-01-15]
- [ ] Add push notifications [id:2 energy:high est:6h]
  - [ ] Set up Firebase [id:2.1]
  - [ ] Create notification service [id:2.2]
- [x] Update dependencies [id:3]
```

**This means you can:**

- Open and edit in any text editor (VS Code, Vim, Obsidian, etc.)
- Read and manage on mobile with any markdown app
- Let AI agents (Claude, GPT, Copilot) read and modify your tasks directly
- Process with grep, sed, or any unix tool
- Commit to git for version history and backup
- Sync via iCloud, Dropbox, or any file sync service
- Never worry about data export — it's already in a universal format

## Quick Start

```bash
# Install
npm install -g todosmd

# Initialize workspace
tmd init

# Add tasks
tmd add inbox "Review pull request" --energy low
tmd add inbox "Write documentation" --est 2h --due 2025-01-15

# List and filter
tmd list bucket:today
tmd list energy:low status:open

# Mark complete
tmd done inbox:1

# Launch interactive mode
tmd interactive
```

## Interactive Mode

Launch with `tmd interactive` or `tmd i` for a full-screen terminal UI.

### Vim Keybindings

| Key | Action |
|-----|--------|
| `j` / `k` | Move down / up |
| `h` / `l` | Collapse / Expand task with subtasks |
| `g` / `G` | Jump to top / bottom |
| `Enter` | Toggle task done/undone |
| `e` | Edit task metadata |
| `a` | Add new task |
| `d` | Delete task |
| `/` | Search tasks |
| `?` | Show help |
| `q` | Quit |

### Built-in Views

| Key | View |
|-----|------|
| `1` | Today — tasks planned for today |
| `2` | Upcoming — tasks planned for the future |
| `3` | All Open — all incomplete tasks |
| `4` | Overdue — past due tasks |
| `5` | Done — completed tasks |
| `6` | All — everything |

### Custom Views

Define your own views in `.todosmd.json`:

```json
{
  "interactive": {
    "views": [
      { "key": "7", "name": "Work", "query": "status:open area:work", "sort": "priority,due" },
      { "key": "8", "name": "Low Energy", "query": "status:open energy:low" }
    ]
  }
}
```

## Inline Views (Auto-Sync)

Embed live task lists anywhere in your markdown files. Perfect for daily notes, project docs, or weekly reviews.

Add a query block to any `.md` file:

```markdown
<!-- tmd:start query="status:open bucket:today" sort="priority,due" -->
<!-- tmd:end -->
```

Run `tmd sync` and tasks matching your query appear automatically:

```markdown
<!-- tmd:start query="status:open bucket:today" sort="priority,due" -->
- [ ] Design landing page [id:website:1 energy:high est:4h]
- [ ] Fix login bug [id:app:1 priority:high due:2025-01-02]
- [ ] Review quarterly goals [id:inbox:1 energy:low]
<!-- tmd:end -->
```

### Example Use Cases

| Use Case | Query |
|----------|-------|
| Daily notes | `query="bucket:today" sort="priority,energy"` |
| Project tasks | `query="project:website status:open"` |
| Weekly review | `query="status:done updated:last-7d"` |
| Work dashboard | `query="area:work status:open" sort="due,priority"` |

Generate blocks quickly with `tmd block-template today` or `tmd block-template "project:myproj"`.

## Installation

Requires Node.js 20+.

```bash
# npm
npm install -g todosmd

# pnpm
pnpm add -g todosmd

# From source
git clone https://github.com/user/todos.md
cd todos.md
pnpm install && pnpm build
npm link
```

## Task Format

Tasks are standard Markdown checkboxes with optional metadata in brackets:

```markdown
# My Project [project:myproj area:work]

- [ ] Design landing page [id:1 energy:high est:4h priority:high bucket:today]
  - [ ] Create wireframes [id:1.1 est:2h]
  - [ ] Choose color palette [id:1.2 est:30m]
- [ ] Review PR [id:2 due:2025-01-20]
- [x] Setup repo [id:3]
```

### Metadata Reference

| Key | Example | Description |
|-----|---------|-------------|
| `id` | `id:1`, `id:1.1` | Task identifier (auto-generated) |
| `energy` | `energy:low` | Energy level: `low`, `normal`, `high` |
| `est` | `est:30m`, `est:2h` | Time estimate |
| `due` | `due:2025-01-20` | Due date |
| `plan` | `plan:2025-01-15` | Planned work date |
| `bucket` | `bucket:today` | Planning bucket: `today`, `upcoming`, `someday` |
| `priority` | `priority:high` | Priority: `low`, `normal`, `high` |
| `area` | `area:work` | Area of responsibility |
| `tags` | `tags:urgent,email` | Comma-separated tags |

### Quick Entry Shorthands

`tmd enrich` expands these shortcuts:

```markdown
- [ ] ! Call client @today        →  bucket:today plan:2025-01-01 priority:high
- [ ] (A) Important task          →  priority:high
- [ ] ## Review docs              →  bucket:upcoming
- [ ] > Someday idea              →  bucket:someday
```

## Commands

| Command | Description |
|---------|-------------|
| `tmd interactive` | Launch interactive TUI |
| `tmd list [filters]` | Query tasks with filters |
| `tmd add <project> "text"` | Add a new task |
| `tmd done <id>` | Mark task complete |
| `tmd undone <id>` | Mark task incomplete |
| `tmd edit <id>` | Edit task metadata |
| `tmd show <id>` | Show task details |
| `tmd search "text"` | Full-text search |
| `tmd stats` | Show statistics |
| `tmd lint` | Validate markdown format |
| `tmd enrich` | Expand shorthands, auto-generate IDs |
| `tmd index` | Generate todos.json index |
| `tmd sync` | Update view files with latest tasks |
| `tmd init` | Scaffold a new workspace |

### Filter Examples

```bash
tmd list status:open bucket:today        # Today's open tasks
tmd list project:app energy:low          # Low energy tasks in project
tmd list due:today,tomorrow              # Due today or tomorrow
tmd list overdue:true priority:high      # High priority overdue
tmd list area:work tags:urgent           # Urgent work tasks
```

## Configuration

Create `.todosmd.json` in your project root:

```json
{
  "files": ["todos.md", "projects/*.md"],
  "output": "todos.json"
}
```

### Config Discovery

1. `--config <path>` — explicit path
2. `.todosmd.json` — nearest file walking up from cwd
3. `~/.config/todosmd/config.json` — global config

## AI Integration

Every command supports `--json` for structured output, making it easy to integrate with AI agents and automation:

```bash
# Get today's tasks as JSON
tmd list bucket:today --json

# Pipe to AI agent
tmd list status:open --json | ai-agent analyze-tasks

# Show task details
tmd show myproj:1 --json
```

### Use Cases

- **AI task planning** — Let AI agents query and prioritize your tasks
- **Automated reports** — Generate daily/weekly summaries
- **Custom integrations** — Build workflows with structured data

## Development

```bash
pnpm install          # Install dependencies
pnpm tmd <command>    # Run CLI in dev mode
pnpm test             # Run tests (136 tests)
pnpm typecheck        # Type check
pnpm build            # Build to dist/
```

## License

MIT
