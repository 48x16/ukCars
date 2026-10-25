// "The SUV takeover": new cars by body style since 2001, one 100% bar a year, like lanes on a
// road. Body styles are our own (DVLA records none). Every fact is built from the data.

import { hidden, stackedBar } from './feature-charts.js';
import { $, fill, startFeature } from './feature-page.js';
import { el, renderTable } from './insight-charts.js';

const count = new Intl.NumberFormat('en-GB');
const pct0 = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
const sum = (values) => values.reduce((a, b) => a + b, 0);
/** "1 in 25", for a share. */
const oneIn = (share) => `1 in ${Math.round(1 / share)}`;

function tile(value, label) {
  const li = el('li', 'wuk-tile');
  li.append(el('span', 'wuk-tile__value', value), el('span', 'wuk-tile__label', label));
  return li;
}

function facts(data) {
  const full = data.years.map((_, i) => i).filter((i) => data.years[i] !== data.partial?.year);
  const share = (id, i) => data.bodies.find((b) => b.id === id).values[i] / data.totals[i];
  const first = full[0];
  const latest = full.at(-1);
  const overtook = full.find((i) => share('suv', i) > share('hatch', i));
  const half = full.find((i) => share('suv', i) >= 0.5);
  return { full, share, first, latest, overtook, half };
}

function renderHero(data, f) {
  const y = (i) => data.years[i];
  const tiles = el('ul', 'wuk-tiles');
  tiles.append(
    tile(pct0.format(f.share('suv', f.latest)), `of new cars in ${y(f.latest)} were SUVs or crossovers`),
    tile(pct0.format(f.share('suv', f.first)), `in ${y(f.first)}: about ${oneIn(f.share('suv', f.first))}`),
    tile(pct0.format(f.share('hatch', f.latest)), `were hatchbacks or small cars, from ${pct0.format(f.share('hatch', f.first))} in ${y(f.first)}`),
  );
  $('hero-graphic').replaceChildren(tiles);
}

function renderLanes(data, f) {
  const y = (i) => data.years[i];
  const segments = (i) => [
    ...data.bodies.map((b) => ({ id: b.id, label: b.label, value: b.values[i] })),
    { id: 'none', label: 'Not classified', value: data.unclassified[i] },
  ];
  $('lanes-legend').replaceChildren(
    ...segments(0).map((s) => {
      const item = el('li', 'wuk-legend__item');
      item.append(el('span', `wuk-fill-key wuk-fill--${s.id}`), el('span', '', s.label));
      return item;
    }),
  );
  $('lanes').replaceChildren(
    ...data.years.map((year, i) => {
      const row = el('li', 'wuk-stackrow wuk-lane');
      const label = year === data.partial?.year ? `${year} so far` : String(year);
      row.append(el('span', 'wuk-stackrow__label', label), ...stackedBar(segments(i), (id) => `wuk-fill--${id}`, { minLabel: 0.06 }));
      return row;
    }),
  );
  $('lanes-summary').textContent =
    `SUVs and crossovers were ${pct0.format(f.share('suv', f.first))} of new cars in ${y(f.first)}.` +
    (f.overtook !== undefined ? ` They overtook hatchbacks and small cars in ${y(f.overtook)}` : '') +
    (f.half !== undefined ? `, and passed half of all new cars in ${y(f.half)}.` : '.') +
    ` In ${y(f.latest)} they were ${pct0.format(f.share('suv', f.latest))}.`;
  renderTable($('lanes-table'), {
    caption: 'New cars by body style, Great Britain',
    columns: [
      { label: 'Year', value: (i) => (y(i) === data.partial?.year ? `${y(i)} (to ${data.latestQuarter})` : String(y(i))) },
      ...data.bodies.map((b) => ({ label: b.label, value: (i) => pct0.format(b.values[i] / data.totals[i]), numeric: true })),
      { label: 'Not classified', value: (i) => pct0.format(data.unclassified[i] / data.totals[i]), numeric: true },
      { label: 'New cars', value: (i) => count.format(data.totals[i]), numeric: true },
    ],
    rows: data.years.map((_, i) => i),
  });
}

/** Each style's biggest models: a bar for the latest year, a marker at their best. */
function renderLeaders(data, f) {
  const y = (i) => data.years[i];
  $('leaders').replaceChildren(
    ...data.bodies.map((b) => {
      const col = el('div', 'wuk-column');
      col.append(el('h3', 'govuk-heading-s', b.label));
      const scale = Math.max(...b.leaders.flatMap((m) => m.values.slice(0, f.latest + 1)));
      const ol = el('ol', 'wuk-bars-simple');
      for (const m of b.leaders) {
        const best = m.values.indexOf(Math.max(...m.values.slice(0, f.latest + 1)));
        const li = el('li', 'wuk-bar-simple');
        const track = el('span', 'wuk-bar-simple__track');
        track.setAttribute('aria-hidden', 'true');
        const now = el('span', 'wuk-bar-simple__now');
        now.style.width = `${(m.values[f.latest] / scale) * 100}%`;
        const then = el('span', 'wuk-bar-simple__then');
        then.style.left = `${(m.values[best] / scale) * 100}%`;
        track.append(now, then);
        const value = el('span', 'wuk-bar-simple__value', count.format(m.values[f.latest]));
        value.append(hidden(` in ${y(f.latest)}; best year ${y(best)}, ${count.format(m.values[best])}`));
        li.append(el('span', 'wuk-bar-simple__name', m.label), value, track);
        ol.append(li);
      }
      col.append(ol);
      return col;
    }),
  );
  const note = el('p', 'govuk-body-s wuk-column-note');
  const key = el('span', 'wuk-then-key');
  key.setAttribute('aria-hidden', 'true');
  note.append(key, ` Marker: each model’s best year since ${y(0)}`);
  $('leaders').append(note);
  fill('latest-year', String(y(f.latest)));
  const mpv = data.bodies.find((b) => b.id === 'mpv');
  const mpvPeak = mpv.values.indexOf(Math.max(...mpv.values.slice(0, f.latest + 1)));
  $('leaders-summary').textContent =
    `People carriers peaked in ${y(mpvPeak)}, at ${count.format(mpv.values[mpvPeak])} new cars (${pct0.format(f.share('mpv', mpvPeak))}); ` +
    `in ${y(f.latest)} there were ${count.format(mpv.values[f.latest])}. Saloons and estates fell from ${pct0.format(f.share('saloon', f.first))} to ${pct0.format(f.share('saloon', f.latest))}.`;
}

startFeature('suv', (data) => {
  fill('latest-quarter', data.latestQuarter);
  const f = facts(data);
  const covered = 1 - sum(data.unclassified) / sum(data.totals);
  fill('covered', pct0.format(covered));
  renderHero(data, f);
  renderLanes(data, f);
  renderLeaders(data, f);
});
