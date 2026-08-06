#!/usr/bin/env node
/**
 * Provision the government Excel templates: upload each blank workbook to
 * Supabase Storage and upsert its excel_templates row.
 *
 * Idempotent — safe to re-run after editing a column mapping or after NVMC
 * publishes a new workbook version.
 *
 *   node scripts/provision-excel-templates.mjs [--dry-run]
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from
 * .env.local if present).
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCountryNameMap, buildCountryCodeMap } from './lib/countries.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const DRY = process.argv.includes('--dry-run');

// ---------------------------------------------------------------- env

function loadEnv() {
  const p = resolve(REPO, '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DRY && (!SUPABASE_URL || !SERVICE_KEY)) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// ------------------------------------------------------- shared value maps

const COUNTRY_NVMC = buildCountryNameMap('nvmc');
const COUNTRY_SAILCLEAR = buildCountryNameMap('sailclear');
const COUNTRY_CODE = buildCountryCodeMap();

// EO 14168: NVMC renamed Gender to Sex and accepts only these two.
const SEX = { M: 'Male', F: 'Female', m: 'Male', f: 'Female', Male: 'Male', Female: 'Female' };

// SailClear's TravelDocumentType vocabulary is Passport | ID Card | Seaman Passport.
const DOC_TYPE_SAILCLEAR = {
  passport: 'Passport',
  Passport: 'Passport',
  'passport card': 'ID Card',
  'Passport Card': 'ID Card',
};

// ------------------------------------------------------------- templates

/**
 * NVMC NOAD Workbook 8.2 — Non-Crew List.
 * Header row 6, data from row 8. Column letters verified against the workbook.
 */
const nvmcNonCrew = {
  sheetName: 'Non-Crew List',
  startRow: 8,
  dataType: 'travelers',
  columns: [
    { col: 'C', source: 'traveler.lastName', required: true },
    { col: 'D', source: 'traveler.firstName', required: true },
    { col: 'E', source: 'traveler.middleName' },
    { col: 'F', source: 'traveler.dateOfBirth', format: 'YYYY-MM-DD', required: true },
    { col: 'G', source: 'traveler.gender', valueMap: SEX, required: true },
    { col: 'H', source: 'traveler.nationality', normalize: 'country', valueMap: COUNTRY_NVMC, required: true },
    // I is NATIONALITY_CODE: a VLOOKUP whose cached value is empty in the blank
    // template, so it is resolved here and written as a literal.
    { col: 'I', source: 'traveler.nationality', normalize: 'country', valueMap: COUNTRY_CODE },
    // J/K Country of Residence are required by NVMC but appear on no passport.
    // Deliberately left unmapped so the field is visibly missing rather than
    // confidently wrong. See the report printed at the end of this script.
    { col: 'L', constant: 'Passport' },
    { col: 'M', source: 'traveler.passportNumber', required: true },
    { col: 'N', source: 'traveler.issuingAuthority', normalize: 'country', valueMap: COUNTRY_NVMC, required: true },
    { col: 'O', source: 'traveler.issuingAuthority', normalize: 'country', valueMap: COUNTRY_CODE },
    { col: 'P', source: 'traveler.dateOfExpiry', format: 'YYYY-MM-DD' },
    // W..AC is the Embark block, also required and also not on a passport.
  ],
};

/** NVMC Crew List — captain lands in the first row. */
const nvmcCrew = {
  sheetName: 'Crew List',
  startRow: 8,
  dataType: 'crew',
  columns: [
    { col: 'E', source: 'crew.lastName', required: true },
    { col: 'F', source: 'crew.firstName', required: true },
    { col: 'G', source: 'crew.middleName' },
    { col: 'H', source: 'crew.dateOfBirth', format: 'YYYY-MM-DD', required: true },
    { col: 'I', source: 'crew.gender', valueMap: SEX },
    { col: 'J', source: 'crew.nationality', normalize: 'country', valueMap: COUNTRY_NVMC, required: true },
    { col: 'K', source: 'crew.nationality', normalize: 'country', valueMap: COUNTRY_CODE },
    { col: 'N', constant: 'Passport' },
    { col: 'O', source: 'crew.passportNumber', required: true },
  ],
};

/**
 * SailClear Individual_Format.xlsx.
 * Worksheet must be named exactly "Individuals"; headers row 1, data from row 2.
 */
const sailclearIndividuals = {
  sheetName: 'Individuals',
  startRow: 2,
  dataType: 'travelers',
  columns: [
    { col: 'A', source: 'traveler.firstName', required: true },
    { col: 'B', source: 'traveler.lastName', required: true },
    { col: 'C', source: 'traveler.middleName' },
    { col: 'D', source: 'traveler.gender', valueMap: SEX, required: true },
    { col: 'E', source: 'traveler.nationality', normalize: 'country', valueMap: COUNTRY_SAILCLEAR, required: true },
    { col: 'F', source: 'traveler.dateOfBirth', format: 'MM-DD-YYYY', required: true },
    // Passports usually print a city here. Routed through the country map so a
    // country resolves and a city falls through and is rejected on upload,
    // rather than being silently accepted as a country.
    { col: 'G', source: 'traveler.placeOfBirth', normalize: 'country', valueMap: COUNTRY_SAILCLEAR, required: true },
    { col: 'H', source: 'traveler.passportType', valueMap: DOC_TYPE_SAILCLEAR, required: true },
    { col: 'I', source: 'traveler.passportNumber', required: true },
    { col: 'J', source: 'traveler.issuingAuthority', normalize: 'country', valueMap: COUNTRY_SAILCLEAR, required: true },
    { col: 'K', source: 'traveler.dateOfIssue', format: 'MM-DD-YYYY', required: true },
    { col: 'L', source: 'traveler.dateOfExpiry', format: 'MM-DD-YYYY', required: true },
    // Guests are Passenger; SailClear separately requires exactly one Master,
    // which is the captain and is not part of the travelers list.
    { col: 'M', constant: 'Passenger' },
    { col: 'O', constant: 'NA' },
  ],
};

/**
 * The three single-value sheets.
 *
 * Layout rule, verified against the workbook's own data validations: the label
 * sits on row N and its input is on row N+1. So "*Name" at B4 is filled at B5.
 *
 * Only fields we genuinely hold are mapped. Everything else is per-voyage data
 * that lives in the captain's head, and guessing at it on a Coast Guard notice
 * is exactly the failure mode this project exists to remove — those cells are
 * listed in `preImport` instead, by exact address.
 */
const nvmcVesselDetails = {
  sheetName: 'Vessel Details',
  startRow: 5,
  dataType: 'single',
  columns: [
    { col: 'B', row: 5, source: 'boat.vesselName' },        // *Name
    { col: 'E', row: 5, source: 'boat.registrationNumber' }, // *ID Number
    { col: 'G', row: 5, source: 'boat.flagState', normalize: 'country', valueMap: COUNTRY_NVMC }, // *Flag
  ],
};

const nvmcReportingParty = {
  sheetName: 'Reporting Party',
  startRow: 5,
  dataType: 'single',
  columns: [
    { col: 'B', row: 5, source: '{captain.lastName}, {captain.firstName}' }, // *Name
    { col: 'E', row: 5, source: 'captain.email' },  // *Email
    { col: 'B', row: 7, source: 'captain.phone' },  // Phone
  ],
};

const nvmcVoyageInformation = {
  sheetName: 'Voyage Information',
  startRow: 10,
  dataType: 'single',
  columns: [
    // 24-hour point of contact — the captain, by definition.
    { col: 'B', row: 10, source: '{captain.lastName}, {captain.firstName}' }, // *Name
    { col: 'B', row: 12, source: 'captain.email' },  // Email
    { col: 'D', row: 12, source: 'captain.phone' },  // *24 Hour Phone
  ],
};

const TEMPLATES = [
  {
    id: 'uscg-noad-8-2',
    name: 'USCG eNOAD - NOAD Workbook 8.2',
    urlPattern: 'https://enoad.nvmc.uscg.gov/*',
    description:
      'Official NVMC NOAD Workbook 8.2. Import via Add Notice > Import Notice, ' +
      'or email to enoad@nvmc.uscg.gov. Country codes are written as literals ' +
      'because the workbook VLOOKUPs do not recalculate outside Excel.',
    file: 'assets/templates/nvmc-noad-workbook-8.2.xlsx',
    storagePath: 'nvmc-noad-workbook-8.2.xlsx',
    sheets: [nvmcNonCrew, nvmcCrew, nvmcVesselDetails, nvmcReportingParty, nvmcVoyageInformation],
    // Exact cells the captain must complete before importing. Addresses are
    // verified against the workbook; label row N, input row N+1.
    unfilledRequired: [
      'Vessel Details  D5 Call Sign · F5 ID Type · B7 Less Than 300GT · B9 Owner · E9 Operator · B11 Charterer · B16 Operational Condition · E16 OCE Description',
      'Reporting Party B11..I11 vessel lat/long · B13 Location Description',
      'Voyage Information  B5 Notice Type · D5 Voyage Type · F5 Transaction Type · B7 Notice ID · E7 Less than 24HR · G7 Closed Loop',
      'Voyage Information  ARRIVAL B15 State · E15 Port · B17 Arrive Date · D17 Arrive Time · B19 City · F19 Facility',
      'Voyage Information  LAST PORT B22 Country · D22 State · F22 Port · B24 Place · D24 Arrive · F24 Depart',
      'Voyage Information  DEPARTURE B27 City · D27 State · F27 Port · B29 Depart Date · E29 Depart Time',
      'Non-Crew  J Country of Residence · W..AC Embark Country/State/Port/Place/Date',
      'Crew List  embark block, position and longshoreman declaration',
    ],
  },
  {
    id: 'sailclear-individuals',
    name: 'SailClear - Individual Format',
    urlPattern: 'https://*sailclear.com/*',
    description:
      'SailClear bulk individual upload. Upload at /dashboard/individuals. ' +
      'Covers the person record only; vessel, voyage and health declaration ' +
      'are still entered in the wizard.',
    file: 'assets/templates/sailclear-individual-format.xlsx',
    storagePath: 'sailclear-individual-format.xlsx',
    sheets: [sailclearIndividuals],
    unfilledRequired: ['G BirthCountry when the passport prints a city rather than a country'],
  },
];

// ------------------------------------------------------------------ upload

async function uploadTemplate(t) {
  const bytes = readFileSync(resolve(REPO, t.file));
  const url = `${SUPABASE_URL}/storage/v1/object/templates/${t.storagePath}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'x-upsert': 'true',
    },
    body: bytes,
  });
  if (!res.ok) throw new Error(`upload ${t.storagePath}: ${res.status} ${await res.text()}`);
  return bytes.length;
}

async function upsertRow(t) {
  const row = {
    id: t.id,
    name: t.name,
    url_pattern: t.urlPattern,
    description: t.description,
    template_path: t.storagePath,
    sheets: t.sheets,
    updated_at: new Date().toISOString(),
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/excel_templates`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`upsert ${t.id}: ${res.status} ${await res.text()}`);
  return res.json();
}

// -------------------------------------------------------------------- main

console.log(DRY ? 'DRY RUN — nothing will be written\n' : `Provisioning against ${SUPABASE_URL}\n`);

for (const t of TEMPLATES) {
  const cells = t.sheets.reduce((n, s) => n + s.columns.length, 0);
  console.log(`${t.name}`);
  console.log(`  id            ${t.id}`);
  console.log(`  urlPattern    ${t.urlPattern}`);
  console.log(`  sheets        ${t.sheets.map((s) => `${s.sheetName}@${s.startRow}`).join(', ')}`);
  console.log(`  mappings      ${cells} columns`);

  if (!DRY) {
    const size = await uploadTemplate(t);
    await upsertRow(t);
    console.log(`  uploaded      ${size.toLocaleString()} bytes -> templates/${t.storagePath}`);
    console.log(`  row           upserted`);
  }

  if (t.unfilledRequired?.length) {
    console.log(`  ⚠ required fields left blank on purpose (fill before submitting):`);
    for (const f of t.unfilledRequired) console.log(`      - ${f}`);
  }
  console.log();
}

console.log(
  `Country value maps: ${Object.keys(COUNTRY_NVMC).length} NVMC aliases, ` +
    `${Object.keys(COUNTRY_SAILCLEAR).length} SailClear aliases, ` +
    `${Object.keys(COUNTRY_CODE).length} code aliases.`,
);
console.log(DRY ? '\nDry run complete.' : '\nDone.');
