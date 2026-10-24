// The Insights page. Every sentence that states a fact is built from the data, so it stays
// true when the weekly pipeline brings in a new quarter.

import './shell.js';
import { format } from 'd3';
import { createChart } from './chart.js';
import { loadInsights } from './data.js';
import { el, formatChange, formatPercent, renderMovers, renderSlope, renderSplitBars, renderTable } from './insight-charts.js';
import { quarterEndDate } from './quarters.js';

const $ = (id) => document.getElementById(id);
const count = new Intl.NumberFormat('en-GB');
const big = new Intl.NumberFormat('en-GB', { notation: 'compact', compactDisplay: 'long', maximumFractionDigits: 1 });
const share1dp = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 1 });

function tile(value, label) {
  const node = el('li', 'wuk-tile');
  node.append(el('span', 'wuk-tile__value', value), el('span', 'wuk-tile__label', label));
  return node;
}

function renderHeadline(h) {
  $('tiles').replaceChildren(
    tile(big.format(h.licensed), `cars licensed in the UK at the end of ${h.quarter}`),
    tile(big.format(h.electric), `battery electric: ${share1dp.format(h.electricShare)} of licensed cars`),
    tile(
      share1dp.format(h.dieselShare),
      `diesel share, down from a peak of ${share1dp.format(h.dieselPeakShare)} in ${h.dieselPeakQuarter}`,
    ),
    tile(big.format(h.sorn), 'cars declared off the road (SORN)'),
  );
}

function renderMoverSection(kind, items, data) {
  const { quarters, settings } = data;
  const startQuarter = quarters[quarters.length - 1 - settings.years * 4];
  renderMovers($(`${kind}-list`), items, quarters, settings);
  renderTable($(`${kind}-table`), {
    caption: `Change in licensed cars, ${startQuarter} to ${quarters.at(-1)}`,
    columns: [
      { label: 'Model', value: (m) => m.name },
      { label: startQuarter, value: (m) => count.format(m.from), numeric: true },
      { label: quarters.at(-1), value: (m) => count.format(m.latest), numeric: true },
      { label: 'Change', value: (m) => formatChange(m.change), numeric: true },
      { label: 'Peak', value: (m) => `${count.format(m.peak)} (${m.peakQuarter})`, numeric: true },
    ],
    rows: items,
  });
}

function renderFuelShare(data) {
  const pct = format('.1%');
  const chart = createChart($('fuel-chart'), { formatValue: pct, formatTick: format('.0%'), totalLabel: null });
  chart.update({
    quarters: data.quarters,
    dates: data.quarters.map(quarterEndDate),
    series: data.fuelShare,
    sorn: null,
    summary:
      `Line chart of each fuel type's share of licensed cars, ${data.quarters[0]} to ${data.quarters.at(-1)}. ` +
      $('fuel-summary').textContent,
  });
}

function renderElectrified(data) {
  const chart = createChart($('electric-chart'), { totalLabel: 'Total electrified' });
  const last = data.quarters.length - 1;
  chart.update({
    quarters: data.quarters,
    dates: data.quarters.map(quarterEndDate),
    series: data.electrified,
    sorn: null,
    summary:
      `Line chart of licensed electrified cars, ${data.quarters[0]} to ${data.quarters.at(-1)}: ` +
      data.electrified.map((s) => `${s.label} ${count.format(s.values[last])}`).join(', ') +
      '. Focus the chart and use the arrow keys to read each quarter.',
  });
}

async function start() {
  let data;
  try {
    data = await loadInsights();
  } catch (err) {
    $('error').hidden = false;
    $('error-message').textContent = navigator.onLine
      ? err.message
      : "You're offline, and the insights haven't been viewed on this device yet, so they aren't saved.";
    return;
  }

  const h = data.headline;
  const { years, minBase, minSorn } = data.settings;
  for (const node of document.querySelectorAll('[data-latest-quarter]')) node.textContent = h.quarter;
  for (const node of document.querySelectorAll('[data-years]')) node.textContent = String(years);
  for (const node of document.querySelectorAll('[data-min-base]')) node.textContent = count.format(minBase);
  for (const node of document.querySelectorAll('[data-min-sorn]')) node.textContent = count.format(minSorn);

  renderHeadline(h);
  renderMoverSection('dying', data.dying, data);
  renderMoverSection('growing', data.growing, data);

  $('fuel-summary').textContent =
    `Diesel peaked at ${share1dp.format(h.dieselPeakShare)} of licensed cars in ${h.dieselPeakQuarter}, ` +
    `and is ${share1dp.format(h.dieselShare)} now.`;
  renderFuelShare(data);

  const electric = data.electrified.find((s) => s.id === 'electric');
  if (electric) {
    const yearAgo = electric.values.at(-5);
    $('electric-summary').textContent =
      `${count.format(electric.values.at(-1))} battery electric cars are licensed, ` +
      `${yearAgo ? `${formatChange((electric.values.at(-1) - yearAgo) / yearAgo)} on a year earlier` : 'new this year'}.`;
  }
  renderElectrified(data);

  renderSplitBars($('garage-list'), data.garageQueens);
  renderTable($('garage-table'), {
    caption: `Share of cars declared off the road, ${h.quarter}`,
    columns: [
      { label: 'Model', value: (m) => m.name },
      { label: 'Off the road (SORN)', value: (m) => count.format(m.sorn), numeric: true },
      { label: 'Licensed', value: (m) => count.format(m.licensed), numeric: true },
      { label: 'Share off the road', value: (m) => formatPercent(m.share), numeric: true },
    ],
    rows: data.garageQueens,
  });

  const firstQuarter = data.quarters[0];
  renderSlope($('makes-chart'), data.makes, { firstQuarter, latestQuarter: h.quarter });
  renderTable($('makes-table'), {
    caption: `Make rankings by licensed cars`,
    columns: [
      { label: 'Make', value: (m) => m.make },
      { label: `Rank ${firstQuarter}`, value: (m) => String(m.firstRank), numeric: true },
      { label: `Rank ${h.quarter}`, value: (m) => String(m.latestRank), numeric: true },
      { label: `Licensed ${h.quarter}`, value: (m) => count.format(m.latest), numeric: true },
    ],
    rows: data.makes,
  });
}

start();
