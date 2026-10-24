// Insights page. Written to pass on both the CI fixture data and the full DfT data.

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { clickNav } from './nav.js';

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function open(page) {
  await page.goto('./insights.html');
  await expect(page.locator('.wuk-slope')).toBeAttached();
}

test('is reachable from the header, which marks the current page', async ({ page }) => {
  await page.goto('./');
  await clickNav(page, 'Insights');
  await expect(page).toHaveURL(/insights\.html$/);
  await expect(page.locator('#nav [aria-current="page"]')).toHaveText('Insights'); // works with the phone menu closed
});

test('shows the headline figures and every section', async ({ page }) => {
  await open(page);
  await expect(page.locator('.wuk-tile')).toHaveCount(4);
  const sections = [
    'Quickest dying cars',
    'Fastest growing cars',
    'The rise and fall of diesel',
    'The electric surge',
    'New arrivals',
    'Lost makes',
    'Nearly extinct',
    'Supercars and luxury',
    'Hot hatch heroes',
    'Garage queens',
    'Make leaderboard',
  ];
  for (const name of sections) {
    await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();
  }
  await expect(page.locator('#fuel-summary')).toContainText('Diesel peaked at');
});

test('lets you follow one make through the rankings with the keyboard', async ({ page }) => {
  await open(page);
  const first = page.locator('.wuk-slope__make').first();
  await expect(first).toHaveAttribute('aria-label', /: \d+(st|nd|rd|th) in .+, \d+(st|nd|rd|th) in /);

  await first.focus();
  await expect(page.locator('.wuk-slope')).toHaveClass(/wuk-slope--focus/);
  await expect(first).toHaveClass(/is-active/);
  await first.blur();
  await expect(page.locator('.wuk-slope')).not.toHaveClass(/wuk-slope--focus/);
});

test('shows a back to top link once the header has scrolled away', async ({ page }) => {
  await open(page);
  const link = page.getByRole('link', { name: 'Back to top' });
  await expect(link).toBeHidden();
  await page.getByRole('heading', { name: 'Garage queens' }).scrollIntoViewIfNeeded();
  await expect(link).toBeInViewport();
  await link.click();
  await expect(page).toHaveURL(/#top$/);
  await expect(page.locator('#top')).toBeInViewport();
  await expect(link).toBeHidden();
});

test('has no WCAG 2.2 AA violations (axe)', async ({ page }) => {
  await open(page);
  // Open every table so axe checks them too (clicking each in turn is flaky on phones, as each reflows the page).
  await page.locator('details').evaluateAll((all) => all.forEach((d) => (d.open = true)));
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  expect(violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) ${v.helpUrl}`)).toEqual([]);
});

test('works offline once viewed', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Service worker behaviour is the same on every screen size');
  await open(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.locator('.wuk-slope')).toBeAttached();

  await context.setOffline(true);
  await context.route('**/*', (route) => route.abort('internetdisconnected'));
  await page.reload();
  await expect(page.locator('.wuk-tile')).toHaveCount(4);
  await expect(page.locator('#offline')).toBeVisible();
});
