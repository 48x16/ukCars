// "Endangered species": once-common models disappearing from Britain's roads, each as a row of
// cars, solid for those still licensed. Every fact is built from the data.

import { Car } from 'lucide';
import { displayName, hidden, icon } from './feature-charts.js';
import { $, fill, startFeature } from './feature-page.js';
import { el, modelLink } from './insight-charts.js';

const count = new Intl.NumberFormat('en-GB');
const pct0 = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
/** Cars in each row: one per twentieth of its most since the data began. */
const ICONS = 20;

function tile(value, label) {
  const li = el('li', 'wuk-tile');
  li.append(el('span', 'wuk-tile__value', value), el('span', 'wuk-tile__label', label));
  return li;
}

function card(m, start) {
  const li = el('li', 'wuk-species');
  const name = el('a', 'govuk-link wuk-species__name', displayName(m.name));
  name.href = modelLink(m);
  const left = Math.round((m.latest / m.peak) * ICONS);
  const row = el('span', 'wuk-species__cars');
  row.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < ICONS; i++) row.append(icon(Car, i < left ? 'wuk-species__car' : 'wuk-species__car wuk-species__car--gone'));
  const since = m.peakQuarter === start ? `since ${start}` : `since its most, in ${m.peakQuarter}`;
  li.append(
    el('h3', 'govuk-heading-s wuk-species__title', ''),
    row,
    el('p', 'wuk-species__left', `${count.format(m.latest)} left`),
    el('p', 'govuk-body-s wuk-species__facts', `${pct0.format(m.fall)} gone ${since}, from ${count.format(m.peak)}. ${count.format(m.perDay)} fewer every day.` + (m.goneBy ? ` At that rate, the last goes in ${m.goneBy}.` : '')),
  );
  li.firstChild.append(name);
  row.after(hidden(`${left} of ${ICONS} cars left.`));
  return li;
}

startFeature('endangered', (data) => {
  const [start, latest] = data.quarters;
  fill('latest-quarter', latest);
  fill('first-quarter', start);
  const top = data.icons[0];
  const quickest = [...data.icons].sort((a, b) => b.perDay - a.perDay)[0];
  const tiles = el('ul', 'wuk-tiles');
  tiles.append(
    tile(count.format(quickest.perDay), `a day: how fast the ${displayName(quickest.name)} is leaving the road, over the last year`),
    tile(count.format(top.latest), `left of the ${displayName(top.name)}, from ${count.format(top.peak)} in ${top.peakQuarter}`),
  );
  $('hero-graphic').replaceChildren(tiles);
  $('icons').replaceChildren(...data.icons.map((m) => card(m, start)));
  $('nearly').replaceChildren(...data.nearlyGone.map((m) => card(m, start)));
  const lostAll = data.icons.reduce((n, m) => n + m.peak - m.latest, 0);
  const fastest = [...data.icons].sort((a, b) => b.perDay - a.perDay)[0];
  $('icons-summary').textContent =
    `These ${data.icons.length} once-everywhere models have lost ${count.format(lostAll)} cars between them since ${start}. ` +
    `The ${displayName(top.name)} has lost the most, ${count.format(top.peak - top.latest)}; the ${displayName(fastest.name)} is going fastest now, ${count.format(fastest.perDay)} a day.`;
  const nearly = data.nearlyGone[0];
  $('nearly-summary').textContent = nearly
    ? `The ${displayName(nearly.name)} had ${count.format(nearly.peak)} licensed in ${nearly.peakQuarter}. Now there are ${count.format(nearly.latest)}.`
    : '';
});
