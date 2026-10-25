// "The new arrivals": Chinese makes among new cars, from SAIC's MGs in 2011 to BYD, Omoda,
// Jaecoo and the rest, on an arrivals board. Every fact is built from the data.

import { format } from 'd3';
import { createChart } from './chart.js';
import { $, fill, startFeature } from './feature-page.js';
import { el, emptyNote, renderTable } from './insight-charts.js';
import { bars } from './make-story.js';

const count = new Intl.NumberFormat('en-GB');
const pct1 = new Intl.NumberFormat('en-GB', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** The chart starts with SAIC's MGs. */
const FROM = 2011;

function tile(value, label) {
  const li = el('li', 'wuk-tile');
  li.append(el('span', 'wuk-tile__value', value), el('span', 'wuk-tile__label', label));
  return li;
}

startFeature('arrivals', (data) => {
  fill('latest-quarter', data.latestQuarter);
  const y = (i) => data.years[i];
  const full = data.years.map((_, i) => i).filter((i) => y(i) !== data.partial?.year);
  const latest = full.at(-1);
  const share = (i) => (data.totals[i] ? data.chinese[i] / data.totals[i] : 0);
  const onSale = data.makes.filter((m) => m.values[latest] >= 100);

  const tiles = el('ul', 'wuk-tiles');
  tiles.append(
    tile(pct1.format(share(latest)), `of new cars in ${y(latest)} were from Chinese makes` + (share(latest) ? `: about 1 in ${Math.round(1 / share(latest))}` : '')),
    tile(count.format(data.chinese[latest]), `new cars in ${y(latest)}, from ${count.format(data.chinese[latest - 5] ?? 0)} five years before`),
    tile(String(onSale.length), `Chinese makes with 100 or more new cars in ${y(latest)}`),
  );
  $('hero-graphic').replaceChildren(tiles);

  const start = Math.max(0, data.years.indexOf(FROM));
  const leader = data.makes[0];
  const small = (v) => (v < 0.0005 ? 'under 0.1%' : pct1.format(v));
  $('rise-summary').textContent =
    `Chinese makes went from ${small(share(start))} of new cars in ${y(start)} to ${pct1.format(share(latest))} in ${y(latest)}. ` +
    (leader ? `${leader.label} sold the most in ${y(latest)}: ${count.format(leader.values[latest])}.` : '') +
    (data.partial ? ` So far in ${data.partial.year}, they're ${pct1.format(share(data.years.length - 1))}.` : '');
  createChart($('rise-chart'), { formatValue: pct1.format, formatTick: format('.0%'), totalLabel: null }).update({
    quarters: data.years.slice(start).map((year) => (year === data.partial?.year ? `${year} so far` : String(year))),
    dates: data.years.slice(start).map((year) => new Date(Date.UTC(year, 6, 1))),
    series: [{ id: 'electric', label: 'Chinese makes', values: data.years.slice(start).map((_, i) => share(start + i)) }],
    sorn: null,
    summary: `Line chart of Chinese makes' share of new cars, ${y(start)} to ${y(data.years.length - 1)}. ${$('rise-summary').textContent}`,
  });

  // The arrivals board: each make, when it arrived (its first year with 100 new cars) and how it's doing.
  const status = (m) => {
    const now = m.values[latest];
    const before = m.values[latest - 1] ?? 0;
    if (m.first === y(latest)) return 'Just landed';
    if (!before) return 'Arrived';
    const change = (now - before) / before;
    return change >= 0.5 ? 'Climbing fast' : change >= 0 ? 'Climbing' : 'Descending';
  };
  const board = $('board');
  const head = el('thead');
  const headRow = el('tr');
  for (const h of ['Make', 'Arrived', `New cars, ${y(latest)}`, 'Status']) {
    const th = el('th', '', h);
    th.scope = 'col';
    headRow.append(th);
  }
  head.append(headRow);
  const body = el('tbody');
  for (const m of [...data.makes].sort((a, b) => a.first - b.first || b.values[latest] - a.values[latest])) {
    const tr = el('tr');
    const name = el('th', '', m.label);
    name.scope = 'row';
    const st = status(m);
    tr.append(name, el('td', '', String(m.first)), el('td', 'wuk-board__num', count.format(m.values[latest])), el('td', `wuk-board__status${/fast|landed/i.test(st) ? ' wuk-board__status--hot' : ''}`, st));
    body.append(tr);
  }
  if (!data.makes.length) {
    const tr = el('tr');
    const td = el('td', '', 'No Chinese makes in this data yet.');
    td.colSpan = 4;
    tr.append(td);
    body.append(tr);
  }
  board.replaceChildren(el('caption', 'govuk-visually-hidden', 'Chinese makes: when each arrived, new cars in the latest year and how it is doing'), head, body);

  const models = data.models.map((m) => ({ label: m.label, value: m.values[latest] })).filter((m) => m.value > 0);
  $('models').replaceChildren(models.length ? bars(models, Math.max(...models.map((m) => m.value))) : emptyNote());
  fill('latest-year', String(y(latest)));

  renderTable($('rise-table'), {
    caption: 'New cars from Chinese makes, Great Britain',
    columns: [
      { label: 'Year', value: (i) => (y(i) === data.partial?.year ? `${y(i)} (to ${data.latestQuarter})` : String(y(i))) },
      { label: 'Chinese makes', value: (i) => count.format(data.chinese[i]), numeric: true },
      { label: 'Share of new cars', value: (i) => pct1.format(share(i)), numeric: true },
    ],
    rows: data.years.map((_, i) => i).slice(start),
  });
});
