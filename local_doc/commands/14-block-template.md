# Command: `tmd block-template`

**Tier**: 4 (Views)
**Priority**: Low - convenience for creating sync blocks

---

## Purpose

Generate a ready-to-paste sync block skeleton. Quick way to add `<!-- tmd:start -->` blocks to markdown files.

---

## Usage

```bash
tmd block-template <preset|query> [options]
```

## Arguments

| Arg | Description | Required |
|-----|-------------|----------|
| `<preset\|query>` | Built-in preset name OR custom query string | Yes |

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--name <name>` | Block name (for custom queries) | none |

---

## Built-in Presets

| Preset | Query | Description |
|--------|-------|-------------|
| `now` | `status:open bucket:now` | Working right now |
| `today` | `status:open bucket:today` | Today's focus tasks |
| `upcoming` | `status:open bucket:upcoming` | Upcoming tasks |
| `anytime` | `status:open bucket:anytime` | Flexible tasks |
| `someday` | `status:open bucket:someday` | Someday/maybe |
| `light` | `status:open energy:low` | Low energy tasks |
| `week` | `status:open plan:this-week` | This week's planned |
| `overdue` | `status:open overdue:true` | Overdue tasks |

---

## Examples

```bash
# Using preset
tmd block-template today

# Using preset with explicit name
tmd block-template light --name "quick-wins"

# Custom query
tmd block-template 'status:open project:as-onb' --name "as-onb-tasks"

# Custom query with multiple filters
tmd block-template 'status:open area:work energy:low' --name "work-light"
```

---

## Output

### Preset (today)

```bash
$ tmd block-template today
```

```markdown
<!-- tmd:start name="today" query="status:open bucket:today" -->
<!-- tmd:end -->
```

### Custom query

```bash
$ tmd block-template 'status:open project:as-onb energy:low' --name "as-onb-light"
```

```markdown
<!-- tmd:start name="as-onb-light" query="status:open project:as-onb energy:low" -->
<!-- tmd:end -->
```

---

## Behavior

1. If arg matches preset name, use preset's query
2. Otherwise, treat arg as custom query string
3. Validate query syntax
4. Output formatted block markers

---

## Use Case

1. Editing `00-daily-focus.md`
2. Run `tmd block-template today`
3. Copy output, paste into file
4. Run `tmd sync --file 00-daily-focus.md` to fill it

---

## Future: `--as-block` flag for `tmd list`

Alternative approach - preview block with content:

```bash
tmd list status:open bucket:today --as-block --name today
```

Output:

```markdown
<!-- tmd:start name="today" query="status:open bucket:today" -->
- [ ] Draft welcome email [id:as-onb:1 energy:normal est:60m]
- [ ] Call bank [id:life:2 energy:low est:15m]
<!-- tmd:end -->
```

This is lower priority but useful for previewing what sync would produce.

---

## Related

- `09-sync.md` - fills these blocks with tasks
- `02-list.md` - filter syntax
