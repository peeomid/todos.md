export type TaskBucket = 'now' | 'today' | 'upcoming' | 'anytime' | 'someday' | (string & {});

export function getNowToggleChanges(params: {
  bucket: TaskBucket | null | undefined;
  plan: string | null | undefined;
  todayIso: string;
}): Record<string, string | null> {
  if (params.bucket === 'now') {
    const changes: Record<string, string | null> = { bucket: 'today' };
    if (!params.plan) changes.plan = params.todayIso;
    return changes;
  }

  return { bucket: 'now' };
}

