#!/usr/bin/env node
/**
 * Bench test for the recon recorder (extension/content/recon.js) — runs it
 * against a local scratch page with a stubbed chrome API, so the recorder can
 * be exercised without loading the extension or touching a live site.
 *
 *   node scripts/recon-bench.mjs
 *
 * Asserts the plan's bench criteria: per-frame snapshots (including inside an
 * iframe), verbatim select options, redaction of typed roster values to path
 * tokens, PII-label shape redaction, option clicks recorded verbatim,
 * conditional-field appearance, validation-message capture, and silent-change
 * detection.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const HERE = dirname(fileURLToPath(import.meta.url));
const reconSrc = readFileSync(resolve(HERE, '..', 'extension', 'content', 'recon.js'), 'utf8');

// --- scratch pages -----------------------------------------------------------

const childHtml = `<!doctype html><html><body>
  <label for="inner">Embark Place</label>
  <input id="inner" name="embarkPlace">
</body></html>`;

const dir = mkdtempSync(join(tmpdir(), 'recon-bench-'));
writeFileSync(join(dir, 'child.html'), childHtml);
writeFileSync(
  join(dir, 'index.html'),
  `<!doctype html><html><body>
  <form>
    <label for="pass">Passport number</label>
    <input id="pass" name="passportNumber">

    <label for="nick">Favorite color</label>
    <input id="nick" name="favoriteColor">

    <label for="country">Country</label>
    <select id="country" name="country">
      <option>-- pick --</option>
      <option>UNITED STATES</option>
      <option>VIRGIN ISLANDS (BRITISH)</option>
    </select>

    <label for="silent">Prefilled Field</label>
    <input id="silent" name="prefilled" value="original">

    <button type="button" id="toggler">toggle conditional</button>
    <div id="slot"></div>

    <div id="overlay-slot"></div>
  </form>
  <iframe src="child.html"></iframe>
  <script>
    document.getElementById('toggler').addEventListener('click', () => {
      const slot = document.getElementById('slot');
      slot.innerHTML = '<label for="cond">Conditional Field</label>' +
        '<input id="cond" name="conditional" required>' +
        '<div role="alert">Conditional Field is required.</div>';
    });
    // A fake typeahead overlay: focus the country select's neighbor opens it.
    window.openOverlay = () => {
      const o = document.getElementById('overlay-slot');
      o.innerHTML = '<div role="listbox"><div role="option">AMERICAN</div>' +
        '<div role="option">BRITON</div></div>';
    };
  </script>
</body></html>`,
);

// --- chrome API stub, installed in every frame before recon.js ---------------

const chromeStub = `
  window.__batches = [];
  window.chrome = {
    runtime: {
      sendMessage: (msg, cb) => { window.__batches.push(msg); cb && cb(); },
      onMessage: { addListener: () => {} },
      get lastError() { return null; },
    },
    storage: {
      local: {
        get: (keys, cb) => cb({ reconSession: {
          id: 'bench',
          startedAt: Date.now(),
          redact: [
            { path: 'traveler[0].passportNumber', norm: 'A00733970' },
            { path: 'traveler[0].lastName', norm: 'REYES' },
          ],
        }}),
      },
    },
  };
`;

// --- run ---------------------------------------------------------------------

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE:', m.text());
});
await page.addInitScript({ content: chromeStub });
await page.addInitScript({ content: reconSrc });
await page.goto(pathToFileURL(join(dir, 'index.html')).href);
await page.waitForTimeout(300);
for (const f of page.frames()) {
  console.log('frame armed?', f.url().split('/').pop(), await f.evaluate(() => window.__crewformsRecon));
}

// Typed roster value → must become a path token.
await page.fill('#pass', 'A00733970');
// Typed non-roster, non-PII-label value → shape only.
await page.fill('#nick', 'turquoise');
// Native select → verbatim option.
await page.selectOption('#country', { label: 'VIRGIN ISLANDS (BRITISH)' });
// Conditional field + validation message appear.
await page.click('#toggler');
// Overlay with options; click one.
await page.evaluate(() => window.openOverlay());
await page.waitForTimeout(100);
await page.click('[role="option"]:has-text("BRITON")');
// Silent change: the page mutates an untouched field programmatically.
await page.evaluate(() => {
  document.getElementById('silent').value = 'changed-by-page';
});
// Type in the iframe too.
await page.frameLocator('iframe').locator('#inner').fill('Yacht Haven Grande');
// Long enough for the 750ms sweep to catch the silent change AND for the
// recorder's 2s flush timer to deliver every frame's final batch.
await page.waitForTimeout(3000);

const events = [];
for (const frame of page.frames()) {
  const batches = await frame.evaluate(() => window.__batches || []);
  console.log(
    'frame', frame.url().split('/').pop(),
    'batches:', batches.length,
    'types:', batches.map((b) => b.type).join(','),
  );
  for (const b of batches) if (b.type === 'RECON_EVENTS') events.push(...b.events);
}
await browser.close();

// --- assertions --------------------------------------------------------------

const kinds = new Set(events.map((e) => e.kind));
const byKind = (k) => events.filter((e) => e.kind === k);
const fails = [];
function check(name, fn) {
  try {
    fn();
    console.log('OK   ' + name);
  } catch (err) {
    fails.push(name);
    console.log('FAIL ' + name + ' — ' + err.message);
  }
}

check('snapshots taken in both frames', () => {
  const frames = new Set(byKind('snapshot').map((e) => e.frame));
  assert.equal(frames.size, 2, `frames with snapshots: ${[...frames].join(', ')}`);
});
check('iframe field inventoried with its label', () => {
  const snap = byKind('snapshot').find((e) => !e.top);
  assert.ok(snap.fields.some((f) => f.label === 'Embark Place'), JSON.stringify(snap.fields));
});
check('native select options captured verbatim in snapshot', () => {
  const snap = byKind('snapshot').find((e) => e.top);
  const sel = snap.fields.find((f) => f.control === 'select');
  assert.deepEqual(sel.options, ['-- pick --', 'UNITED STATES', 'VIRGIN ISLANDS (BRITISH)']);
});
check('typed roster value redacted to a path token', () => {
  const hits = events.filter((e) => e.value && e.value.token === '≡ traveler[0].passportNumber');
  assert.ok(hits.length >= 1, JSON.stringify(events.filter((e) => e.field?.name === 'passportNumber')));
});
check('raw passport number appears nowhere in the stream', () => {
  assert.ok(!JSON.stringify(events).includes('A00733970'));
});
check('non-roster free text reduced to a shape', () => {
  const hit = events.find((e) => e.field?.name === 'favoriteColor' && e.value?.pattern);
  assert.equal(hit.value.pattern, 'aaaaaaaaa');
  assert.ok(!JSON.stringify(events).includes('turquoise'));
});
check('select change recorded with verbatim option', () => {
  const hit = events.find((e) => e.kind === 'change' && e.value?.option === 'VIRGIN ISLANDS (BRITISH)');
  assert.ok(hit);
});
check('conditional field appearance recorded with trigger context', () => {
  const hit = byKind('field-appeared').find((e) => e.field?.label === 'Conditional Field');
  assert.ok(hit, JSON.stringify(byKind('field-appeared')));
  assert.ok(hit.after, 'has preceding-interaction context');
});
check('validation message captured verbatim', () => {
  assert.ok(byKind('validation-message').some((e) => e.text === 'Conditional Field is required.'));
});
check('overlay option click recorded verbatim', () => {
  assert.ok(byKind('option-selected').some((e) => e.value === 'BRITON'));
});
check('silent page-driven value change detected', () => {
  assert.ok(byKind('silent-change').some((e) => e.field?.name === 'prefilled'));
});
check('iframe typing captured and shape-redacted', () => {
  const hit = events.find((e) => !e.top && e.field?.name === 'embarkPlace' && (e.value?.pattern || e.value?.token));
  assert.ok(hit, 'iframe input event with redacted value');
  assert.ok(!JSON.stringify(events).includes('Yacht Haven Grande'));
});

console.log(fails.length ? `\n${fails.length} FAILURES` : '\nAll bench checks passed.');
process.exit(fails.length ? 1 : 0);
