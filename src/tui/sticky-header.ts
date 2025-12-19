type RenderRowLike = { kind: 'header'; label: string } | { kind: 'task' };

export function getStickyHeaderLabel(rows: RenderRowLike[], scroll: number): string | null {
  if (rows.length === 0) return null;
  const start = Math.min(Math.max(0, scroll), rows.length - 1);
  for (let i = start; i >= 0; i--) {
    const row = rows[i]!;
    if (row.kind === 'header') return row.label;
  }
  return null;
}

