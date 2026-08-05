/**
 * Regression tests for the two defects that would have silently corrupted
 * every date in a filing submitted to CBP and the Coast Guard:
 *
 *   1. OCR returns dates as { day, month, year }; String()-ing that wrote the
 *      literal text "[object Object]" into the cell.
 *   2. formatDate parsed "YYYY-MM-DD" via `new Date()`, which reads back in
 *      local time and shifts the day backwards everywhere west of Greenwich.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getValue, formatDate, applyValueMap, colLetterToNumber } from '../src/lib/excel/values.ts';

test('OCR date object collapses to ISO instead of "[object Object]"', () => {
  const ctx = { traveler: { dateOfBirth: { day: '12', month: '03', year: '1985' } } };
  assert.equal(getValue(ctx, 'traveler.dateOfBirth'), '1985-03-12');
});

test('single-digit day and month are zero padded', () => {
  const ctx = { traveler: { dateOfExpiry: { day: '5', month: '9', year: '2031' } } };
  assert.equal(getValue(ctx, 'traveler.dateOfExpiry'), '2031-09-05');
});

test('a partial date yields nothing rather than a plausible wrong date', () => {
  const ctx = { traveler: { dateOfBirth: { day: '', month: '03', year: '1985' } } };
  assert.equal(getValue(ctx, 'traveler.dateOfBirth'), undefined);
});

test('a non-date object yields nothing rather than "[object Object]"', () => {
  const ctx = { traveler: { weird: { a: 1 } } };
  assert.equal(getValue(ctx, 'traveler.weird'), undefined);
});

test('plain scalar fields are unaffected', () => {
  assert.equal(getValue({ traveler: { lastName: 'SMITH' } }, 'traveler.lastName'), 'SMITH');
  assert.equal(getValue({ traveler: {} }, 'traveler.missing'), undefined);
  assert.equal(getValue({}, 'a.b.c'), undefined);
});

test('ISO dates never shift a day regardless of local timezone', () => {
  assert.equal(formatDate('1985-03-12', 'YYYY-MM-DD'), '1985-03-12');
  assert.equal(formatDate('1985-01-01', 'MM/DD/YYYY'), '01/01/1985');
  assert.equal(formatDate('2026-12-31', 'DD-MM-YYYY'), '31-12-2026');
  // Midnight-boundary dates are where the old Date() path failed hardest.
  assert.equal(formatDate('2000-01-01', 'YYYY-MM-DD'), '2000-01-01');
});

test('NVMC default output is ISO', () => {
  assert.equal(formatDate('1985-03-12'), '1985-03-12');
});

test('unparseable input is left visibly wrong, not silently reshaped', () => {
  assert.equal(formatDate('not a date', 'YYYY-MM-DD'), 'not a date');
  assert.equal(formatDate(undefined), '');
});

test('end to end: OCR object through to the NVMC cell string', () => {
  const ctx = { traveler: { dateOfExpiry: { day: '05', month: '09', year: '2031' } } };
  assert.equal(formatDate(getValue(ctx, 'traveler.dateOfExpiry'), 'YYYY-MM-DD'), '2031-09-05');
});

test('valueMap resolves the *_CODE columns and passes through misses', () => {
  const codes = { 'United States': 'US', 'British Virgin Islands': 'VG' };
  assert.equal(applyValueMap('United States', codes), 'US');
  assert.equal(applyValueMap('Atlantis', codes), 'Atlantis');
  assert.equal(applyValueMap(undefined, codes), '');
});

test('column letters map to indices past Z', () => {
  assert.equal(colLetterToNumber('A'), 1);
  assert.equal(colLetterToNumber('Z'), 26);
  assert.equal(colLetterToNumber('AA'), 27);
  // The Non-Crew List runs out to AR.
  assert.equal(colLetterToNumber('AR'), 44);
});
