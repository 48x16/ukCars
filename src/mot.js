// The MOT page. Every sentence that states a fact is built from the data, so it stays true
// when the yearly MOT summary is replaced.

import './shell.js';
import { format } from 'd3';
import geo from '../data/geo/gb.json';
import { createAreaMap } from './area-map.js';
import { createChart } from './chart.js';
import { quintileBreaks, renderMapLegend } from './council-map.js';
import { loadMot } from './data.js';
import { el, modelLink, renderTable } from './insight-charts.js';
import { createPaintChart } from './paint-chart.js';

const $ = (id) => document.getElementById(id);
const count = new Intl.NumberFormat('en-GB');
const big = new Intl.NumberFormat('en-GB', { notation: 'compact', compactDisplay: 'long', maximumFractionDigits: 1 });
const pct1 = new Intl.NumberFormat('en-GB', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct0 = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
const oneDp = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const FIRST_AGE = 3; // cars' first MOT
const MIN_COLOUR_YEAR_TESTS = 20_000;
const MIN_BAND_TESTS = 2_000;
const RANK_SIZE = 10;

const rate = (o) => (o.tests ? o.pass / o.tests : null);
const title = (s) => s.charAt(0) + s.slice(1).toLowerCase();
const titleWords = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const list = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

function tile(value, label) {
  const node = el('li', 'wuk-tile');
  node.append(el('span', 'wuk-tile__value', value), el('span', 'wuk-tile__label', label));
  return node;
}

function renderHeadline(data) {
  const { totals, byAge, year } = data;
  const withMiles = byAge.filter((a) => a.meanMiles !== null);
  const meanMiles = withMiles.reduce((n, a) => n + a.meanMiles * a.tests, 0) / withMiles.reduce((n, a) => n + a.tests, 0);
  $('tiles').replaceChildren(
    tile(big.format(totals.tests), `car MOT tests in ${year}`),
    tile(pct1.format(totals.pass / totals.tests), 'passed first time'),
    tile(pct1.format(totals.prs / totals.tests), 'failed, but were fixed within the hour'),
    tile(count.format(Math.round(meanMiles / 100) * 100), 'average miles on the clock'),
  );
}

function renderAge(data) {
  const ages = data.byAge.filter((a) => a.age >= FIRST_AGE && a.tests > 0);
  const oldest = ages.at(-1).age;
  const label = (age) => (age === oldest ? `${age} years or more` : `${age} years`);
  const first = ages[0];
  const low = ages.slice(0, -1).reduce((a, b) => (rate(b) < rate(a) ? b : a));
  const later = ages.find((a) => a.age === low.age + 6);
  $('age-summary').textContent =
    `${pct1.format(rate(first))} of ${first.age}-year-old cars passed first time. That falls to ${pct1.format(rate(low))} ` +
    `at ${low.age} years` +
    (later && rate(later) > rate(low)
      ? `, then rises again: ${pct1.format(rate(later))} at ${later.age}. The cars that last that long are often the cherished ones.`
      : '.');

  const ageValues = ages.map((a) => a.age);
  const formatX = (v) => (v === oldest ? `${v}+` : String(v));
  const passChart = createChart($('pass-chart'), { formatValue: (v) => pct1.format(v), formatTick: format('.0%'), totalLabel: null, formatX });
  passChart.update({
    quarters: ages.map((a) => label(a.age)),
    dates: ageValues,
    series: [
      { id: 'petrol', label: 'Passed first time', values: ages.map(rate) },
      { id: 'diesel', label: 'Passed, or fixed within the hour', values: ages.map((a) => (a.pass + a.prs) / a.tests) },
    ],
    sorn: null,
    summary: `Line chart of the share of cars passing their MOT by age, ${first.age} to ${oldest} years. ${$('age-summary').textContent} Focus the chart and use the arrow keys to read each age.`,
  });

  const withMiles = ages.filter((a) => a.meanMiles !== null);
  const peak = withMiles.reduce((a, b) => (b.meanMiles > a.meanMiles ? b : a));
  const milesChart = createChart($('miles-chart'), { formatValue: (v) => `${count.format(v)} miles`, totalLabel: null, formatX });
  milesChart.update({
    quarters: withMiles.map((a) => label(a.age)),
    dates: withMiles.map((a) => a.age),
    series: [{ id: 'petrol', label: 'Average mileage', values: withMiles.map((a) => a.meanMiles) }],
    sorn: null,
    summary:
      `Line chart of average mileage at the MOT by age: ${count.format(withMiles[0].meanMiles)} miles at ${withMiles[0].age} years, ` +
      `highest at ${peak.age} years with ${count.format(peak.meanMiles)} miles. Focus the chart and use the arrow keys to read each age.`,
  });
}

function renderColours(data) {
  const { years: allYears, series: allSeries } = data.colours;
  const totals = allYears.map((_, i) => allSeries.reduce((n, s) => n + s.values[i], 0));
  // Cars first used in the last few years aren't due a test yet; the few that are (imports,
  // early tests) aren't typical, so years stop at the age of a first MOT.
  const keep = allYears.map((y, i) => totals[i] >= MIN_COLOUR_YEAR_TESTS && y <= data.year - FIRST_AGE);
  const years = allYears.filter((_, i) => keep[i]);
  const yearTotals = totals.filter((_, i) => keep[i]);
  // "Other" sits on top of the stack, after the named colours.
  const series = [...allSeries.filter((s) => s.name !== 'OTHER'), ...allSeries.filter((s) => s.name === 'OTHER')].map((s) => ({
    name: s.name,
    values: s.values.filter((_, i) => keep[i]),
  }));
  const shares = (s) => s.values.map((v, i) => v / yearTotals[i]);
  const last = years.length - 1;
  const named = series.filter((s) => s.name !== 'OTHER');
  const leader = named.reduce((a, b) => (shares(b)[last] > shares(a)[last] ? b : a));
  const faller = named
    .map((s) => {
      const sh = shares(s);
      const peak = Math.max(...sh);
      return { s, peak, peakYear: years[sh.indexOf(peak)], now: sh[last] };
    })
    .reduce((a, b) => (b.peak - b.now > a.peak - a.now ? b : a));
  $('colour-summary').textContent =
    `${title(leader.name)} is the most common colour for cars first used in ${years[last]}: ${pct0.format(shares(leader)[last])} of them. ` +
    `${title(faller.s.name)} peaked at ${pct0.format(faller.peak)} of cars first used in ${faller.peakYear}, and is ${pct0.format(faller.now)} now.`;

  createPaintChart($('paint-chart')).update({
    years,
    series,
    summary: `Stacked area chart of the colours of cars tested, by year first used, ${years[0]} to ${years[last]}. ${$('colour-summary').textContent} Focus the chart and use the arrow keys to read each year.`,
  });

  renderTable($('paint-table'), {
    caption: `Share of cars tested in ${data.year} by colour, by year first used`,
    columns: [
      { label: 'Year first used', value: (r) => String(r.year) },
      ...series.map((s, j) => ({ label: title(s.name), value: (r) => pct1.format(r.shares[j]), numeric: true })),
    ],
    rows: years.map((year, i) => ({ year, shares: series.map((s) => s.values[i] / yearTotals[i]) })).reverse(),
  });
}

const AREA_METRICS = {
  pass: {
    label: 'Passed first time',
    value: (a) => rate(a),
    format: (v) => pct1.format(v),
    legend: (v) => pct0.format(v),
    note: 'The share of cars passing first time at test centres in each area. Darker areas pass more often.',
  },
  miles: {
    label: 'Average mileage',
    value: (a) => a.meanMiles,
    format: (v) => `${count.format(v)} miles`,
    legend: (v) => count.format(v),
    note: 'Average miles on the clock of cars tested in each area. Darker areas have higher mileage.',
  },
  age: {
    label: 'Average age',
    value: (a) => a.meanAge,
    format: (v) => `${oneDp.format(v)} years`,
    legend: (v) => oneDp.format(v),
    note: 'Average age of cars tested in each area. Darker areas have older cars.',
  },
};

function renderAreas(data) {
  const names = new Map(geo.areas.map((a) => [a.area, a.name]));
  const areas = data.areas.filter((a) => names.has(a.area)).map((a) => ({ ...a, name: names.get(a.area) }));
  const byArea = new Map(areas.map((a) => [a.area, a]));
  const fullName = (a) => `${a.area} ${a.name}`;

  const select = $('area');
  const none = el('option', '', 'Choose an area');
  none.value = '';
  select.replaceChildren(
    none,
    ...[...areas].sort((a, b) => a.area.localeCompare(b.area)).map((a) => {
      const option = el('option', '', fullName(a));
      option.value = a.area;
      return option;
    }),
  );

  const card = (code) => {
    const a = byArea.get(code);
    if (!a) return $('area-card').replaceChildren();
    const plugIns = (a.fuels.electric + a.fuels.hybrid) / a.tests;
    const facts = el('dl', 'wuk-council__facts');
    for (const [term, value] of [
      ['Car MOT tests', count.format(a.tests)],
      ['Passed first time', pct1.format(a.pass / a.tests)],
      ['Fixed within the hour', pct1.format(a.prs / a.tests)],
      ['Failed', pct1.format(a.fail / a.tests)],
      ['Average mileage', `${count.format(a.meanMiles)} miles`],
      ['Average age', `${oneDp.format(a.meanAge)} years`],
      ['Electric or hybrid', pct1.format(plugIns)],
    ]) {
      facts.append(el('dt', '', term), el('dd', '', value));
    }
    $('area-card').replaceChildren(el('h3', 'govuk-heading-s wuk-council__name', fullName(a)), facts);
  };
  const pick = (code) => {
    select.value = code ?? '';
    map.highlight(code);
    card(code);
  };
  const map = createAreaMap($('map'), { geo, onPick: pick });
  select.addEventListener('change', () => pick(select.value || null));

  const showMetric = (key) => {
    const metric = AREA_METRICS[key];
    const values = new Map(areas.map((a) => [a.area, metric.value(a)]));
    const breaks = quintileBreaks([...values.values()]);
    const ranked = [...areas].sort((a, b) => metric.value(b) - metric.value(a));
    const summary =
      `Highest: ${fullName(ranked[0])}, ${metric.format(metric.value(ranked[0]))}. ` +
      `Lowest: ${fullName(ranked.at(-1))}, ${metric.format(metric.value(ranked.at(-1)))}.`;
    $('map-heading').textContent = metric.label;
    $('metric-note').textContent = metric.note;
    $('map-summary').textContent = `${summary} Find an area in the list to see all its figures.`;
    renderMapLegend($('map-legend'), breaks, metric.legend);
    map.update({
      sizes: new Map(areas.map((a) => [a.area, a.tests])),
      values,
      breaks,
      format: metric.format,
      label: `Map of Great Britain's postcode areas, circles sized by tests and shaded by ${metric.label.toLowerCase()}, darker for higher. ${summary}`,
    });
    const item = (a) => {
      const li = el('li', 'wuk-rank__item');
      li.append(el('span', 'wuk-rank__name', fullName(a)), el('span', 'wuk-rank__value', metric.format(metric.value(a))));
      return li;
    };
    $('area-high').replaceChildren(...ranked.slice(0, RANK_SIZE).map(item));
    $('area-low').replaceChildren(...ranked.slice(-RANK_SIZE).reverse().map(item));
  };
  $('metric').addEventListener('change', (event) => showMetric(event.target.value));
  showMetric(document.querySelector('#metric input:checked').value);
}

function renderModels(data) {
  const bands = data.ageBands;
  const select = $('band');
  select.replaceChildren(
    ...bands.map((b, i) => {
      const option = el('option', '', b.label);
      option.value = String(i);
      return option;
    }),
  );
  select.value = String(Math.min(2, bands.length - 1)); // 10 to 14 years: the age where cars part company
  for (const node of document.querySelectorAll('[data-min-band]')) node.textContent = count.format(MIN_BAND_TESTS);

  const show = (i) => {
    const ranked = data.models
      .filter((m) => m.bands[i].tests >= MIN_BAND_TESTS)
      .map((m) => ({ ...m, bandRate: rate(m.bands[i]) }))
      .sort((a, b) => b.bandRate - a.bandRate);
    const item = (m) => {
      const li = el('li', 'wuk-rank__item');
      const name = el('a', 'govuk-link wuk-rank__name', m.name);
      name.href = modelLink(m);
      li.append(name, el('span', 'wuk-rank__value', pct1.format(m.bandRate)));
      return li;
    };
    $('model-best').replaceChildren(...ranked.slice(0, RANK_SIZE).map(item));
    $('model-worst').replaceChildren(...ranked.slice(-RANK_SIZE).reverse().map(item));
  };
  select.addEventListener('change', () => show(Number(select.value)));
  show(Number(select.value));

  const bandRate = (m, i) => (m.bands[i].tests >= 100 ? pct1.format(rate(m.bands[i])) : 'Too few');
  renderTable($('model-table'), {
    caption: `Car models with at least 500 MOT tests in ${data.year}`,
    columns: [
      { label: 'Model', value: (m) => m.name },
      { label: 'Tests', value: (m) => count.format(m.tests), numeric: true },
      { label: 'Passed first time', value: (m) => pct1.format(rate(m)), numeric: true },
      ...bands.map((b, i) => ({ label: `Passed, ${b.label}`, value: (m) => bandRate(m, i), numeric: true })),
      { label: 'Average age', value: (m) => oneDp.format(m.meanAge), numeric: true },
      { label: 'Average mileage', value: (m) => (m.meanMiles === null ? 'Not known' : count.format(m.meanMiles)), numeric: true },
    ],
    rows: data.models,
  });
}

function renderMonths(data) {
  const months = data.byMonth.map((m, i) => ({ name: MONTHS[i], tests: m.tests })).filter((m) => m.tests > 0);
  const max = Math.max(...months.map((m) => m.tests));
  const ranked = [...months].sort((a, b) => b.tests - a.tests);
  const busiest = ranked.slice(0, 2).map((m) => m.name);
  const plates = ranked.slice(0, 3).some((m) => m.name === 'March') && ranked.slice(0, 3).some((m) => m.name === 'September');
  $('month-summary').textContent =
    `${list(busiest)} were the busiest months, ${ranked.at(-1).name} the quietest.` +
    (plates
      ? ' New registration plates arrive in March and September, so new car sales bunch up then, and three years later so do first MOTs.'
      : '');
  $('months').replaceChildren(
    ...months.map((m) => {
      const li = el('li', 'wuk-month');
      const bar = el('span', 'wuk-month__bar');
      bar.style.width = `${(m.tests / max) * 100}%`;
      bar.setAttribute('aria-hidden', 'true');
      li.append(el('span', 'wuk-month__name', m.name), el('span', 'wuk-month__track'), el('span', 'wuk-month__value', big.format(m.tests)));
      li.querySelector('.wuk-month__track').append(bar);
      return li;
    }),
  );
}

function renderNotes(data) {
  const { match } = data;
  const vans = match.notCars.slice(0, 3).map((m) => titleWords(m.name));
  $('note-vans').append(
    el('b', '', 'Vans, pickups and motorhomes are left out of the model rankings.'),
    " MOT test class 4 includes them, but DVLA's figures here are cars only, so models tested far more often than DVLA has cars of them aren't ranked" +
      (vans.length ? `: ${list(vans)} and others, ${count.format(match.notCarsTests)} tests.` : '.'),
  );
  $('note-match').append(
    el('b', '', 'Models are matched to DVLA’s names.'),
    ` DVSA's model names are written more freely; ${pct1.format(match.testsMatched / match.testsInModels)} of tests matched a DVLA model.`,
  );
}

async function start() {
  let data;
  try {
    data = await loadMot();
  } catch (err) {
    $('error').hidden = false;
    $('error-message').textContent = navigator.onLine
      ? err.message
      : "You're offline, and this page hasn't been viewed on this device yet, so its data isn't saved.";
    return;
  }
  for (const node of document.querySelectorAll('[data-year]')) node.textContent = String(data.year);
  renderHeadline(data);
  renderAge(data);
  renderColours(data);
  renderAreas(data);
  renderModels(data);
  renderMonths(data);
  renderNotes(data);
}

start();
