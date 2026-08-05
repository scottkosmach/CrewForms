# Field notes — what the forms actually do

Paste the debrief from each real filing into a dated file here:

```
docs/field-notes/2026-08-05-bvi.md
docs/field-notes/2026-08-05-enoad.md
docs/field-notes/2026-08-05-sailclear.md
```

## Why bother

All three targets resist offline study. eNOAD and SailClear are behind logins,
and the BVI portal sits behind Cloudflare, which blocks headless automation. So
the only reliable source of truth about these forms is somebody filling one in
for real — and each debrief is the only record of that.

Everything hard-won so far came from exactly this kind of observation, and every
item cost real time to find:

- **BVI dates are `DD/MM/YYYY`.** A US captain entering 6 August as `08/06/2026`
  files 8 June, and nothing on screen objects.
- **BVI names and passport numbers must be UPPERCASE.** Lowercase fails
  validation rather than being corrected.
- **BVI dropdowns must be clicked, not typed.** Typing leaves the Angular
  control `null` and submit fails without explaining why.
- **The terms checkbox at the foot of BVI step 1 gates "Save and Continue"** —
  which reads as the form being broken rather than incomplete.
- **BVI spells countries a third way again**: `VIRGIN ISLANDS (BRITISH)`, versus
  NVMC's `VIRGIN ISLANDS, BRITISH` and SailClear's `British Virgin Islands`.
- **The BVI option panel only renders ~10 rows**, so `UNIT` buries
  `UNITED STATES` beneath six `UNITED KINGDOM` variants.

None of that is documented anywhere public. It came from watching the form.

## What to capture

The prompt already asks for the useful parts. When pasting a debrief back, keep:

- the **label exactly as displayed** — that is what future field matching keys on
- the **control type** — text, dropdown, date picker, radio, checkbox
- **verbatim option strings**, including code prefixes like
  `VICHA - CHARLOTTE AMALIE HARBOR, ST. THOMAS`
- **exact validation messages** and what cleared them
- fields that appear or disappear based on another field
- anything that silently reverted after being set

## What this feeds

Two things.

**Short term** — the per-site prompts in `extension/sidepanel/app.js`
(`siteRules()`). Anything learned here should go straight in, so the next filing
starts ahead of where this one did.

**Longer term** — the descriptor-based field matching described in the plan.
That approach identifies fields by label, `formcontrolname`, and control type
rather than by ordinal position, which is what made the old mappings break (see
`supabase/mappings-backup/RETIRED.md`). It needs exactly this data to work, and
these notes are how it gets collected without automated access.

## A caution

A debrief is one person's account of one session. Treat a claim as provisional
until a second filing agrees with it, and note in the file when something is
based on a single observation. Confidently wrong notes are worse than none —
they would be baked into automation and become invisible.
