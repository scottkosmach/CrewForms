#!/usr/bin/env node
/**
 * Drive the BVI Preclearance wizard from scripts/agent/roster.json.
 *
 *   node scripts/agent/bvi-fill.mjs            fill step 1, stop, leave browser open
 *   node scripts/agent/bvi-fill.mjs --discover dump every dropdown's real options
 *
 * IT NEVER SUBMITS. There is deliberately no code path that clicks Submit —
 * the captain reviews the filled form and submits by hand. This is a sworn
 * immigration declaration.
 *
 * Cloudflare blocks headless automation here, so this runs real Chrome, headed,
 * with a persistent profile: the captain's own browser, with them watching.
 *
 * Formats that bite (verified against the compiled bundle):
 *   dates  DD/MM/YYYY  — day first. 6 Aug is 06/08, not 08/06.
 *   time   24-hour, separate hour and minute pickers, minutes in 15s.
 *   names  UPPERCASE only: ^[-,A-Z'.s ]*$   lowercase fails validation.
 *   docs   UPPERCASE alphanumeric only: ^[0-9A-Z]*$
 */

import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, 'out');
mkdirSync(OUT, { recursive: true });

const URL = 'https://eta.bviportals.com/ng-vg-bms-online/transport-manifest';
const DISCOVER = process.argv.includes('--discover');

const roster = JSON.parse(readFileSync(resolve(HERE, 'roster.json'), 'utf8'));
if (!roster.voyage || !roster.vessel) {
  console.error('roster.json has no voyage — fill scripts/agent/trip.json and re-run roster.mjs');
  process.exit(1);
}

const problems = [];
const note = (m) => {
  problems.push(m);
  console.log(`  ⚠ ${m}`);
};

/** ISO (YYYY-MM-DD) -> the DD/MM/YYYY this form parses. */
function toBviDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? '').trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${d}/${mo}/${y}`;
}

/** The name pattern rejects lowercase outright. */
const upper = (s) => String(s ?? '').toUpperCase().trim();

// ------------------------------------------------------------------ browser

const ctx = await chromium.launchPersistentContext(resolve(OUT, 'profile'), {
  channel: 'chrome',
  headless: false,
  viewport: { width: 1440, height: 1000 },
  args: ['--disable-blink-features=AutomationControlled'],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());

console.log(`Opening ${URL}`);
await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(6000);

if (/Attention Required|blocked/i.test(await page.title())) {
  console.error('Cloudflare blocked this session. Close other Chrome windows and retry.');
  await ctx.close();
  process.exit(1);
}

// ------------------------------------------------------------------ helpers

/**
 * Locate a control by the visible label of its mat-form-field, or directly by
 * formControlName when the label is ambiguous — "Time" labels both the hour and
 * the minute picker, so label alone always resolves to the first of the pair.
 */
function fieldByLabel(label, fcn) {
  if (fcn) return page.locator(`[formcontrolname="${fcn}"]`).first();
  return page
    .locator('mat-form-field, .mat-mdc-form-field')
    .filter({ hasText: label })
    .locator('input, textarea')
    .first();
}

/**
 * Read the options of THIS field's panel.
 *
 * Material keeps closed panels in the overlay container, and the hour and
 * minute pickers sit side by side, so a global `mat-option` query happily
 * returns the neighbour's list — which is how asking for hour 14 came back
 * offering 00/15/30/45. Scope to the panel the input declares it owns.
 */
async function panelOptions(field) {
  let scope = page.locator('.cdk-overlay-pane:visible mat-option, .cdk-overlay-pane:visible [role="option"]');

  if (field) {
    const owns =
      (await field.getAttribute('aria-controls')) ?? (await field.getAttribute('aria-owns'));
    // `owns` may list several ids; the first is the panel. Attribute selector
    // avoids escaping problems with Material's generated ids. When the input
    // declares nothing, fall back to the visible overlay pane.
    const panelId = owns ? owns.split(/\s+/)[0] : null;
    if (panelId) {
      scope = page.locator(`[id="${panelId}"]`).locator('mat-option, [role="option"]');
    }
  }

  try {
    await scope.first().waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    return [];
  }
  return (await scope.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
}

async function closePanel() {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
}

/**
 * Fill a Material typeahead by *selecting a real option*.
 *
 * Setting .value leaves the Angular control null and the form silently fails
 * validation on submit, so this always clicks an option and then verifies the
 * input reflects it. If nothing matches it refuses rather than guessing — a
 * wrong port or nationality on an immigration manifest is worse than a blank.
 */
async function pickAutocomplete(label, desired, { query, fcn } = {}) {
  const field = fieldByLabel(label, fcn);
  if (!(await field.count())) {
    note(`field not found: ${label}`);
    return null;
  }

  const want = String(desired ?? '').trim().toLowerCase();
  const norm = (s) => s.trim().toLowerCase();
  // Ports render as "VICHA - CHARLOTTE AMALIE HARBOR, ST. THOMAS", so also
  // compare against the part after the UN/LOCODE prefix.
  const afterCode = (s) => (s.includes(' - ') ? s.split(' - ').slice(1).join(' - ') : s);
  const bestOf = (options) =>
    options.find((o) => norm(o) === want) ??
    options.find((o) => norm(afterCode(o)) === want) ??
    options.find((o) => norm(o).startsWith(want)) ??
    options.find((o) => norm(afterCode(o)).startsWith(want)) ??
    (want ? options.find((o) => norm(o).includes(want)) : null);

  // The panel renders only a ~10-row window, so the query has to be selective
  // enough to bring the target into view: "UNIT" buries UNITED STATES beneath
  // UNITED ARAB EMIRATES and six UNITED KINGDOM variants. Try most specific
  // first, then loosen — a port option starting with its code will not match
  // its own full name.
  const attempts = query
    ? [query]
    : [...new Set([String(desired ?? ''), String(desired ?? '').split(/[ ,]/)[0], String(desired ?? '').slice(0, 4)])].filter(Boolean);

  let options = [];
  let match = null;
  let typed = '';

  for (const attempt of attempts) {
    typed = attempt;
    await closePanel(); // never inherit the previous field's open panel
    await field.click();
    await field.fill('');
    await field.type(attempt, { delay: 55 });
    await page.waitForTimeout(750);
    options = await panelOptions(field);
    match = options.length ? bestOf(options) : null;
    if (match) break;
    await closePanel();
  }

  if (!match) {
    note(
      options.length
        ? `${label}: no option matches "${desired}". Offered: ${options.slice(0, 12).join(' | ')}`
        : `${label}: no options appeared (tried ${attempts.join(', ')})`,
    );
    await closePanel();
    return null;
  }

  await page
    .locator('.cdk-overlay-pane:visible')
    .locator('mat-option, [role="option"]')
    .filter({ hasText: match })
    .first()
    .click();
  await page.waitForTimeout(300);

  const got = await field.inputValue();
  if (!got) note(`${label}: selected "${match}" but the field read back empty`);
  console.log(`  ${label.padEnd(38)} ${got || match}`);
  return match;
}

async function typeText(label, value, { transform } = {}) {
  const v = transform ? transform(value) : String(value ?? '');
  if (!v) {
    note(`${label}: nothing to enter`);
    return;
  }
  const field = fieldByLabel(label);
  if (!(await field.count())) {
    note(`field not found: ${label}`);
    return;
  }
  await field.click();
  await field.fill('');
  await field.type(v, { delay: 30 });
  await page.waitForTimeout(150);
  const got = await field.inputValue();
  if (got !== v) note(`${label}: typed "${v}" but field holds "${got}"`);
  console.log(`  ${label.padEnd(38)} ${got}`);
}

async function clickToggle(text) {
  const b = page.locator('button', { hasText: new RegExp(`^\\s*${text}\\s*$`, 'i') }).first();
  if (!(await b.count())) {
    note(`toggle not found: ${text}`);
    return;
  }
  await b.click();
  await page.waitForTimeout(400);
  console.log(`  toggle                                 ${text}`);
}

// ----------------------------------------------------------------- discover

if (DISCOVER) {
  console.log('\n=== discovering dropdown options (nothing is committed) ===\n');
  await clickToggle('ARRIVAL');
  await clickToggle('SEA VESSEL');

  const found = {};
  for (const label of [
    'Port of entry',
    'Initial port of embarkation',
    'Transport type',
    "Transport's country of registration",
  ]) {
    const field = fieldByLabel(label);
    if (!(await field.count())) continue;
    await field.click();
    await page.waitForTimeout(800);
    let opts = await panelOptions(field);
    // Country lists are long and only render a window; probe a few prefixes.
    if (label.includes('country')) {
      const probe = {};
      for (const p of ['United', 'Virgin', 'Canada', 'Germany']) {
        await field.fill('');
        await field.type(p, { delay: 50 });
        await page.waitForTimeout(700);
        probe[p] = await panelOptions(field);
      }
      found[label] = probe;
    } else {
      found[label] = opts;
    }
    await closePanel();
    console.log(`${label}:`);
    const show = Array.isArray(found[label])
      ? found[label]
      : Object.entries(found[label]).flatMap(([k, v]) => v.map((o) => `${k} -> ${o}`));
    show.slice(0, 40).forEach((o) => console.log(`   ${o}`));
    if (show.length > 40) console.log(`   … ${show.length - 40} more`);
    console.log();
  }

  writeFileSync(resolve(OUT, 'bvi-options.json'), JSON.stringify(found, null, 2));
  console.log(`Wrote ${resolve(OUT, 'bvi-options.json')}`);
  console.log('\nBrowser left open. Close it when done.');
  process.exit(0);
}

// --------------------------------------------------------------- fill step 1

// roster.mjs spreads the voyage block to the top level, so direction, vessel
// and voyage are siblings here.
const v = { direction: roster.direction ?? 'arrival' };
const vessel = roster.vessel;
const voyage = roster.voyage;

console.log('\n=== Step 1 — Transport ===');

await clickToggle(v.direction === 'departure' ? 'DEPARTURE' : 'ARRIVAL');
await clickToggle(vessel.type === 'AIRCRAFT' ? 'AIRCRAFT' : 'SEA VESSEL');

const dateLabel =
  v.direction === 'departure' ? 'Intended date of departure' : 'Intended date of arrival';
const bviDate = toBviDate(voyage.intendedDate);
if (!bviDate) note(`intendedDate "${voyage.intendedDate}" is not YYYY-MM-DD`);
else await typeText(dateLabel, bviDate);

const [hh, mm] = String(voyage.intendedTime ?? '').split(':');
if (hh && mm) {
  await pickAutocomplete('Time (hour)', hh, { query: hh, fcn: 'hour' });
  await pickAutocomplete('Time (minutes)', mm, { query: mm, fcn: 'minutes' });
} else {
  note(`intendedTime "${voyage.intendedTime}" is not HH:mm`);
}

await pickAutocomplete(
  v.direction === 'departure' ? 'Port where embarking' : 'Port of entry',
  voyage.portOfEntry,
);
await pickAutocomplete(
  v.direction === 'departure' ? 'Final destination' : 'Initial port of embarkation',
  voyage.initialPortOfEmbarkation ?? voyage.portOfEmbarkation,
);
await pickAutocomplete('Transport type', vessel.transportType ?? 'Yacht');
await pickAutocomplete(
  "Transport's country of registration",
  vessel.countryOfRegistration?.bvi ?? vessel.countryOfRegistration?.raw,
);

await typeText('Registration number', vessel.registrationNumber, { transform: upper });
await typeText('Name of the vessel', vessel.name, { transform: upper });
// The form upper-cases this field itself; email is case-insensitive so accept
// whatever it renders rather than fighting it.
await typeText('Email', voyage.contactEmail, { transform: upper });
await typeText('Phone', voyage.contactPhone);

await page.screenshot({ path: resolve(OUT, 'bvi-filled-step1.png'), fullPage: true });

console.log('\n=== people queued for the Travelers step ===');
for (const p of roster.people) {
  console.log(
    `  ${upper(p.lastName)}, ${upper(p.firstName)}  ` +
      `${p.nationality.bvi ?? p.nationality.raw}  ${upper(p.documentNumber)}  ` +
      `DOB ${toBviDate(p.dateOfBirth?.iso) ?? '??'}  exp ${toBviDate(p.dateOfExpiry?.iso) ?? '??'}`,
  );
}

console.log(`\nScreenshot: ${resolve(OUT, 'bvi-filled-step1.png')}`);
if (problems.length) {
  console.log(`\n⚠ ${problems.length} item(s) need a human before continuing:`);
  [...new Set(problems)].forEach((p) => console.log(`   - ${p}`));
}
console.log(
  '\nSTOPPED before "Save and Continue". Review every field on screen, then drive the\n' +
    'rest yourself. Nothing has been submitted and this script cannot submit.',
);
console.log('Browser left open deliberately.');
