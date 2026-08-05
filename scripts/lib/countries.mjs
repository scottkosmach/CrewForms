/**
 * Build the country value maps used by the Excel templates.
 *
 * One OCR value has to become three different strings depending on where it is
 * going: SailClear wants "British Virgin Islands", NVMC wants
 * "VIRGIN ISLANDS, BRITISH" for display and "VG" for its code column. Rather
 * than hand-type those tables, we generate them from the vocabularies shipped
 * inside each government template plus a small curated override file.
 *
 * Unmapped values deliberately fall through unchanged: the target then rejects
 * them, which is far better than silently filing a wrong nationality.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REF = resolve(HERE, '../../shared/reference');

const nvmcCountries = JSON.parse(
  readFileSync(resolve(REF, 'nvmc/personCountry.json'), 'utf8'),
);
const sailclear = JSON.parse(
  readFileSync(resolve(REF, 'sailclear/vocabularies.json'), 'utf8'),
);
const overrides = JSON.parse(
  readFileSync(resolve(REF, 'country-overrides.json'), 'utf8'),
);

/** Uppercase, de-invert "X, Y" into "Y X", strip everything non-alphanumeric. */
export function canon(s) {
  let t = String(s).trim().toUpperCase();
  if (t.includes(',')) {
    const parts = t.split(',').map((x) => x.trim());
    t = parts.slice(1).join(' ') + ' ' + parts[0];
  }
  return t.replace(/[^A-Z0-9]/g, '');
}

/**
 * Pair every NVMC country with its SailClear spelling.
 * Returns [{ nvmc, code, sailclear|null }]
 */
export function buildCountryPairs() {
  const scByCanon = new Map(sailclear.countries.map((n) => [canon(n), n]));
  const manual = overrides.nvmcToSailclear;

  return Object.entries(nvmcCountries).map(([nvmcName, code]) => {
    const auto = scByCanon.get(canon(nvmcName));
    const sc = Object.prototype.hasOwnProperty.call(manual, nvmcName)
      ? manual[nvmcName]
      : (auto ?? null);
    return { nvmc: nvmcName, code, sailclear: sc };
  });
}

/**
 * Every spelling of a country we are willing to accept from OCR.
 * Keeps the value maps tolerant without inventing countries.
 */
function aliasesFor(pair) {
  const out = new Set();
  const add = (v) => {
    if (v && String(v).trim()) out.add(String(v).trim());
  };

  add(pair.nvmc);
  add(pair.sailclear);
  add(pair.code); // alpha-2

  // Title Case of the NVMC name, which is what a model asked for a "full
  // country name" tends to produce.
  add(
    pair.nvmc
      .toLowerCase()
      .replace(/\b[a-z]/g, (c) => c.toUpperCase()),
  );

  // De-inverted form: "VIRGIN ISLANDS, BRITISH" -> "British Virgin Islands"
  if (pair.nvmc.includes(',')) {
    const parts = pair.nvmc.split(',').map((x) => x.trim());
    const flat = (parts.slice(1).join(' ') + ' ' + parts[0])
      .toLowerCase()
      .replace(/\b[a-z]/g, (c) => c.toUpperCase());
    add(flat);
    add(flat.toUpperCase());
  }

  if (pair.sailclear) add(pair.sailclear.toUpperCase());

  return [...out];
}

/**
 * BVI Immigration uses a third spelling again: UPPERCASE, with the inverted
 * suffix in parentheses rather than after a comma. Verified against the live
 * dropdown — "VIRGIN ISLANDS (BRITISH)", "VIRGIN ISLANDS (U.S.)",
 * "UNITED STATES", "UNITED KINGDOM".
 */
export function toBviCountry(nvmcName) {
  const upper = String(nvmcName).toUpperCase();
  const i = upper.indexOf(', ');
  if (i === -1) return upper;
  return `${upper.slice(0, i)} (${upper.slice(i + 2)})`;
}

/**
 * valueMap for a display column: any accepted spelling -> the target's exact
 * string. `target` is 'nvmc', 'sailclear' or 'bvi'.
 */
export function buildCountryNameMap(target) {
  const map = {};
  for (const pair of buildCountryPairs()) {
    const value =
      target === 'nvmc'
        ? pair.nvmc
        : target === 'bvi'
          ? toBviCountry(pair.nvmc)
          : pair.sailclear;
    if (!value) continue;
    for (const alias of aliasesFor(pair)) {
      // First writer wins so an alias shared by two countries cannot be
      // silently reassigned by whichever happens to come later.
      if (!(alias in map)) map[alias] = value;
    }
  }
  for (const [a3, nvmcName] of Object.entries(overrides.alpha3ToNvmc)) {
    const pair = buildCountryPairs().find((p) => p.nvmc === nvmcName);
    const value = target === 'nvmc' ? nvmcName : pair?.sailclear;
    if (value && !(a3 in map)) map[a3] = value;
  }
  return map;
}

/** valueMap for an NVMC *_CODE column: accepted spelling -> alpha-2 code. */
export function buildCountryCodeMap() {
  const map = {};
  for (const pair of buildCountryPairs()) {
    if (!pair.code) continue;
    for (const alias of aliasesFor(pair)) {
      if (!(alias in map)) map[alias] = pair.code;
    }
  }
  for (const [a3, nvmcName] of Object.entries(overrides.alpha3ToNvmc)) {
    const code = nvmcCountries[nvmcName];
    if (code && !(a3 in map)) map[a3] = code;
  }
  return map;
}

export const vocabularies = sailclear;
