#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Build and link the `tmd` CLI globally from this repo.

Usage:
  ./script/build-and-link-global.sh [--pm pnpm|npm] [--skip-build]

Notes:
  - Default is pnpm if available, otherwise npm.
  - If pnpm global linking isn't configured, this script prints setup guidance and
    automatically falls back to `npm link` (unless you force `--pm pnpm`).
EOF
}

pm=""
pm_forced="false"
skip_build="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --pm)
      pm="${2:-}"
      pm_forced="true"
      shift 2
      ;;
    --skip-build)
      skip_build="true"
      shift
      ;;
    *)
      echo "Unknown arg: $1" >&2
      echo "" >&2
      usage >&2
      exit 2
      ;;
  esac
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if [[ -z "$pm" ]]; then
  if command -v pnpm >/dev/null 2>&1; then
    pm="pnpm"
  elif command -v npm >/dev/null 2>&1; then
    pm="npm"
  else
    echo "Neither pnpm nor npm found on PATH." >&2
    exit 1
  fi
fi

case "$pm" in
  pnpm|npm) ;;
  *)
    echo "Invalid --pm value: '$pm' (expected pnpm or npm)" >&2
    exit 2
    ;;
esac

if [[ "$skip_build" != "true" ]]; then
  if [[ "$pm" == "pnpm" ]]; then
    pnpm -s build
  else
    npm run -s build
  fi
fi

if [[ "$pm" == "npm" ]]; then
  npm link
  echo "Linked globally via npm. Try: tmd --help"
  exit 0
fi

pnpm_global_bin_dir="$(pnpm config get global-bin-dir 2>/dev/null || true)"
pnpm_home="${PNPM_HOME:-}"

if [[ -z "$pnpm_global_bin_dir" || "$pnpm_global_bin_dir" == "undefined" ]]; then
  if [[ "$pm_forced" == "true" ]]; then
    cat <<'EOF' >&2
pnpm global bin dir is not configured.

Fix (recommended):
  pnpm setup

Alternative (macOS default):
  pnpm config set global-bin-dir "$HOME/Library/pnpm"
  export PATH="$HOME/Library/pnpm:$PATH"   # add to shell rc
EOF
    exit 1
  fi

  if command -v npm >/dev/null 2>&1; then
    cat <<'EOF' >&2
pnpm global bin dir is not configured, so pnpm cannot link globally.
Falling back to `npm link`.

To enable pnpm global linking later:
  pnpm setup
  # or (macOS default):
  pnpm config set global-bin-dir "$HOME/Library/pnpm"
  export PATH="$HOME/Library/pnpm:$PATH"
EOF
    npm link
    echo "Linked globally via npm. Try: tmd --help"
    exit 0
  fi

  echo "pnpm global bin dir is not configured and npm is not available for fallback." >&2
  echo "Run: pnpm setup" >&2
  exit 1
fi

if [[ -n "$pnpm_home" ]] && [[ ":$PATH:" != *":$pnpm_home:"* ]]; then
  echo "Note: PNPM_HOME is set but not on PATH: PNPM_HOME=$pnpm_home" >&2
fi

set +e
pnpm_link_out="$(pnpm link --global 2>&1)"
rc=$?
set -e

if [[ $rc -eq 0 ]]; then
  echo "Linked globally via pnpm. Try: tmd --help"
  exit 0
fi

if echo "$pnpm_link_out" | grep -q "ERR_PNPM_NO_GLOBAL_BIN_DIR"; then
  if [[ "$pm_forced" == "true" ]]; then
    echo "$pnpm_link_out" >&2
    exit $rc
  fi
  if command -v npm >/dev/null 2>&1; then
    cat <<'EOF' >&2
pnpm link --global failed (ERR_PNPM_NO_GLOBAL_BIN_DIR). Falling back to `npm link`.

To enable pnpm global linking later:
  pnpm setup
  # or (macOS default):
  pnpm config set global-bin-dir "$HOME/Library/pnpm"
  export PATH="$HOME/Library/pnpm:$PATH"
EOF
    npm link
    echo "Linked globally via npm. Try: tmd --help"
    exit 0
  fi
fi

echo "$pnpm_link_out" >&2
cat <<'EOF' >&2
pnpm link --global failed.

If you see ERR_PNPM_NO_GLOBAL_BIN_DIR:
  pnpm config get global-bin-dir
  pnpm config set global-bin-dir "$HOME/Library/pnpm"   # macOS default
  export PATH="$HOME/Library/pnpm:$PATH"                # add to shell rc
  pnpm link --global

Fallback (often simplest):
  npm link
EOF
exit $rc
