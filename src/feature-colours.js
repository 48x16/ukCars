// "Silver to grey": car colours from MOT records. Colour is the data here, so every swatch is
// painted its own colour, and always named in text beside it.

import { displayName, hidden, miniLine, stackedBar } from './feature-charts.js';
import { $, fill, startFeature } from './feature-page.js';
import { el, renderTable } from './insight-charts.js';
import { inkOn, paint } from './paint-chart.js';

const pct0 = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
const pct1 = new Intl.NumberFormat('en-GB', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const title = (s) => s.charAt(0) + s.slice(1).toLowerCase();
const FUELS = { petrol: 'Petrol', diesel: 'Diesel', hybrid: 'Hybrid', electric: 'Battery electric' };
const list = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

/** Consecutive years with the same top colour, as eras. */
function eras(colourOfYear) {
  const out = [];
  for (const y of colourOfYear) {
    const era = out.at(-1);
    if (era && era.colour === y.colour) era.to = y.year;
    else out.push({ colour: y.colour, from: y.year, to: y.year });
  }
  return out;
}

function renderChips(data) {
  const chip = (y, big = false) => {
    const li = el('li', `wuk-chip${big ? ' wuk-chip--big' : ''}`);
    const swatch = el('span', 'wuk-chip__paint');
    swatch.style.background = paint(y.colour);
    swatch.setAttribute('aria-hidden', 'true');
    li.append(swatch, el('span', 'wuk-chip__year', String(y.year)), hidden(`: ${title(y.colour)}, ${pct0.format(y.share)}`));
    return li;
  };
  $('chips').replaceChildren(...data.colourOfYear.map((y) => chip(y)));
  const list2 = eras(data.colourOfYear);
  $('eras').replaceChildren(
    ...list2.map((e) => {
      const li = el('li', 'wuk-era');
      const swatch = el('span', 'wuk-era__paint');
      swatch.style.background = paint(e.colour);
      swatch.setAttribute('aria-hidden', 'true');
      li.append(swatch, el('span', 'wuk-era__name', title(e.colour)), el('span', 'wuk-era__years', e.from === e.to ? String(e.from) : `${e.from} to ${e.to}`));
      return li;
    }),
  );
  // Hero: the eras as big paint chips.
  const hero = el('ol', 'wuk-hero-chips');
  for (const e of list2) {
    const li = el('li', 'wuk-hero-chip');
    li.style.background = paint(e.colour);
    li.style.color = inkOn(paint(e.colour));
    li.append(el('span', 'wuk-hero-chip__name', title(e.colour)), el('span', 'wuk-hero-chip__years', e.from === e.to ? String(e.from) : `${e.from}–${e.to}`));
    hero.append(li);
  }
  $('hero-graphic').replaceChildren(hero);
  $('eras-summary').textContent = `The colours of the eras: ${list(list2.map((e) => `${title(e.colour).toLowerCase()} (${e.from === e.to ? e.from : `${e.from} to ${e.to}`})`))}.`;
}

function renderRise(data) {
  const { years, series } = data;
  const named = series.filter((s) => s.name !== 'OTHER').slice(0, 9);
  const top = Math.max(...named.flatMap((s) => s.share));
  $('colour-multiples').replaceChildren(
    ...named.map((s) => {
      const peak = Math.max(...s.share);
      const card = el('li', 'wuk-multiple wuk-multiple--paint');
      card.style.setProperty('--paint', paint(s.name));
      card.append(
        el('h3', 'govuk-heading-s wuk-multiple__title', title(s.name)),
        el('p', 'wuk-multiple__value', pct0.format(s.share.at(-1))),
        el('p', 'wuk-multiple__change', `Peak ${pct0.format(peak)} in ${years[s.share.indexOf(peak)]}`),
        miniLine(s.share, { top, className: s.name === 'WHITE' ? 'wuk-mini--white' : '' }),
      );
      return card;
    }),
  );
  const silver = named.find((s) => s.name === 'SILVER');
  const green = named.find((s) => s.name === 'GREEN');
  const parts = [];
  if (silver) parts.push(`Silver rose to ${pct0.format(Math.max(...silver.share))} of cars first used in ${years[silver.share.indexOf(Math.max(...silver.share))]}, and is ${pct0.format(silver.share.at(-1))} now`);
  if (green) parts.push(`green has gone from ${pct0.format(green.share[0])} in ${years[0]} to ${pct0.format(green.share.at(-1))}`);
  $('rise-summary').textContent = parts.length ? `${parts.join('; ')}.` : '';
  renderTable($('colour-table'), {
    caption: `Share of cars tested in ${data.year}, by year first used`,
    columns: [{ label: 'Year first used', value: (r) => String(r.year) }, ...series.map((s, j) => ({ label: title(s.name), value: (r) => pct1.format(r.shares[j]), numeric: true }))],
    rows: years.map((year, i) => ({ year, shares: series.map((s) => s.share[i]) })).reverse(),
  });
}

/** The colours shown by name in the make and fuel bars, most common first; the rest are "Other". */
function barColours(rows) {
  const totals = new Map();
  for (const r of rows) for (const [c, v] of Object.entries(r)) if (c === c.toUpperCase() && typeof v === 'number') totals.set(c, (totals.get(c) ?? 0) + v);
  return [...totals].sort((a, b) => b[1] - a[1]).slice(0, 9).map(([c]) => c);
}

function paintRow(label, row, colours, extra) {
  const li = el('li', 'wuk-stackrow');
  const other = 1 - colours.reduce((n, c) => n + (row[c] ?? 0), 0);
  const segments = [...colours.map((c) => ({ id: c, label: title(c), value: row[c] ?? 0 })), { id: 'OTHER', label: 'Other', value: Math.max(0, other) }];
  li.append(el('span', 'wuk-stackrow__label', label), ...stackedBar(segments, null, { paintFor: paint, minLabel: 0.1 }));
  if (extra) li.append(el('span', 'wuk-stackrow__extra', extra));
  return li;
}

function renderMakes(data) {
  const { makes, recentAges } = data;
  if (recentAges) fill('recent-ages', `${recentAges.from} to ${recentAges.to} years old`);
  const colours = barColours(makes);
  $('makes-legend').replaceChildren(
    ...[...colours, 'OTHER'].map((c) => {
      const item = el('li', 'wuk-legend__item');
      const key = el('span', 'wuk-paint__swatch');
      key.style.background = paint(c);
      item.append(key, el('span', '', title(c)));
      return item;
    }),
  );
  const sorted = [...makes].sort((a, b) => b.colourful - a.colourful);
  $('make-bars').replaceChildren(...sorted.map((m) => paintRow(displayName(m.make), m, colours, `${pct0.format(m.colourful)} colourful`)));
  $('makes-summary').textContent =
    `${displayName(sorted[0].make)} buyers are the boldest: ${pct0.format(sorted[0].colourful)} of recent ${displayName(sorted[0].make)}s are a colour, ` +
    `not black, white, grey or silver. ${displayName(sorted.at(-1).make)} buyers are the most cautious, at ${pct0.format(sorted.at(-1).colourful)}.`;
  renderTable($('make-table'), {
    caption: 'Colours of recent cars by make',
    columns: [
      { label: 'Make', value: (m) => displayName(m.make) },
      { label: 'Colourful', value: (m) => pct1.format(m.colourful), numeric: true },
      ...colours.map((c) => ({ label: title(c), value: (m) => pct1.format(m[c] ?? 0), numeric: true })),
    ],
    rows: sorted,
  });

  const fuels = data.fuels.filter((f) => FUELS[f.fuel]).sort((a, b) => Object.keys(FUELS).indexOf(a.fuel) - Object.keys(FUELS).indexOf(b.fuel));
  $('fuel-bars').replaceChildren(...fuels.map((f) => paintRow(FUELS[f.fuel], f, colours)));
  const ev = fuels.find((f) => f.fuel === 'electric');
  const petrol = fuels.find((f) => f.fuel === 'petrol');
  if (ev && petrol) {
    const top = colours.reduce((a, b) => ((ev[b] ?? 0) > (ev[a] ?? 0) ? b : a));
    $('fuel-summary').textContent =
      `The most common colour for recent battery electric cars is ${title(top).toLowerCase()}, at ${pct0.format(ev[top])}` +
      ` (${pct0.format(petrol[top] ?? 0)} of petrol cars).`;
  }
}

startFeature('colours', (data) => {
  fill('year', String(data.year));
  renderChips(data);
  renderRise(data);
  renderMakes(data);
});
