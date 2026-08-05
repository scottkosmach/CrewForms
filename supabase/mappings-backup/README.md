# site_mappings backup

Snapshot of the `site_mappings` table pulled from production (`crewforms.vercel.app/api/mappings`) on **2026-08-04**.

These records previously existed **only in Supabase**. The mappings API has no auth and no version history — a single `PUT` or `DELETE` overwrites them irrecoverably. This directory is the recovery point.

## Files

| File | What it is |
|---|---|
| `all-mappings.json` | All five records in one array |
| `mjopxm8gruafsdlxo1.json` | **SailClear individual/save** — 12 fields, version 16 |
| `mjpq5gpnzlwhnyclb7.json` | SailClear notification/save — 1 field |
| `mjsl97t9crk5cfsrb5t.json` | **USCG eNOAD** — 4 fields, never worked (iframe) |
| `example-port-authority.json` | Seed row from `seed.sql`, safe to delete from prod |
| `example-boat-registry.json` | Seed row from `seed.sql`, safe to delete from prod |

## Why these are worth keeping even though the mappings are obsolete

**SailClear (`mjopxm8gruafsdlxo1`)** — obsolete as a mapping: the site was rebuilt from Angular to React on 15 July 2026, so every ordinal position in it is meaningless now. Valuable as a record of *what the form asked for* and how each control had to be driven. Six of twelve fields are hand-recorded keystroke macros against Angular Material dropdowns, e.g. nationality = press `u` five times then `Enter` at 250 ms per keystroke; gender maps `F`→`f`, `M`→`m`. Reaching version 16 in three days is the clearest evidence of why ordinal addressing had to go.

**eNOAD (`mjsl97t9crk5cfsrb5t`)** — never functioned, because no code in the repo has ever read `frameUrl`, `frameIndex`, or `tabAfter`. But it is genuine reconnaissance from someone sitting in front of the authenticated app, and it records three facts we cannot otherwise obtain without an eNOAD account:

- the passenger form lives at `https://enoad.nvmc.uscg.gov/menu/EditNonCrew.aspx`
- it is in **frame index 2** of the parent document
- field ordinals run to at least **52**, confirming a very large legacy form

That page name matches the "Non-Crew List" tab in the official NVMC NOAD Workbook — the same data model we now generate as a file instead of typing into the form.

## Refreshing this snapshot

```powershell
# List, then fetch each by id
Invoke-RestMethod "https://crewforms.vercel.app/api/mappings"
Invoke-WebRequest "https://crewforms.vercel.app/api/mappings?id=<ID>" -UseBasicParsing
```

Re-export before any migration that rewrites the `fields` JSONB.
