#!/usr/bin/env node
/**
 * Extract the BVI Preclearance portal's controlled vocabularies and label
 * inventory into shared/reference/bvi/, so the fill layer and the canonical
 * field registry select from the REAL option strings instead of guessing.
 *
 *   node scripts/agent/extract-bvi-dictionaries.mjs [--linger]
 *
 * READ ONLY. It loads the page, captures every dictionaries-API response the
 * Angular app makes, and fetches the public config + i18n bundle from page
 * context (so the requests ride the Cloudflare-cleared session). It never
 * types into a field and never saves anything.
 *
 * Some dictionaries only load the first time their dropdown is opened. Run
 * with --linger and the browser stays open: click through each dropdown once
 * (opening a panel enters no data), then press Enter here to finish.
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', '..', 'shared', 'reference', 'bvi');
mkdirSync(resolve(OUT, 'raw'), { recursive: true });

const BASE = 'https://eta.bviportals.com/ng-vg-bms-online';
const URL = `${BASE}/transport-manifest`;
const linger = process.argv.includes('--linger');
const fromRaw = process.argv.includes('--from-raw');

/**
 * The app fetches ALL its vocabularies in one call:
 *   /cbn-dictionaries/api/v1/dictionaries/cache/getLists
 * whose body is { cacheListWsBeans: [{ id, name, values: [...] }] }.
 * This maps each dictionary's server-side name to the canonical filename that
 * shared/registry/canonical-fields.json references.
 *
 * Naming trap discovered 2026-08-06: the field the UI labels "Transport type"
 * (CREWED CHARTER / BAREBOAT RENTAL / ...) is backed by PURPOSE VISIT
 * TRANSPORT. The dictionary actually named TRANSPORT TYPE is just
 * SEA VESSEL | AIRCRAFT.
 */
const DICT_FILES = {
  NATIONALITY: 'nationality.json',
  COUNTRY: 'country.json',
  PORT: 'ports.json',
  LOCATION: 'portsOfEntry.json',
  'PURPOSE VISIT PERSON': 'purposeOfVisit.json',
  'PURPOSE VISIT TRANSPORT': 'purposeOfVisitTransport.json',
  'TRANSPORT TYPE': 'transportType.json',
  'ACCOMMODATION TYPE': 'accommodationType.json',
  SEX: 'gender.json',
  'PERSON TYPE': 'personType.json',
  'DIRECTION CODE': 'directionCode.json',
  'EDIFACT TRAVEL DOCUMENT TYPE': 'travelDocumentType.json',
};

const slug = (u) =>
  new globalThis.URL(u).pathname.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();

/**
 * Split a getLists payload into one file per dictionary. Values are kept
 * VERBATIM — several carry leading/trailing whitespace (" ONE VI POKER RUN",
 * "BVI MUSIC FEST ") and exact-match logic must know that. Inactive values are
 * kept too, flagged, because the live form may still render them.
 */
function splitDictionaries(body) {
  const written = [];
  for (const list of body.cacheListWsBeans || []) {
    const file = DICT_FILES[list.name] || `raw/dict-${list.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`;
    const values = list.values.map((v) => ({
      id: v.id,
      value: v.valueName,
      active: v.activeInd !== false,
      ...(v.valueName !== v.valueName.trim() ? { whitespaceHazard: true } : {}),
    }));
    writeFileSync(
      resolve(OUT, file),
      JSON.stringify({ dictionary: list.name, dictionaryId: list.id, count: values.length, values }, null, 2),
    );
    written.push({ file, dictionary: list.name, count: values.length });
    console.log(`${file.padEnd(32)} <- ${list.name} (${values.length} values)`);
  }
  return written;
}

if (fromRaw) {
  const rawPath = resolve(OUT, 'raw', 'cbn-dictionaries-api-v1-dictionaries-cache-getlists.json');
  if (!existsSync(rawPath)) {
    console.error('No raw getLists capture found — run without --from-raw first.');
    process.exit(1);
  }
  const written = splitDictionaries(JSON.parse(readFileSync(rawPath, 'utf8')));
  console.log(`\nSplit ${written.length} dictionaries from the existing raw capture.`);
  process.exit(0);
}

// Cloudflare blocks headless automation on this host. Real Chrome, headed,
// with the same persistent profile bvi-recon.mjs uses, passes normally.
const ctx = await chromium.launchPersistentContext(resolve(HERE, 'out', 'profile'), {
  channel: 'chrome',
  headless: false,
  viewport: { width: 1440, height: 1000 },
  args: ['--disable-blink-features=AutomationControlled'],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());

/** Every JSON response from the app's own API hosts, keyed by URL. */
const captured = new Map();
page.on('response', async (res) => {
  const u = res.url();
  if (!u.includes('bviportals.com')) return;
  if (!/api|dictionar|assets\/i18n|assets\/config/i.test(u)) return;
  try {
    const ct = res.headers()['content-type'] || '';
    if (!ct.includes('json')) return;
    captured.set(u.split('?')[0], { url: u, status: res.status(), body: await res.json() });
  } catch {
    // Non-JSON or already-consumed body — not a dictionary.
  }
});

console.log(`Opening ${URL}`);
await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(8000);
console.log(`title: ${await page.title()}`);

// The two public assets the research phase identified, fetched from page
// context so they carry the cleared Cloudflare session.
const fetchJson = (u) =>
  page.evaluate(async (url) => {
    const r = await fetch(url);
    return { status: r.status, body: r.status === 200 ? await r.json() : null };
  }, u);

const config = await fetchJson(`${BASE}/assets/config.json`);
const labels = await fetchJson(`${BASE}/assets/i18n/en.json`);

if (config.body) {
  writeFileSync(resolve(OUT, 'config.json'), JSON.stringify(config.body, null, 2));
  console.log(`config.json          -> saved (env=${config.body.env ?? '?'})`);
} else {
  console.log(`config.json          -> HTTP ${config.status}`);
}
if (labels.body) {
  writeFileSync(resolve(OUT, 'labels-en.json'), JSON.stringify(labels.body, null, 2));
  console.log(`labels-en.json       -> saved (${Object.keys(labels.body).length} top-level keys)`);
} else {
  console.log(`labels-en.json       -> HTTP ${labels.status}`);
}

// If the config names the dictionaries base URL, note it — dictionaries the
// app has not requested yet will only appear once their dropdown opens.
const dictBase = config.body?.dictionariesApiUrl || config.body?.dictionaryApiUrl || null;
if (dictBase) console.log(`dictionaries API:    ${dictBase}`);

if (linger) {
  console.log(
    '\n--linger: the browser stays open. Click through each dropdown once\n' +
      '(Nationality, Country, Ports, Purpose, Transport type, Gender, ...)\n' +
      'so the app requests its dictionary, then press Enter here to finish.',
  );
  await new Promise((done) => process.stdin.once('data', done));
} else {
  // Give the app a moment to finish any lazy dictionary loads it does on its own.
  await page.waitForTimeout(5000);
}

// Write everything captured raw, then split any getLists payload into the
// canonical per-dictionary files the registry points at.
const manifest = [];
let split = [];
for (const { url, status, body } of captured.values()) {
  const items = Array.isArray(body) ? body.length : body && typeof body === 'object' ? Object.keys(body).length : 0;
  const file = `raw/${slug(url)}.json`;
  writeFileSync(resolve(OUT, file), JSON.stringify(body, null, 2));
  manifest.push({ file, url, status, items });
  console.log(`${file.padEnd(32)} <- ${url} (${items} items)`);
  if (body && typeof body === 'object' && Array.isArray(body.cacheListWsBeans)) {
    split = split.concat(splitDictionaries(body));
  }
}

writeFileSync(
  resolve(OUT, 'manifest.json'),
  JSON.stringify(
    {
      extracted: new Date().toISOString(),
      source: URL,
      dictionariesApiUrl: dictBase,
      note: 'Captured from the live app\'s own API traffic. Per-dictionary files are referenced by shared/registry/canonical-fields.json; raw/ holds the untouched responses. Values are verbatim — some carry whitespaceHazard. Re-run with --linger and open every dropdown if a dictionary is missing.',
      captures: manifest,
      dictionaries: split,
    },
    null,
    2,
  ),
);
console.log(`\nmanifest.json        -> ${manifest.length} captures recorded`);
if (!manifest.length) {
  console.log(
    'No dictionary responses captured. The app likely loads them on first\n' +
      'dropdown open — re-run with --linger and click each dropdown once.',
  );
}

await ctx.close();
