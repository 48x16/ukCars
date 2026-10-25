// "The Bavarian battle": BMW, Mercedes and Audi. Every fact is built from the data.

import { createChart } from './chart.js';
import { displayName, hidden, renderPodium, stackedBar } from './feature-charts.js';
import { $, fill, startFeature } from './feature-page.js';
import { el, formatChange, modelLink, renderTable } from './insight-charts.js';
import { quarterEndDate } from './quarters.js';

const count = new Intl.NumberFormat('en-GB');
const big = new Intl.NumberFormat('en-GB', { notation: 'compact', compactDisplay: 'long', maximumFractionDigits: 2 });
const pct0 = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
const pct1 = new Intl.NumberFormat('en-GB', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const NAMES = { BMW: 'BMW', MERCEDES: 'Mercedes', AUDI: 'Audi' };
const id = (make) => make.toLowerCase();
const name = (make) => NAMES[make] ?? displayName(make);
const list = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

function renderRace(data) {
  const { quarters, makes, leader, firstLeader, leadChanges } = data;
  const last = quarters.length - 1;
  const ranked = [...makes].sort((a, b) => b.licensed[last] - a.licensed[last]);
  const gap = ranked[0].licensed[last] - ranked[1].licensed[last];
  renderPodium(
    $('hero-graphic'),
    ranked.map((m) => ({ label: name(m.make), value: m.licensed[last] })),
    (v) => `${big.format(v)} cars`,
  );
  $('race-summary').textContent =
    (leadChanges.length === 0
      ? `${name(leader)} has led in every quarter since ${quarters[0]}.`
      : `${name(firstLeader)} led in ${quarters[0]}; the lead has changed hands ${leadChanges.length} times, most recently in ${leadChanges.at(-1).quarter}, to ${name(leadChanges.at(-1).to)}.`) +
    ` ${name(ranked[1].make)} is ${count.format(gap)} cars behind at the end of ${quarters[last]}. ` +
    `Since ${quarters[0]}: ${list(makes.filter((m) => m.licensed[0] > 0).map((m) => `${name(m.make)} ${formatChange((m.licensed[last] - m.licensed[0]) / m.licensed[0])}`))}.`;
  createChart($('race-chart'), { totalLabel: null }).update({
    quarters,
    dates: quarters.map(quarterEndDate),
    series: makes.map((m) => ({ id: id(m.make), label: name(m.make), values: m.licensed })),
    sorn: null,
    summary: `Line chart of licensed cars by make, ${quarters[0]} to ${quarters[last]}. ${$('race-summary').textContent} Focus the chart and use the arrow keys to read each quarter.`,
  });
}

function renderFuels(data) {
  const fuelOrder = ['petrol', 'diesel', 'hybrid', 'plugin', 'electric', 'other'];
  const labels = Object.fromEntries(data.makes.flatMap((m) => m.fuels.map((f) => [f.id, f.label])));
  const present = fuelOrder.filter((f) => labels[f]);
  $('fuel-legend').replaceChildren(
    ...present.map((f) => {
      const item = el('li', 'wuk-legend__item');
      item.append(el('span', `wuk-fill-key wuk-fill--${f}`), el('span', '', labels[f]));
      return item;
    }),
  );
  $('fuel-bars').replaceChildren(
    ...data.makes.map((m) => {
      const row = el('li', 'wuk-stackrow');
      const segments = present.map((f) => ({ id: f, label: labels[f], value: m.fuels.find((x) => x.id === f)?.latest ?? 0 }));
      row.append(el('span', 'wuk-stackrow__label', name(m.make)), ...stackedBar(segments, (f) => `wuk-fill--${f}`));
      return row;
    }),
  );
  const share = (m, f) => (m.fuels.find((x) => x.id === f)?.latest ?? 0) / m.fuels.reduce((n, x) => n + x.latest, 0);
  const diesel = [...data.makes].sort((a, b) => share(b, 'diesel') - share(a, 'diesel'))[0];
  const electric = [...data.makes].sort((a, b) => share(b, 'electric') - share(a, 'electric'))[0];
  $('fuel-summary').textContent =
    `${name(diesel.make)} has the most diesels: ${pct0.format(share(diesel, 'diesel'))} of its licensed cars. ` +
    `${name(electric.make)} has the biggest battery electric share, at ${pct0.format(share(electric, 'electric'))}.`;
}

function renderElectric(data) {
  const { quarters, makes } = data;
  const last = quarters.length - 1;
  const ranked = [...makes].sort((a, b) => b.electric[last] - a.electric[last]);
  $('electric-summary').textContent =
    `${name(ranked[0].make)} leads on battery electric cars, with ${count.format(ranked[0].electric[last])}, ahead of ` +
    `${list(ranked.slice(1).map((m) => `${name(m.make)} (${count.format(m.electric[last])})`))}.`;
  // Electric cars barely existed before 2019: start the chart there.
  const start = Math.max(0, quarters.findIndex((q) => q.startsWith('2019')));
  createChart($('electric-chart'), { totalLabel: null }).update({
    quarters: quarters.slice(start),
    dates: quarters.slice(start).map(quarterEndDate),
    series: makes.map((m) => ({ id: id(m.make), label: name(m.make), values: m.electric.slice(start) })),
    sorn: null,
    summary: `Line chart of licensed battery electric cars by make, ${quarters[start]} to ${quarters[last]}. ${$('electric-summary').textContent}`,
  });
}

function renderTopModels(data) {
  $('top-models').replaceChildren(
    ...data.makes.map((m) => {
      const col = el('div', 'wuk-column');
      col.append(el('h3', 'govuk-heading-s', name(m.make)));
      const max = Math.max(...m.topModels.flatMap((t) => [t.latest, t.before]));
      const ol = el('ol', 'wuk-bars-simple');
      for (const t of m.topModels) {
        const li = el('li', 'wuk-bar-simple');
        const link = el('a', 'govuk-link wuk-bar-simple__name', displayName(t.name.replace(/^MERCEDES(-BENZ)? |^BMW |^AUDI /, '')));
        link.href = modelLink(t);
        const track = el('span', 'wuk-bar-simple__track');
        track.setAttribute('aria-hidden', 'true');
        const now = el('span', 'wuk-bar-simple__now');
        now.style.width = `${(t.latest / max) * 100}%`;
        const then = el('span', 'wuk-bar-simple__then');
        then.style.left = `${(t.before / max) * 100}%`;
        track.append(now, then);
        const value = el('span', 'wuk-bar-simple__value', count.format(t.latest));
        value.append(hidden(` licensed, ${count.format(t.before)} in ${data.fiveYearsAgo}`));
        li.append(link, value, track);
        ol.append(li);
      }
      col.append(ol);
      return col;
    }),
  );
  const note = el('p', 'govuk-body-s wuk-column-note');
  note.append(el('span', 'wuk-then-key'), ` Marker: licensed in ${data.fiveYearsAgo}`);
  note.firstChild.setAttribute('aria-hidden', 'true');
  $('top-models').append(note);
}

function renderMot(data) {
  const section = $('mot-dots').closest('section');
  if (!data.ageBands || data.makes.some((m) => !m.mot)) {
    section.hidden = true;
    return;
  }
  fill('mot-year', String(data.motYear));
  const rate = (o) => o.pass / o.tests;
  $('mot-legend').replaceChildren(
    ...data.makes.map((m) => {
      const item = el('li', 'wuk-legend__item');
      item.append(el('span', `wuk-mark wuk-mark--${id(m.make)}`), el('span', '', name(m.make)));
      return item;
    }),
  );
  const bands = data.ageBands.map((b, i) => ({ label: b.label, rates: data.makes.map((m) => ({ make: m.make, value: rate(m.mot.bands[i]) })) }));
  const lo = Math.floor(Math.min(...bands.flatMap((b) => b.rates.map((r) => r.value))) * 20) / 20;
  const at = (v) => `${((v - lo) / (1 - lo)) * 100}%`;
  $('mot-dots').replaceChildren(
    ...bands.map((b) => {
      const li = el('li', 'wuk-dotrow');
      const track = el('span', 'wuk-dotrow__track');
      track.setAttribute('aria-hidden', 'true');
      for (const r of b.rates) {
        const mark = el('span', `wuk-mark wuk-mark--${id(r.make)}`);
        mark.style.left = at(r.value);
        track.append(mark);
      }
      const words = hidden(`: ${b.rates.map((r) => `${name(r.make)} ${pct1.format(r.value)}`).join(', ')}`);
      li.append(el('span', 'wuk-dotrow__label', b.label), words, track);
      return li;
    }),
  );
  const scale = el('p', 'govuk-body-s wuk-dotrow-scale', `Scale: ${pct0.format(lo)} to 100% passing first time.`);
  $('mot-dots').after(scale);
  const old = bands.at(-1).rates.sort((a, b) => b.value - a.value);
  $('mot-summary').textContent =
    `Among the oldest cars (${bands.at(-1).label.toLowerCase()}), ${name(old[0].make)} passes most often: ${pct1.format(old[0].value)}, ` +
    `against ${list(old.slice(1).map((r) => `${pct1.format(r.value)} for ${name(r.make)}`))}.`;
  renderTable($('mot-table'), {
    caption: `Share passing their MOT first time, ${data.motYear}`,
    columns: [{ label: 'Age of car', value: (b) => b.label }, ...data.makes.map((m, i) => ({ label: name(m.make), value: (b) => pct1.format(b.rates.find((r) => r.make === m.make).value), numeric: true }))],
    rows: data.ageBands.map((b, i) => ({ label: b.label, rates: data.makes.map((m) => ({ make: m.make, value: rate(m.mot.bands[i]) })) })),
  });
}

startFeature('bavarian', (data) => {
  renderRace(data);
  renderFuels(data);
  renderElectric(data);
  renderTopModels(data);
  renderMot(data);
});
