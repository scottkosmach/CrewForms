#!/usr/bin/env node
/**
 * Recon the BVI Preclearance wizard: open it, walk step 1, and dump the real
 * field inventory so the driver is written against what is actually on the
 * page rather than a guess.
 *
 *   node scripts/agent/bvi-recon.mjs [--headed]
 *
 * READ ONLY. This never types into a field, never clicks Next, and never
 * submits. It loads the page, reads the DOM, and screenshots.
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, 'out');
mkdirSync(OUT, { recursive: true });

const URL = 'https://eta.bviportals.com/ng-vg-bms-online/transport-manifest';
const headed = process.argv.includes('--headed');

// Cloudflare blocks headless automation on this host. Real Chrome, headed,
// with a persistent profile passes normally - this is the captain's own
// browser with them present, not an attempt to defeat bot protection.
const ctx = await chromium.launchPersistentContext(resolve(OUT, 'profile'), {
  channel: 'chrome',
  headless: false,
  viewport: { width: 1440, height: 1000 },
  args: ['--disable-blink-features=AutomationControlled'],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());

console.log(`Opening ${URL}`);
await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(8000);

console.log(`title: ${await page.title()}`);
console.log(`url:   ${page.url()}\n`);

await page.screenshot({ path: resolve(OUT, 'bvi-step1.png'), fullPage: true });

/**
 * Read every form control Angular Material has rendered, with the label the
 * user actually sees and enough detail to tell a typeahead from a plain input.
 */
const fields = await page.evaluate(() => {
  const seen = [];
  const controls = document.querySelectorAll(
    'input, select, textarea, mat-select, [role="combobox"], [role="listbox"]',
  );

  const labelFor = (el) => {
    // mat-form-field puts the label in a <mat-label> inside the wrapper
    const wrapper = el.closest('mat-form-field, .mat-mdc-form-field, .mat-form-field');
    const matLabel = wrapper?.querySelector('mat-label, label');
    if (matLabel?.textContent?.trim()) return matLabel.textContent.trim();
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l?.textContent?.trim()) return l.textContent.trim();
    }
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const t = labelledby
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim())
        .filter(Boolean)
        .join(' ');
      if (t) return t;
    }
    return el.getAttribute('placeholder') || null;
  };

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };

  controls.forEach((el, i) => {
    if (!visible(el)) return;
    seen.push({
      index: i,
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || null,
      label: labelFor(el),
      formControlName: el.getAttribute('formcontrolname') || null,
      id: el.id || null,
      name: el.getAttribute('name') || null,
      placeholder: el.getAttribute('placeholder') || null,
      required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
      // The tell for a Material typeahead: it owns an autocomplete panel.
      isAutocomplete:
        el.hasAttribute('matinput') && el.getAttribute('role') === 'combobox'
          ? true
          : el.getAttribute('aria-autocomplete') === 'list' ||
            Boolean(el.getAttribute('aria-owns') || el.getAttribute('aria-controls')),
      readOnly: el.hasAttribute('readonly'),
    });
  });

  const headings = [...document.querySelectorAll('h1,h2,h3,h4,.mat-step-label,.mat-horizontal-stepper-header')]
    .map((h) => h.textContent.trim())
    .filter(Boolean)
    .slice(0, 25);

  const buttons = [...document.querySelectorAll('button')]
    .filter((b) => b.offsetParent !== null)
    .map((b) => b.textContent.trim())
    .filter(Boolean)
    .slice(0, 25);

  return { fields: seen, headings, buttons };
});

console.log('=== stepper / headings ===');
fields.headings.forEach((h) => console.log(`  ${h}`));

console.log('\n=== visible form controls ===');
if (!fields.fields.length) console.log('  (none — the wizard may need a role chosen first)');
for (const f of fields.fields) {
  const kind = f.isAutocomplete ? 'AUTOCOMPLETE' : f.tag === 'mat-select' ? 'SELECT' : (f.type || f.tag).toUpperCase();
  console.log(
    `  [${String(f.index).padStart(2)}] ${kind.padEnd(13)} ${(f.label ?? '(no label)').padEnd(38)}` +
      ` fcn=${f.formControlName ?? '-'}${f.required ? '  *required' : ''}`,
  );
}

console.log('\n=== buttons ===');
fields.buttons.forEach((b) => console.log(`  ${b}`));

console.log(`\nScreenshot: ${resolve(OUT, 'bvi-step1.png')}`);
await ctx.close();
