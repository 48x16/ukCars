// The Electric page. Every sentence that states a fact is built from the data, so it stays
// true when the weekly pipeline brings in a new quarter.

import './shell.js';
import topology from '../data/geo/councils.json';
import { createChart } from './chart.js';
import { createCouncilMap, quintileBreaks, renderMapLegend } from './council-map.js';
import { loadElectric } from './data.js';
import { el, formatChange, renderTable } from './insight-charts.js';
import { quarterEndDate } from './quarters.js';

const $ = (id) => document.getElementById(id);
const count = new Intl.NumberFormat('en-GB');
const big = new Intl.NumberFormat('en-GB', { notation: 'compact', compactDisplay: 'long', maximumFractionDigits: 2 });
const oneDp = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const upTo1Dp = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
const share = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
const RANK_SIZE = 10;

/** The three ways to shade the map. Higher always means darker. */
const METRICS = {
  people: {
    label: 'Plug-ins per 1,000 people',
    value: (c) => c.plugInsPer1000,
    format: (v) => oneDp.format(v),
    note: 'Where plug-ins are most common. Darker councils have more privately kept plug-ins for their population.',
  },
  charger: {
    label: 'Plug-ins per public charger',
    value: (c) => c.plugInsPerCharger,
    format: (v) => oneDp.format(v),
    note:
      'How many plug-ins share each public charger. Darker councils have more plug-ins per charger, though many ' +
      'owners there may charge on their own driveway.',
  },
  chargers: {
    label: 'Public chargers per 100,000 people',
    value: (c) => c.chargersPer100k,
    format: (v) => count.format(Math.round(v)),
    note: 'Where public chargers are most plentiful for the population, whoever uses them.',
  },
};

function tile(value, label) {
  const node = el('li', 'wuk-tile');
  node.append(el('span', 'wuk-tile__value', value), el('span', 'wuk-tile__label', label));
  return node;
}

function renderHeadline(data) {
  const { uk, plugInQuarter, chargersDate } = data;
  const plugIns = uk.plugIns.at(-1);
  const electric = uk.electric.at(-1);
  $('tiles').replaceChildren(
    tile(big.format(plugIns), `privately kept plug-in vehicles at the end of ${plugInQuarter}`),
    tile(share.format(electric / plugIns), `of them battery electric (${count.format(electric)})`),
    tile(count.format(uk.chargers), `public chargers on ${chargersDate}, ${count.format(uk.rapid)} of them 50kW or faster`),
    tile(oneDp.format(plugIns / uk.chargers), 'privately kept plug-ins per public charger'),
  );
}

function renderGrowth(data) {
  const { uk } = data;
  const hybrid = uk.plugIns.map((v, i) => v - uk.electric[i]);
  const last = uk.quarters.length - 1;
  const yearAgo = uk.plugIns[last - 4];
  $('growth-summary').textContent =
    `${count.format(uk.plugIns[last])} privately kept plug-ins at the end of ${uk.quarters[last]}` +
    (yearAgo ? `, ${formatChange((uk.plugIns[last] - yearAgo) / yearAgo)} on a year earlier` : '') +
    `. Battery electric overtook plug-in hybrids in ${crossover(uk.quarters, uk.electric, hybrid) ?? 'none of these quarters'}.`;
  const chart = createChart($('growth-chart'), { totalLabel: 'All plug-ins' });
  chart.update({
    quarters: uk.quarters,
    dates: uk.quarters.map(quarterEndDate),
    series: [
      { id: 'electric', label: 'Battery electric', values: uk.electric },
      { id: 'plugin', label: 'Plug-in hybrid and range extended', values: hybrid },
    ],
    sorn: null,
    summary: `Line chart of privately kept plug-in vehicles, ${uk.quarters[0]} to ${uk.quarters[last]}. ${$('growth-summary').textContent} Focus the chart and use the arrow keys to read each quarter.`,
  });
}

/** The first quarter when `a` passed `b` and stayed ahead. */
function crossover(quarters, a, b) {
  for (let i = quarters.length - 1; i > 0; i--) {
    if (a[i - 1] <= b[i - 1] && a[i] > b[i]) return a.slice(i).every((v, j) => v > b[i + j]) ? quarters[i] : null;
  }
  return null;
}

function renderCouncilCard(council, data) {
  const card = $('council-card');
  if (!council) return card.replaceChildren();
  const rows = [
    ['Plug-ins', count.format(council.plugIns)],
    ['Battery electric', count.format(council.electric)],
    ['A year earlier', council.plugInsYearAgo === null ? 'Not known' : count.format(council.plugInsYearAgo)],
    ['Public chargers', `${count.format(council.chargers)} (${count.format(council.rapid)} rapid)`],
    ...Object.values(METRICS).map((m) => [m.label, m.value(council) === null ? 'Not known' : m.format(m.value(council))]),
  ];
  const list = el('dl', 'wuk-council__facts');
  for (const [term, value] of rows) list.append(el('dt', '', term), el('dd', '', value));
  card.replaceChildren(el('h3', 'govuk-heading-s wuk-council__name', `${council.name}, ${council.nation}`), list);
  card.append(el('p', 'govuk-body-s wuk-council__note', `Plug-ins at the end of ${data.plugInQuarter}.`));
}

function renderRanks(councils, metric) {
  const ranked = councils.filter((c) => metric.value(c) !== null).sort((a, b) => metric.value(b) - metric.value(a));
  const item = (c) => {
    const li = el('li', 'wuk-rank__item');
    li.append(el('span', 'wuk-rank__name', c.name), el('span', 'wuk-rank__value', metric.format(metric.value(c))));
    return li;
  };
  $('rank-high').replaceChildren(...ranked.slice(0, RANK_SIZE).map(item));
  $('rank-low').replaceChildren(...ranked.slice(-RANK_SIZE).reverse().map(item));
}

function fillCouncilSelect(select, councils) {
  const none = el('option', '', 'Choose a council');
  none.value = '';
  const groups = ['England', 'Scotland', 'Wales', 'Northern Ireland'].map((nation) => {
    const group = document.createElement('optgroup');
    group.label = nation;
    for (const c of councils.filter((x) => x.nation === nation)) {
      const option = el('option', '', c.name);
      option.value = c.code;
      group.append(option);
    }
    return group;
  });
  select.replaceChildren(none, ...groups.filter((g) => g.children.length));
}

async function start() {
  let data;
  try {
    data = await loadElectric();
  } catch (err) {
    $('error').hidden = false;
    $('error-message').textContent = navigator.onLine
      ? err.message
      : "You're offline, and this page hasn't been viewed on this device yet, so its data isn't saved.";
    return;
  }

  for (const node of document.querySelectorAll('[data-plug-in-quarter]')) node.textContent = data.plugInQuarter;
  for (const node of document.querySelectorAll('[data-chargers-date]')) node.textContent = data.chargersDate;
  $('unplaced').textContent =
    `${count.format(data.unplacedPlugIns)} plug-ins (${share.format(data.unplacedPlugIns / data.uk.plugIns.at(-1))}) ` +
    "couldn't be placed in a council and are only in the UK totals.";

  const byCode = new Map(data.councils.map((c) => [c.code, c]));
  const select = $('council');
  fillCouncilSelect(select, data.councils);

  const pick = (code) => {
    select.value = code ?? '';
    map.highlight(code);
    renderCouncilCard(byCode.get(code), data);
  };
  const map = createCouncilMap($('map'), { topology, onPick: pick });
  select.addEventListener('change', () => pick(select.value || null));

  const showMetric = (key) => {
    const metric = METRICS[key];
    const values = new Map(data.councils.map((c) => [c.code, metric.value(c)]));
    const breaks = quintileBreaks([...values.values()]);
    const ranked = data.councils.filter((c) => metric.value(c) !== null).sort((a, b) => metric.value(b) - metric.value(a));
    const summary =
      ranked.length > 0
        ? `Highest: ${ranked[0].name}, ${metric.format(metric.value(ranked[0]))}. ` +
          `Lowest: ${ranked.at(-1).name}, ${metric.format(metric.value(ranked.at(-1)))}.`
        : '';
    $('map-heading').textContent = metric.label;
    $('metric-note').textContent = metric.note;
    $('map-summary').textContent = `${summary} Find a council in the list, or see every value in the table below.`;
    for (const node of document.querySelectorAll('[data-metric-label]')) node.textContent = metric.label.toLowerCase();
    const missing = topology.objects.councils.geometries.some((g) => values.get(g.properties.code) == null);
    // Breaks are rounded to 2 figures, so the legend drops the values' trailing ".0".
    renderMapLegend($('map-legend'), breaks, (v) => upTo1Dp.format(v), { noData: missing });
    map.update({
      values,
      breaks,
      format: metric.format,
      label: `Map of UK councils shaded by ${metric.label.toLowerCase()}, darker for higher. ${summary}`,
    });
    renderRanks(data.councils, metric);
  };
  $('metric').addEventListener('change', (event) => showMetric(event.target.value));
  showMetric(document.querySelector('#metric input:checked').value);

  renderHeadline(data);
  renderGrowth(data);

  const known = (v, format) => (v === null ? 'Not known' : format(v));
  renderTable($('council-table'), {
    caption: `Privately kept plug-ins (end of ${data.plugInQuarter}) and public chargers (${data.chargersDate}) by council`,
    columns: [
      { label: 'Council', value: (c) => c.name },
      { label: 'Nation', value: (c) => c.nation },
      { label: 'Plug-ins', value: (c) => count.format(c.plugIns), numeric: true },
      { label: 'Battery electric', value: (c) => count.format(c.electric), numeric: true },
      { label: 'Public chargers', value: (c) => count.format(c.chargers), numeric: true },
      { label: '50kW+', value: (c) => count.format(c.rapid), numeric: true },
      ...Object.values(METRICS).map((m) => ({ label: m.label, value: (c) => known(m.value(c), m.format), numeric: true })),
    ],
    rows: data.councils,
  });
}

start();
