# NVMC reference tables

Extracted from the official **NOAD Workbook 8.2** (`extension/assets/templates/nvmc-noad-workbook-8.2.xlsx`) by `scripts/extract-nvmc-lookups.mjs`. Regenerate whenever NVMC publishes a new workbook version:

```bash
node scripts/extract-nvmc-lookups.mjs
```

## Why we need these at all

The workbook's `*_CODE` columns are **live VLOOKUP formulas**, and in the blank template their cached values are empty (`<v/>`). The Non-Crew List sheet alone contains 2,702 formulas. Nothing recalculates them outside Excel, so a generator that writes only display values ships **empty code columns** to NVMC.

We therefore resolve every code ourselves and write it as a literal value alongside its display value. That requires the same tables the formulas use.

| File | Formula range | Entries | Used by |
|---|---|---|---|
| `personCountry.json` | `Lookups!$AJ$1:$AK$242` | 242 | `NATIONALITY_CODE`, `COUNTRY_RESIDENCE_CODE`, `ID_COUNTRY_CODE`, `SECONDARY_ID_COUNTRY_CODE` |
| `travelCountry.json` | `Lookups!$C$1:$D$248` | 242 | `EMBARK_COUNTRY_CODE`, `DEBARK_COUNTRY_CODE` |
| `usState.json` | `Lookups!$AB$1:$AC$73` | 58 | `US_ADDRESS_STATE_ABBR` |
| `port.json` | `Lookups!$H$1:$I$12332` | 12,113 | `EMBARK_PORT_CODE`, `DEBARK_PORT_CODE` |

`personCountry` and `travelCountry` are **currently identical**. They are kept as separate files because the workbook references them through different ranges and a future version could diverge — if they ever stop matching, the extractor's counts will show it.

112 duplicate port keys were skipped (first occurrence wins).

## Encoding model — the part that bites

**Country names are UPPERCASE and some are comma-inverted.** This is not the same vocabulary any other system in this project uses:

| Concept | NVMC | SailClear |
|---|---|---|
| USA | `UNITED STATES` | `United States` |
| BVI | `VIRGIN ISLANDS, BRITISH` | `British Virgin Islands` |
| USVI | *not a country* — see below | `US Virgin Islands` |

**US state names are title case**, unlike countries: `Virgin Islands`, `Puerto Rico`, `Florida`.

**The USVI is not a country in this schema.** A US Virgin Islands port is encoded as:

```
Embark Country = UNITED STATES          (code US)
Embark State   = Virgin Islands         (abbr VI)
Embark Port    = CHARLOTTE AMALIE, ST THOMAS
Embark Port Code = (blank — see below)
```

**Port codes are deliberately blank for US ports.** The formula is:

```
AA8 = IF(X8="US", "", VLOOKUP(Z8 & X8, Lookups!$H$1:$I$12332, 2, FALSE))
```

So when the embark country code is `US`, the port code column must stay empty. Writing a code there contradicts the official workbook's own logic.

**Port lookup keys are `portName + countryCode` concatenated**, with no separator — e.g. `ROAD TOWN, TORTOLAVG` → `RAD`.

**The port dropdown is a cascading named range**, built by concatenating country and state and stripping spaces and punctuation:

```
Z8 validation = INDIRECT(SUBSTITUTE(...CONCATENATE(W8, Y8)...))
```

So the valid port list depends on the country/state pair already being correct.

## Values for the USVI↔BVI run

| | Value | Code |
|---|---|---|
| BVI (country) | `VIRGIN ISLANDS, BRITISH` | `VG` |
| USVI (state of `UNITED STATES`) | `Virgin Islands` | `VI` |
| Road Town, Tortola | `ROAD TOWN, TORTOLA` | `RAD` |
| Tortola | `TORTOLA` | `TOV` |
| Beef Island, Tortola | `BEEF ISLAND, TORTOLA` | `EIS` |
| Virgin Gorda | `VIRGIN GORDA` | `VIJ` |
| Charlotte Amalie, St Thomas | `CHARLOTTE AMALIE, ST THOMAS` | *(blank — US port)* |
| Christiansted, St. Croix | `CHRISTIANSTED, ST. CROIX` | *(blank — US port)* |
| Frederiksted, St. Croix | `FREDERIKSTED, ST. CROIX` | *(blank — US port)* |

Note: the archived eNOAD mapping (`supabase/mappings-backup/mjsl97t9crk5cfsrb5t.json`) hard-coded the static value `"Virgin Island"` — singular, which matches nothing in this table. The correct value is `Virgin Islands`.

## Also relevant

Per **EO 14168**, effective with workbook 8.0 / schema 4.0 on 2025-12-09, the `Gender` field was renamed **`Sex`** and accepts only `Male` or `Female`. This applies to email submissions, web service submissions, and eNOAD imports alike.
