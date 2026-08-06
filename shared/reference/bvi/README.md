# BVI Preclearance reference data

Extracted from the live portal's own public assets by
`scripts/agent/extract-bvi-dictionaries.mjs` (2026-08-06). Re-run it to
refresh; add `--linger` and click each dropdown once if a dictionary fails to
appear, and `--from-raw` to re-split the last capture without a browser.

Two sources:

1. **The dictionaries API** — the Angular app fetches *every* vocabulary in one
   call to `/cbn-dictionaries/api/v1/dictionaries/cache/getLists`. The raw
   response is kept under `raw/`; each dictionary is split into its own file.
2. **`labels-en.json`** — the app's complete i18n bundle
   (`/ng-vg-bms-online/assets/i18n/en.json`): every field label, instruction,
   and validation message, verbatim. The `…NotRecognizedError` strings identify
   exactly which fields are click-to-select typeaheads (11 of them).

| File | Dictionary | Entries | Backs the field |
|---|---|---|---|
| `nationality.json` | NATIONALITY | 271 | Nationality — **demonyms** (`AMERICAN`, `BRITON`) |
| `country.json` | COUNTRY | 270 | Country of issue / residence / registration |
| `ports.json` | PORT | 25,751 | Initial port of embarkation (`CODE - Name`) |
| `portsOfEntry.json` | LOCATION | 15 | Port of entry (NOT the PORT list) |
| `purposeOfVisit.json` | PURPOSE VISIT PERSON | 19 | Purpose of visit (per person) |
| `purposeOfVisitTransport.json` | PURPOSE VISIT TRANSPORT | 16 | **"Transport type"** on the form — see trap below |
| `transportType.json` | TRANSPORT TYPE | 2 | SEA VESSEL \| AIRCRAFT |
| `accommodationType.json` | ACCOMMODATION TYPE | 9 | Type of accommodation (`SEA VESSEL` is legal) |
| `gender.json` | SEX | 3 | Gender (UNSPECIFIED \| FEMALE \| MALE) |
| `personType.json` | PERSON TYPE | 2 | Traveling as (PASSENGER \| CREW) |
| `directionCode.json` | DIRECTION CODE | 2 | DEPARTURE \| ARRIVAL |
| `travelDocumentType.json` | EDIFACT TRAVEL DOCUMENT TYPE | 13 | single-letter EDIFACT codes |

## Traps confirmed by this extraction

- **The "Transport type" field is backed by PURPOSE VISIT TRANSPORT** (CREWED
  CHARTER, BAREBOAT RENTAL, regattas, poker runs…). The dictionary literally
  named TRANSPORT TYPE is just `SEA VESSEL | AIRCRAFT`.
- **The plain-UK demonym is `BRITON`**, not `BRITISH` — `BRITISH` appears only
  inside longer variants (`UNITED KINGDOM BRITISH – OVERSEAS CITIZEN`, …).
  Argentina's literal option is `ARGENTINIAN, ARGENTINE`, comma and all.
  Both are fixed in `NATIONALITY_DEMONYM` (`extension/sidepanel/app.js`).
- **Values are verbatim and some carry stray whitespace** (`" ONE VI POKER
  RUN"`, `"BVI MUSIC FEST "`) — flagged `whitespaceHazard` in the split files.
  Compare trimmed, select verbatim.
- **Inactive entries are kept** (`"active": false`) because the form may still
  render them; never *select* an inactive value.
- The i18n bundle has **no passport issue-date string at all** — the traveler
  form almost certainly has no such field.
- Port of entry uses the 15-entry LOCATION list (including airports and
  Immigration offices), not the 25k PORT list the embarkation field uses.
