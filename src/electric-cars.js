// The electric car sections of the Electric page: the fleet, the models, the makes, where
// they're from, and the MOT. Every fact is built from the data.

import { createChart } from './chart.js';
import { displayName, hidden, renderPictogram } from './feature-charts.js';
import { el, formatChange, modelLink, renderTable } from './insight-charts.js';
import { quarterEndDate } from './quarters.js';

const $ = (id) => document.getElementById(id);
const count = new Intl.NumberFormat('en-GB');
const big = new Intl.NumberFormat('en-GB', { notation: 'compact', compactDisplay: 'long', maximumFractionDigits: 2 });
const pct0 = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
const pct1 = new Intl.NumberFormat('en-GB', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const FUELS = [
  { id: 'petrol', label: 'Petrol' },
  { id: 'diesel', label: 'Diesel' },
  { id: 'hybrid', label: 'Hybrid' },
  { id: 'electric', label: 'Battery electric' },
];

function fill(name, value) {
  for (const node of document.querySelectorAll(`[data-${name}]`)) node.textContent = value;
}

function renderSurge(data) {
  const { quarters, fleet } = data;
  const last = quarters.length - 1;
  const crossing = quarters.findIndex((_, i) => fleet.electric[i] > fleet.plugin[i]);
  $('surge-summary').textContent =
    `${big.format(fleet.electric[last])} battery electric cars are licensed: ${pct1.format(fleet.electric[last] / fleet.licensed[last])} of all cars, ` +
    `up from ${count.format(fleet.electric[0])} in ${quarters[0]}. Plug-in hybrids add ${big.format(fleet.plugin[last])} more.` +
    (crossing > 0 ? ` Battery electric cars overtook plug-in hybrids in ${quarters[crossing]}.` : '');
  createChart($('surge-chart'), { totalLabel: 'All plug-in cars' }).update({
    quarters,
    dates: quarters.map(quarterEndDate),
    series: [
      { id: 'electric', label: 'Battery electric', values: fleet.electric },
      { id: 'plugin', label: 'Plug-in hybrid', values: fleet.plugin },
    ],
    sorn: null,
    summary: `Line chart of licensed plug-in cars, ${quarters[0]} to ${quarters[last]}. ${$('surge-summary').textContent} Focus the chart and use the arrow keys to read each quarter.`,
  });
}

function renderModels(data) {
  fill('year-ago', data.yearAgoQuarter);
  const max = Math.max(...data.models.flatMap((m) => [m.latest, m.yearAgo]));
  const [first, second] = data.models;
  $('models-summary').textContent =
    `The ${displayName(first.name)} is Britain's most common electric car, with ${count.format(first.latest)} licensed` +
    (second ? `, just ahead of the ${displayName(second.name)} (${count.format(second.latest)}).` : '.');
  $('ev-models').replaceChildren(
    ...data.models.map((m) => {
      const li = el('li', 'wuk-bar-simple');
      const link = el('a', 'govuk-link wuk-bar-simple__name', displayName(m.name));
      link.href = modelLink(m);
      const value = el('span', 'wuk-bar-simple__value', count.format(m.latest));
      value.append(hidden(` licensed, ${count.format(m.yearAgo)} in ${data.yearAgoQuarter}`));
      const track = el('span', 'wuk-bar-simple__track');
      track.setAttribute('aria-hidden', 'true');
      const now = el('span', 'wuk-bar-simple__now');
      now.style.width = `${(m.latest / max) * 100}%`;
      const then = el('span', 'wuk-bar-simple__then');
      then.style.left = `${(m.yearAgo / max) * 100}%`;
      track.append(now, then);
      li.append(link, value, track);
      return li;
    }),
  );
}

function renderMakes(data) {
  const item = (name, value) => {
    const li = el('li', 'wuk-rank__item');
    li.append(el('span', 'wuk-rank__name', name), el('span', 'wuk-rank__value', value));
    return li;
  };
  $('ev-makes').replaceChildren(...data.makes.map((m) => item(displayName(m.make), count.format(m.electric))));
  $('ev-share').replaceChildren(...data.mostElectric.map((m) => item(displayName(m.make), pct0.format(m.share))));
  const [top] = data.makes;
  // Makes that sell other fuels too (all-electric makes can round to just under 100%).
  const mixed = data.mostElectric.find((m) => m.share < 0.99);
  $('makes-summary').textContent =
    `${displayName(top.make)} has the most battery electric cars on the road: ${count.format(top.electric)}` +
    (top.yearAgo ? `, ${formatChange((top.electric - top.yearAgo) / top.yearAgo)} on a year earlier.` : '.') +
    (mixed ? ` Of makes that sell other fuels too, ${displayName(mixed.make)} is the most electric: ${pct0.format(mixed.share)} of its cars.` : '');
}

function renderOrigins(data) {
  const groups = [...data.origins].sort((a, b) => b.of100 - a.of100);
  const chinese = groups.find((g) => g.id === 'chinese');
  renderPictogram($('ev-pictogram'), groups, { highlight: (g) => g.id === 'chinese' });
  $('origin-summary').textContent =
    `Of every 100 battery electric cars, ${groups[0].of100} are ${groups[0].label} and ${groups[1].of100} ${groups[1].label}` +
    (chinese ? `. ${chinese.of100} are Chinese, in pink: far more than Chinese makes' share of all cars.` : '.');
}

function renderMot(data) {
  const section = $('mot-dots').closest('section');
  if (!data.mot) {
    section.hidden = true;
    return;
  }
  fill('mot-year', String(data.mot.year));
  const fuels = FUELS.filter((f) => data.mot.bands.some((b) => b.fuels[f.id]?.tests));
  const rate = (o) => (o?.tests ? o.pass / o.tests : null);
  $('mot-legend').replaceChildren(
    ...fuels.map((f) => {
      const item = el('li', 'wuk-legend__item');
      item.append(el('span', `wuk-mark wuk-mark--${f.id}`), el('span', '', f.label));
      return item;
    }),
  );
  // Bands with too few electric cars to say much are left out.
  const bands = data.mot.bands.filter((b) => (b.fuels.electric?.tests ?? 0) >= 1000);
  const all = bands.flatMap((b) => fuels.map((f) => rate(b.fuels[f.id]))).filter((v) => v !== null);
  const lo = Math.floor(Math.min(...all) * 20) / 20;
  const at = (v) => `${((v - lo) / (1 - lo)) * 100}%`;
  $('mot-dots').replaceChildren(
    ...bands.map((b) => {
      const li = el('li', 'wuk-dotrow');
      const track = el('span', 'wuk-dotrow__track');
      track.setAttribute('aria-hidden', 'true');
      for (const f of fuels) {
        const v = rate(b.fuels[f.id]);
        if (v === null) continue;
        const mark = el('span', `wuk-mark wuk-mark--${f.id}`);
        mark.style.left = at(v);
        track.append(mark);
      }
      li.append(el('span', 'wuk-dotrow__label', b.label), hidden(`: ${fuels.map((f) => `${f.label} ${pct1.format(rate(b.fuels[f.id]) ?? 0)}`).join(', ')}`), track);
      return li;
    }),
  );
  const scale = el('p', 'govuk-body-s wuk-dotrow-scale', `Scale: ${pct0.format(lo)} to 100% passing first time.`);
  $('mot-dots').after(scale);
  const young = bands[0];
  if (young) {
    const ev = young.fuels.electric;
    const petrol = young.fuels.petrol;
    $('mot-summary').textContent =
      `At ${young.label}, ${pct1.format(rate(ev))} of battery electric cars passed first time, against ${pct1.format(rate(petrol))} of petrol cars. ` +
      `They'd also done more miles: ${count.format(ev.meanMiles)} on average, against ${count.format(petrol.meanMiles)}.`;
  }
  renderTable($('mot-table'), {
    caption: `MOT results by fuel and age, ${data.mot.year}`,
    columns: [
      { label: 'Age of car', value: (r) => r.band },
      { label: 'Fuel', value: (r) => r.fuel },
      { label: 'Tests', value: (r) => count.format(r.o.tests), numeric: true },
      { label: 'Passed first time', value: (r) => pct1.format(r.o.pass / r.o.tests), numeric: true },
      { label: 'Average mileage', value: (r) => (r.o.meanMiles === null ? 'Not known' : count.format(r.o.meanMiles)), numeric: true },
    ],
    rows: data.mot.bands.flatMap((b) => fuels.filter((f) => b.fuels[f.id]?.tests).map((f) => ({ band: b.label, fuel: f.label, o: b.fuels[f.id] }))),
  });
}

export function renderElectricCars(data) {
  renderSurge(data);
  renderModels(data);
  renderMakes(data);
  renderOrigins(data);
  renderMot(data);
}
