/**
 * Self-verifying NOAD mapping: every single-value cell the mapping writes is
 * checked against the REAL workbook (assets/templates/nvmc-noad-workbook-8.2
 * .xlsx) — the label sits one row above its input, so a mapping that drifts
 * one row or one column stops matching its label and fails here instead of
 * producing a valid-looking wrong filing. Rerun after any NVMC workbook
 * update.
 *
 * Every mapped cell MUST have an entry in EXPECTED_LABELS: adding a mapping
 * without reviewing its label against the workbook is itself a failure.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {
  TEMPLATES,
  COUNTRY_NVMC,
  COUNTRY_CODE,
} from '../scripts/lib/noad-mappings.mjs';
import { readFileSync } from 'node:fs';

const NOAD = TEMPLATES.find((t) => t.id === 'uscg-noad-8-2');

/** sheet -> input-cell address -> label text (as printed one row above). */
const EXPECTED_LABELS = {
  'Vessel Details': {
    B5: '*Name', D5: '*Call Sign', E5: '*ID Number', F5: '*ID Type', G5: '*Flag',
    B7: '*Less Than 300GT', D7: 'MMSI Number',
    B9: '*Owner', E9: '*Operator', G9: '*Class Society',
    B11: '*Charterer', E11: 'COFR Operator',
    B13: 'Class', D13: 'Type', F13: 'Sub-Type',
    B16: '*Operational Condition of Equipment', E16: '*OCE Description',
    B19: 'Oil', C19: 'Electric', D19: 'Nuclear', E19: 'Low Flash Point Fuel (Below 60C)',
    F19: 'LNG', G19: 'Methanol', H19: 'Ammonia', I19: 'Hydrogen', J19: 'Other',
    B48: 'FLAG_CODE',
  },
  'Reporting Party': {
    B5: '*Name', E5: '*Email', B7: 'Phone', E7: 'Fax', B13: '*Location Description',
  },
  'Voyage Information': {
    B5: '*Notice Type', D5: '*Voyage Type', F5: '*Transaction Type',
    E7: '*Less than 24HR Voyage?', G7: '*Closed Loop Voyage?',
    B10: '*Name', B12: 'Email', D12: '*24 Hour Phone', F12: 'Fax',
    B15: '*State', E15: '*Port', B17: '*Arrive Date (YYYY-MM-DD)', D17: '*Arrive Time (HH:MM)', B19: '*City',
    B22: '*Country', F22: '*Port', B24: '*Place', F24: '*Depart Date (YYYY-MM-DD)',
    B27: '*City', D27: '*State', F27: '*Port', B29: '*Depart Date (YYYY-MM-DD)', E29: '*Depart Time (HH:MM)',
    B32: '*Country', F32: '*Port', B34: '*Place', D34: '*Arrive Date (YYYY-MM-DD)', F34: '*Arrive Time (HH:MM)',
    B43: 'CLOSED_LOOP_VOYAGE', C43: 'LAST_PORT_COUNTRY_CODE', D43: 'LAST_PORT_CODE',
    E43: 'NEXT_PORT_COUNTRY_CODE', F43: 'NEXT_PORT_CODE', G43: 'DEPART_DT', H43: 'DEPART_TIME',
  },
};

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile('assets/templates/nvmc-noad-workbook-8.2.xlsx');

const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

test('every single-value mapping sits under its own label in the real workbook', () => {
  for (const sheet of NOAD.sheets.filter((s) => s.dataType === 'single')) {
    const ws = wb.getWorksheet(sheet.sheetName);
    assert.ok(ws, `worksheet ${sheet.sheetName} exists`);
    const expected = EXPECTED_LABELS[sheet.sheetName];
    for (const m of sheet.columns) {
      const addr = `${m.col}${m.row}`;
      const want = expected[addr];
      assert.ok(
        want !== undefined,
        `${sheet.sheetName} ${addr} is mapped but has no reviewed label in EXPECTED_LABELS`,
      );
      const label = squash(ws.getCell(`${m.col}${m.row - 1}`).text);
      assert.ok(
        label.startsWith(want),
        `${sheet.sheetName} ${addr}: label above reads "${label}", expected to start with "${want}"`,
      );
    }
  }
});

test('no reviewed label is left unmapped (the two lists stay in sync)', () => {
  for (const sheet of NOAD.sheets.filter((s) => s.dataType === 'single')) {
    const mapped = new Set(sheet.columns.map((m) => `${m.col}${m.row}`));
    for (const addr of Object.keys(EXPECTED_LABELS[sheet.sheetName])) {
      assert.ok(mapped.has(addr), `${sheet.sheetName} ${addr} reviewed but not mapped`);
    }
  }
});

test('derived values are members of the workbook vocabularies they fill', () => {
  const ref = (f) => JSON.parse(readFileSync(`shared/reference/nvmc/${f}`, 'utf8'));
  const noticeTypes = ref('noticeTypes.json');
  const voyageTypes = ref('voyageTypes.json');

  // Notice/voyage types the two legs derive.
  assert.ok(noticeTypes.includes('Departure') && noticeTypes.includes('Arrival'));
  assert.deepEqual(voyageTypes.Departure, ['US to Foreign']);
  assert.ok(voyageTypes.Arrival.includes('Foreign to US'));

  // Anne Bonny's statics resolve to exact vocabulary members.
  assert.ok(ref('classSociety.json').includes('U.S. Coast Guard'));

  // Transaction Type constant.
  const f5 = NOAD.sheets
    .find((s) => s.sheetName === 'Voyage Information')
    .columns.find((m) => m.col === 'F' && m.row === 5);
  assert.ok(['Initial', 'Update', 'Canceled'].includes(f5.constant));

  // Country maps resolve the run's two countries to NVMC spellings + codes.
  assert.equal(COUNTRY_CODE['UNITED STATES'], 'US');
  assert.equal(COUNTRY_CODE['VIRGIN ISLANDS, BRITISH'], 'VG');
  assert.equal(COUNTRY_NVMC['UNITED STATES'] ?? 'UNITED STATES', 'UNITED STATES');
});

test('the vessel-details charterer cell draws from the trip, not the boat', () => {
  const b11 = NOAD.sheets
    .find((s) => s.sheetName === 'Vessel Details')
    .columns.find((m) => m.col === 'B' && m.row === 11);
  assert.equal(b11.source, 'trip.charterer');
});
