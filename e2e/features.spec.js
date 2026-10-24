// Feature pages. Written to pass on both the CI fixture data and the full data.

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { clickNav } from './nav.js';

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const FEATURES = [
  { page: 'out-to-play', title: 'Out to play', sections: ['Taxed for summer', 'The sawtooth'], ready: '.wuk-saw' },
  { page: 'bavarian', title: 'The Bavarian battle', sections: ['The race', 'What they run on', 'The electric race', 'Best sellers'], ready: '.wuk-podium' },
  { page: 'origins', title: 'Where cars come from', sections: ['If Britain’s cars were 100', 'Then and now', 'Country by country'], ready: '.wuk-picto' },
  { page: 'colours', title: 'Silver to grey', sections: ['Colour of the year', 'Rise and fall', 'Which makes dare', 'Electric shades'], ready: '.wuk-chip' },
];

test('the Features index links to every feature, and the header marks it', async ({ page }) => {
  await page.goto('./');
  await clickNav(page, 'Features');
  await expect(page).toHaveURL(/features\.html$/);
  await expect(page.locator('#nav [aria-current="page"]')).toHaveText('Features'); // works with the phone menu closed
  for (const f of FEATURES) await expect(page.getByRole('link', { name: f.title, exact: true })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  expect(results.violations).toEqual([]);
});

for (const f of FEATURES) {
  test(`${f.title}: shows every section and has no WCAG 2.2 AA violations`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`./${f.page}.html`);
    await expect(page.getByRole('heading', { name: f.title, level: 1 })).toBeVisible();
    await expect(page.locator(f.ready).first()).toBeAttached();
    for (const name of f.sections) await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();
    await page.locator('details').evaluateAll((all) => all.forEach((d) => (d.open = true)));
    const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
    expect(results.violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}
