#!/usr/bin/env node
/**
 * Extract the dropdown vocabularies from SailClear's Individual_Format.xlsx.
 *
 * SailClear validates the upload against these exact strings, and its spelling
 * differs from NVMC's for the same country — "British Virgin Islands" here vs
 * "VIRGIN ISLANDS, BRITISH" there. Both value maps are generated from the
 * respective source of truth rather than typed by hand.
 *
 *   node scripts/extract-sailclear-reference.mjs [path-to-template.xlsx]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openWorkbook } from './lib/xlsx-read.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const DEFAULT_TEMPLATE = resolve(
  REPO,
  'assets/templates/sailclear-individual-format.xlsx',
);
const OUT_DIR = resolve(REPO, 'shared/reference/sailclear');

const templatePath = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_TEMPLATE;
console.log(`Reading ${templatePath}`);

const wb = openWorkbook(templatePath);
console.log(`Sheets: ${wb.sheetNames.map((s) => s.name).join(', ')}`);

// Each vocabulary sheet is a single column A of allowed values.
const VOCAB_SHEETS = {
  countries: 'Countries',
  documentType: 'Document Type',
  maritalStatus: 'Marital Status',
  rank: 'Rank',
  gender: 'Gender',
};

const out = {};
for (const [key, sheet] of Object.entries(VOCAB_SHEETS)) {
  const col = wb.readColumn(sheet, 'A');
  const values = [...col.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v)
    .filter(Boolean);
  out[key] = values;
  console.log(`  ${key.padEnd(14)} ${String(values.length).padStart(4)}  e.g. ${values.slice(0, 3).join(', ')}`);
}

// The header row of the Individuals sheet is the column contract we generate
// against; capture it so a template change shows up as a diff.
const headerRow = new Map();
for (const col of 'ABCDEFGHIJKLMNOP') {
  const v = wb.readColumn('Individuals', col).get(1);
  if (v) headerRow.set(col, v);
}
out.individualsHeader = Object.fromEntries(headerRow);
console.log(`  individualsHeader  ${headerRow.size} columns`);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, 'vocabularies.json'), JSON.stringify(out, null, 2));
writeFileSync(
  resolve(OUT_DIR, 'manifest.json'),
  JSON.stringify(
    {
      source: templatePath.split(/[\\/]/).pop(),
      extractedAt: new Date().toISOString().slice(0, 10),
      counts: Object.fromEntries(
        Object.entries(out).map(([k, v]) => [k, Array.isArray(v) ? v.length : Object.keys(v).length]),
      ),
    },
    null,
    2,
  ),
);
console.log(`\nWrote shared/reference/sailclear/vocabularies.json`);
