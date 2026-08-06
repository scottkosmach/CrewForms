# Canonical field registry

One entry per **captain-facing question**. The captain answers each question once;
the registry says how that one answer is rendered on each of the three sites.
This is the contract between the future wizard (which asks the questions) and the
fill/prompt/Excel layers (which spend the answers).

The registry exists because the same fact has a different spelling on every site:

| Canonical fact | BVI Preclearance | USCG eNOAD | SailClear |
|---|---|---|---|
| US citizenship | `AMERICAN` (demonym!) | `UNITED STATES` | `United States` |
| BVI as a country | `VIRGIN ISLANDS (BRITISH)` | `VIRGIN ISLANDS, BRITISH` | `British Virgin Islands` |
| A date | `DD/MM/YYYY` | `YYYY-MM-DD` | `DD/MM/YYYY` (form) / `MM-DD-YYYY` (spreadsheet) |

## Files

- **`canonical-fields.json`** — the registry. Consumed by the wizard
  (`question` / `scope` / `source`) and by the fill layers (`bindings`).
- **`learned-lists.json`** — seed values for lists that grow with use
  (the captain's usual docks, ports, trip purposes). At runtime the live copy
  lives in `chrome.storage.local.learnedLists`; this file only seeds it.

## Schema

```jsonc
{
  "id": "countryOfCitizenship",       // stable key, camelCase
  "question": "…?",                    // exactly what the wizard would ask
  "scope": "per-traveler",             // per-captain | per-vessel | per-trip | per-traveler
  "source": {
    "kind": "passportOCR",             // passportOCR | wizard | stored | derived
    "path": "traveler.nationality",   // where the value lives today (chrome.storage shapes)
    "normalize": "toCountry"           // optional: normalizer in extension/sidepanel/app.js
  },
  "canonical": { "example": "UNITED STATES" },
  "bindings": {
    "<site>": {
      "label": "Nationality",         // exactly as shown on screen
      "control": "mat-autocomplete",  // text | select | mat-autocomplete | telerik-radcombobox |
                                       //   date | radio | checkbox | readonly | absent | unverified
      "frame": "menu/EditNonCrew.aspx", // only when not the top frame
      "transform": "demonym",         // identity | demonym | titleCase | upper | map:<name>
      "example": "AMERICAN",
      "vocabulary": "shared/reference/…", // the full legal option list, when we have it
      "interaction": "…",             // what makes the control take a value
      "idiosyncrasies": ["…"],
      "confidence": "single-observation",
      "observed": ["2026-08-05"]
    }
  }
}
```

`"control": "absent"` is a real finding, not a gap — e.g. eNOAD has **no** field
for passport issue date or place of birth, and knowing that stops every future
layer from hunting for one.

## Provenance rules

- **`single-observation`** — seen once on the live form (currently: the
  2026-08-05 run). Treat as provisional; forms change and one sighting can be a
  misreading.
- **`confirmed`** — two independent sightings agree. Only recon sessions promote
  a binding to confirmed; never promote by assumption.
- **`template`** — taken from an official file contract (NOAD Workbook 8.2,
  SailClear `Individual_Format.xlsx`), which is versioned and more durable than
  the DOM — but describes the *file*, not necessarily the live form.
- **`needs-recon`** — believed to exist, never verified. These are the recon
  targets; a session that observes one should replace it wholesale.
- **A contradiction beats a seed.** If a recon session disagrees with a binding,
  the observation wins: update the binding, append the date to `observed`, and
  note the old value in `idiosyncrasies` if the change itself is informative.
- Append the session date to `observed` on every sighting, agreeing or not.

## What recon sessions do with this file

Recon reports (Claude survey debriefs in `docs/recon/`, and later the DOM
recorder's exports) are **diffed against this file**, classifying every field as
`binding-confirmed`, `binding-contradicted`, `field-not-in-registry`, or
`registry-field-not-seen`. The registry is the accumulator; raw sessions are the
evidence and stay verbatim in `docs/recon/`.
