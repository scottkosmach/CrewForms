/**
 * mergeSeedBoat: the one rule that keeps seeding safe is "a captain's answer
 * always beats a seed". These tests pin the edge cases where that rule is
 * easiest to break: false as a real answer, and empty seed values.
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

const merge = new Function('stored', 'seed', `${slice}; return mergeSeedBoat(stored, seed);`);

const SEED = {
  vesselName: 'Anne Bonny',
  callSign: 'WDM4875',
  mmsi: '338200891',
  lessThan300GT: true,
  fuelTypes: [],
  cofrOperator: '',
};

test('unanswered fields fill from the seed', () => {
  const patch = merge({ vesselName: 'Anne Bonny', callSign: '' }, SEED);
  assert.equal(patch.callSign, 'WDM4875');
  assert.equal(patch.mmsi, '338200891');
  assert.equal(patch.lessThan300GT, true);
});

const STORED_NAME = { vesselName: 'Anne Bonny' };

test('a captain edit is never overwritten', () => {
  const patch = merge({ ...STORED_NAME, callSign: 'CUSTOM1', mmsi: '111111111', lessThan300GT: true }, SEED);
  assert.equal(patch, null);
});

test('false is an answer, not an empty slot', () => {
  // "Not under 300 GT" must survive a seed that says true.
  const patch = merge({ ...STORED_NAME, callSign: 'X', mmsi: 'Y', lessThan300GT: false }, SEED);
  assert.equal(patch, null);
});

test('empty seed values generate no patch', () => {
  // cofrOperator '' and fuelTypes [] in the seed must not stomp anything or
  // count as fillable content.
  const patch = merge({ ...STORED_NAME, callSign: 'X', mmsi: 'Y', lessThan300GT: true, cofrOperator: undefined }, SEED);
  assert.equal(patch, null);
});

test('the id never transfers from a seed', () => {
  const patch = merge({ callSign: '' }, { id: 'seed-id', callSign: 'WDM4875' });
  assert.equal(patch.id, undefined);
  assert.equal(patch.callSign, 'WDM4875');
});
