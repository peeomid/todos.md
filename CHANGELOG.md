# Changelog

## 0.1.4 - 2026-01-16
- Add `completed:` date filter that only matches tasks with `completedAt`.
- Auto-backfill `completedAt` in `tmd list` and `tmd search`.

## 0.1.3 - 2026-01-16
- Add `completedAt` metadata for completed tasks.
- Set/clear `completedAt` on done/undone and backfill during sync and TUI reload.
- Use `completedAt` for completion stats when available.
- Document the new metadata and behavior.
