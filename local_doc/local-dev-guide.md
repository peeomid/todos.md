# Local Development Guide

How to run, build, install, and publish the `tmd` CLI.

---

## 1. Run the Most Updated Code on Your Files

### Option A: Using `pnpm tmd` (recommended for development)

```bash
cd /path/to/todosmd

# Run any command directly with tsx (no build needed)
pnpm tmd list
pnpm tmd index -f ~/path/to/your/todos.md
pnpm tmd sync --file ~/path/to/daily-focus.md
pnpm tmd enrich --dry-run
```

### Option B: Using `tsx` directly

```bash
npx tsx src/cli.ts list
npx tsx src/cli.ts index -f ~/path/to/your/todos.md
```

---

## 2. Build and Install CLI on Your System

### Recommended: one command (build + global link)

```bash
./script/build-and-link-global.sh
tmd --help
```

You can force the package manager:

```bash
./script/build-and-link-global.sh --pm pnpm
./script/build-and-link-global.sh --pm npm
```

Notes:
- If pnpm global linking isn't configured, the script prints setup guidance and falls back to `npm link` automatically (unless you force `--pm pnpm`).

### Manual: Build the project

```bash
cd /path/to/todosmd
pnpm build
```

### Step 2: Install globally (so `tmd` works anywhere)

#### Option A: `npm link` (simplest)

```bash
# Creates a global symlink to your local development version
npm link

# Now you can use `tmd` from anywhere
tmd --help
tmd list -f ~/todos/work.md
```

#### Option B: `pnpm link --global` (requires one-time setup)

```bash
# One-time setup so pnpm has a global bin directory on your PATH
pnpm setup

# Creates a global symlink to your local development version
pnpm link --global

# Now you can use `tmd` from anywhere
tmd --help
tmd list -f ~/todos/work.md
```

#### If `pnpm link --global` fails with `ERR_PNPM_NO_GLOBAL_BIN_DIR`

Some environments (common with Node installed via `nvm`) don’t have pnpm’s global bin dir configured by default.

```bash
# Inspect current pnpm global bin dir (often prints "undefined" when misconfigured)
pnpm config get global-bin-dir

# macOS default (recommended)
pnpm config set global-bin-dir "$HOME/Library/pnpm"

# Ensure it's on PATH (add to ~/.zshrc or ~/.bashrc as needed)
export PATH="$HOME/Library/pnpm:$PATH"

# Retry
pnpm link --global
```

If you don’t want to deal with pnpm globals, use `npm link` instead (it works well with `nvm`).

### To unlink later

```bash
# If you used `npm link`
npm unlink

# If you used `pnpm link --global`
pnpm unlink --global
```

### Alternative: Install from local path

```bash
npm install -g /path/to/todosmd
```

---

## 3. Publish Package to npm

### Package.json Configuration

Before publishing, ensure `package.json` has these fields:

```json
{
  "name": "todosmd",
  "version": "0.1.0",
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "bin": {
    "tmd": "dist/cli.js"
  },
  "scripts": {
    "prepublishOnly": "pnpm check && pnpm test && pnpm build"
  },
  "publishConfig": {
    "access": "public"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/your-username/todosmd.git"
  },
  "bugs": {
    "url": "https://github.com/your-username/todosmd/issues"
  },
  "homepage": "https://github.com/your-username/todosmd#readme",
  "author": "Your Name <your@email.com>",
  "license": "MIT"
}
```

**Key fields:**
- `files`: Specifies what gets published (only `dist/`, not `src/`)
- `prepublishOnly`: Runs tests and builds before publishing
- `publishConfig.access`: Makes package public on npm
- `bin`: Defines the CLI command name

### Publishing Steps

```bash
# 1. Login to npm (one-time)
npm login

# 2. Verify what will be published
npm pack --dry-run

# 3. Publish!
npm publish
```

### Version Bumping

```bash
# Patch release (0.1.0 -> 0.1.1)
npm version patch

# Minor release (0.1.0 -> 0.2.0)
npm version minor

# Major release (0.1.0 -> 1.0.0)
npm version major

# Then publish
npm publish
```

---

## 4. Installation Methods for Users

Once published, users can install via:

### NPX (no install, just run)

```bash
npx todosmd list
npx todosmd index -f todos.md
```

### Global install

```bash
npm install -g todosmd
# or
pnpm add -g todosmd

# Then use anywhere
tmd list
```

### Project dependency

```bash
pnpm add todosmd
# or
npm install todosmd
```

### Optional: Homebrew tap (advanced)

Create a separate `homebrew-tap` repository with a formula:

```bash
brew tap your-username/tap
brew install your-username/tap/todosmd
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Run dev version | `pnpm tmd <command>` |
| Build | `pnpm build` |
| Type check | `pnpm typecheck` |
| Run tests | `pnpm test` |
| Install globally (local dev) | `pnpm link --global` |
| Unlink global | `pnpm unlink --global` |
| Test before publish | `npm pack --dry-run` |
| Publish | `npm publish` |
| Users install | `npm install -g todosmd` |
| Users run without install | `npx todosmd <command>` |

---

## Development Workflow

```bash
# 1. Make changes to src/

# 2. Run tests
pnpm test

# 3. Type check
pnpm typecheck

# 4. Test your changes with real files
pnpm tmd list -f ~/path/to/todos.md

# 5. Build (if needed for global install)
pnpm build
```

---

## References

- [npm scripts documentation](https://docs.npmjs.com/cli/v8/using-npm/scripts/)
- [npm publish documentation](https://docs.npmjs.com/cli/v11/commands/npm-publish/)
- [mcporter](https://github.com/steipete/mcporter) - reference CLI project
