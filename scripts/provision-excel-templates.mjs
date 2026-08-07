#!/usr/bin/env node
/**
 * Provision the government Excel templates: upload each blank workbook to
 * Supabase Storage and upsert its excel_templates row.
 *
 * The sheet mappings themselves live in scripts/lib/noad-mappings.mjs (and
 * are verified against the real workbook by tests/noad-mapping.test.mjs) —
 * this script is only the upload plumbing.
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
import {
  TEMPLATES,
  COUNTRY_NVMC,
  COUNTRY_SAILCLEAR,
  COUNTRY_CODE,
} from './lib/noad-mappings.mjs';

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
