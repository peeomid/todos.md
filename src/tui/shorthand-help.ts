export function getShorthandHelpLines(): string[] {
  return [
    'Row shorthands (visual hints in the task list):',
    '',
    'Priority:',
    '  (A) = high',
    '  (B) = normal',
    '  (C) = low',
    '',
    'Bucket:',
    '  ! = today',
    '  > = upcoming',
    '  ~ = anytime',
    '  ? = someday',
    '',
    'Notes:',
    '  - These are display shorthands; canonical metadata lives in [..] (priority:, bucket:, plan:, due:, etc.)',
  ];
}

