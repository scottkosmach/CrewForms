#!/usr/bin/env node
/**
 * Extract the reference tables from the official NVMC NOAD Workbook.
 *
 * Why this exists: the workbook's *_CODE columns (NATIONALITY_CODE,
 * EMBARK_PORT_CODE, ...) are live VLOOKUP formulas whose cached values are
 * empty in the blank template. A generator that only writes display values
 * ships empty code columns, because nothing recalculates the formulas outside
 * Excel. So we resolve the codes ourselves and write them as literals — which
 * requires the same lookup tables the formulas use.
 *
 * Re-run this whenever NVMC publishes a new workbook version.
 *
 *   node scripts/extract-nvmc-lookups.mjs [path-to-workbook.xlsx]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const DEFAULT_WORKBOOK = resolve(
  REPO,
  'assets/templates/nvmc-noad-workbook-8.2.xlsx',
);
const OUT_DIR = resolve(REPO, 'shared/reference/nvmc');

/**
 * Single-column named ranges published as dropdown vocabularies. The Vessel
 * Details and Voyage Information sheets validate against these by name, and
 * the live eNOAD site's dropdowns carry the same values (verified against the
 * 2026-08-06 captures in docs/recon/) — so they double as the wizard's option
 * lists.
 */
const LISTS = {
  // Voyage Information B5.
  noticeTypes: 'Notice_Types',
  // Vessel Details G9 (Lookups!B holds the same 78 rows under "Agency").
  classSociety: 'Class_Society',
  // Vessel Details B13; D13/F13 cascade from it via INDIRECT.
  vesselClass: 'Vessel_Class',
  // Voyage Information B32 NPOC country / G5 flag — plain uppercase names.
  countries: 'Countries',
  // Voyage Information B15/D27 state dropdowns — title-case names.
  usStates: 'UNITEDSTATESStates',
};

/**
 * Voyage Information D5 validates via INDIRECT(B5): the notice type IS the
 * name of the range holding its voyage types.
 */
const VOYAGE_TYPE_RANGES = ['Arrival', 'Departure'];

/** The ranges the Non-Crew/Crew sheet formulas actually reference. */
const TABLES = {
  // VLOOKUP(H8, Lookups!$AJ$1:$AK$242, 2) — nationality, country of residence,
  // ID country, secondary ID country all share this table.
  personCountry: { first: 'AJ', second: 'AK', lastRow: 242 },
  // VLOOKUP(W8, Lookups!$C$1:$D$248, 2) — embark/debark country. NOTE: this is
  // a *different* table from personCountry; do not assume they agree.
  travelCountry: { first: 'C', second: 'D', lastRow: 248 },
  // VLOOKUP(T8, Lookups!$AB$1:$AC$73, 2) — US state -> USPS abbreviation.
  usState: { first: 'AB', second: 'AC', lastRow: 73 },
  // VLOOKUP(Z8 & X8, Lookups!$H$1:$I$12332, 2) — key is portName + countryCode.
  port: { first: 'H', second: 'I', lastRow: 12332 },
};

// ---------------------------------------------------------------- zip reader

/** Minimal reader for the stored/deflated entries in an .xlsx container. */
function readZipEntries(buf) {
  const EOCD_SIG = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip file: no end-of-central-directory');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map();

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    // Local header declares its own name/extra lengths; the central directory's
    // extra length is not reusable here.
    const lhNameLen = buf.readUInt16LE(localOff + 26);
    const lhExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lhNameLen + lhExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);

    entries.set(name, method === 0 ? raw : inflateRawSync(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

// -------------------------------------------------------------- xlsx parsing

function parseSharedStrings(xml) {
  const out = [];
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g;
  let m;
  while ((m = siRe.exec(xml))) {
    let text = '';
    let t;
    tRe.lastIndex = 0;
    while ((t = tRe.exec(m[1]))) text += t[1];
    out.push(unescapeXml(text));
  }
  return out;
}

function unescapeXml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&');
}

/**
 * Build { "COL": { rowNumber: value } } for the requested columns only, so we
 * never hold the whole 2.5 MB sheet as objects.
 */
function readColumns(sheetXml, strings, columns) {
  const want = new Set(columns);
  const grid = Object.fromEntries(columns.map((c) => [c, new Map()]));
  const cellRe = /<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m;
  while ((m = cellRe.exec(sheetXml))) {
    const [, col, row, attrs, inner] = m;
    if (!want.has(col)) continue;
    if (!inner) continue;
    const vm = /<v>([\s\S]*?)<\/v>/.exec(inner);
    let value;
    if (/t="s"/.test(attrs)) {
      if (!vm) continue;
      value = strings[Number(vm[1])];
    } else if (/t="inlineStr"/.test(attrs)) {
      const im = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner);
      value = im ? unescapeXml(im[1]) : undefined;
    } else {
      value = vm ? unescapeXml(vm[1]) : undefined;
    }
    if (value === undefined || value === '') continue;
    grid[col].set(Number(row), value);
  }
  return grid;
}

/** Map of defined name -> reference string (e.g. "Lookups!$K$1:$K$3"). */
function parseDefinedNames(workbookXml) {
  const out = new Map();
  const block = /<definedNames>([\s\S]*?)<\/definedNames>/.exec(workbookXml);
  if (!block) return out;
  const re = /<definedName name="([^"]+)"[^>]*>([\s\S]*?)<\/definedName>/g;
  let m;
  while ((m = re.exec(block[1]))) out.set(m[1], unescapeXml(m[2]));
  return out;
}

/**
 * Parse "Lookups!$G$27" / "Lookups!$K$1:$K$3" into { col, start, end }.
 * Returns null for anything else (formulas, other sheets, multi-column).
 */
function parseLookupsRange(ref) {
  const m = /^Lookups!\$([A-Z]+)\$(\d+)(?::\$([A-Z]+)\$(\d+))?$/.exec(ref);
  if (!m) return null;
  const [, col, start, col2, end] = m;
  if (col2 && col2 !== col) return null;
  return { col, start: Number(start), end: Number(end ?? start) };
}

/** Values of a single-column Lookups range, empties skipped. */
function rangeValues(grid, range) {
  const colMap = grid[range.col];
  if (!colMap) throw new Error(`column ${range.col} was not read from Lookups`);
  const out = [];
  for (let row = range.start; row <= range.end; row++) {
    const v = colMap.get(row);
    if (v !== undefined && v !== '') out.push(v);
  }
  return out;
}

function buildPairs(grid, spec) {
  const pairs = [];
  const seen = new Set();
  let collisions = 0;
  for (let row = 1; row <= spec.lastRow; row++) {
    const key = grid[spec.first].get(row);
    const val = grid[spec.second].get(row);
    if (key === undefined) continue;
    if (seen.has(key)) {
      collisions++;
      continue;
    }
    seen.add(key);
    pairs.push([key, val ?? '']);
  }
  return { pairs, collisions };
}

// ---------------------------------------------------------------------- main

const workbookPath = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_WORKBOOK;
console.log(`Reading ${workbookPath}`);

const entries = readZipEntries(readFileSync(workbookPath));

const workbookXml = entries.get('xl/workbook.xml').toString('utf8');
const relsXml = entries.get('xl/_rels/workbook.xml.rels').toString('utf8');

// Resolve the "Lookups" sheet by name rather than assuming sheet12.xml.
const sheetTag = [...workbookXml.matchAll(/<sheet[^>]*\/>/g)]
  .map((m) => m[0])
  .find((t) => /name="Lookups"/.test(t));
if (!sheetTag) throw new Error('no sheet named "Lookups" in this workbook');
const rid = /r:id="([^"]+)"/.exec(sheetTag)[1];
const target = new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(relsXml)[1];
const lookupsPath = `xl/${target.replace(/^\/?xl\//, '')}`;
console.log(`Lookups sheet -> ${lookupsPath}`);

const strings = parseSharedStrings(entries.get('xl/sharedStrings.xml').toString('utf8'));
console.log(`sharedStrings: ${strings.length}`);

const definedNames = parseDefinedNames(workbookXml);

// Every named range that resolves to a single Lookups column gets read; the
// port place lists alone span most of column G.
const namedRanges = new Map();
for (const [name, ref] of definedNames) {
  const range = parseLookupsRange(ref);
  if (range) namedRanges.set(name, range);
}

const lookupsXml = entries.get(lookupsPath).toString('utf8');
const allCols = [
  ...new Set([
    ...Object.values(TABLES).flatMap((t) => [t.first, t.second]),
    ...[...namedRanges.values()].map((r) => r.col),
  ]),
];
const grid = readColumns(lookupsXml, strings, allCols);

mkdirSync(OUT_DIR, { recursive: true });

const manifest = {
  source: workbookPath.split(/[\\/]/).pop(),
  extractedAt: new Date().toISOString().slice(0, 10),
  tables: {},
};

for (const [name, spec] of Object.entries(TABLES)) {
  const { pairs, collisions } = buildPairs(grid, spec);
  const file = `${name}.json`;
  writeFileSync(
    resolve(OUT_DIR, file),
    JSON.stringify(Object.fromEntries(pairs), null, name === 'port' ? 0 : 2),
  );
  manifest.tables[name] = {
    file,
    range: `${spec.first}1:${spec.second}${spec.lastRow}`,
    entries: pairs.length,
    duplicateKeysSkipped: collisions,
  };
  console.log(
    `  ${name.padEnd(14)} ${String(pairs.length).padStart(6)} entries` +
      (collisions ? `  (${collisions} duplicate keys skipped)` : ''),
  );
  const sample = pairs.slice(0, 3).map(([k, v]) => `${k}=${v}`).join(', ');
  console.log(`  ${''.padEnd(14)} e.g. ${sample}`);
}

manifest.lists = {};

function writeList(fileBase, data, sourceNote) {
  const file = `${fileBase}.json`;
  writeFileSync(resolve(OUT_DIR, file), JSON.stringify(data, null, 2));
  const entryCount = Array.isArray(data)
    ? data.length
    : Object.values(data).reduce((n, v) => n + (Array.isArray(v) ? v.length : 1), 0);
  manifest.lists[fileBase] = { file, source: sourceNote, entries: entryCount };
  console.log(`  ${fileBase.padEnd(14)} ${String(entryCount).padStart(6)} entries  (${sourceNote})`);
}

console.log('\nNamed-range lists:');
for (const [fileBase, name] of Object.entries(LISTS)) {
  const range = namedRanges.get(name);
  if (!range) throw new Error(`defined name "${name}" missing from this workbook`);
  writeList(fileBase, rangeValues(grid, range), name);
}

const voyageTypes = {};
for (const noticeType of VOYAGE_TYPE_RANGES) {
  const range = namedRanges.get(noticeType);
  if (!range) throw new Error(`voyage-type range "${noticeType}" missing from this workbook`);
  voyageTypes[noticeType] = rangeValues(grid, range);
}
writeList('voyageTypes', voyageTypes, 'INDIRECT ranges named after each notice type');

// The Voyage sheet's port dropdowns cascade through INDIRECT(country+state,
// spaces and punctuation stripped) — each such name is a column-G slice.
const RESERVED_G = new Set(['All_Ports']);
const portsByPlace = {};
for (const [name, range] of namedRanges) {
  if (range.col !== 'G' || RESERVED_G.has(name)) continue;
  portsByPlace[name] = rangeValues(grid, range);
}
writeList('portsByPlace', portsByPlace, `${Object.keys(portsByPlace).length} INDIRECT place keys over Lookups!G`);

writeFileSync(resolve(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\nWrote ${Object.keys(TABLES).length + Object.keys(manifest.lists).length + 1} files to shared/reference/nvmc/`);
