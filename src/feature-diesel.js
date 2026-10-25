// "Peak diesel": the rise and fall of diesel among new cars since 2001, and what replaced it.
// Every fact is built from the data.

import { format } from 'd3';
import { createChart } from './chart.js';
import { $, fill, startFeature } from './feature-page.js';
import { el, renderTable } from './insight-charts.js';

const count = new Intl.NumberFormat('en-GB');
const pct0 = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });

/**
 * Moments in diesel's story, shown against that year's share. Dates are public record:
 * the VW emissions scandal broke in September 2015, and from April 2018 new diesels not
 * meeting the RDE2 standard paid a higher first year of road tax.
 */
const MOMENTS = [
  { year: 2015, text: 'September: the Volkswagen emissions scandal breaks' },
  { year: 2018, text: 'April: higher first-year road tax for most new diesels' },
];

function tile(value, label) {
  const li = el('li', 'wuk-tile');
  li.append(el('span', 'wuk-tile__value', value), el('span', 'wuk-tile__label', label));
  return li;
}

startFeature('diesel', (data) => {
  fill('latest-quarter', data.latestQuarter);
  const y = (i) => data.years[i];
  const full = data.years.map((_, i) => i).filter((i) => y(i) !== data.partial?.year);
  const latest = full.at(-1);
  const shares = Object.fromEntries(data.fuels.map((f) => [f.id, f.values.map((v, i) => (data.totals[i] ? v / data.totals[i] : 0))]));
  const diesel = shares.diesel;
  const peak = full.reduce((a, b) => (diesel[b] > diesel[a] ? b : a));
  const plugged = (i) => shares.electric[i] + shares.plugin[i];
  const overtaken = full.find((i) => i > peak && plugged(i) > diesel[i]);
  const evOvertaken = full.find((i) => i > peak && shares.electric[i] > diesel[i]);

  const tiles = el('ul', 'wuk-tiles');
  tiles.append(
    tile(pct0.format(diesel[peak]), `of new cars were diesel in ${y(peak)}, the peak`),
    tile(pct0.format(diesel[latest]), `in ${y(latest)}`),
    tile(pct0.format(shares.electric[latest]), `of new cars in ${y(latest)} were battery electric`),
  );
  $('hero-graphic').replaceChildren(tiles);

  $('rise-summary').textContent =
    `Diesel was ${pct0.format(diesel[0])} of new cars in ${y(0)}, rose to ${pct0.format(diesel[peak])} in ${y(peak)}, and fell to ${pct0.format(diesel[latest])} in ${y(latest)}: ` +
    `${count.format(data.fuels.find((f) => f.id === 'diesel').values[latest])} new diesels, against ${count.format(data.fuels.find((f) => f.id === 'diesel').values[peak])} at the peak.` +
    (overtaken !== undefined ? ` Plug-ins (battery electric and plug-in hybrid together) overtook diesel in ${y(overtaken)}` : '') +
    (evOvertaken !== undefined ? `; battery electric cars alone did in ${y(evOvertaken)}.` : '.');

  createChart($('rise-chart'), { formatValue: pct0.format, formatTick: format('.0%'), totalLabel: null }).update({
    quarters: data.years.map((year) => (year === data.partial?.year ? `${year} so far` : String(year))),
    dates: data.years.map((year) => new Date(Date.UTC(year, 6, 1))),
    series: data.fuels.filter((f) => f.id !== 'other').map((f) => ({ id: f.id, label: f.label, values: shares[f.id] })),
    sorn: null,
    summary: `Line chart of each fuel's share of new cars, ${y(0)} to ${y(data.years.length - 1)}. ${$('rise-summary').textContent} Focus the chart and use the arrow keys to read each year.`,
  });

  $('moments').replaceChildren(
    ...MOMENTS.filter((m) => data.years.includes(m.year)).map((m) => {
      const i = data.years.indexOf(m.year);
      const li = el('li', 'wuk-moment');
      li.append(el('span', 'wuk-moment__year', String(m.year)), el('span', 'wuk-moment__text', m.text), el('span', 'wuk-moment__value', `Diesel: ${pct0.format(diesel[i])} of new cars`));
      return li;
    }),
  );

  renderTable($('rise-table'), {
    caption: 'Share of new cars by fuel, Great Britain',
    columns: [
      { label: 'Year', value: (i) => (y(i) === data.partial?.year ? `${y(i)} (to ${data.latestQuarter})` : String(y(i))) },
      ...data.fuels.map((f) => ({ label: f.label, value: (i) => pct0.format(shares[f.id][i]), numeric: true })),
      { label: 'New cars', value: (i) => count.format(data.totals[i]), numeric: true },
    ],
    rows: data.years.map((_, i) => i),
  });
});
