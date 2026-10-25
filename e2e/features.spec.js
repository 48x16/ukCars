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
  { page: 'suv', title: 'The SUV takeover', sections: ['Lane by lane', 'Winners and losers'], ready: '.wuk-lane' },
  { page: 'diesel', title: 'Peak diesel', sections: ['Rise and fall'], ready: '.wuk-chart__svg' },
  { page: 'plates', title: 'Plate days', sections: ['The sawtooth', 'Plate decoder'], ready: '.wuk-plate' },
  { page: 'arrivals', title: 'The new arrivals', sections: ['Coming in to land', 'Arrivals', 'Best sellers'], ready: '.wuk-board tbody tr' },
  { page: 'workhorses', title: 'The workhorses', sections: ['High milers', 'Garage queens', 'Diesel did the miles'], ready: '.wuk-odo' },
  { page: 'built-to-last', title: 'Built to last', sections: ['Everyday champions', 'Cherished classics', 'Feeling their age'], ready: '#hero-graphic .wuk-tile' },
  { page: 'endangered', title: 'Endangered species', sections: ['Icons in decline', 'Nearly gone'], ready: '#icons > li' },
  { page: 'traffic', title: 'How Britain drives', sections: ['The van boom', 'Which roads', 'Busiest and quietest'], ready: '.wuk-chart__svg' },
  { page: 'faults', title: 'Why cars fail', sections: ['What fails', 'The usual suspects', 'As cars age', 'Petrol, diesel, electric', 'Model by model'], ready: '#age-table .wuk-heat__cell' },
  { page: 'mini', title: 'Mini, year by year', sections: ['The road so far', 'Peak Mini', 'Colours', 'Under the bonnet', 'Where Minis live'], ready: '.wuk-map__bubble' },
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
