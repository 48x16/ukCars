// "Plate days": new cars every quarter since 2001. New number plates arrive each March and
// September, and buyers wait for them, so those quarters tower over the rest. Every fact is
// built from the data.

import { hidden } from './feature-charts.js';
import { $, fill, startFeature } from './feature-page.js';
import { el, renderTable } from './insight-charts.js';

const count = new Intl.NumberFormat('en-GB');
const pct0 = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
const QUARTER_MONTHS = { 1: 'January to March', 2: 'April to June', 3: 'July to September', 4: 'October to December' };
/** The quarters holding a plate month: March (Q1) and September (Q3). */
const isPlateQuarter = (q) => /Q[13]$/.test(q);

/**
 * The age identifier on plates issued from a date: March's is the year's last two digits
 * ("25"), September's adds 50 ("75"). The current style began in September 2001 with "51".
 */
function plateFor(year, month) {
  const yy = year % 100;
  return String(month >= 9 ? yy + 50 : yy).padStart(2, '0');
}

function tile(value, label) {
  const li = el('li', 'wuk-tile');
  li.append(el('span', 'wuk-tile__value', value), el('span', 'wuk-tile__label', label));
  return li;
}

startFeature('plates', (data) => {
  const { quarters, values } = data;
  fill('latest-quarter', quarters.at(-1));
  const years = [...new Set(quarters.map((q) => Number(q.slice(0, 4))))];
  const fullYears = years.filter((y) => quarters.filter((q) => q.startsWith(String(y))).length === 4);
  const yearShare = (y) => {
    const qs = quarters.map((q, i) => [q, values[i]]).filter(([q]) => q.startsWith(String(y)));
    const total = qs.reduce((n, [, v]) => n + v, 0);
    return qs.filter(([q]) => isPlateQuarter(q)).reduce((n, [, v]) => n + v, 0) / total;
  };
  const plateShare = fullYears.reduce((n, y) => n + yearShare(y), 0) / fullYears.length;
  const biggest = values.indexOf(Math.max(...values));
  const lowest = values.indexOf(Math.min(...values));
  const yearBefore = quarters.indexOf(`${Number(quarters[lowest].slice(0, 4)) - 1} ${quarters[lowest].slice(5)}`);

  const tiles = el('ul', 'wuk-tiles');
  tiles.append(
    tile(pct0.format(plateShare), `of each year's new cars, on average, arrive in the plate quarters (to March and to September)`),
    tile(count.format(values[biggest]), `new cars in ${quarters[biggest]}, the biggest quarter since ${years[0]}`),
  );
  $('hero-graphic').replaceChildren(tiles);

  $('saw-summary').textContent =
    `On average, ${pct0.format(plateShare)} of a year's new cars are registered in the quarters holding March and September, the plate months, against 50% if buyers didn't wait. ` +
    `The quietest quarter was ${quarters[lowest]} (${QUARTER_MONTHS[quarters[lowest].slice(-1)]}), with ${count.format(values[lowest])}` +
    (yearBefore !== -1 ? `, ${pct0.format(1 - values[lowest] / values[yearBefore])} down on a year before.` : '.');

  const max = values[biggest];
  $('saw').replaceChildren(
    ...quarters.map((q, i) => {
      const li = el('li', `wuk-saw-col${isPlateQuarter(q) ? ' wuk-saw-col--plate' : ''}${i === lowest ? ' wuk-saw-col--low' : ''}`);
      const bar = el('span', 'wuk-saw-col__bar');
      bar.style.height = `${(values[i] / max) * 100}%`;
      bar.setAttribute('aria-hidden', 'true');
      li.append(bar, hidden(`${q}: ${count.format(values[i])}`));
      return li;
    }),
  );
  $('saw-axis').replaceChildren(
    ...years.filter((y) => y % 5 === 0).map((y) => {
      const span = el('span', 'wuk-saw-axis__tick', String(y));
      span.style.left = `${(quarters.indexOf(`${y} Q1`) / quarters.length) * 100}%`;
      return span;
    }),
  );

  // The decoder: each plate since the current style began, newest first.
  const plates = [];
  for (const y of years) for (const month of [3, 9]) if ((y > 2001 || month === 9) && `${y} Q${month === 3 ? 1 : 3}` <= quarters.at(-1)) plates.push({ y, month });
  $('decoder').replaceChildren(
    ...plates.reverse().map(({ y, month }) => {
      const li = el('li', 'wuk-plate');
      li.append(el('span', 'wuk-plate__id', plateFor(y, month)), el('span', 'wuk-plate__when', `${month === 3 ? 'March' : 'September'} ${y}`));
      return li;
    }),
  );

  renderTable($('saw-table'), {
    caption: 'New cars each quarter, Great Britain',
    columns: [
      { label: 'Quarter', value: (i) => quarters[i] },
      { label: 'New cars', value: (i) => count.format(values[i]), numeric: true },
    ],
    rows: quarters.map((_, i) => i).reverse(),
  });
});
