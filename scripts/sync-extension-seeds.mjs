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
const nvmcLists = {
  classSociety: ref('classSociety.json'),
  vesselClass: ref('vesselClass.json'),
  usStates: ref('usStates.json'),
};
writeFileSync(resolve(SEEDS, 'nvmc-lists.json'), JSON.stringify(nvmcLists, null, 2));
console.log(
  `nvmc-lists.json (classSociety ${nvmcLists.classSociety.length}, vesselClass ${nvmcLists.vesselClass.length}, usStates ${nvmcLists.usStates.length})`,
);
