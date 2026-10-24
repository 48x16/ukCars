// Clicks a link in the header. On phones the links sit behind the Menu button, so it opens
// that first, as a person would.
export async function clickNav(page, name) {
  const menu = page.getByRole('button', { name: 'Menu' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: 'Pages' }).getByRole('link', { name, exact: true }).click();
}
