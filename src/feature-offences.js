// "Caught out": drink-driving since 1979, when it happens, breath tests, region by region, drink
// and drug driving in court, and the motoring offences police deal with. Collisions only: no
// deaths or casualty counts, by the site's rules. Every fact is built from the data.

import { createChart } from './chart.js';
import { theRegion } from './feature-charts.js';
import { $, fill, startFeature } from './feature-page.js';
import { el, emptyNote, renderTable } from './insight-charts.js';
import { bars, markedBars } from './make-story.js';

const count = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const pct0 = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
const pct1 = new Intl.NumberFormat('en-GB', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const yearDate = (y) => new Date(Date.UTC(y, 6, 1));
const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;
/** Ranked police forces need this many tests in the year. */
const MIN_FORCE_TESTS = 1_000;

function tile(value, label) {
  const li = el('li', 'wuk-tile');
  li.append(el('span', 'wuk-tile__value', value), el('span', 'wuk-tile__label', label));
  return li;
}

function lineChart(root, years, series, { formatValue = (v) => count.format(v), formatTick = (v) => count.format(v), summary }) {
  createChart(root, { formatValue, formatTick, totalLabel: null }).update({
    quarters: years.map(String),
    dates: years.map(yearDate),
    series,
    sorn: null,
    summary,
  });
}

function renderDrink(d) {
  const rows = d.collisions;
  if (!rows.length) return $('drink-chart').replaceChildren(emptyNote());
  const first = rows[0];
  const last = rows.at(-1);
  const fall = 1 - last.collisions / first.collisions;
  const sex = (r) => (r && r.male !== null && r.female !== null ? r.female / (r.male + r.female) : null);
  const s0 = sex(d.drivers[0]);
  const s1 = sex(d.drivers.at(-1));
  $('drink-summary').textContent =
    `There were about ${count.format(last.collisions)} drink-drive collisions in ${last.year}, ${pct0.format(fall)} fewer than the ${count.format(first.collisions)} of ${first.year}. ` +
    (s0 !== null && s1 !== null ? `Women were the drink-driver in ${pct0.format(s1)} of them, against ${pct0.format(s0)} in ${d.drivers[0].year}.` : '');
  lineChart($('drink-chart'), rows.map((r) => r.year), [{ id: 'cars', label: 'Drink-drive collisions', values: rows.map((r) => r.collisions) }], {
    summary: `Line chart of drink-drive collisions in Great Britain, ${first.year} to ${last.year}. ${$('drink-summary').textContent}`,
  });
  renderTable($('drink-table'), {
    caption: 'Drink-drive collisions, Great Britain',
    columns: [
      { label: 'Year', value: (r) => String(r.year) },
      { label: 'Collisions', numeric: true, value: (r) => count.format(r.collisions) },
      { label: 'Female drink-driver', numeric: true, value: (r) => { const x = d.drivers.find((v) => v.year === r.year); return x?.female === null || !x ? 'n/a' : count.format(x.female); } },
    ],
    rows,
  });
}

function renderWhen(d) {
  const { hours } = d;
  const months = d.months.months;
  if (!hours.some((h) => h.collisions)) return $('hours-chart').replaceChildren(emptyNote());
  fill('span', `${d.months.from} to ${d.months.to}`);
  const all = hours.reduce((n, h) => n + h.collisions, 0);
  const night = hours.filter((h) => h.hour >= 21 || h.hour < 3).reduce((n, h) => n + h.collisions, 0);
  const peak = hours.reduce((a, b) => (b.collisions > a.collisions ? b : a));
  const low = hours.reduce((a, b) => (b.collisions < a.collisions ? b : a));
  const busiest = months.reduce((a, b) => (b.collisions > a.collisions ? b : a));
  const quietest = months.reduce((a, b) => (b.collisions < a.collisions ? b : a));
  $('when-summary').textContent =
    `${pct0.format(night / all)} of drink-drive collisions happen between 9pm and 3am. The worst hour starts at ${hourLabel(peak.hour)}, the quietest at ${hourLabel(low.hour)}. ` +
    `${busiest.month} has the most, ${quietest.month} the fewest.`;
  const scale = peak.collisions;
  $('hours-chart').replaceChildren(bars(hours.map((h) => ({ label: hourLabel(h.hour), value: h.collisions, text: count.format(h.collisions) })), scale));
  $('months-chart').replaceChildren(bars(months.map((m) => ({ label: m.month, value: m.collisions, text: count.format(m.collisions) })), busiest.collisions || 1));
}

function renderBreath(d) {
  const { trend, months } = d.breath;
  if (!trend.length) return $('breath-chart').replaceChildren(emptyNote());
  const first = trend[0];
  const last = trend.at(-1);
  const rate = (r) => r.positive / r.tests;
  const m = months.months;
  const dec = m.find((x) => x.month === 'December');
  const others = m.filter((x) => x !== dec);
  const t0 = d.tested[0];
  const t1 = d.tested.at(-1);
  $('breath-note').textContent = d.breath.trendNote;
  $('breath-summary').textContent =
    `Police in England and Wales carried out ${count.format(last.tests)} screening breath tests in ${last.year}, against ${count.format(first.tests)} in ${first.year}; ${pct0.format(rate(last))} were positive or refused (${pct0.format(rate(first))} in ${first.year}). ` +
    (dec && others.length ? `In ${months.year}, December saw ${count.format(dec.tests)} tests, ${(dec.tests / (others.reduce((n, x) => n + x.tests, 0) / others.length)).toFixed(1)} times an average month, and the lowest positive rate: ${pct1.format(rate(dec))}. ` : '') +
    (t0 && t1 ? `After collisions, ${pct0.format(t1.tested / t1.involved)} of drivers were breath tested in ${t1.year} (${pct0.format(t0.tested / t0.involved)} in ${t0.year}); ${pct1.format(t1.failed / t1.tested)} of those failed.` : '');
  lineChart($('breath-chart'), trend.map((r) => r.year), [{ id: 'cars', label: 'Screening breath tests', values: trend.map((r) => r.tests) }], {
    summary: `Line chart of police screening breath tests in England and Wales, ${first.year} to ${last.year}. ${$('breath-summary').textContent}`,
  });
  fill('breath-year', String(months.year));
  $('breath-months').replaceChildren(m.length ? bars(m.map((x) => ({ label: x.month, value: x.tests, text: `${count.format(x.tests)} (${pct0.format(rate(x))} positive)` })), Math.max(...m.map((x) => x.tests))) : emptyNote());
}

function renderWhere(d) {
  const regions = d.regions.regions.filter((r) => r.perBillionMiles !== null).sort((a, b) => b.perBillionMiles - a.perBillionMiles);
  fill('region-span', `${d.regions.from} to ${d.regions.to}`);
  const forces = d.breath.forces.forces.filter((f) => f.tests >= MIN_FORCE_TESTS && f.positive !== null);
  const byRate = [...forces].sort((a, b) => b.positive / b.tests - a.positive / a.tests);
  if (!regions.length) {
    $('regions-chart').replaceChildren(emptyNote('p', 'No regional rates in this data.'));
  } else {
    $('regions-chart').replaceChildren(bars(regions.map((r) => ({ label: r.name, value: r.perBillionMiles, text: r.perBillionMiles.toFixed(1) })), regions[0].perBillionMiles));
  }
  $('where-summary').textContent =
    (regions.length > 1 ? `Per mile driven, drink-drive collisions are most common in ${theRegion(regions[0].name)} (${regions[0].perBillionMiles.toFixed(1)} per billion vehicle miles) and least in ${theRegion(regions.at(-1).name)} (${regions.at(-1).perBillionMiles.toFixed(1)}). ` : '') +
    (byRate.length > 1 ? `Of police forces doing ${count.format(MIN_FORCE_TESTS)} or more breath tests in ${d.breath.forces.year}, ${byRate[0].name} had the highest share positive or refused (${pct0.format(byRate[0].positive / byRate[0].tests)}), ${byRate.at(-1).name} the lowest (${pct0.format(byRate.at(-1).positive / byRate.at(-1).tests)}).` : '');
  renderTable($('regions-table'), {
    caption: `Drink-drive collisions by region, ${d.regions.from} to ${d.regions.to}`,
    columns: [
      { label: 'Region', value: (r) => r.name },
      { label: 'Collisions', numeric: true, value: (r) => count.format(r.collisions) },
      { label: 'Per billion vehicle miles', numeric: true, value: (r) => (r.perBillionMiles === null ? 'n/a' : r.perBillionMiles.toFixed(1)) },
    ],
    rows: d.regions.regions,
  });
}

function renderCourts(d) {
  const c = d.courts;
  if (!c || !c.years.length) {
    $('courts-chart').replaceChildren(emptyNote('p', 'No court figures in this data.'));
    $('courts-summary').textContent = '';
    return;
  }
  const drink = c.series.find((s) => s.id === 'drink');
  const drug = c.series.find((s) => s.id === 'drug');
  const refused = c.series.find((s) => s.id === 'refused');
  const last = c.years.length - 1;
  const toJune = (i) => `the year to June ${c.years[i]}`;
  $('courts-summary').textContent =
    `In ${toJune(last)}, ${count.format(drink.convicted[last])} people were convicted of drink driving in England and Wales, and ${count.format(drug.convicted[last])} of drug driving` +
    (refused ? `; ${count.format(refused.convicted[last])} more for refusing a test. ` : '. ') +
    (last > 0 ? `In ${toJune(0)} it was ${count.format(drink.convicted[0])} for drink driving and ${count.format(drug.convicted[0])} for drug driving.` : '');
  lineChart($('courts-chart'), c.years, [
    { id: 'cars', label: 'Drink driving', values: drink.convicted },
    { id: 'vans', label: 'Drug driving', values: drug.convicted },
  ], { summary: `Line chart of convictions for drink and drug driving, ${c.years[0]} to ${c.years[last]}. ${$('courts-summary').textContent}` });
  renderTable($('courts-table'), {
    caption: 'Convictions for drink and drug driving, England and Wales',
    columns: [
      { label: 'Year', value: (i) => String(c.years[i]) },
      ...c.series.map((s) => ({ label: s.label, numeric: true, value: (i) => count.format(s.convicted[i]) })),
    ],
    rows: c.years.map((_, i) => i),
  });
}

function renderOffences(d) {
  const o = d.offences;
  if (!o.years.length) return $('offences-chart').replaceChildren(emptyNote());
  const last = o.years.length - 1;
  fill('first-offences', String(o.years[0]));
  const rows = o.offences.filter((x) => x.counts[last] !== null).sort((a, b) => b.counts[last] - a.counts[last]);
  const max = Math.max(...rows.flatMap((x) => [x.counts[last], x.counts[0] ?? 0]));
  $('offences-chart').replaceChildren(
    markedBars(rows.map((x) => ({ label: x.label, value: x.counts[last], text: count.format(x.counts[last]), mark: x.counts[0], markText: count.format(x.counts[0]) })), max, String(o.years[0])),
  );
  const get = (label) => o.offences.find((x) => x.label === label);
  const speed = get('Speeding');
  const phone = get('Handheld phone at the wheel');
  $('offences-summary').textContent =
    `Police in England and Wales dealt with ${count.format(o.total[last])} motoring offences in ${o.years[last]}, against ${count.format(o.total[0])} in ${o.years[0]}. ` +
    (speed ? `Speeding was ${pct0.format(speed.counts[last] / o.total[last])} of them: ${count.format(speed.counts[last])}. ` : '') +
    (phone ? `Handheld phone offences went from ${count.format(phone.counts[0])} to ${count.format(phone.counts[last])}. ` : '') +
    `${count.format(o.retraining[last])} of these offences ended in a course, such as speed awareness, rather than a fine or court (${count.format(o.retraining[0])} in ${o.years[0]}).`;
  renderTable($('offences-table'), {
    caption: 'Motoring offences by type, England and Wales',
    columns: [{ label: 'Offence', value: (x) => x.label }, ...o.years.filter((_, i) => i === 0 || i === last || i % 3 === 0).map((y) => ({ label: String(y), numeric: true, value: (x) => (x.counts[o.years.indexOf(y)] === null ? 'n/a' : count.format(x.counts[o.years.indexOf(y)])) }))],
    rows,
  });
}

startFeature('offences', (d) => {
  const last = d.collisions.at(-1);
  fill('latest-quarter', String(last?.year ?? ''));
  const tiles = el('ul', 'wuk-tiles');
  if (last) tiles.append(tile(count.format(last.collisions), `drink-drive collisions in ${last.year}, down from ${count.format(d.collisions[0].collisions)} in ${d.collisions[0].year}`));
  const o = d.offences;
  if (o.years.length) tiles.append(tile(count.format(o.total.at(-1)), `motoring offences dealt with by police in ${o.years.at(-1)}`));
  $('hero-graphic').replaceChildren(tiles);
  renderDrink(d);
  renderWhen(d);
  renderBreath(d);
  renderWhere(d);
  renderCourts(d);
  renderOffences(d);
});
