#!/usr/bin/env node
/**
 * Extract the live eNOAD site's dropdown vocabularies from the HTML captures
 * in docs/recon/2026-08-06-enoad-tabs/ (or a directory given as argv[2]).
 *
 *   node scripts/agent/extract-enoad-dropdowns.mjs [capture-dir]
 *
 * Two outputs:
 *
 * 1. shared/reference/nvmc/flagList.json — the Vessel Details flag options,
 *    VERBATIM. This is the one eNOAD list not derivable from the NOAD
 *    workbook: the site renders "NAME - CODE" with names truncated around
 *    25 chars ("BONAIRE, SINT EUSTATIUS A - BQ"), while the workbook's
 *    Countries range holds full plain names. flagByCode.json is the derived
 *    code -> option-string map for fill layers.
 *
 * 2. A cross-check of every other captured dropdown against the
 *    workbook-derived lists in shared/reference/nvmc/ — drift here means the
 *    site and workbook vocabularies have diverged and the registry's
 *    bindings need a fresh look. A contradiction beats a seed.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const CAPTURE_DIR = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(REPO, 'docs', 'recon', '2026-08-06-enoad-tabs');
const REF_DIR = resolve(REPO, 'shared', 'reference', 'nvmc');

const unescapeHtml = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&');

/**
 * Every Telerik combobox in a capture: id="cbXxx" ... <ul class="rcbList">.
 * The list belonging to a combo is the first rcbList after its id, provided
 * no other combo id intervenes (abbreviated combos in the captures have a
 * bracketed placeholder instead of a list and are skipped).
 */
function extractCombos(html) {
  const combos = {};
  const idRe = /<div id="(cb[A-Za-z]+)" class="RadComboBox/g;
  const starts = [];
  let m;
  while ((m = idRe.exec(html))) starts.push({ id: m[1], index: m.index });
  for (let i = 0; i < starts.length; i++) {
    const { id, index } = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1].index : html.length;
    const scope = html.slice(index, end);
    const list = /<ul class="rcbList">([\s\S]*?)<\/ul>/.exec(scope);
    if (!list) continue;
    const items = [...list[1].matchAll(/<li class="rcbItem">([^<]*)<\/li>/g)].map((x) =>
      unescapeHtml(x[1]),
    );
    combos[id] = items.filter((v) => v !== '[None Selected]');
  }
  return combos;
}

const readRef = (file) => JSON.parse(readFileSync(resolve(REF_DIR, file), 'utf8'));

function diff(label, siteList, refList) {
  const site = new Set(siteList);
  const ref = new Set(refList);
  const onlySite = [...site].filter((v) => !ref.has(v));
  const onlyRef = [...ref].filter((v) => !site.has(v));
  const ok = onlySite.length === 0 && onlyRef.length === 0;
  console.log(`  ${ok ? 'MATCH' : 'DRIFT'}  ${label}  (site ${site.size} / ref ${ref.size})`);
  if (onlySite.length) console.log(`         only on site: ${onlySite.join(' | ')}`);
  if (onlyRef.length) console.log(`         only in reference: ${onlyRef.join(' | ')}`);
  return ok;
}

// ------------------------------------------------------------------- collect

const combos = {};
for (const file of readdirSync(CAPTURE_DIR).filter((f) => f.endsWith('.html'))) {
  const found = extractCombos(readFileSync(resolve(CAPTURE_DIR, file), 'utf8'));
  for (const [id, items] of Object.entries(found)) {
    if (combos[id] && combos[id].length !== items.length) {
      console.warn(`  WARNING: ${id} captured twice with different lengths`);
    }
    combos[id] = items;
  }
}
console.log(`Combos captured: ${Object.keys(combos).sort().join(', ')}\n`);

// ------------------------------------------------------- flag list (publish)

const flags = combos.cbFlag || [];
if (!flags.length) throw new Error('cbFlag options missing from the captures');

const byCode = {};
const malformed = [];
for (const option of flags) {
  const m = /^(.*) - ([A-Z]{2})$/.exec(option);
  if (!m) {
    malformed.push(option);
    continue;
  }
  byCode[m[2]] = option;
}
if (malformed.length) console.warn(`  WARNING malformed flag options: ${malformed.join(' | ')}`);

writeFileSync(resolve(REF_DIR, 'flagList.json'), JSON.stringify(flags, null, 2));
writeFileSync(resolve(REF_DIR, 'flagByCode.json'), JSON.stringify(byCode, null, 2));
console.log(`flagList.json: ${flags.length} options; flagByCode.json: ${Object.keys(byCode).length} codes\n`);

// ---------------------------------------------------------------- cross-check

console.log('Cross-checks against workbook-derived lists:');

const voyageTypes = readRef('voyageTypes.json');
const portsByPlace = readRef('portsByPlace.json');
const personCountry = readRef('personCountry.json');

diff('ID Type', combos.cbIDType || [], ['IMO Number', 'Official Number']);
diff('Notice Type', combos.cbNoticeType || [], readRef('noticeTypes.json'));
diff('Voyage Type (Departure notice)', combos.cbVoyageType || [], voyageTypes.Departure);
diff('Class Society', combos.cbClassSociety || [], readRef('classSociety.json'));
diff('Vessel Class', combos.cbVesselClass || [], readRef('vesselClass.json'));
diff('OCE', combos.cbOCE || [], ['Operational', 'Not Operational', 'Not Required']);
diff('Departure State', combos.cbDepartureState || [], readRef('usStates.json'));
diff('Departure Port (Virgin Islands)', combos.cbDeparturePort || [], portsByPlace.UNITEDSTATESVirginIslands);
diff('NPOC Country', combos.cbNextCountry || [], readRef('countries.json'));
diff('NPOC Port (BVI)', combos.cbNextPort || [], portsByPlace.VIRGINISLANDSBRITISH);

// Flag codes should be exactly the person-country codes.
diff('Flag codes vs personCountry codes', Object.keys(byCode), [
  ...new Set(Object.values(personCountry)),
]);

console.log('\nDone. DRIFT lines are findings, not errors — record them in the registry.');
