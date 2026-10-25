// "Life with the car": the National Travel Survey on how England took to the car since 1951.
// Households with a car, who holds a licence, miles driven, driving alone, the car itself, and
// where it sleeps. Every fact is built from the data.

import { createChart } from './chart.js';
import { $, fill, startFeature } from './feature-page.js';
import { el, emptyNote, renderTable } from './insight-charts.js';
import { bars, markedBars } from './make-story.js';

const count = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const share0 = (v) => `${Math.round(v)}%`;
/** A survey year on the chart: the middle of its period, 1 July. */
const at = (row) => new Date(Date.UTC(Math.floor(row.at), row.at % 1 ? 12 : 6, 1));
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** "one in seven", from a percentage. */
const oneIn = (pct) => {
  const n = Math.round(100 / pct);
  return `one in ${WORDS[n] ?? count.format(n)}`;
};
const lower = (s) => s[0].toLowerCase() + s.slice(1);
/** Combined survey years, shorter: "1975 to 1976" -> "1975-76". */
const yr = (label) => label.replace(/^(\d{4}) to \d{2}(\d{2})$/, '$1-$2');
/** DfT's rural-urban classes in a sentence: "Urban: Nearer to a major town or city" -> "urban, near a major town or city". */
const areaName = (a) => a.replace(': Nearer to', ', near').replace(': Further from', ', far from').toLowerCase();

function tile(value, label) {
  const li = el('li', 'wuk-tile');
  li.append(el('span', 'wuk-tile__value', value), el('span', 'wuk-tile__label', label));
  return li;
}

function lineChart(root, rows, series, { formatValue = share0, formatTick = (v) => `${v}%`, summary }) {
  createChart(root, { formatValue, formatTick, totalLabel: null }).update({
    quarters: rows.map((r) => yr(r.year)),
    dates: rows.map(at),
    series: series.map((s) => ({ id: s.id, label: s.label, values: rows.map((r) => r[s.key]) })),
    sorn: null,
    summary,
  });
}

function renderHouseholds(d) {
  const rows = d.households;
  if (!rows.length) return $('households-chart').replaceChildren(emptyNote());
  const first = rows[0];
  const last = rows.at(-1);
  const withCar = (r) => 100 - r.none;
  $('households-summary').textContent =
    `In ${yr(first.year)}, ${share0(withCar(first))} of households in England had a car or van: about ${oneIn(withCar(first))}. ` +
    `By ${yr(last.year)} it was ${share0(withCar(last))}, and ${share0(last.twoPlus)} had two or more, against ${share0(first.twoPlus)} in ${yr(first.year)}.`;
  lineChart($('households-chart'), rows, [
    { id: 'cars', key: 'one', label: 'One car or van' },
    { id: 'vans', key: 'twoPlus', label: 'Two or more' },
    { id: 'lorries', key: 'none', label: 'No car or van' },
  ], { summary: `Line chart of households by cars or vans, ${yr(first.year)} to ${yr(last.year)}. ${$('households-summary').textContent}` });
  renderTable($('households-table'), {
    caption: 'Households by cars or vans, England',
    columns: [
      { label: 'Year', value: (r) => yr(r.year) },
      { label: 'No car or van', numeric: true, value: (r) => share0(r.none) },
      { label: 'One', numeric: true, value: (r) => share0(r.one) },
      { label: 'Two or more', numeric: true, value: (r) => share0(r.twoPlus) },
    ],
    rows,
  });
}

function renderLicences(d) {
  const sex = (s) => d.licences.find((l) => l.sex === s)?.years ?? [];
  const all = sex('All');
  if (!all.length) return $('licences-chart').replaceChildren(emptyNote());
  const first = all[0];
  const last = all.at(-1);
  const young = all.filter((r) => r['17 to 20'] !== null);
  const peak = young.reduce((a, b) => (b['17 to 20'] > a['17 to 20'] ? b : a));
  const women = sex('Female');
  const men = sex('Male');
  $('licences-summary').textContent =
    `${share0(last.all)} of adults held a full car licence in ${yr(last.year)}, against ${share0(first.all)} in ${yr(first.year)}. ` +
    (peak !== last ? `Among 17 to 20-year-olds it peaked at ${share0(peak['17 to 20'])} in ${yr(peak.year)}, and is ${share0(last['17 to 20'])} now. ` : '') +
    `The over-70s went from ${share0(first['70 and over'])} to ${share0(last['70 and over'])}.` +
    (women.length && men.length ? ` Women: ${share0(women[0].all)} in ${yr(women[0].year)}, ${share0(women.at(-1).all)} now (men ${share0(men.at(-1).all)}).` : '');
  lineChart($('licences-chart'), all, [
    { id: 'cars', key: 'all', label: 'All adults' },
    { id: 'vans', key: '17 to 20', label: '17 to 20' },
    { id: 'lorries', key: '70 and over', label: '70 and over' },
  ], { summary: `Line chart of full car licence holding by age, ${yr(first.year)} to ${yr(last.year)}. ${$('licences-summary').textContent}` });
  renderTable($('licences-table'), {
    caption: 'Full car licence holders by age, England',
    columns: [
      { label: 'Year', value: (r) => yr(r.year) },
      { label: 'All adults', numeric: true, value: (r) => share0(r.all) },
      ...['17 to 20', '21 to 29', '30 to 39', '40 to 49', '50 to 59', '60 to 69', '70 and over'].map((a) => ({ label: a, numeric: true, value: (r) => (r[a] === null ? 'n/a' : share0(r[a])) })),
    ],
    rows: all,
  });

  const reasons = d.reasons.young;
  if (!reasons.length) return $('reasons-chart').replaceChildren(emptyNote());
  $('reasons-chart').replaceChildren(bars(reasons.map((r) => ({ label: r.reason, value: r.share, text: share0(r.share) })), reasons[0].share));
  $('reasons-summary').textContent =
    `Asked in ${d.reasons.year} for their main reason, 17 to 20-year-olds without a licence put “${lower(reasons[0].reason)}” first (${share0(reasons[0].share)}). ` +
    (d.reasons.all[0] ? `Across all ages the commonest is “${lower(d.reasons.all[0].reason)}” (${share0(d.reasons.all[0].share)}).` : '');
}

function renderMiles(d) {
  const rows = d.mileage.filter((r) => r.all !== null);
  if (!rows.length) return $('miles-chart').replaceChildren(emptyNote());
  const first = rows[0];
  const last = rows.at(-1);
  const p0 = d.purpose[0];
  const p1 = d.purpose.at(-1);
  const c0 = d.company[0];
  const c1 = d.company.at(-1);
  const m0 = d.modes[0];
  const m1 = d.modes.at(-1);
  $('miles-summary').textContent =
    `The average car covered ${count.format(last.all)} miles in ${yr(last.year)}, against ${count.format(first.all)} in ${yr(first.year)}. ` +
    (p0 && p1 ? `Business miles fell from ${count.format(p0.business)} to ${count.format(p1.business)} a car, and company cars from ${share0(c0.company)} to ${share0(c1.company)} of the total. ` : '') +
    (m0 && m1 ? `Each of us drove ${count.format(m1.driverMiles)} miles in ${m1.year}, against ${count.format(m0.driverMiles)} in ${m0.year}.` : '');
  lineChart($('miles-chart'), rows, [{ id: 'cars', key: 'all', label: 'Miles a car a year' }], {
    formatValue: (v) => `${count.format(v)} miles`,
    formatTick: (v) => count.format(v),
    summary: `Line chart of average annual miles a car, ${yr(first.year)} to ${yr(last.year)}. ${$('miles-summary').textContent}`,
  });
  fill('latest', yr(last.year));
  const fuels = [['Petrol', 'petrol'], ['Diesel', 'diesel'], ['Hybrid', 'hybrid'], ['Battery electric', 'electric']].filter(([, k]) => last[k] !== null);
  $('fuel-miles').replaceChildren(fuels.length ? bars(fuels.map(([label, k]) => ({ label, value: last[k], text: count.format(last[k]) })), Math.max(...fuels.map(([, k]) => last[k]))) : emptyNote());
}

function renderAlone(d) {
  const [then, now] = [d.lone.byPurpose[0], d.lone.byPurpose.at(-1)];
  if (!now) return $('alone-chart').replaceChildren(emptyNote());
  fill('first-lone', then.year);
  const rows = now.purposes.filter((p) => p.share !== null).sort((a, b) => b.share - a.share);
  $('alone-chart').replaceChildren(
    markedBars(
      rows.map((p) => {
        const before = then.purposes.find((x) => x.purpose === p.purpose)?.share;
        return { label: p.purpose, value: p.share, text: share0(p.share), mark: before, markText: before === null || before === undefined ? '' : share0(before) };
      }),
      100,
      then.year,
    ),
  );
  const y0 = d.lone.years[0];
  const y1 = d.lone.years.at(-1);
  const o0 = d.occupancy[0];
  const o1 = d.occupancy.at(-1);
  $('alone-summary').textContent =
    `${share0(y1.commuting)} of car journeys to work in ${y1.year} had only the driver aboard, against ${share0(y0.commuting)} in ${y0.year}. ` +
    `Across all journeys, ${share0(y1.all)} were driven alone. A car carries ${o1.all.toFixed(1)} people on average (${o0.all.toFixed(1)} in ${o0.year}).`;
}

function renderCar(d) {
  const [first, last] = [d.fuel[0], d.fuel.at(-1)];
  if (!last) return $('fuel-chart').replaceChildren(emptyNote());
  fill('first-fuel', yr(first.year));
  const fuels = [['Petrol', 'petrol'], ['Diesel', 'diesel'], ['Hybrid', 'hybrid'], ['Battery electric', 'electric'], ['Plug-in hybrid', 'plugIn']];
  $('fuel-chart').replaceChildren(
    markedBars(
      fuels.filter(([, k]) => last[k] !== null).map(([label, k]) => ({ label, value: last[k], text: share0(last[k]), mark: first[k], markText: first[k] === null ? '' : share0(first[k]) })),
      100,
      yr(first.year),
    ),
  );
  const t0 = d.transmission[0];
  const t1 = d.transmission.at(-1);
  $('car-summary').textContent =
    `${share0(last.petrol)} of households’ cars ran on petrol in ${yr(last.year)} (${share0(first.petrol)} in ${yr(first.year)}), ${share0(last.diesel)} on diesel, and ${share0(last.electric)} on batteries alone. ` +
    (t0 && t1 ? `Automatics went from ${share0(t0.automatic)} of cars in ${t0.year} to ${share0(t1.automatic)} in ${t1.year}.` : '');
}

function renderParking(d) {
  const [first, last] = [d.parking.years[0], d.parking.years.at(-1)];
  if (!last) return $('parking-chart').replaceChildren(emptyNote());
  fill('first-parking', yr(first.year));
  const places = [['Garage', 'garage'], ['Drive or other private land', 'drive'], ['Street', 'street'], ['Somewhere else', 'other']];
  $('parking-chart').replaceChildren(
    markedBars(places.map(([label, k]) => ({ label, value: last[k], text: share0(last[k]), mark: first[k], markText: share0(first[k]) })), 100, yr(first.year)),
  );
  const areas = [...d.parking.byArea].sort((a, b) => b.street - a.street);
  $('parking-summary').textContent =
    `Only ${share0(last.garage)} of cars spent the night in a garage in ${yr(last.year)}, against ${share0(first.garage)} in ${yr(first.year)}. ` +
    `${share0(last.drive)} were on a drive or other private land, and ${share0(last.street)} on the street.` +
    (areas.length > 1 ? ` Street parking ranges from ${share0(areas[0].street)} (${areaName(areas[0].area)}) to ${share0(areas.at(-1).street)} (${areaName(areas.at(-1).area)}).` : '');
}

startFeature('motoring', (d) => {
  fill('latest-quarter', d.latest);
  const hh = d.households.at(-1);
  const lic = d.licences.find((l) => l.sex === 'All')?.years.at(-1);
  const miles = d.mileage.filter((r) => r.all !== null).at(-1);
  const tiles = el('ul', 'wuk-tiles');
  if (hh) tiles.append(tile(share0(100 - hh.none), `of households had a car or van in ${hh.year}`));
  if (lic) tiles.append(tile(share0(lic.all), `of adults held a full car licence in ${yr(lic.year)}`));
  if (miles) tiles.append(tile(count.format(miles.all), `miles: the average car’s year`));
  $('hero-graphic').replaceChildren(tiles);
  renderHouseholds(d);
  renderLicences(d);
  renderMiles(d);
  renderAlone(d);
  renderCar(d);
  renderParking(d);
});
