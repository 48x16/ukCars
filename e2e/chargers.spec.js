// Chargers near you. Written to pass on both the CI fixture data (BN1 and SW1A postcodes,
// chargers around Brighton) and the full data.

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function find(page, postcode) {
  await page.getByLabel('Postcode').fill(postcode);
  await page.getByRole('button', { name: 'Find chargers' }).click();
}

const speeds = (page) =>
  page.locator('.wuk-charger').evaluateAll((items) =>
    items.map((li) => {
      const dd = [...li.querySelectorAll('dt')].find((dt) => dt.textContent === 'Top speed')?.nextElementSibling;
      return Number.parseFloat(dd?.textContent) || 0;
    }),
  );
const distances = (page) =>
  page.locator('.wuk-charger').evaluateAll((items) =>
    items.map((li) => Number.parseFloat([...li.querySelectorAll('dt')].find((dt) => dt.textContent === 'Distance').nextElementSibling.textContent)),
  );

test('is reachable from the Electric page', async ({ page }) => {
  await page.goto('./electric.html');
  await page.getByRole('link', { name: 'Find chargers near you' }).click();
  await expect(page.getByRole('heading', { name: 'Chargers near you', level: 1 })).toBeVisible();
});

test('lists chargers near a postcode fastest first, or nearest first', async ({ page }) => {
  await page.goto('./chargers.html');
  await find(page, 'bn1 1aa');
  await expect(page.locator('.wuk-charger').first()).toBeVisible();
  await expect(page.getByRole('status')).toContainText('of BN1 1AA, fastest first');
  const fastest = await speeds(page);
  expect(fastest).toEqual([...fastest].sort((a, b) => b - a));

  await page.getByLabel('Nearest first').check();
  await page.getByRole('button', { name: 'Find chargers' }).click();
  await expect(page.getByRole('status')).toContainText('nearest first');
  const near = await distances(page);
  expect(near).toEqual([...near].sort((a, b) => a - b));
  await expect(page).toHaveURL(/#BN11AA\/nearest\/5\/0$/);
});

test('restores a search from the address', async ({ page }) => {
  await page.goto('./chargers.html#BN11AA/fastest/10/0');
  await expect(page.locator('.wuk-charger').first()).toBeVisible();
  await expect(page.getByLabel('Within')).toHaveValue('10');
});

test('explains a postcode it cannot use', async ({ page }) => {
  await page.goto('./chargers.html');
  await find(page, '');
  await expect(page.locator('#form-errors')).toContainText('Enter a postcode');
  await find(page, 'hello');
  await expect(page.locator('#postcode-error')).toContainText('Enter a full postcode, like BN1 1AA');
  await find(page, 'ZZ9 9ZZ');
  await expect(page.locator('#postcode-error')).toContainText("We couldn't find ZZ9 9ZZ");
});

test('has no WCAG 2.2 AA violations (axe), with results and with an error', async ({ page }) => {
  await page.goto('./chargers.html');
  await find(page, 'BN1 1AA');
  await expect(page.locator('.wuk-charger').first()).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG_AA).analyze()).violations).toEqual([]);
  await find(page, 'hello');
  await expect(page.locator('#postcode-error')).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG_AA).analyze()).violations).toEqual([]);
});
