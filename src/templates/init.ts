export function renderTodosScaffold(): string {
  return `# Tasks

## Inbox [project:inbox area:inbox]

- [ ] Example task [id:1 energy:normal est:30m area:inbox]
`;
}

export function renderDailyViewScaffold(): string {
  return `<!-- tmd:start name="daily" query="bucket:today status:open" -->
<!-- tmd:end -->
`;
}

