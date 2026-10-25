// "The workhorses": the models doing the most miles a year, and the fewest, from a year of MOT
// tests. Every fact is built from the data.

import { displayName } from './feature-charts.js';
import { $, fill, startFeature } from './feature-page.js';
import { el, emptyNote, modelLink } from './insight-charts.js';
import { bars } from './make-story.js';

const count = new Intl.NumberFormat('en-GB');
const FUELS = { petrol: 'Petrol', diesel: 'Diesel', hybrid: 'Hybrid', electric: 'Electric' };

/** A milometer: one boxed digit per figure. */
function odometer(miles) {
  const box = el('span', 'wuk-odo');
  box.setAttribute('aria-hidden', 'true');
  for (const d of String(miles).padStart(6, '0')) box.append(el('span', 'wuk-odo__digit', d));
  return box;
}

/** Ranked models as bars, each name linking to Explore. */
function ranked(list, rows, scale) {
  if (!rows.length) return list.replaceChildren(emptyNote());
  const ol = bars(
    rows.map((m) => ({ label: displayName(m.name), value: m.milesPerYear, text: count.format(m.milesPerYear) })),
    scale,
  );
  [...ol.querySelectorAll('.wuk-road__name')].forEach((node, i) => {
    const a = el('a', 'govuk-link', node.textContent);
    a.href = modelLink(rows[i]);
    node.replaceChildren(a);
  });
  ol.classList.add('wuk-road__models--links');
  list.replaceChildren(ol);
}

startFeature('workhorses', (data) => {
  fill('mot-year', String(data.year));
  fill('latest-quarter', `${data.year} MOT tests`);
  fill('ranked', count.format(data.ranked));
  const top = data.top[0];
  const hero = el('div', 'wuk-odo-hero');
  hero.append(
    odometer(top?.milesPerYear ?? data.national),
    el(
      'p',
      'wuk-bignum__label',
      top
        ? `miles a year: the ${displayName(top.name)}, the hardest-working car at the MOT in ${data.year}. The average car does ${count.format(data.national)}.`
        : `miles a year: the average car at the MOT in ${data.year}.`,
    ),
  );
  $('hero-graphic').replaceChildren(hero);

  const scale = top?.milesPerYear ?? 1;
  ranked($('high'), data.top, scale);
  ranked($('bottom'), data.bottom, scale);
  if (top) {
    const times = top.milesPerYear / data.national;
    $('high-summary').textContent =
      `The ${displayName(top.name)} averages ${count.format(top.milesPerYear)} miles a year, ${times >= 2 ? 'more than twice' : `${times.toFixed(1)} times`} the ${count.format(data.national)} of the average car.` +
      (data.top.length > 1 ? ` Next: ${data.top.slice(1, 4).map((m) => displayName(m.name)).join(', ')}. Many will be taxis and private hire cars.` : '');
    const low = data.bottom[0];
    $('bottom-summary').textContent =
      `At the other end, the ${displayName(low.name)} averages ${count.format(low.milesPerYear)} miles a year. Classics, sports cars and second cars come out for high days and holidays.`;
  }

  // Each fuel's average mileage at each age.
  const rows = data.ageBands.map((label, b) => ({ label, fuels: Object.entries(data.fuels).filter(([, v]) => v[b] !== null).map(([id, v]) => ({ id, miles: v[b] })) }));
  const max = Math.max(...rows.flatMap((r) => r.fuels.map((f) => f.miles)));
  $('fuels').replaceChildren(
    ...rows.map((r) => {
      const group = el('div', 'wuk-fuel-band');
      group.append(el('h3', 'govuk-heading-s', r.label));
      group.append(bars(r.fuels.map((f) => ({ label: FUELS[f.id], value: f.miles })), max));
      return group;
    }),
  );
  const at = (id, b) => data.fuels[id]?.[b];
  $('fuels-summary').textContent =
    `At ${data.ageBands[0]} old, diesels have done ${count.format(at('diesel', 0))} miles on average, against ${count.format(at('petrol', 0))} for petrol cars: ` +
    `drivers with big mileages tended to choose diesel. Electric cars that age have done ${count.format(at('electric', 0))}.`;
});
