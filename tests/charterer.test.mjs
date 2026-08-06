/**
 * computeCharterer: eNOAD's Vessel Charterer = the majority guest surname;
 * a tie must surface candidates for the captain instead of guessing. The
 * observed value from the 2026-08-06 filing was "Rosato".
 *
 * The helper lives in the extension's plain-JS side panel (no module system),
 * so it is extracted from source and evaluated, same as agent-prompt.test.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('extension/sidepanel/app.js', 'utf8');
const slice = src.slice(
  src.indexOf('/** Dates arrive from OCR'),
  src.indexOf('function currentAgentSite'),
);

const compute = new Function('travelers', `${slice}; return computeCharterer(travelers);`);

const person = (lastName) => ({ firstName: 'X', lastName });

test('the majority surname wins', () => {
  const r = compute([person('Rosato'), person('Rosato'), person('Smith')]);
  assert.equal(r.value, 'Rosato');
  assert.deepEqual(r.candidates, []);
});

test('a tie yields candidates, never a guess', () => {
  const r = compute([person('Rosato'), person('Smith')]);
  assert.equal(r.value, null);
  assert.deepEqual(r.candidates.sort(), ['Rosato', 'Smith']);
});

test('tallying is case-insensitive, display keeps the first casing seen', () => {
  // OCR yields ROSATO; a hand-entered guest might be Rosato — same family.
  const r = compute([person('ROSATO'), person('Rosato'), person('Smith')]);
  assert.equal(r.value, 'ROSATO');
});

test('blank surnames are skipped, empty list resolves to nothing', () => {
  assert.deepEqual(compute([person(''), person('   ')]), { value: null, candidates: [] });
  assert.deepEqual(compute([]), { value: null, candidates: [] });
});

test('a three-way tie lists all three', () => {
  const r = compute([person('A'), person('B'), person('C')]);
  assert.equal(r.value, null);
  assert.equal(r.candidates.length, 3);
});
