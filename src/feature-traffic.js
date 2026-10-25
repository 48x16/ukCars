// "How Britain drives": vehicle miles on Britain's roads since 1993, by vehicle and by road, and
// the busiest and quietest councils. Every fact is built from the data.

import { createChart } from './chart.js';
import { $, fill, startFeature } from './feature-page.js';
import { el, emptyNote, formatChange, renderTable } from './insight-charts.js';
import { bars } from './make-story.js';

const billions = (v) => `${(v / 1e9).toFixed(1)} billion`;
const index = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const pct1 = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 1 });

function tile(value, label) {
  const li = el('li', 'wuk-tile');
  li.append(el('span', 'wuk-tile__value', value), el('span', 'wuk-tile__label', label));
  return li;
}

const yearDates = (years) => years.map((y) => new Date(Date.UTC(y, 6, 1)));

startFeature('traffic', (data) => {
  const { years } = data;
  const first = 0;
  const last = years.length - 1;
  const y = (i) => years[i];
  fill('latest-quarter', `${y(last)} traffic estimates`);
  fill('first-year', String(y(first)));
  const vehicle = (id) => data.vehicles.find((v) => v.id === id);
  const growth = (v) => (v.values[last] - v.values[first]) / v.values[first];
  const cars = vehicle('cars');
  const vans = vehicle('vans');
  const covid = years.indexOf(2020);
  const dip = covid > 0 ? (cars.values[covid] - cars.values[covid - 1]) / cars.values[covid - 1] : null;

  const tiles = el('ul', 'wuk-tiles');
  tiles.append(
    tile(`${(data.all[last] / 1e9).toFixed(0)} billion`, `miles driven on Britain’s roads in ${y(last)}`),
    tile(formatChange(growth(vans)), `more van miles than in ${y(first)}; cars ${formatChange(growth(cars))}`),
  );
  if (dip !== null) tiles.append(tile(formatChange(dip), `car miles in 2020, the first Covid year`));
  $('hero-graphic').replaceChildren(tiles);

  const ranked = [...data.vehicles].sort((a, b) => growth(b) - growth(a));
  $('vehicles-summary').textContent =
    `Since ${y(first)}, van miles are ${formatChange(growth(vans))}, more than any other vehicle; car miles are ${formatChange(growth(cars))}. ` +
    `${ranked.at(-1).label} are the only ones down, ${formatChange(growth(ranked.at(-1)))}.` +
    (dip !== null ? ` In 2020, car miles fell ${formatChange(dip).replace('−', '').replace('-', '')}.` : '');
  createChart($('vehicles-chart'), { formatValue: (v) => index.format(v), formatTick: (v) => index.format(v), totalLabel: null }).update({
    quarters: years.map(String),
    dates: yearDates(years),
    series: data.vehicles.map((v) => ({ id: v.id, label: v.label, values: v.values.map((x) => (x / v.values[first]) * 100) })),
    sorn: null,
    summary: `Line chart of vehicle miles by type, as an index with ${y(first)} at 100, ${y(first)} to ${y(last)}. ${$('vehicles-summary').textContent}`,
  });

  const road = (id) => data.roads.find((r) => r.id === id);
  const share = (r, i) => r.values[i] / data.all[i];
  $('roads-summary').textContent =
    `A roads carry the most traffic: ${Math.round(share(road('aroad'), last) * 100)}% of all miles in ${y(last)}. ` +
    `Motorways are ${pct1.format(road('motorway').roadMiles / data.roads.reduce((n, r) => n + r.roadMiles, 0))} of the road network but carry ${Math.round(share(road('motorway'), last) * 100)}%, ${formatChange((road('motorway').values[last] - road('motorway').values[first]) / road('motorway').values[first])} on ${y(first)}.`;
  createChart($('roads-chart'), { formatValue: billions, formatTick: (v) => `${v / 1e9}bn`, totalLabel: null }).update({
    quarters: years.map(String),
    dates: yearDates(years),
    series: data.roads.map((r) => ({ id: r.id, label: r.label, values: r.values })),
    sorn: null,
    summary: `Line chart of vehicle miles by road type, ${y(first)} to ${y(last)}. ${$('roads-summary').textContent}`,
  });

  const { busiest, quietest } = data.councils;
  const perMile = (c) => ({ label: c.name, value: c.perRoadMile, text: `${(c.perRoadMile / 1e6).toFixed(2)}m` });
  const scale = busiest[0]?.perRoadMile ?? 1;
  $('busiest').replaceChildren(busiest.length ? bars(busiest.map(perMile), scale) : emptyNote());
  $('quietest').replaceChildren(quietest.length ? bars(quietest.map(perMile), scale) : emptyNote());
  fill('council-year', String(data.councils.year));
  if (busiest.length) {
    $('councils-summary').textContent =
      `Every mile of road in ${busiest[0].name} carries ${(busiest[0].perRoadMile / 1e6).toFixed(1)} million vehicle miles a year, the most of any council. ` +
      `In ${quietest[0].name} it’s ${(quietest[0].perRoadMile / 1e6).toFixed(2)} million.`;
  }

  renderTable($('vehicles-table'), {
    caption: 'Vehicle miles a year, Great Britain (billions)',
    columns: [{ label: 'Year', value: (i) => String(y(i)) }, ...data.vehicles.map((v) => ({ label: v.label, value: (i) => (v.values[i] / 1e9).toFixed(1), numeric: true }))],
    rows: years.map((_, i) => i).reverse(),
  });
});
