// MOT page. Written to pass on both the CI fixture data and the full data: the MOT summary is
// real either way, but with fixture licensing data few models match DVLA's.

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function open(page) {
  await page.goto('./mot.html');
  await expect(page.locator('.wuk-map__bubble').first()).toBeAttached();
}

test('is reachable from the header, which marks the current page', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('navigation', { name: 'Pages' }).getByRole('link', { name: 'MOT', exact: true }).click();
  await expect(page).toHaveURL(/mot\.html$/);
  await expect(page.getByRole('link', { name: 'MOT', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('shows the headline figures and every section', async ({ page }) => {
  await open(page);
  await expect(page.locator('.wuk-tile')).toHaveCount(4);
  for (const name of ['Age before beauty', 'Fifty shades of grey', 'Where cars pass', 'Built to last', 'Plate days', 'About these figures']) {
    await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();
  }
  await expect(page.locator('#age-summary')).toContainText('passed first time');
  await expect(page.locator('#colour-summary')).toContainText('most common colour');
  await expect(page.getByRole('img', { name: /^Stacked area chart of the colours/ })).toBeVisible();
  await expect(page.locator('#months li')).toHaveCount(12);
});

test('reads the colour chart with the keyboard', async ({ page }) => {
  await open(page);
  const chart = page.getByRole('img', { name: /^Stacked area chart of the colours/ });
  await chart.focus();
  const tooltip = page.locator('#paint-chart .wuk-tooltip');
  await expect(tooltip).toBeVisible();
  const latest = await tooltip.locator('.wuk-tooltip__title').textContent();
  await page.keyboard.press('Home');
  await expect(tooltip.locator('.wuk-tooltip__title')).not.toHaveText(latest);
});

test('maps postcode areas and finds one from the list', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('img', { name: /^Map of Great Britain's postcode areas/ })).toBeVisible();
  await page.getByLabel('Find a postcode area').selectOption('BN');
  await expect(page.locator('#area-card').getByRole('heading', { name: 'BN Brighton' })).toBeVisible();
  await expect(page.locator('.wuk-map__picked')).toHaveCount(1);
  await page.locator('#metric-age').check();
  await expect(page.getByRole('heading', { name: 'Average age', level: 3 })).toBeVisible();
  await expect(page.locator('#area-high li')).toHaveCount(10);
});

test('has no WCAG 2.2 AA violations (axe)', async ({ page }) => {
  await open(page);
  await page.getByLabel('Find a postcode area').selectOption({ index: 1 });
  // Open every table so axe checks them too. (Clicking each in turn is flaky on the phone
  // layout, where each opened table reflows the page under the next click.)
  await page.locator('details').evaluateAll((all) => all.forEach((d) => (d.open = true)));
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  expect(results.violations).toEqual([]);
});
