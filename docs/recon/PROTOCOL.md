# Recon capture protocol

How to run a filing so it feeds the field registry
(`shared/registry/canonical-fields.json`). A filing is the only chance to
observe these forms — they sit behind logins and bot protection — so a recon
filing follows the same steps as a normal one, plus capture.

Two capture channels, complementary:

1. **Survey mode** (available now) — tick *Survey mode* under Copy for Claude
   in the side panel before copying each site's prompt. Claude fills as usual
   and then reports the full inventory: every field, option strings verbatim,
   validation messages, conditional behavior, and every value translation it
   made.
2. **The DOM recorder** — armed from the **Recon tab**, it passively records
   field descriptors, option clicks, mutations and validation messages in
   every frame while anyone (captain or Claude) fills — including inside the
   eNOAD passenger iframe, and across its postback reloads. Stop & download
   produces a `.json` (machine) and `.md` (skimmable, with redaction audit)
   pair. Bench-verified by `node scripts/recon-bench.mjs`.

## Before the trip (dev machine)

- [ ] `node scripts/agent/extract-bvi-dictionaries.mjs` — refresh
      `shared/reference/bvi/` (all 12 vocabularies come from one API call).
- [ ] Registry committed and current; skim the `needs-recon` bindings so you
      know what this run should answer. Biggest open areas: **SailClear's
      vessel/voyage/health wizard** and **eNOAD's voyage-side fields**
      (`shared/reference/nvmc/port.json` is still empty — eNOAD port options
      are a standing capture target).
- [ ] Extension rebuilt and loaded; Survey mode checkbox visible on the
      Travelers tab.

## Filing day — order of operations

Work sites lowest-stakes first. **Never submit anything the captain has not
reviewed. Recording never changes what gets filed.**

### 1. SailClear (first — no timeout, records editable)

- Tick Survey mode, Copy, paste into Claude on `sailclear.com`.
- Person records are covered by the spreadsheet path; the survey's real
  targets are the **vessel, voyage and health-declaration wizard** pages the
  spreadsheet never touches, plus the individuals form labels (`ID`,
  `Country Of Citizenship`, …) for confirmation.

### 2. eNOAD (second — 15-minute timeout)

- The timeout rule stands: **save each passenger as you finish it**, never
  batch. The survey adds no interaction cost while filling; Claude writes it
  up at the end.
- Capture targets: live labels in the `menu/EditNonCrew.aspx` iframe, the
  **port dropdown option strings** (verbatim, with any codes), and the
  Voyage Information section's field list.

### 3. BVI Preclearance (last — and only as the real filing)

- **There is no practice mode.** Every `Save & Add Traveler` persists
  server-side immediately. Typing into Step 1 *before* any Save is a safe
  smoke test; never press Save except when filing for real.
- **Write down the Manifest ID the moment it appears** — editing later needs
  it plus the vessel registration number.
- Vocabularies are already fully extracted (`shared/reference/bvi/`), so the
  survey here is *verification*: do the on-screen options match the
  dictionaries, does the label read `Gender` over the SEX dictionary, is
  there really no passport issue-date field.

### After each site — before moving to the next

1. Copy Claude's survey verbatim into `docs/recon/<date>-<site>.md`
   (same convention as `docs/field-notes/`): a short editorial header if
   anything needs contextualizing, then the untouched text in a code fence.
2. If the DOM recorder ran: Stop & download, skim the **redaction audit** at
   the bottom of the `.md` before it goes anywhere near the repo, then move
   both files into `docs/recon/`.

## Within a week — distillation

- Diff each survey against the registry. Classify every claim:
  `binding-confirmed` / `binding-contradicted` / `field-not-in-registry` /
  `registry-field-not-seen`.
- **A contradiction beats a seed** — update the binding, append the date to
  `observed`.
- Promote `confidence` to `confirmed` only when a second sighting agrees;
  a single run can misread (see the 2026-08-05 eNOAD "declined the workbook"
  misreading).
- New fields get new registry entries; new dropdown values get flagged
  against the reference vocabularies (drift detection).

## Standing safety rules

- **DO NOT SUBMIT** is in every prompt; the captain reviews and submits.
- Passport data stays in `chrome.storage.local` and on the clipboard — never
  in committed recon artifacts. Dropdown *option strings* are site vocabulary
  and safe to commit; typed personal values are not.
- If a survey and the recorder ever disagree, keep both verbatim and note the
  disagreement — that is a finding about the tools, not noise.
