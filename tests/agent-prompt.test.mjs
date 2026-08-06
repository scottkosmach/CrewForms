/**
 * Regression tests for the Copy-for-Claude prompt.
 *
 * Every case here comes from the first real run (2026-08-05, seven passengers,
 * all three sites) where the prompt told the assistant something untrue. These
 * are not hypotheticals — each one was observed.
 *
 * The helpers live in the extension's plain-JS side panel, which has no module
 * system, so they are extracted from source and evaluated.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('extension/sidepanel/app.js', 'utf8');
const slice = src.slice(
  src.indexOf('/** Dates arrive from OCR'),
  src.indexOf('function currentAgentSite'),
);

function build(site, travelers, { boats = [], trips = [], survey = false } = {}) {
  const sandbox = {
    state: { travelers, boats, trips },
    getCurrentBoatId: () => (boats[0] ? boats[0].id : null),
    getCurrentTripId: () => (trips[0] ? trips[0].id : null),
  };
  const fn = new Function(
    'state',
    'getCurrentBoatId',
    'getCurrentTripId',
    'site',
    'opts',
    `${slice}; return buildAgentText(site, opts);`,
  );
  return fn(sandbox.state, sandbox.getCurrentBoatId, sandbox.getCurrentTripId, site, { survey });
}

/** 6 February 1990 — both parts <= 12, so a transposition is invisible. */
const AMBIGUOUS = {
  firstName: 'Ann',
  lastName: 'Reyes',
  passportNumber: 'a00733970',
  nationality: 'UNITED STATES OF AMERICA',
  gender: 'F',
  placeOfBirth: 'NEW YORK, U.S.A.',
  dateOfBirth: { day: '6', month: '2', year: '1990' },
  dateOfIssue: { day: '2', month: '6', year: '2021' },
  dateOfExpiry: { day: '11', month: '11', year: '2031' },
  issuingAuthority: 'UNITED STATES DEPARTMENT OF STATE',
};

const dob = (t) => (t.match(/Date of birth: (.*)/) || [])[1].trim();

test('SailClear web form gets day-first dates, not the spreadsheet format', () => {
  // The prompt used to emit MM-DD-YYYY because that is what their bulk
  // spreadsheet uses. The live web form is day-first, so 6 Feb was being
  // handed over as "02-06-1990" and read as 2 June.
  assert.match(dob(build('sailclear', [AMBIGUOUS])), /^06\/02\/1990/);
});

test('each site gets its own date format', () => {
  assert.match(dob(build('bvi', [AMBIGUOUS])), /^06\/02\/1990/);
  assert.match(dob(build('enoad', [AMBIGUOUS])), /^1990-02-06/);
});

test('every date carries a spelled-out month that cannot be transposed', () => {
  for (const site of ['bvi', 'enoad', 'sailclear']) {
    const t = build(site, [AMBIGUOUS]);
    assert.ok(t.includes('(6 February 1990)'), `${site} date of birth`);
    assert.ok(t.includes('(11 November 2031)'), `${site} expiry`);
  }
});

test('BVI nationality is a demonym, not a country', () => {
  // The dropdown offers AMERICAN. Nothing in "UNITED STATES OF AMERICA"
  // fuzzy-matches that, so it has to be mapped explicitly.
  const t = build('bvi', [AMBIGUOUS]);
  assert.match(t, /Nationality: AMERICAN/);
  assert.match(t, /DEMONYM list/);
});

test('the other two sites still want the country, not the demonym', () => {
  assert.match(build('enoad', [AMBIGUOUS]), /Nationality: UNITED STATES/);
  assert.match(build('sailclear', [AMBIGUOUS]), /Nationality: United States/);
});

test('issuing authority is reduced to a country', () => {
  // Passports print the authority; no form offers it as an option.
  for (const site of ['bvi', 'enoad']) {
    assert.match(build(site, [AMBIGUOUS]), /Country of issue: UNITED STATES$/m);
  }
  assert.match(build('sailclear', [AMBIGUOUS]), /Country of issue: United States$/m);
});

test('an unmapped nationality asks rather than inventing a demonym', () => {
  const odd = { ...AMBIGUOUS, nationality: 'REPUBLIC OF NOWHERE' };
  assert.match(build('bvi', [odd]), /pick the demonym/);
});

test('eNOAD omits fields that form has no home for', () => {
  const t = build('enoad', [AMBIGUOUS]);
  assert.ok(!t.includes('Passport issued'), 'no issue-date field exists');
  assert.ok(!t.includes('Place of birth'), 'no place-of-birth field exists');
});

test('passport numbers keep letter prefixes and are uppercased', () => {
  assert.match(build('bvi', [AMBIGUOUS]), /Passport number: A00733970/);
});

test('every prompt forbids submitting', () => {
  for (const site of ['bvi', 'enoad', 'sailclear']) {
    assert.match(build(site, [AMBIGUOUS]), /DO NOT SUBMIT/);
  }
});

test('survey mode swaps the friction debrief for the full inventory', () => {
  for (const site of ['bvi', 'enoad', 'sailclear']) {
    const t = build(site, [AMBIGUOUS], { survey: true });
    assert.match(t, /SURVEY — WHEN YOU HAVE FINISHED FILLING/, `${site} survey header`);
    assert.match(t, /EVERY form field in the order encountered/, `${site} field inventory ask`);
    assert.match(t, /what I gave you → what the site/, `${site} translation-pairs ask`);
    // The standard debrief must be replaced, not appended — two overlapping
    // asks would get the assistant to answer neither properly.
    assert.ok(!t.includes('Keep it to what actually gave trouble'), `${site} standard debrief gone`);
    // Fill-side guardrails survive the swap.
    assert.match(t, /DO NOT SUBMIT/, `${site} still forbids submitting`);
  }
});

test('survey mode is off by default', () => {
  for (const site of ['bvi', 'enoad', 'sailclear']) {
    const t = build(site, [AMBIGUOUS]);
    assert.ok(!t.includes('SURVEY —'), `${site} default is the short debrief`);
    assert.match(t, /Keep it to what actually gave trouble/);
  }
});
