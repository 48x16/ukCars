// Your test centre: any car driving test centre in Great Britain. Its pass rate against its
// region and the country, first attempts, automatics, by age, since 2007, and the wait for a
// test. The chosen centre is kept in the URL's #, so a link opens the same centre.

import './shell.js';
import { createChart } from './chart.js';
import { loadTestCentre, loadTestCentres } from './data.js';
import { theRegion } from './feature-charts.js';
import { $, drawIcons, fill } from './feature-page.js';
import { el, emptyNote, renderTable } from './insight-charts.js';
import { bars } from './make-story.js';

const count = new Intl.NumberFormat('en-GB');
const pct1 = new Intl.NumberFormat('en-GB', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct0 = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
const weeks1 = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const rate = (o) => (o && o.tests ? o.passes / o.tests : null);
const monthDate = (m) => new Date(`${m}-01T00:00:00Z`);
const monthLabel = (m) => monthName.format(monthDate(m));
const yearDate = (y) => new Date(Date.UTC(Number(y.slice(0, 4)), 9, 1));
/** An age is named in the summary only with this many tests at the centre: fewer is noise. */
const MIN_AGE_TESTS = 30;
/** Below this many tests a year, the pass rate carries a warning (the feature ranks from 500). */
const SMALL_CENTRE_TESTS = 500;

/** Bars of rates, each with a pink marker for Great Britain where there is one. */
function rateBars(rows) {
  const list = bars(rows.map((r) => ({ label: r.label, value: r.value, text: pct1.format(r.value) })), 1);
  [...list.children].forEach((li, i) => {
    if (rows[i].gb === null || rows[i].gb === undefined) return;
    const mark = el('span', 'wuk-road__average');
    mark.style.left = `${rows[i].gb * 100}%`;
    li.querySelector('.wuk-road__track').append(mark);
    li.querySelector('.wuk-road__value').append(el('span', 'govuk-visually-hidden', ` (Great Britain ${pct1.format(rows[i].gb)})`));
  });
  return list;
}

function renderPass(c) {
  const { gb, region } = c.compare;
  const rows = [{ label: c.name, value: rate(c) }];
  if (region) rows.push({ label: region.name, value: region.rate });
  rows.push({ label: 'Great Britain', value: gb.rate });
  $('pass-chart').replaceChildren(bars(rows.map((r) => ({ label: r.label, value: r.value, text: pct1.format(r.value) })), 1));
  const vs = rate(c) - gb.rate;
  $('pass-summary').textContent =
    `${pct1.format(rate(c))} of the ${count.format(c.tests)} car tests at ${c.name} were passes in ${c.year}` +
    (region ? `, against ${pct1.format(region.rate)} across ${theRegion(region.name)}` : '') +
    ` and ${pct1.format(gb.rate)} across Great Britain. ` +
    (Math.abs(vs) < 0.01 ? 'That’s about the national rate.' : `That’s ${Math.round(Math.abs(vs) * 100)} points ${vs > 0 ? 'above' : 'below'} the national rate.`) +
    (c.tests < SMALL_CENTRE_TESTS ? ` With so few tests, a handful of results moves the rate a long way.` : '');
}

function renderWho(c) {
  const { gb } = c.compare;
  const rows = [
    c.firstAttempt && { label: 'First attempts', value: rate(c.firstAttempt), gb: gb.firstRate },
    c.automatic && { label: 'Automatic cars', value: rate(c.automatic), gb: gb.autoRate },
    c.male?.tests && { label: 'Men', value: rate(c.male) },
    c.female?.tests && { label: 'Women', value: rate(c.female) },
  ].filter((r) => r && r.value !== null);
  if (!rows.length) {
    $('who-chart').replaceChildren(emptyNote('p', 'No breakdown for this centre.'));
    $('who-summary').textContent = '';
    return;
  }
  $('who-chart').replaceChildren(rateBars(rows));
  const parts = [];
  if (c.firstAttempt) parts.push(`First-time learners pass ${pct1.format(rate(c.firstAttempt))} of tests here (Great Britain: ${pct1.format(gb.firstRate)}).`);
  if (c.automatic) parts.push(`Automatic tests: ${pct1.format(rate(c.automatic))}, ${pct0.format(c.automatic.tests / c.tests)} of the centre’s tests (Great Britain: ${pct1.format(gb.autoRate)}).`);
  if (c.male?.tests && c.female?.tests) parts.push(`Men pass ${pct1.format(rate(c.male))}, women ${pct1.format(rate(c.female))}.`);
  $('who-summary').textContent = parts.join(' ');
}

function renderAges(c) {
  const ages = c.ages.filter((a) => a.tests);
  if (!ages.length) {
    $('age-chart').replaceChildren(emptyNote('p', 'No ages published for this centre.'));
    $('age-summary').textContent = '';
    return;
  }
  $('age-chart').replaceChildren(bars(ages.map((a) => ({ label: String(a.age), value: rate(a), text: `${pct1.format(rate(a))} (${count.format(a.tests)})` })), 1));
  const named = ages.filter((a) => a.tests >= MIN_AGE_TESTS);
  if (named.length < 2) {
    $('age-summary').textContent = `Too few tests at each age here to compare them.`;
    return;
  }
  const best = named.reduce((a, b) => (rate(b) > rate(a) ? b : a));
  const worst = named.reduce((a, b) => (rate(b) < rate(a) ? b : a));
  $('age-summary').textContent = `Here, ${best.age}-year-olds pass most often (${pct1.format(rate(best))}) and ${worst.age}-year-olds least (${pct1.format(rate(worst))}), among ages with ${MIN_AGE_TESTS} or more tests.`;
}

function renderHistory(c) {
  const years = c.history.filter((h) => h.tests);
  if (years.length < 2) {
    $('history-chart').replaceChildren(emptyNote('p', 'This centre has only one year under this name.'));
    $('history-summary').textContent = '';
    $('history-table').replaceChildren();
    return;
  }
  const first = years[0];
  const last = years.at(-1);
  const best = years.reduce((a, b) => (rate(b) > rate(a) ? b : a));
  $('history-summary').textContent =
    `${pct1.format(rate(last))} in ${last.year}, against ${pct1.format(rate(first))} in ${first.year}. ` +
    (best === last ? `That’s its best year since ${first.year}. ` : `Its best year was ${best.year}, at ${pct1.format(rate(best))}. `) +
    `Tests a year: ${count.format(first.tests)} then, ${count.format(last.tests)} now.`;
  createChart($('history-chart'), { formatValue: (v) => `${v.toFixed(1)}%`, formatTick: (v) => `${v}%`, totalLabel: null }).update({
    quarters: years.map((y) => y.year),
    dates: years.map((y) => yearDate(y.year)),
    series: [{ id: 'cars', label: 'Pass rate', values: years.map((y) => rate(y) * 100) }],
    sorn: null,
    summary: `Line chart of the pass rate at ${c.name}, ${first.year} to ${last.year}. ${$('history-summary').textContent}`,
  });
  renderTable($('history-table'), {
    caption: `Car driving tests at ${c.name} by financial year`,
    columns: [
      { label: 'Year', value: (y) => y.year },
      { label: 'Tests', numeric: true, value: (y) => count.format(y.tests) },
      { label: 'Pass rate', numeric: true, value: (y) => pct1.format(rate(y)) },
    ],
    rows: years,
  });
}

function renderWait(c) {
  const months = c.waits.filter((m) => m.wait !== null);
  if (!months.length) {
    $('wait-chart').replaceChildren(emptyNote('p', 'No waiting times published for this centre.'));
    $('wait-summary').textContent = '';
    return;
  }
  const last = months.at(-1);
  const gb = c.compare.gb.wait;
  $('wait-summary').textContent =
    `In ${monthLabel(last.month)}, half of learners at ${c.name} waited more than ${weeks1.format(last.wait)} weeks from booking to test` +
    (gb ? ` (Great Britain: ${weeks1.format(gb)}).` : '.') +
    (last.within7 !== null ? ` ${pct0.format(last.within7 / 100)} took their test within 7 weeks of booking; ${pct0.format(last.over21 / 100)} waited more than 21.` : '');
  createChart($('wait-chart'), { formatValue: (v) => `${weeks1.format(v)} weeks`, formatTick: (v) => `${v}`, totalLabel: null }).update({
    quarters: months.map((m) => monthLabel(m.month)),
    dates: months.map((m) => monthDate(m.month)),
    series: [{ id: 'cars', label: 'Median wait (weeks)', values: months.map((m) => m.wait) }],
    sorn: null,
    summary: `Line chart of the median wait at ${c.name}, ${monthLabel(months[0].month)} to ${monthLabel(last.month)}. ${$('wait-summary').textContent}`,
  });
}

async function show(slug) {
  let c;
  try {
    c = await loadTestCentre(slug);
  } catch (err) {
    $('error').hidden = false;
    $('error-message').textContent = err.message;
    return;
  }
  fill('year', c.year);
  const lastWait = c.waits.at(-1);
  fill('latest-quarter', lastWait ? monthLabel(lastWait.month) : c.year);
  renderPass(c);
  renderWho(c);
  renderAges(c);
  renderHistory(c);
  renderWait(c);
  history.replaceState(null, '', `#${slug}`);
}

async function start() {
  drawIcons();
  let index;
  try {
    index = await loadTestCentres();
  } catch (err) {
    $('error').hidden = false;
    $('error-message').textContent = navigator.onLine ? err.message : "You're offline, and this page hasn't been viewed on this device yet, so its data isn't saved.";
    return;
  }
  const select = $('centre');
  if (!index.length) {
    select.closest('.govuk-form-group').replaceWith(emptyNote('p', 'No test centres in this data.'));
    return;
  }
  select.replaceChildren(
    ...index.map((c) => {
      const option = el('option', '', c.region ? `${c.name} (${c.region})` : c.name);
      option.value = c.slug;
      return option;
    }),
  );
  const fromHash = decodeURIComponent(location.hash.slice(1));
  // With no centre asked for, open on the busiest.
  const busiest = index.reduce((a, b) => (b.tests > a.tests ? b : a));
  select.value = index.some((c) => c.slug === fromHash) ? fromHash : busiest.slug;
  select.addEventListener('change', () => show(select.value));
  window.addEventListener('hashchange', () => {
    const slug = decodeURIComponent(location.hash.slice(1));
    if (slug !== select.value && index.some((c) => c.slug === slug)) {
      select.value = slug;
      show(slug);
    }
  });
  await show(select.value);
}

start();
