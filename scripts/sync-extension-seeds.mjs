#!/usr/bin/env node
/**
 * Mirror the registry seeds into the extension bundle.
 *
 *   node scripts/sync-extension-seeds.mjs
 *
 * The extension cannot read repo files at runtime, so the seed files it
 * fetches via chrome.runtime.getURL() are checked-in copies under
 * extension/sidepanel/seeds/. shared/registry/ stays the source of truth —
 * edit there, run this, rebuild the zip.
 */

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const SEEDS = resolve(REPO, 'extension', 'sidepanel', 'seeds');
mkdirSync(SEEDS, { recursive: true });

const COPIES = [
  ['shared/registry/vessels.json', 'vessels.json'],
  ['shared/registry/learned-lists.json', 'learned-lists.json'],
];
for (const [from, to] of COPIES) {
  copyFileSync(resolve(REPO, from), resolve(SEEDS, to));
  console.log(`${from} -> extension/sidepanel/seeds/${to}`);
}

// The boat form's datalists want just two of the NVMC vocabularies — bundle
// them together instead of shipping every reference file.
const ref = (f) => JSON.parse(readFileSync(resolve(REPO, 'shared', 'reference', 'nvmc', f), 'utf8'));

// The wizard's "Other departure port" flow wants the eNOAD port options per
// US state. portsByPlace keys are INDIRECT names — country+state with
// non-letters stripped — so UNITEDSTATES + the state name recovers them.
// Only the US slice ships; foreign "Other" ports stay free text (their eNOAD
// rendering is unobserved and must never be guessed).
const portsByPlace = ref('portsByPlace.json');
const usStates = ref('usStates.json');
const usPortsByState = {};
for (const stateName of usStates) {
  const key = `UNITEDSTATES${stateName.replace(/[^A-Za-z]/g, '')}`;
  if (portsByPlace[key]) usPortsByState[stateName] = portsByPlace[key];
}

// Foreign NPOC/last-port codes for the hidden workbook helper cells
// (Voyage Information row 43). Keys: country name -> port name -> code, from
// the workbook's own port table (key = portName + countryCode). US ports
// carry NO code by the workbook's own rule, so only foreign countries the
// captain actually sails to are bundled — currently the BVI.
const portTable = ref('port.json');
const travelCountry = ref('travelCountry.json');
const FOREIGN_PORT_COUNTRIES = ['VIRGIN ISLANDS, BRITISH'];
const foreignPortCodes = {};
for (const country of FOREIGN_PORT_COUNTRIES) {
  const code = travelCountry[country];
  const placeKey = country.replace(/[^A-Za-z]/g, '');
  const ports = portsByPlace[placeKey] || [];
  foreignPortCodes[country] = {};
  for (const port of ports) {
    const portCode = portTable[`${port}${code}`];
    if (portCode) foreignPortCodes[country][port] = portCode;
  }
}

const nvmcLists = {
  classSociety: ref('classSociety.json'),
  vesselClass: ref('vesselClass.json'),
  usStates,
  usPortsByState,
  foreignPortCodes,
};
writeFileSync(resolve(SEEDS, 'nvmc-lists.json'), JSON.stringify(nvmcLists, null, 2));
console.log(
  `nvmc-lists.json (classSociety ${nvmcLists.classSociety.length}, vesselClass ${nvmcLists.vesselClass.length}, ` +
    `usStates ${usStates.length}, usPortsByState ${Object.keys(usPortsByState).length} states)`,
);
