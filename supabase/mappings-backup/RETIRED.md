# Ordinal site_mappings — retired 2026-08-05

All five rows were deleted from production. The JSON files here are the record.

## Why

Every mapping addressed fields by ordinal position — "the Nth input matching
`input, select, textarea, mat-select, [role=combobox], [role=listbox]`". The
fill loop still resolves them that way (`fieldMapping.position - 1` in
`extension/content/content-script.js`), and it reports success whenever no
exception is thrown, so a wrong position is not an error — it is passport data
typed into a different box on a government form.

| Mapping | State when retired |
|---|---|
| `mjopxm8gruafsdlxo1` sailclear individual/save, 12 fields, **v16** | Authored against the Angular SailClear. The site was rebuilt in React on 2026-07-15, so every ordinal was meaningless. Reaching v16 in three days is the record of how badly this addressing scheme fit. |
| `mjpq5gpnzlwhnyclb7` sailclear notification/save, 1 field | Same rebuild. |
| `mjsl97t9crk5cfsrb5t` eNOAD, 4 fields | Never functioned. Carries `frameUrl` / `frameIndex` / `tabAfter` keys that no code read at the time. |
| `example-port-authority`, `example-boat-registry` | `seed.sql` demo rows that were live in production. |

Leaving them in place meant the side panel would detect a mapping, enable
**Paste**, and fill confidently from positions that no longer point anywhere.

## What replaced them

- **SailClear** and **eNOAD** — generated workbooks (`excel_templates`), a
  versioned file contract rather than a DOM guess.
- **BVI Preclearance** — no file channel exists, so a browser driver
  (`scripts/agent/bvi-fill.mjs`) or an AI assistant fed by the side panel's
  **Copy for AI** button. Both select real dropdown options and refuse to guess.

## The engine is still there

Removing these rows removed dangerous *data*, not capability. Mapping detection,
the Admin builder, iframe scanning and the fill engine all remain. Any new
mapping should carry field identity — label, `formcontrolname`, control type —
and never position alone.

## Restoring one

```bash
curl -X POST https://crewforms.vercel.app/api/mappings \
  -H 'Content-Type: application/json' \
  --data @supabase/mappings-backup/<id>.json
```
