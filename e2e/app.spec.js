// End-to-end tests: real browser, production build, served data.
// Written to pass on both the CI fixture data and the full DfT data.

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function open(page, path = './') {
  await page.goto(path);
  await expect(page.locator('.wuk-chart__hit')).toBeAttached();
}

/** Fails with a readable list: rule, what's wrong, and how many elements. */
async function expectNoAxeViolations(page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  const summary = violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} elements) ${v.helpUrl}`);
  expect(summary).toEqual([]);
}

test('shows the most licensed model on first load', async ({ page }) => {
  await open(page);
  await expect(page.locator('#chart-title')).toContainText('licensed cars by fuel type');
  await expect(page.locator('#stat-value')).not.toBeEmpty();
  await expect(page.locator('.wuk-legend__item').first()).toBeVisible();
});

test('finds a model with keyboard-only search', async ({ page }) => {
  await open(page);
  const search = page.getByRole('combobox', { name: 'Find a car' });
  await search.fill('fiesta');
  await expect(page.getByRole('listbox').getByRole('option', { name: /FORD FIESTA/ })).toBeVisible();
  await expect(search).toHaveAttribute('aria-expanded', 'true');

  await search.press('ArrowDown');
  await expect(search).toHaveAttribute('aria-activedescendant', 'search-option-0');
  await search.press('Enter');

  await expect(page.locator('#chart-title')).toContainText('FORD FIESTA');
  await expect(page).toHaveURL(/#\/ford\/ford-fiesta$/);
});

test('opens a model from a shared link', async ({ page }) => {
  await open(page, './#/ford/ford-fiesta');
  await expect(page.locator('#chart-title')).toContainText('FORD FIESTA');
  await expect(page.locator('#model')).toHaveValue('ford-fiesta');
});

test('reads each quarter from the keyboard', async ({ page }) => {
  await open(page);
  const chart = page.locator('.wuk-chart__svg');
  await chart.focus();
  const title = page.locator('.wuk-tooltip__title');
  await expect(title).toBeVisible();
  const latest = await title.textContent();

  await chart.press('ArrowLeft');
  await expect(title).not.toHaveText(latest);
  await chart.press('End');
  await expect(title).toHaveText(latest);
});

test('shows every value in the data table', async ({ page }) => {
  await open(page);
  await page.getByText('Show the data as a table').click();
  const rows = page.locator('#data-table tbody tr');
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(1);
});

test.describe('accessibility (WCAG 2.2 AA, axe)', () => {
  test('page', async ({ page }) => {
    await open(page);
    await expectNoAxeViolations(page);
  });

  test('with search results open', async ({ page }) => {
    await open(page);
    await page.getByRole('combobox', { name: 'Find a car' }).fill('f');
    await expect(page.getByRole('listbox')).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('with the data table open', async ({ page }) => {
    await open(page);
    await page.getByText('Show the data as a table').click();
    await expectNoAxeViolations(page);
  });
});

test('keeps viewed models available offline', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Service worker behaviour is the same on every screen size');

  await open(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // From here the service worker controls the page.
  await expect(page.locator('.wuk-chart__hit')).toBeAttached();
  const viewed = await page.locator('#chart-title').textContent();

  // setOffline flips navigator.onLine; route() also fails the service worker's own fetches.
  await context.setOffline(true);
  await context.route('**/*', (route) => route.abort('internetdisconnected'));
  await page.reload();
  await expect(page.locator('#chart-title')).toHaveText(viewed);
  await expect(page.locator('#offline')).toBeVisible();

  // A make that hasn't been viewed can't be shown, and says why.
  const makes = await page.locator('#make option').evaluateAll((options) => options.map((o) => o.value));
  await page.selectOption('#make', makes[makes.length - 1]);
  await expect(page.locator('#error-message')).toContainText("hasn't been viewed on this device yet");
  await expect(page.locator('#results')).toBeHidden();
});
