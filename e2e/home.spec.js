// The front door. Written to pass on both the CI fixture data and the full data.

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test('shows the headline number and a door to every section', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#big-number')).toHaveText(/\d/);
  await expect(page.locator('#big-label')).toContainText('cars licensed in the UK');
  for (const name of ['Explore', 'Insights', 'Electric', 'MOT']) {
    await expect(page.getByRole('heading', { name, level: 3, exact: true }).getByRole('link')).toBeVisible();
  }
  await expect(page.locator('#door-explore-value')).toHaveText(/\d/);
  for (const name of ['Out to play', 'The Bavarian battle', 'Where cars come from', 'Silver to grey']) {
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
  }
});

test('finds a car and opens it in Explore', async ({ page }) => {
  await page.goto('./');
  const input = page.getByRole('combobox', { name: 'Find a car' });
  await input.fill('fiesta');
  await expect(page.getByRole('option').first()).toBeVisible();
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(page).toHaveURL(/explore\.html#\/ford\/ford-fiesta$/);
  await expect(page.locator('.wuk-chart__hit')).toBeAttached();
});

test('the wordmark leads home from every page', async ({ page }) => {
  await page.goto('./mot.html');
  await page.getByRole('link', { name: 'What’s on UK roads' }).click();
  await expect(page.locator('#big-number')).toHaveText(/\d/);
});

test('has no WCAG 2.2 AA violations (axe)', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#big-number')).toHaveText(/\d/);
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  expect(results.violations).toEqual([]);
});
