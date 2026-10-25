// A make's story, year by year: every new car registered in Great Britain since 2001 down a road
// whose width follows each year's total; then its peak (most models on sale at once), the ones
// off the road, and the make at the MOT (colours, engines, where they live). Drawn for the Mini
// feature and for any make on the Year by year page. Every fact is built from the data.

import { Car } from 'lucide';
import geo from '../data/geo/gb.json';
import { createAreaMap } from './area-map.js';
import { createChart } from './chart.js';
import { quintileBreaks, renderMapLegend } from './council-map.js';
import { hidden, icon, stackedBar } from './feature-charts.js';
import { $, fill } from './feature-page.js';
import { el, formatChange, renderTable } from './insight-charts.js';
import { paint } from './paint-chart.js';
import { quarterEndDate } from './quarters.js';

const count = new Intl.NumberFormat('en-GB');
const pct0 = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
/** Models with fewer new cars than this in a year are folded into "Other". */
const SHOWN = 50;
/** At most this many models a year on the road; the rest are "Other". */
const MAX_ROWS = 8;
/** A model is on sale in a year with at least this many new cars (as in the pipeline). */
const ON_SALE = 100;
const MONTHS = ['March', 'June', 'September'];
const TOP_AREAS = 10;
/** Colours and engine sizes under this share of the make's cars are folded into "Other". */
const MIN_SHARE = 0.01;

const sum = (values) => values.reduce((a, b) => a + b, 0);
const title = (s) => s.charAt(0) + s.slice(1).toLowerCase();
const list = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);
/** A share in words: "under 1%" rather than a misleading 0%. */
const share = (v) => (v > 0 && v < 0.005 ? 'under 1%' : pct0.format(v));
const charts = new WeakMap(); // one chart per container, reused when the make changes

function tile(value, label) {
  const li = el('li', 'wuk-tile');
  li.append(el('span', 'wuk-tile__value', value), el('span', 'wuk-tile__label', label));
  return li;
}

/** Name, bar and value rows, all on one scale. */
export function bars(rows, scale, className = 'wuk-road__models') {
  const ol = el('ol', className);
  for (const r of rows) {
    const li = el('li', 'wuk-road__model');
    const track = el('span', 'wuk-road__track');
    track.setAttribute('aria-hidden', 'true');
    const fillBar = el('span', 'wuk-road__fill');
    fillBar.style.width = `${(r.value / scale) * 100}%`;
    track.append(fillBar);
    li.append(el('span', 'wuk-road__name', r.label), track, el('span', 'wuk-road__value', r.text ?? count.format(r.value)));
    ol.append(li);
  }
  return ol;
}

/** The years from the make's first on sale: a brand new to Britain doesn't start with empty road. */
function fromFirstYear(data) {
  const start = Math.max(0, data.totals.findIndex((t) => t >= ON_SALE));
  const cut = (values) => values.slice(start);
  return {
    ...data,
    years: cut(data.years),
    totals: cut(data.totals),
    electric: cut(data.electric),
    models: data.models.map((m) => ({ ...m, values: cut(m.values), ranks: m.ranks && cut(m.ranks) })),
  };
}

function facts(data) {
  const full = data.years.map((_, i) => i).filter((i) => data.years[i] !== data.partial?.year);
  const best = full.reduce((a, b) => (data.totals[b] > data.totals[a] ? b : a));
  // The first year is usually a part-year launch (as for the new Mini in 2001), so not the quietest.
  const rest = full.length > 1 ? full.slice(1) : full;
  const worst = rest.reduce((a, b) => (data.totals[b] < data.totals[a] ? b : a));
  const latest = full.at(-1);
  const favourite = [...data.models].sort((a, b) => sum(b.values) - sum(a.values))[0];
  const onSale = data.years.map((_, i) => data.models.filter((m) => m.id !== 'special' && m.values[i] >= ON_SALE));
  const peak = Math.max(...onSale.map((m) => m.length));
  return { best, worst, latest, favourite, onSale, peak, electricShare: data.electric[latest] / data.totals[latest] };
}

function renderHero(data, f, { many }) {
  const all = sum(data.totals);
  const tiles = el('ul', 'wuk-tiles');
  tiles.append(
    tile(count.format(all), `new ${many} registered since ${data.years[0]}`),
    tile(String(data.years[f.best]), `the best year, with ${count.format(data.totals[f.best])} new ${many}`),
    tile(f.favourite.label, `the favourite: ${pct0.format(sum(f.favourite.values) / all)} of all new ${many}`),
    tile(pct0.format(f.electricShare), `of new ${many} in ${data.years[f.latest]} were electric`),
  );
  $('hero-graphic').replaceChildren(tiles);
}

function tags(data, i) {
  const year = data.years[i];
  const items = [
    ...data.models.filter((m) => m.launched === year).map((m) => ({ text: `New: ${m.label}`, kind: 'new' })),
    ...(data.firstElectric === year ? [{ text: 'Electric arrives', kind: 'new' }] : []),
    ...data.models.filter((m) => m.ended === year).map((m) => ({ text: `Farewell: ${m.label}`, kind: 'end' })),
  ];
  if (!items.length) return null;
  const ul = el('ul', 'wuk-road__tags');
  for (const t of items) ul.append(el('li', `wuk-road__tag wuk-road__tag--${t.kind}`, t.text));
  return ul;
}

function yearColour(data, year) {
  const c = data.mot?.colours.byYear[year];
  if (!c) return null;
  const p = el('p', 'wuk-road__colour');
  const swatch = el('span', 'wuk-road__swatch');
  swatch.style.background = paint(c.colour);
  swatch.setAttribute('aria-hidden', 'true');
  p.append(swatch, `Favourite colour at the MOT: ${title(c.colour)}, ${pct0.format(c.share)}`);
  return p;
}

function renderRoad(data, f, { many, intro }) {
  const widest = Math.max(...data.totals);
  const scale = Math.max(...data.models.flatMap((m) => m.values));
  const width = (i) => (data.totals[i] / widest).toFixed(3);
  const totalLabel = (i) =>
    data.years[i] === data.partial?.year
      ? `${count.format(data.totals[i])} so far (January to ${MONTHS[data.partial.quarters - 1]})`
      : `${count.format(data.totals[i])} new ${many}`;
  const items = data.years.map((year, i) => {
    const partial = year === data.partial?.year;
    // Each year's stretch of road narrows or widens towards the next full year.
    const next = i + 1 < data.years.length && data.years[i + 1] !== data.partial?.year ? i + 1 : i;
    const li = el('li', `wuk-road__year${partial ? ' wuk-road__year--partial' : ''}`);
    li.style.setProperty('--w0', width(i));
    li.style.setProperty('--w1', width(next));
    const news = tags(data, i);
    const dot = el('span', `wuk-road__dot${news?.querySelector('.wuk-road__tag--new') ? ' wuk-road__dot--new' : ''}`);
    dot.setAttribute('aria-hidden', 'true');
    const total = el('p', 'wuk-road__total', totalLabel(i));
    if (i > 0 && !partial && data.totals[i - 1]) total.append(el('span', 'wuk-road__change', ` ${formatChange((data.totals[i] - data.totals[i - 1]) / data.totals[i - 1])}`));
    li.append(dot, el('h3', 'wuk-road__when', String(year)), total);
    if (news) li.append(news);
    const rows = data.models
      .filter((m) => m.values[i] >= SHOWN)
      .map((m) => ({ label: m.label, value: m.values[i] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, MAX_ROWS);
    const other = data.totals[i] - sum(rows.map((r) => r.value));
    if (other >= SHOWN) rows.push({ label: 'Other', value: other });
    li.append(bars(rows, scale));
    if (data.electric[i] >= SHOWN) li.append(el('p', 'wuk-road__electric', `Electric: ${count.format(data.electric[i])}, ${pct0.format(data.electric[i] / data.totals[i])} of new ${many}`));
    const colour = yearColour(data, year);
    if (colour) li.append(colour);
    return li;
  });
  const end = el('li', 'wuk-road__end');
  end.setAttribute('aria-hidden', 'true');
  end.style.setProperty('--w0', width(data.years.length - 1));
  end.append(icon(Car));
  $('road').replaceChildren(...items, end);

  const y = (i) => data.years[i];
  const allElectric = sum(data.electric) >= sum(data.totals) * 0.95;
  $('road-summary').textContent =
    (intro ? `${intro} ` : '') +
    `The best year was ${y(f.best)}, with ${count.format(data.totals[f.best])} new ${many}; the quietest full year since ${y(0)} was ${y(f.worst)}, with ${count.format(data.totals[f.worst])}.` +
    (allElectric
      ? ` Every one is electric.`
      : data.firstElectric
        ? ` Electric ${many} arrived in ${data.firstElectric}, and were ${share(f.electricShare)} of new ${many} in ${y(f.latest)}.`
        : '');
  $('road-colour-note').hidden = !data.mot;

  renderTable($('road-table'), {
    caption: `New ${many} registered each year, Great Britain`,
    columns: [
      { label: 'Year', value: (i) => (y(i) === data.partial?.year ? `${y(i)} (to ${data.latestQuarter})` : String(y(i))) },
      { label: `New ${many}`, value: (i) => count.format(data.totals[i]), numeric: true },
      { label: 'Electric', value: (i) => count.format(data.electric[i]), numeric: true },
      { label: 'Models on sale', value: (i) => String(f.onSale[i].length), numeric: true },
      { label: 'Biggest model', value: (i) => [...data.models].sort((a, b) => b.values[i] - a.values[i])[0].label },
    ],
    rows: data.years.map((_, i) => i),
  });
}

function renderPeak(data, f, { one }) {
  const peakYears = data.years.filter((_, i) => f.onSale[i].length === f.peak);
  const first = data.years.indexOf(peakYears[0]);
  $('peak-title').textContent = `Peak ${one}`;
  const when = peakYears.length > 3 ? `${peakYears[0]} (and ${peakYears.length - 1} years since)` : list(peakYears.map(String));
  $('peak-summary').textContent =
    `Peak ${one} was ${when}, with ${f.peak} ${f.peak === 1 ? 'model' : 'models'} on sale at once` +
    (f.peak <= 10 ? `: ${list(f.onSale[first].map((m) => m.label))}. ` : '. ') +
    `Now there ${f.onSale[f.latest].length === 1 ? 'is' : 'are'} ${f.onSale[f.latest].length}.`;
  $('peak').replaceChildren(
    ...data.years.map((year, i) => {
      const li = el('li', `wuk-peak__year${f.onSale[i].length === f.peak ? ' wuk-peak__year--peak' : ''}`);
      const stack = el('span', 'wuk-peak__stack');
      stack.setAttribute('aria-hidden', 'true');
      for (let n = 0; n < f.onSale[i].length; n++) stack.append(el('span', 'wuk-peak__block'));
      const label = el('span', `wuk-peak__label${year % 5 === 0 || f.onSale[i].length === f.peak ? '' : ' wuk-peak__label--quiet'}`, String(year).slice(2));
      label.setAttribute('aria-hidden', 'true');
      li.append(stack, label, hidden(`${year}: ${f.onSale[i].length} models`));
      return li;
    }),
  );
}

function renderFleet(data, { many }) {
  const fleet = data.fleet;
  const section = $('fleet-chart').closest('section');
  const last = fleet ? fleet.quarters.length - 1 : 0;
  const offShare = (m) => m.sorn[last] / (m.licensed[last] + m.sorn[last]);
  const ranked = fleet ? fleet.models.filter((m) => m.licensed[last] + m.sorn[last] >= 500).sort((a, b) => offShare(b) - offShare(a)) : [];
  section.hidden = !ranked.length;
  if (!ranked.length) return;
  const { quarters, models } = fleet;
  const licensed = quarters.map((_, i) => sum(models.map((m) => m.licensed[i])));
  const sorn = quarters.map((_, i) => sum(models.map((m) => m.sorn[i])));
  const fall = (m) => (m.peak - m.licensed[last]) / m.peak;
  const shrunk = models
    .map((m) => ({ ...m, peak: Math.max(...m.licensed) }))
    .filter((m) => m.peak >= 1000 && fall(m) > 0.1)
    .sort((a, b) => fall(b) - fall(a));
  $('fleet-summary').textContent =
    `${count.format(sorn[last])} ${many} were declared off the road (SORN) at the end of ${quarters[last]}` +
    (sorn[0] ? `, against ${count.format(sorn[0])} in ${quarters[0]}.` : '.') +
    (offShare(ranked[0]) >= 0.01 ? ` ${ranked[0].label}s are the most likely to be tucked away: ${pct0.format(offShare(ranked[0]))} of them.` : '') +
    (shrunk.length
      ? ` Furthest below their peak on the road: ${list(shrunk.slice(0, 3).map((m) => `the ${m.label} (${count.format(m.licensed[last])}, from ${count.format(m.peak)})`))}.`
      : '');
  const root = $('fleet-chart');
  if (!charts.has(root)) charts.set(root, createChart(root, { totalLabel: null }));
  charts.get(root).update({
    quarters,
    dates: quarters.map(quarterEndDate),
    series: [{ id: 'petrol', label: 'Licensed', values: licensed }],
    sorn: { label: 'Off the road (SORN)', values: sorn },
    summary: `Line chart of licensed ${many}, with those declared off the road shaded, ${quarters[0]} to ${quarters[last]}. ${$('fleet-summary').textContent}`,
  });
  $('fleet-bars').replaceChildren(
    ...ranked.slice(0, 15).map((m) => {
      const row = el('li', 'wuk-stackrow');
      const segments = [
        { id: 'licensed', label: 'Licensed', value: m.licensed[last] },
        { id: 'sorn', label: 'Off the road', value: m.sorn[last] },
      ];
      row.append(el('span', 'wuk-stackrow__label', m.label), ...stackedBar(segments, (id) => `wuk-fill--${id}`));
      return row;
    }),
  );
}

function renderColours(mot, { one, many }) {
  const total = (c) => sum(Object.values(c));
  const mine = total(mot.colours.make);
  const all = total(mot.colours.allCars);
  const named = Object.entries(mot.colours.make)
    .filter(([name, n]) => name !== 'NOT STATED' && n / mine >= MIN_SHARE)
    .sort((a, b) => b[1] - a[1]);
  const segs = (counts) => [
    ...named.map(([name]) => ({ id: name, label: title(name), value: counts[name] ?? 0 })),
    { id: 'OTHER', label: 'Other', value: total(counts) - sum(named.map(([name]) => counts[name] ?? 0)) },
  ];
  $('colour-bars').replaceChildren(
    ...[
      [many, mot.colours.make],
      ['All cars', mot.colours.allCars],
    ].map(([name, counts]) => {
      const row = el('li', 'wuk-stackrow');
      row.append(el('span', 'wuk-stackrow__label', name), ...stackedBar(segs(counts), null, { paintFor: paint, minLabel: 0.06 }));
      return row;
    }),
  );
  $('colour-legend').replaceChildren(
    ...segs(mot.colours.make).map((s) => {
      const item = el('li', 'wuk-legend__item');
      const key = el('span', 'wuk-road__swatch');
      key.style.background = paint(s.id);
      item.append(key, el('span', '', s.label));
      return item;
    }),
  );
  const lift = named
    .map(([name, n]) => ({ name, ratio: n / mine / ((mot.colours.allCars[name] ?? 0) / all) }))
    .filter((c) => Number.isFinite(c.ratio))
    .sort((a, b) => b.ratio - a.ratio)[0];
  $('colour-summary').textContent =
    `The favourite ${one} colour is ${title(named[0][0]).toLowerCase()}: ${pct0.format(named[0][1] / mine)} of the ${count.format(mot.tests)} ${many} tested in ${mot.year}.` +
    (lift && lift.ratio >= 1.2 ? ` ${many} are ${lift.ratio.toFixed(1)} times as likely as other cars to be ${title(lift.name).toLowerCase()}.` : '');
}

function renderEngines(mot, { many }) {
  const { band, counts } = mot.engines;
  const tested = sum(counts);
  const rows = counts
    .map((n, i) => ({ i, value: n }))
    .filter((r) => r.value / tested >= MIN_SHARE)
    .map((r) => ({ label: r.i === 0 ? 'Electric' : `${((r.i * band) / 1000).toFixed(1)} litre`, value: r.value, text: pct0.format(r.value / tested) }));
  const other = tested - sum(rows.map((r) => r.value));
  if (other / tested >= 0.005) rows.push({ label: 'Other', value: other, text: pct0.format(other / tested) });
  $('engine-bars').replaceChildren(bars(rows, Math.max(...rows.map((r) => r.value)), 'wuk-road__models wuk-engines'));
  const top = [...rows].sort((a, b) => b.value - a.value);
  const describe = (r) => (r.label === 'Electric' ? 'are electric' : `have a ${r.label.toLowerCase()} engine`);
  $('engine-summary').textContent =
    `Most ${many} at the MOT ${describe(top[0])} (${pct0.format(top[0].value / tested)})` +
    (top[1] ? `; next, ${pct0.format(top[1].value / tested)} ${describe(top[1])}.` : '.');
}

function renderMap(mot, { many }) {
  const names = new Map(geo.areas.map((a) => [a.area, a.name]));
  const fullName = (a) => `${a.area} ${names.get(a.area)}`;
  const per1000 = (a) => (a.tests / a.all) * 1000;
  const areas = mot.areas.filter((a) => names.has(a.area)); // DVSA has a few unknown areas, such as XX
  const values = new Map(areas.map((a) => [a.area, per1000(a)]));
  const breaks = quintileBreaks([...values.values()]);
  const fmt = (v) => `${v.toFixed(1)} per 1,000 tests`;
  const byShare = [...areas].sort((a, b) => per1000(b) - per1000(a));
  const byCount = [...areas].sort((a, b) => b.tests - a.tests);
  const summary =
    `${many} are most popular in ${fullName(byShare[0])}, at ${fmt(per1000(byShare[0]))}, and least in ${fullName(byShare.at(-1))}, at ${fmt(per1000(byShare.at(-1)))}. ` +
    `The most ${many} are tested in ${fullName(byCount[0])}: ${count.format(byCount[0].tests)}.`;
  $('map-summary').textContent = summary;
  renderMapLegend($('map-legend'), breaks, (v) => v.toFixed(1));
  createAreaMap($('map'), { geo }).update({
    sizes: new Map(areas.map((a) => [a.area, a.tests])),
    values,
    breaks,
    format: fmt,
    label: `Map of Great Britain's postcode areas, circles sized by MOT tests of ${many} and shaded by ${many} per 1,000 tests, darker for more. ${summary}`,
  });
  const item = (a, text) => {
    const li = el('li', 'wuk-rank__item');
    li.append(el('span', 'wuk-rank__name', fullName(a)), el('span', 'wuk-rank__value', text));
    return li;
  };
  $('area-share').replaceChildren(...byShare.slice(0, TOP_AREAS).map((a) => item(a, per1000(a).toFixed(1))));
  $('area-count').replaceChildren(...byCount.slice(0, TOP_AREAS).map((a) => item(a, count.format(a.tests))));
}

function renderMot(data, words) {
  const sections = ['colour-bars', 'engine-bars', 'map'].map((id) => $(id).closest('section'));
  for (const s of sections) s.hidden = !data.mot;
  if (!data.mot) return;
  fill('mot-year', String(data.mot.year));
  fill('mot-tests', count.format(data.mot.tests));
  renderColours(data.mot, words);
  renderEngines(data.mot, words);
  renderMap(data.mot, words);
}

/**
 * Draws a make's story into the page. `one` and `many` name its cars ("Mini", "Minis"); `intro`
 * is an opening sentence for the road, if the make has one.
 */
export function renderMakeStory(raw, { one, many, intro = '' }) {
  const data = fromFirstYear(raw);
  fill('latest-quarter', data.latestQuarter);
  fill('first-year', String(data.years[0]));
  fill('make-one', one);
  fill('make-many', many);
  const words = { one, many, intro };
  const f = facts(data);
  renderHero(data, f, words);
  renderRoad(data, f, words);
  renderPeak(data, f, words);
  renderFleet(data, words);
  renderMot(data, words);
}
