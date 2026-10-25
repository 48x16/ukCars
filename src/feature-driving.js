// "Learning to drive": the car driving test in Great Britain. Pass rates since 2007, by age,
// manual or automatic, the wait for a test, the usual faults, and the centres at either end.
// Every fact is built from the data.

import { createChart } from './chart.js';
import { theRegion } from './feature-charts.js';
import { $, fill, startFeature } from './feature-page.js';
import { el, emptyNote, renderTable } from './insight-charts.js';
import { bars } from './make-story.js';

const count = new Intl.NumberFormat('en-GB');
const pct0 = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
const pct1 = new Intl.NumberFormat('en-GB', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const weeks1 = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const rate = (o) => (o && o.tests ? o.passes / o.tests : null);
const monthDate = (m) => new Date(`${m}-01T00:00:00Z`);
const monthLabel = (m) => monthName.format(monthDate(m));
/** A financial year ("2025-26") sits on the chart at its middle, 1 October. */
const yearDate = (y) => new Date(Date.UTC(Number(y.slice(0, 4)), 9, 1));
/** "Junctions - observation" -> "Junctions – observation". */
const faultName = (f) => f.replace(/\s+-\s+/, ' – ');
const lower = (s) => s[0].toLowerCase() + s.slice(1);
/** Ages grouped for the chart: single years while the rate falls fast, then bands. */
const AGE_GROUPS = [
  ['17', (a) => a === 17],
  ['18', (a) => a === 18],
  ['19', (a) => a === 19],
  ['20 to 24', (a) => a >= 20 && a <= 24],
  ['25 to 29', (a) => a >= 25 && a <= 29],
  ['30 to 39', (a) => a >= 30 && a <= 39],
  ['40 to 49', (a) => a >= 40 && a <= 49],
  ['50 to 59', (a) => a >= 50 && a <= 59],
  ['60 and over', (a) => a >= 60],
];

function tile(value, label) {
  const li = el('li', 'wuk-tile');
  li.append(el('span', 'wuk-tile__value', value), el('span', 'wuk-tile__label', label));
  return li;
}

const who = (label) => (/^\d+$/.test(label) ? `${label}-year-olds` : `learners aged ${label}`);

function renderYears(data) {
  const { years } = data;
  if (!years.length) return $('years-chart').replaceChildren(emptyNote());
  const first = years[0];
  const last = years.at(-1);
  $('years-summary').textContent =
    `In ${last.year}, ${pct1.format(rate(last))} of car driving tests were passes: ${count.format(last.passes)} of ${count.format(last.tests)}. ` +
    `In ${first.year} it was ${pct1.format(rate(first))}. ` +
    `Passes with no faults at all went from ${count.format(first.zeroFaults)} to ${count.format(last.zeroFaults)} a year.`;
  createChart($('years-chart'), { formatValue: (v) => `${v.toFixed(1)}%`, formatTick: (v) => `${v}%`, totalLabel: null }).update({
    quarters: years.map((y) => y.year),
    dates: years.map((y) => yearDate(y.year)),
    series: [{ id: 'cars', label: 'Pass rate', values: years.map((y) => rate(y) * 100) }],
    sorn: null,
    summary: `Line chart of the car driving test pass rate, ${first.year} to ${last.year}. ${$('years-summary').textContent}`,
  });
  renderTable($('years-table'), {
    caption: 'Car driving tests by financial year',
    columns: [
      { label: 'Year', value: (y) => y.year },
      { label: 'Tests', numeric: true, value: (y) => count.format(y.tests) },
      { label: 'Passes', numeric: true, value: (y) => count.format(y.passes) },
      { label: 'Pass rate', numeric: true, value: (y) => pct1.format(rate(y)) },
      { label: 'Passed with no faults', numeric: true, value: (y) => count.format(y.zeroFaults) },
    ],
    rows: years,
  });
}

function renderAges(data) {
  const groups = AGE_GROUPS.map(([label, test]) => {
    const rows = data.ages.filter((a) => test(a.age === '60+' ? 60 : Number(a.age)));
    return { label, tests: rows.reduce((n, a) => n + a.tests, 0), passes: rows.reduce((n, a) => n + a.passes, 0) };
  }).filter((g) => g.tests);
  if (!groups.length) return $('age-chart').replaceChildren(emptyNote());
  const best = groups.reduce((a, b) => (rate(b) > rate(a) ? b : a));
  const oldest = groups.at(-1);
  const { male, female } = data.gender;
  $('age-summary').textContent =
    `${who(best.label)[0].toUpperCase()}${who(best.label).slice(1)} pass most often: ${pct1.format(rate(best))}. ` +
    (oldest !== best ? `For ${who(oldest.label)} it's ${pct1.format(rate(oldest))}. ` : '') +
    (male && female ? `Men pass ${pct1.format(rate(male))} of tests, women ${pct1.format(rate(female))}.` : '');
  $('age-chart').replaceChildren(bars(groups.map((g) => ({ label: g.label, value: rate(g), text: pct1.format(rate(g)) })), 1));
  renderTable($('age-table'), {
    caption: `Car driving tests by age, ${data.year}`,
    columns: [
      { label: 'Age', value: (g) => g.label },
      { label: 'Tests', numeric: true, value: (g) => count.format(g.tests) },
      { label: 'Pass rate', numeric: true, value: (g) => pct1.format(rate(g)) },
    ],
    rows: groups,
  });
}

function renderGearbox(data) {
  const { manual, automatic } = data;
  if (!manual || !automatic) return $('gearbox-chart').replaceChildren(emptyNote());
  $('gearbox-summary').textContent =
    `Manual tests were passes ${pct1.format(rate(manual))} of the time in ${data.year}, automatic tests ${pct1.format(rate(automatic))}. ` +
    `Automatics were ${pct0.format(automatic.tests / (manual.tests + automatic.tests))} of all tests: ${count.format(automatic.tests)}.`;
  $('gearbox-chart').replaceChildren(
    bars(
      [
        { label: 'Manual', value: rate(manual), text: pct1.format(rate(manual)) },
        { label: 'Automatic', value: rate(automatic), text: pct1.format(rate(automatic)) },
      ],
      1,
    ),
  );
}

function renderWait(data) {
  const months = data.months.filter((m) => m.wait !== null);
  if (!months.length) return $('wait-chart').replaceChildren(emptyNote());
  const first = months[0];
  const last = months.at(-1);
  const peak = months.reduce((a, b) => (b.wait > a.wait ? b : a));
  const regions = [...data.regions].filter((r) => r.wait !== null).sort((a, b) => b.wait - a.wait);
  $('wait-summary').textContent =
    `In ${monthLabel(last.month)}, half of learners waited more than ${weeks1.format(last.wait)} weeks from booking to test. ` +
    `It was ${weeks1.format(first.wait)} weeks in ${monthLabel(first.month)}, and peaked at ${weeks1.format(peak.wait)} in ${monthLabel(peak.month)}.` +
    (regions.length > 1 ? ` Learners in ${theRegion(regions[0].name)} wait longest (${weeks1.format(regions[0].wait)} weeks), in ${theRegion(regions.at(-1).name)} least (${weeks1.format(regions.at(-1).wait)}).` : '');
  createChart($('wait-chart'), { formatValue: (v) => `${weeks1.format(v)} weeks`, formatTick: (v) => `${v}`, totalLabel: null }).update({
    quarters: months.map((m) => monthLabel(m.month)),
    dates: months.map((m) => monthDate(m.month)),
    series: [{ id: 'cars', label: 'Median wait (weeks)', values: months.map((m) => m.wait) }],
    sorn: null,
    summary: `Line chart of the median wait for a car driving test in weeks, ${monthLabel(first.month)} to ${monthLabel(last.month)}. ${$('wait-summary').textContent}`,
  });
  if (!regions.length) return $('regions-chart').replaceChildren(emptyNote());
  $('regions-chart').replaceChildren(bars(regions.map((r) => ({ label: r.name, value: r.wait, text: `${weeks1.format(r.wait)} wks` })), regions[0].wait));
  renderTable($('regions-table'), {
    caption: `Car driving tests by region: the last 12 months, and the wait in ${monthLabel(last.month)}`,
    columns: [
      { label: 'Region', value: (r) => r.name },
      { label: 'Tests', numeric: true, value: (r) => count.format(r.tests) },
      { label: 'Pass rate', numeric: true, value: (r) => pct1.format(rate(r)) },
      { label: 'Median wait (weeks)', numeric: true, value: (r) => weeks1.format(r.wait) },
      { label: 'Taken within 7 weeks', numeric: true, value: (r) => (r.within7 === null ? 'n/a' : pct0.format(r.within7 / 100)) },
    ],
    rows: [...data.regions].sort((a, b) => a.name.localeCompare(b.name)),
  });
}

function renderFaults(data) {
  const [latest, previous] = data.faults;
  const list = $('faults-list');
  if (!latest) return list.replaceWith(emptyNote());
  list.replaceChildren(
    ...latest.faults.map((f, i) => {
      const before = previous ? previous.faults.indexOf(f) : -1;
      const li = el('li', 'wuk-faults__item');
      const move = !previous ? '' : before === -1 ? 'new' : before === i ? 'same place' : `${before + 1 > i + 1 ? 'up' : 'down'} from ${before + 1}`;
      li.append(el('span', 'wuk-faults__name', faultName(f)), el('span', 'wuk-faults__move', move));
      return li;
    }),
  );
  const top = latest.faults[0];
  let streak = 0;
  while (streak < data.faults.length && data.faults[streak].faults[0] === top) streak++;
  const newcomers = previous ? latest.faults.filter((f) => !previous.faults.includes(f)) : [];
  $('faults-summary').textContent =
    `The fault examiners record most is “${lower(faultName(top))}”` +
    (streak > 1 ? `, top in each of the last ${streak} years.` : '.') +
    (newcomers.length ? ` New to the top ten in ${latest.year}: ${newcomers.map((f) => `“${lower(faultName(f))}”`).join(', ')}.` : '');
}

/** A ranked list of centres, each linking to its page in the Your test centre tool. */
function centreList(root, rows, value, text) {
  if (!rows.length) return root.replaceChildren(emptyNote('p', 'No centres meet the criteria in this data.'));
  const ol = bars(rows.map((c) => ({ label: c.name, value: value(c), text: text(c) })), Math.max(...rows.map(value)));
  [...ol.querySelectorAll('.wuk-road__name')].forEach((node, i) => {
    const a = el('a', 'govuk-link', node.textContent);
    a.href = `./test-centre.html#${rows[i].slug}`;
    node.replaceChildren(a);
  });
  ol.classList.add('wuk-road__models--links');
  root.replaceChildren(ol);
}

function renderCentres(data) {
  const { highest, lowest, longestWait, shortestWait, count: centres } = data.centres;
  const passText = (c) => pct1.format(c.rate);
  const waitText = (c) => `${weeks1.format(c.wait)} wks`;
  centreList($('highest'), highest, (c) => c.rate, passText);
  centreList($('lowest'), lowest, (c) => c.rate, passText);
  centreList($('longest'), longestWait, (c) => c.wait, waitText);
  centreList($('shortest'), shortestWait, (c) => c.wait, waitText);
  const top = highest[0];
  const bottom = lowest[0];
  $('centres-summary').textContent =
    `There are ${count.format(centres)} car test centres in this data. ` +
    (top && bottom ? `${top.name} has the highest pass rate, ${pct1.format(top.rate)}; ${bottom.name} the lowest, ${pct1.format(bottom.rate)}. ` : '') +
    (longestWait[0] ? `The longest wait is at ${longestWait[0].name}: ${weeks1.format(longestWait[0].wait)} weeks.` : '');
}

startFeature('driving', (data) => {
  fill('latest-quarter', monthLabel(data.latestMonth));
  fill('year', data.year);
  fill('min-tests', count.format(data.centres.minRankedTests));
  const last = data.years.at(-1);
  const wait = data.months.filter((m) => m.wait !== null).at(-1);
  const tiles = el('ul', 'wuk-tiles');
  if (last) tiles.append(tile(pct0.format(rate(last)), `of car driving tests were passes in ${last.year}`));
  if (wait) tiles.append(tile(`${weeks1.format(wait.wait)} weeks`, `the median wait from booking to test, ${monthLabel(wait.month)}`));
  $('hero-graphic').replaceChildren(tiles);
  renderYears(data);
  renderAges(data);
  renderGearbox(data);
  renderWait(data);
  renderFaults(data);
  renderCentres(data);
});
