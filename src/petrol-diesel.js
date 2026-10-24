// The Petrol and diesel page. Every fact is built from the data.

import { createChart } from './chart.js';
import { loadFuelPrices } from './data.js';
import { displayName, hidden, renderChangeDots, stackedBar } from './feature-charts.js';
import { $, fill, startFeature } from './feature-page.js';
import { passRate, renderFuelMot } from './fuel-mot.js';
import { el, formatChange, modelLink } from './insight-charts.js';
import { quarterEndDate } from './quarters.js';

const count = new Intl.NumberFormat('en-GB');
const big = new Intl.NumberFormat('en-GB', { notation: 'compact', compactDisplay: 'long', maximumFractionDigits: 2 });
const pct0 = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
const pct1 = new Intl.NumberFormat('en-GB', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pounds = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const pence = (v) => `${v.toFixed(1)}p`;
const month = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const TANK_LITRES = 55;

function tile(value, label) {
  const node = el('li', 'wuk-tile');
  node.append(el('span', 'wuk-tile__value', value), el('span', 'wuk-tile__label', label));
  return node;
}

function renderFleet(data) {
  const { quarters, fleet } = data;
  const last = quarters.length - 1;
  const peak = Math.max(...fleet.diesel);
  const peakQuarter = quarters[fleet.diesel.indexOf(peak)];
  const share = (v) => v / fleet.licensed[last];
  $('fleet-summary').textContent =
    `Diesel cars peaked at ${big.format(peak)} in ${peakQuarter} and are down to ${big.format(fleet.diesel[last])}: ` +
    `${pct0.format(share(fleet.diesel[last]))} of all cars. Petrol cars number ${big.format(fleet.petrol[last])} (${pct0.format(share(fleet.petrol[last]))}), ` +
    `and self-charging hybrids, which run on petrol or diesel, ${big.format(fleet.hybrid[last])}.`;
  createChart($('fleet-chart'), { totalLabel: null }).update({
    quarters,
    dates: quarters.map(quarterEndDate),
    series: [
      { id: 'petrol', label: 'Petrol', values: fleet.petrol },
      { id: 'diesel', label: 'Diesel', values: fleet.diesel },
      { id: 'hybrid', label: 'Hybrid', values: fleet.hybrid },
    ],
    sorn: null,
    summary: `Line chart of licensed cars by fuel, ${quarters[0]} to ${quarters[last]}. ${$('fleet-summary').textContent} Focus the chart and use the arrow keys to read each quarter.`,
  });
  return { peak, peakQuarter };
}

function modelBars(list, models, before) {
  const max = Math.max(...models.flatMap((m) => [m.latest, m.fiveYearsAgo]));
  list.replaceChildren(
    ...models.map((m) => {
      const li = el('li', 'wuk-bar-simple');
      const link = el('a', 'govuk-link wuk-bar-simple__name', displayName(m.name));
      link.href = modelLink(m);
      const value = el('span', 'wuk-bar-simple__value', count.format(m.latest));
      value.append(hidden(` licensed, ${count.format(m.fiveYearsAgo)} in ${before}`));
      const track = el('span', 'wuk-bar-simple__track');
      track.setAttribute('aria-hidden', 'true');
      const now = el('span', 'wuk-bar-simple__now');
      now.style.width = `${(m.latest / max) * 100}%`;
      const then = el('span', 'wuk-bar-simple__then');
      then.style.left = `${(m.fiveYearsAgo / max) * 100}%`;
      track.append(now, then);
      li.append(link, value, track);
      return li;
    }),
  );
}

function renderModels(data) {
  fill('five-years-ago', data.fiveYearsAgoQuarter);
  modelBars($('petrol-models'), data.petrolModels, data.fiveYearsAgoQuarter);
  modelBars($('diesel-models'), data.dieselModels, data.fiveYearsAgoQuarter);
  const [petrol] = data.petrolModels;
  const [diesel] = data.dieselModels;
  $('favourites-summary').textContent =
    `The ${displayName(petrol.name)} is Britain's most common petrol car, with ${count.format(petrol.latest)} licensed. ` +
    `The most common diesel is the ${displayName(diesel.name)}: ${count.format(diesel.latest)}` +
    (diesel.fiveYearsAgo ? `, ${formatChange((diesel.latest - diesel.fiveYearsAgo) / diesel.fiveYearsAgo)} in five years.` : '.');
}

function renderStrongholds(data) {
  const [top] = data.dieselMakes;
  const fallen = [...data.dieselMakes].sort((a, b) => b.before - b.share - (a.before - a.share))[0];
  $('strongholds-summary').textContent =
    `${displayName(top.make)} is still ${pct0.format(top.share)} diesel. ` +
    `${displayName(fallen.make)} has moved furthest away from it, from ${pct0.format(fallen.before)} to ${pct0.format(fallen.share)} in five years.`;
  renderChangeDots(
    $('strongholds'),
    data.dieselMakes.map((m) => ({ label: displayName(m.make), from: m.before, to: m.share })),
    (v) => pct0.format(v),
  );
}

function renderFallers(data) {
  const [first] = data.dieselFallers;
  $('fallers-summary').textContent = first
    ? `The diesel ${displayName(first.name)} has lost ${pct0.format(-first.change)} of its licensed cars in five years: the fastest-disappearing diesel on Britain's roads.`
    : '';
  $('fallers').replaceChildren(
    ...data.dieselFallers.map((m) => {
      const li = el('li', 'wuk-rank__item');
      const name = el('a', 'govuk-link wuk-rank__name', displayName(m.name));
      name.href = modelLink(m);
      li.append(name, el('span', 'wuk-rank__value', formatChange(m.change)));
      return li;
    }),
  );
}

async function renderPump(fleetFacts, data) {
  let prices;
  try {
    prices = await loadFuelPrices();
  } catch {
    $('pump-chart').closest('section').hidden = true;
    return null;
  }
  const { weeks } = prices;
  const last = weeks.length - 1;
  const date = (i) => new Date(`${weeks[i]}T00:00:00Z`);
  fill('latest-week', `the week of ${day.format(date(last))}`);
  const peakOf = (series) => series.indexOf(Math.max(...series));
  const pPeak = peakOf(prices.petrol);
  const dPeak = peakOf(prices.diesel);
  $('pump-summary').textContent =
    `Petrol is ${pence(prices.petrol[last])} a litre and diesel ${pence(prices.diesel[last])}. ` +
    (month.format(date(dPeak)) === month.format(date(pPeak))
      ? `Both peaked in ${month.format(date(dPeak))}, when diesel reached ${pence(prices.diesel[dPeak])} and petrol ${pence(prices.petrol[pPeak])}. `
      : `Petrol's highest was ${pence(prices.petrol[pPeak])} in ${month.format(date(pPeak))}; diesel's was ${pence(prices.diesel[dPeak])} in ${month.format(date(dPeak))}` +
        (dPeak === last ? ', this week. ' : '. ')) +
    `In ${date(0).getUTCFullYear()} they were ${pence(prices.petrol[0])} and ${pence(prices.diesel[0])}.`;
  createChart($('pump-chart'), { formatValue: pence, formatTick: (v) => `${v}p`, totalLabel: null }).update({
    quarters: weeks.map((_, i) => `Week of ${day.format(date(i))}`),
    dates: weeks.map((_, i) => date(i)),
    series: [
      { id: 'petrol', label: 'Petrol', values: prices.petrol },
      { id: 'diesel', label: 'Diesel', values: prices.diesel },
    ],
    sorn: null,
    summary: `Line chart of weekly UK pump prices, ${day.format(date(0))} to ${day.format(date(last))}. ${$('pump-summary').textContent} Focus the chart and use the arrow keys to read each week.`,
  });

  const tank = (p) => pounds.format((p * TANK_LITRES) / 100);
  $('tank').replaceChildren(
    tile(tank(prices.petrol[last]), `of petrol now; ${tank(prices.petrol[0])} in ${date(0).getUTCFullYear()}`),
    tile(tank(prices.diesel[last]), `of diesel now; ${tank(prices.diesel[dPeak])} at the ${month.format(date(dPeak))} peak`),
  );

  const litre = (fuel, label) => {
    const price = prices[fuel][last];
    const duty = prices[`${fuel}Duty`][last];
    const vat = (price * prices.vat[last]) / (100 + prices.vat[last]);
    const rest = price - duty - vat;
    const row = el('li', 'wuk-stackrow');
    const segments = [
      { id: 'duty', label: 'Fuel duty', value: duty },
      { id: 'vat', label: 'VAT', value: vat },
      { id: 'rest', label: 'Fuel, refining, delivery and the forecourt', value: rest },
    ];
    row.append(el('span', 'wuk-stackrow__label', `${label}, ${pence(price)}`), ...stackedBar(segments, (id) => `wuk-fill--${id}`));
    row.append(el('span', 'wuk-stackrow__extra', `${pence(duty)} duty, ${pence(vat)} VAT, ${pence(rest)} the rest: ${pct0.format((duty + vat) / price)} tax`));
    return row;
  };
  $('litre').replaceChildren(litre('petrol', 'Petrol'), litre('diesel', 'Diesel'));
  return prices;
}

function renderHero(data, fleetFacts, prices) {
  const { fleet, quarters } = data;
  const last = quarters.length - 1;
  const tiles = el('ul', 'wuk-tiles');
  tiles.append(
    tile(big.format(fleet.petrol[last]), `petrol cars licensed at the end of ${quarters[last]}`),
    tile(big.format(fleet.diesel[last]), `diesel cars, down from ${big.format(fleetFacts.peak)} in ${fleetFacts.peakQuarter}`),
  );
  if (prices) {
    const i = prices.weeks.length - 1;
    tiles.append(tile(pence(prices.petrol[i]), 'a litre of petrol, this week'), tile(pence(prices.diesel[i]), 'a litre of diesel, this week'));
  }
  $('hero-graphic').replaceChildren(tiles);
}

startFeature('petrol-diesel', async (data) => {
  const fleetFacts = renderFleet(data);
  renderModels(data);
  renderStrongholds(data);
  renderFallers(data);
  renderFuelMot(data.mot, {
    fuels: ['petrol', 'diesel', 'hybrid'],
    summarise: (bands) => {
      const mid = bands.find((b) => /10 to 14/.test(b.label)) ?? bands.at(-1);
      const { petrol, diesel } = mid.fuels;
      return (
        `At ${mid.label}, ${pct1.format(passRate(petrol))} of petrol cars passed first time, against ${pct1.format(passRate(diesel))} of diesels. ` +
        `The diesels had done far more miles: ${count.format(diesel.meanMiles)} on average, against ${count.format(petrol.meanMiles)}.`
      );
    },
  });
  const prices = await renderPump(fleetFacts, data);
  renderHero(data, fleetFacts, prices);
});
