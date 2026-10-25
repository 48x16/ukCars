// Quiet times for an MOT: busiest and quietest days, hours and months for car tests in a
// postcode area. Only the area letters are used, and the search is kept in the URL's #.

import './shell.js';
import { quintileBreaks, stepOf } from './council-map.js';
import { drawIcons, fill } from './feature-page.js';
import { clearErrors, showErrors } from './form-errors.js';
import { el } from './insight-charts.js';
import { areaOf, DAYS, hourLabel, MONTHS, summarise } from './mot-times-calc.js';

const DATA = `${import.meta.env.BASE_URL}data/`;
const $ = (id) => document.getElementById(id);
const count = new Intl.NumberFormat('en-GB');
const compact = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });
function renderHeat(area, open) {
  const values = DAYS.flatMap((_, d) => open.map((h) => area.grid[d * 24 + h]));
  const breaks = quintileBreaks(values);
  const head = el('thead', 'govuk-table__head');
  const headRow = el('tr', 'govuk-table__row');
  headRow.append(el('td', 'govuk-table__header'));
  for (const h of open) {
    const th = el('th', 'govuk-table__header wuk-heat__hour', String(h).padStart(2, '0'));
    th.scope = 'col';
    th.append(el('span', 'govuk-visually-hidden', `:00 to ${String(h + 1).padStart(2, '0')}:00`));
    headRow.append(th);
  }
  head.append(headRow);
  const body = el('tbody', 'govuk-table__body');
  DAYS.forEach((day, d) => {
    const tr = el('tr', 'govuk-table__row');
    const th = el('th', 'govuk-table__header', day.slice(0, 3));
    th.scope = 'row';
    th.append(el('span', 'govuk-visually-hidden', day.slice(3)));
    tr.append(th);
    for (const h of open) {
      const v = area.grid[d * 24 + h];
      const td = el('td', 'govuk-table__cell wuk-heat__cell', compact.format(v));
      td.dataset.step = String(stepOf(v, breaks));
      tr.append(td);
    }
    body.append(tr);
  });
  $('heat').replaceChildren(el('caption', 'govuk-visually-hidden', `Car MOT tests finishing in each hour, ${area.code} ${area.name}`), head, body);
}

function renderMonths(area) {
  const max = Math.max(...area.month);
  $('months').replaceChildren(
    ...area.month.map((v, i) => {
      const li = el('li', 'wuk-month');
      const track = el('span', 'wuk-month__track');
      const bar = el('span', 'wuk-month__bar');
      bar.style.width = `${(v / max) * 100}%`;
      bar.setAttribute('aria-hidden', 'true');
      track.append(bar);
      li.append(el('span', 'wuk-month__name', MONTHS[i]), track, el('span', 'wuk-month__value', count.format(v)));
      return li;
    }),
  );
}

function render(area) {
  const s = summarise(area);
  $('results-title').textContent = `${area.code} ${area.name}`;
  const p = (text) => el('p', 'govuk-body', text);
  $('results-summary').replaceChildren(
    p(`Busiest: ${DAYS[s.busiest.d]}s, ${hourLabel(s.busiest.h)}.`),
    p(`Quietest weekday time: ${DAYS[s.quietest.d]}s, ${hourLabel(s.quietest.h)}.`),
    p(`Busiest day is ${s.busiestDay.name}, quietest weekday ${s.quietestWeekday.name}. Busiest month is ${s.busiestMonth.name}, quietest ${s.quietestMonth.name}.`),
  );
  renderHeat(area, s.open);
  renderMonths(area);
  $('results-section').hidden = false;
}

async function start() {
  drawIcons();
  let data;
  try {
    const res = await fetch(`${DATA}tools/mot-times.json`);
    if (!res.ok) throw new Error(`Could not load the MOT times (${res.status})`);
    data = await res.json();
  } catch (err) {
    $('error').hidden = false;
    $('error-message').textContent = navigator.onLine ? err.message : "You're offline, and this tool hasn't been used on this device yet.";
    $('finder').hidden = true;
    return;
  }
  fill('year', String(data.year));
  const show = () => {
    clearErrors(['postcode']);
    const value = $('postcode').value.trim();
    if (!value) return showErrors([{ field: 'postcode', message: 'Enter a postcode or postcode area' }]);
    const code = areaOf(value);
    if (!code) return showErrors([{ field: 'postcode', message: 'Enter a postcode or area like BN1 1AA or BN' }]);
    const area = data.areas[code];
    if (!area) return showErrors([{ field: 'postcode', message: `We have no MOT times for ${code}. Check it's a postcode area in Great Britain` }]);
    history.replaceState(null, '', `#${code}`);
    render({ code, ...area });
  };
  $('finder').addEventListener('submit', (event) => {
    event.preventDefault();
    show();
  });
  const fromUrl = decodeURIComponent(location.hash.slice(1));
  if (fromUrl) {
    $('postcode').value = fromUrl;
    show();
  }
}

start();
