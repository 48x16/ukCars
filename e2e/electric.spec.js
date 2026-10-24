// Electric page. Written to pass on both the CI fixture data (five councils) and the full data.

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function open(page) {
  await page.goto('./electric.html');
  await expect(page.locator('.wuk-map__council').first()).toBeAttached();
}

test('is reachable from the header, which marks the current page', async ({ page }) => {
  await page.goto('./insights.html');
  await page.getByRole('navigation', { name: 'Pages' }).getByRole('link', { name: 'Electric', exact: true }).click();
  await expect(page).toHaveURL(/electric\.html$/);
  await expect(page.getByRole('link', { name: 'Electric', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('shows the headline figures, the map and every section', async ({ page }) => {
  await open(page);
  await expect(page.locator('.wuk-tile')).toHaveCount(4);
  for (const name of ['Council by council', 'Top and bottom', 'The national picture', 'Every council', 'Reading the map']) {
    await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();
  }
  // Every UK council is drawn, with London's twice (map and inset).
  await expect(page.locator('#map path.wuk-map__council')).toHaveCount(361 + 33);
  await expect(page.getByRole('img', { name: /^Map of UK councils shaded by plug-ins per 1,000 people/ })).toBeVisible();
  await expect(page.locator('#map-legend li').first()).toContainText('Under');
});

test('switches what the map is shaded by', async ({ page }) => {
  await open(page);
  await page.getByLabel('Plug-ins per public charger').check();
  await expect(page.getByRole('heading', { name: 'Plug-ins per public charger', level: 3 })).toBeVisible();
  await expect(page.getByRole('img', { name: /shaded by plug-ins per public charger/ })).toBeVisible();
  await expect(page.locator('#rank-high li').first()).toBeVisible();
});

test('finds a council from the list and outlines it on the map', async ({ page }) => {
  await open(page);
  await page.getByLabel('Find a council').selectOption({ label: 'Hammersmith and Fulham' });
  const card = page.locator('#council-card');
  await expect(card.getByRole('heading', { name: 'Hammersmith and Fulham, England' })).toBeVisible();
  await expect(card).toContainText('Public chargers');
  await expect(page.locator('.wuk-map__picked')).toHaveCount(2); // map and London inset
});

test('picks a council by clicking the map', async ({ page }) => {
  await open(page);
  const code = await page.locator('#council option').nth(1).getAttribute('value');
  const name = await page.locator('#council option').nth(1).textContent();
  await page.locator('#map path.wuk-map__council').first().waitFor();
  await page.evaluate((c) => {
    const target = [...document.querySelectorAll('#map path.wuk-map__council')].find((p) => p.__data__.properties.code === c);
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, code);
  await expect(page.getByLabel('Find a council')).toHaveValue(code);
  await expect(page.locator('#council-card h3')).toContainText(name);
});

test('has no WCAG 2.2 AA violations (axe)', async ({ page }) => {
  await open(page);
  await page.getByLabel('Find a council').selectOption({ index: 1 });
  await page.getByText('Show the data as a table').click();
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  expect(results.violations).toEqual([]);
});
