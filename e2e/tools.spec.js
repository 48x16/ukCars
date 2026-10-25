// Tools: the index, quiet times for an MOT, and your car. Written to pass on both the CI
// fixture data (a few Ford and Tesla models, the real MOT summary) and the full data.

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { clickNav } from './nav.js';

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const noViolations = async (page) => expect((await new AxeBuilder({ page }).withTags(WCAG_AA).analyze()).violations).toEqual([]);

test('the Tools page and the home page link to every tool', async ({ page }) => {
  for (const path of ['./tools.html', './']) {
    await page.goto(path);
    for (const name of ['Chargers near you', 'Quiet times for an MOT', 'Your car', 'Any make, year by year', 'Top Trumps']) {
      await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
    }
  }
  await clickNav(page, 'Tools');
  await expect(page.locator('#nav [aria-current="page"]')).toHaveText('Tools'); // works with the phone menu closed
  await noViolations(page);
});

test('quiet times for an MOT: shows an area from a postcode', async ({ page }) => {
  await page.goto('./mot-times.html');
  await page.getByLabel('Postcode or postcode area').fill('bn1 1aa');
  await page.getByRole('button', { name: 'Show quiet times' }).click();
  await expect(page.getByRole('heading', { name: 'BN Brighton', level: 2 })).toBeVisible();
  await expect(page.locator('#results-summary')).toContainText('Quietest weekday time');
  await expect(page.locator('#heat tbody tr')).toHaveCount(6);
  await expect(page.locator('#months li')).toHaveCount(12);
  await expect(page).toHaveURL(/#BN$/);
  await noViolations(page);
});

test('quiet times for an MOT: explains what it cannot use', async ({ page }) => {
  await page.goto('./mot-times.html');
  await page.getByRole('button', { name: 'Show quiet times' }).click();
  await expect(page.locator('#form-errors')).toContainText('Enter a postcode or postcode area');
  await page.getByLabel('Postcode or postcode area').fill('zz');
  await page.getByRole('button', { name: 'Show quiet times' }).click();
  await expect(page.locator('#postcode-error')).toContainText('We have no MOT times for ZZ');
  await noViolations(page);
});

test('your car: shows how rare it is, the MOT and the mileage', async ({ page }) => {
  await page.goto('./your-car.html');
  const search = page.getByRole('combobox', { name: 'Your car' });
  await search.fill('fiesta');
  await page.getByRole('option', { name: /FORD FIESTA/ }).first().click();
  await page.getByLabel('Year first registered').selectOption('2015');
  await page.getByLabel('Mileage (optional)').fill('80,000');
  await page.getByRole('button', { name: 'Show my car' }).click();
  await expect(page.locator('#rare-tiles li')).toHaveCount(3);
  await expect(page.locator('#rare-summary')).toContainText('known to DVLA');
  await expect(page.locator('#mot-summary')).not.toBeEmpty();
  await expect(page.locator('#miles-result')).toContainText('cars at their MOT had done fewer miles');
  await expect(page).toHaveURL(/#ford\/ford-fiesta\/2015\/80000\/$/); // the last part, the version, is empty
  await noViolations(page);
});

test('your car: narrows to a version', async ({ page }) => {
  await page.goto('./your-car.html');
  await page.getByRole('combobox', { name: 'Your car' }).fill('fiesta');
  await page.getByRole('option', { name: /FORD FIESTA/ }).first().click();
  const version = page.getByLabel('Version (optional)');
  await expect(version).toBeEnabled();
  await version.selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Show my car' }).click();
  await expect(page.locator('#rare-tiles li').nth(2)).toContainText('versions of the Ford Fiesta');
  const summary = await page.locator('#rare-summary').textContent();
  expect(summary).toMatch(/^The Ford .+ \((petrol|diesel|.+)\) is .+ of all Ford Fiestas/);
  await page.reload();
  await expect(page.locator('#rare-summary')).toHaveText(summary); // kept in the address
});

test('your car: explains what it needs', async ({ page }) => {
  await page.goto('./your-car.html');
  await page.getByLabel('Mileage (optional)').fill('lots');
  await page.getByRole('button', { name: 'Show my car' }).click();
  await expect(page.locator('#form-errors')).toContainText('Choose your car from the list');
  await expect(page.locator('#miles-error')).toContainText('Enter the mileage as a number');
  await noViolations(page);
});

test('any make, year by year: draws the road for the chosen make', async ({ page }) => {
  await page.goto('./make.html');
  await expect(page.getByRole('heading', { name: 'Any make, year by year', level: 1 })).toBeVisible();
  await expect(page.locator('.wuk-road__year').first()).toBeVisible();
  const first = await page.locator('#make option').first().getAttribute('value');
  await page.locator('#make').selectOption(first);
  await expect(page).toHaveURL(new RegExp(`#${first}$`));
  await expect(page.locator('#road-summary')).toContainText('The best year was');
  await noViolations(page);
});

test('Top Trumps: plays two models head to head, and asks for two', async ({ page }) => {
  await page.goto('./trumps.html');
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.locator('#form-errors')).toContainText('Choose the first car');
  await page.goto('./trumps.html#ford/ford-fiesta/ford/ford-focus');
  await expect(page.locator('.wuk-trump')).toHaveCount(2);
  await expect(page.locator('.wuk-trump').first()).toContainText('On the road');
  await expect(page.locator('#play-summary')).toContainText(/wins|draw/i);
  await noViolations(page);
});
