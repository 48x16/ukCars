// Opens a page in Edge at desktop and phone widths and reports what a reviewer needs:
// every generated sentence (elements whose id ends in -summary, plus the hero), axe WCAG 2.2 AA
// violations with their targets, sideways overflow, and console errors.
//
//   node .claude/skills/check-page/scripts/check-page.mjs <page> [--base URL] [--ready SELECTOR]
//
// <page> is the file name without .html (e.g. faults). --base defaults to the dev server
// (http://localhost:5173); use http://localhost:4173 for `vite preview`. --ready is a selector
// that only exists once the data has drawn (defaults to the first filled -summary element).
// Exits 1 if axe finds violations, the page scrolls sideways, or the console logs errors.

import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(resolve(import.meta.dirname, '../../../../package.json'));
const { chromium } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const page = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!page) {
  console.error('Usage: check-page.mjs <page> [--base URL] [--ready SELECTOR]');
  process.exit(2);
}
const base = option('--base', 'http://localhost:5173');
const ready = option('--ready', null);
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const browser = await chromium.launch({ channel: 'msedge' });
let failed = false;
for (const [label, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 360, height: 800 }]]) {
  const context = await browser.newContext({ viewport });
  const tab = await context.newPage();
  const errors = [];
  tab.on('pageerror', (e) => errors.push(e.message));
  tab.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await tab.goto(`${base}/${page}.html`);
  if (ready) await tab.waitForSelector(ready, { timeout: 20_000 });
  else await tab.waitForFunction(() => [...document.querySelectorAll('[id$="-summary"]')].some((n) => n.textContent.trim()), null, { timeout: 20_000 }).catch(() => {});

  if (label === 'desktop') {
    const hero = await tab.locator('#hero-graphic').innerText().catch(() => '');
    if (hero?.trim()) console.log(`hero: ${hero.replace(/\s+/g, ' ').trim()}`);
    for (const s of await tab.$$eval('[id$="-summary"]', (nodes) => nodes.map((n) => [n.id, n.textContent.trim()]))) {
      console.log(`${s[0]}: ${s[1] || '(empty)'}`);
    }
    await tab.locator('details').evaluateAll((all) => all.forEach((d) => (d.open = true)));
  }
  const axe = await new AxeBuilder({ page: tab }).withTags(WCAG).analyze();
  const overflow = await tab.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`\n[${label}] axe: ${axe.violations.length ? '' : 'clean'}`);
  for (const v of axe.violations) console.log(`  ${v.id}: ${v.help}\n    ${v.nodes.map((n) => n.target.join(' ')).slice(0, 5).join('\n    ')}`);
  console.log(`[${label}] sideways overflow: ${overflow > 0 ? `${overflow}px` : 'none'}`);
  console.log(`[${label}] console errors: ${errors.length ? errors.join(' | ') : 'none'}`);
  failed ||= axe.violations.length > 0 || overflow > 0 || errors.length > 0;
  await context.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
