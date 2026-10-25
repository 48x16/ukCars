// "Built to last": which models pass their MOT first time at 15 years or older. Every fact is
// built from the data.

import { displayName } from './feature-charts.js';
import { $, fill, startFeature } from './feature-page.js';
import { el, emptyNote, modelLink } from './insight-charts.js';
import { bars } from './make-story.js';

const count = new Intl.NumberFormat('en-GB');
const pct0 = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });

function tile(value, label) {
  const li = el('li', 'wuk-tile');
  li.append(el('span', 'wuk-tile__value', value), el('span', 'wuk-tile__label', label));
  return li;
}

/** Ranked models as bars of their pass rate, each name linking to Explore, with the average marked. */
function ranked(list, rows, national) {
  if (!rows.length) return list.replaceChildren(emptyNote());
  const ol = bars(
    rows.map((m) => ({ label: displayName(m.name), value: m.rate, text: pct0.format(m.rate) })),
    1,
  );
  [...ol.querySelectorAll('.wuk-road__model')].forEach((li, i) => {
    const name = li.querySelector('.wuk-road__name');
    const a = el('a', 'govuk-link', name.textContent);
    a.href = modelLink(rows[i]);
    name.replaceChildren(a);
    const mark = el('span', 'wuk-road__average');
    mark.style.left = `${national * 100}%`;
    li.querySelector('.wuk-road__track').append(mark);
  });
  ol.classList.add('wuk-road__models--links');
  list.replaceChildren(ol);
}

startFeature('built-to-last', (data) => {
  fill('mot-year', String(data.year));
  fill('latest-quarter', `${data.year} MOT tests`);
  fill('band', data.band);
  fill('national', pct0.format(data.national));
  const best = data.everyday[0];
  const worst = data.worst[0];
  const tiles = el('ul', 'wuk-tiles');
  tiles.append(tile(pct0.format(data.national), `of cars ${data.band} old passed their MOT first time in ${data.year}`));
  if (best) tiles.append(tile(pct0.format(best.rate), `for the ${displayName(best.name)}, the best of the everyday cars`));
  if (worst) tiles.append(tile(pct0.format(worst.rate), `for the ${displayName(worst.name)}, the lowest`));
  $('hero-graphic').replaceChildren(tiles);

  ranked($('everyday'), data.everyday, data.national);
  ranked($('best'), data.best, data.national);
  ranked($('worst'), data.worst, data.national);
  if (best) $('everyday-summary').textContent =
    `Of the cars still common at ${data.band}, the ${displayName(best.name)} passes first time most often: ${pct0.format(best.rate)}, from ${count.format(best.tests)} tests. ` +
    `Then ${data.everyday.slice(1, 4).map((m) => `the ${displayName(m.name)} (${pct0.format(m.rate)})`).join(', ')}.`;
  if (data.best.length) $('best-summary').textContent =
    `The very best are cherished cars: the ${displayName(data.best[0].name)} passes ${pct0.format(data.best[0].rate)} of the time. Few are left, and they're looked after.`;
  if (worst) $('worst-summary').textContent =
    `The ${displayName(worst.name)} passes first time ${pct0.format(worst.rate)} of the time at ${data.band}, against ${pct0.format(data.national)} for all cars that age.`;
});
