# eNOAD tab captures — 2026-08-06

`outerHTML` of the main form panel on the first three eNOAD tabs — all
values and every dropdown option string verbatim; pure Telerik calendar/
popup scaffolding abbreviated with bracketed notes (each file's trailing
comment says exactly what was elided)
(`enoad.nvmc.uscg.gov`, release 8.0.4), captured by the captain during the
2026-08-06 Departure filing (Cruz Bay, USVI → Tortola, BVI). Saved from the
conversation where they were supplied; screenshots of the same three tabs are
in `.tm/clips/` on the capture machine.

| File | Tab | What it pins down |
|---|---|---|
| `vessel-details.html` | Vessel Details | Full **flag dropdown** (`NAME - CODE` strings, some truncated — the one list not derivable from the NOAD workbook), ID Type options, Class Society list, Vessel Class list, fuel-type checkbox labels, OCE options, DOC/SMC agency lists, which fields carry the required marker |
| `reporting-party.html` | Reporting Party | Contact fields, lat/long masked inputs, "Either Latitude/Longitude or Location Description is required" |
| `arrival-departure-port.html` | Arrival/Departure Port (Departure notice) | Voyage/Notice type behavior (Notice Type disabled once chosen; Voyage Type offers only `US to Foreign`), 24-hr POC block, departure city/state/port cascade (state list incl. territories; USVI port list), NPOC country list (**plain uppercase names, no codes**), NPOC port list for BVI, datetime format `M/d/yyyy HH:mm` |

Personal values present: the captain's own name/email/phone/fax and the
trip's charterer surname — retained deliberately (they are this project's
own seed data, per the vessel-registry plan). **No guest passport data is
present.** Dropdown option strings are site vocabulary, extracted into
`shared/reference/nvmc/flagList.json` by
`scripts/agent/extract-enoad-dropdowns.mjs`.

Observed idiosyncrasies worth keeping in view:

- The **flag** list is `NAME - CODE` with names truncated around 25 chars:
  `BONAIRE, SINT EUSTATIUS A - BQ`, `CONGO, THE DEMOCRATIC REP - CD`,
  `FALKLAND ISLANDS (MALVINA - FK`. The NPOC **country** list on the voyage
  tab is full plain names (`BONAIRE, SINT EUSTATIUS AND SABA`) — same
  concept, two spellings on one site.
- Vessel Type / Sub-Type dropdowns are empty (`[None Selected]` only) until
  a Vessel Class is chosen — server-side cascade via postback.
- MMSI's required marker exists but is `visibility: hidden` — it toggles
  (likely with <300GT state); treat MMSI as conditionally required.
- Departure Date/Time and Arrival Date/Time inputs display `M/d/yyyy HH:mm`
  and post `yyyy-MM-dd-HH-mm-ss` in their client state.
- Notice Type combo is disabled on the Departure notice (chosen earlier at
  notice creation); Closed Loop Voyage was pre-checked.
- Latitude/Longitude are masked inputs (`_ 00° 00' 00"`) — leave to the
  captain; Location Description alone satisfied the requirement.
