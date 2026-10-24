// Petrol and diesel page. Written to pass on both the CI fixture data and the full data.

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { clickNav } from './nav.js';

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test('is reachable from the header, and shows every section', async ({ page }) => {
  await page.goto('./');
  await clickNav(page, 'Petrol & diesel');
  await expect(page).toHaveURL(/petrol-diesel.html$/);
  await expect(page.getByRole('heading', { name: 'Fill her up', level: 1 })).toBeVisible();
  for (const name of ['The rise and fall of diesel', 'Britain’s favourites', 'Diesel strongholds', 'Disappearing diesels', 'At the pump']) {
    await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();
  }
  await expect(page.locator('#pump-summary')).toContainText('a litre');
  await expect(page.locator('#litre li')).toHaveCount(2);
});

test('has no WCAG 2.2 AA violations (axe)', async ({ page }) => {
  await page.goto('./petrol-diesel.html');
  await expect(page.locator('#litre li').first()).toBeVisible();
  await page.locator('details').evaluateAll((all) => all.forEach((d) => (d.open = true)));
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  expect(results.violations).toEqual([]);
});
