// MOT pass rates by fuel at the same age, as a dot plot with a table twin. Shared by the
// Electric and Petrol and diesel pages; each says which fuels to show and how to sum up.

import { hidden } from './feature-charts.js';
import { el, renderTable } from './insight-charts.js';

const count = new Intl.NumberFormat('en-GB');
const pct0 = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
const pct1 = new Intl.NumberFormat('en-GB', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const FUEL_LABELS = { petrol: 'Petrol', diesel: 'Diesel', hybrid: 'Hybrid', electric: 'Battery electric' };
export const passRate = (o) => (o?.tests ? o.pass / o.tests : null);

/**
 * `mot` is { year, bands: [{ label, fuels: { petrol: outcome, ... } }] }. `fuels` are the fuel ids
 * to show; `keepBand(band)` drops bands with too few tests to say much; `summarise(bands)`
 * returns the summary sentence. Elements are found by id with the given prefix: -dots,
 * -legend, -table, -summary, and [data-<prefix>-year].
 */
export function renderFuelMot(mot, { prefix = 'mot', fuels: ids, keepBand = () => true, summarise }) {
  const $ = (suffix) => document.getElementById(`${prefix}-${suffix}`);
  const section = $('dots').closest('section');
  if (!mot) {
    section.hidden = true;
    return;
  }
  for (const node of document.querySelectorAll(`[data-${prefix}-year]`)) node.textContent = String(mot.year);
  const fuels = ids.filter((id) => mot.bands.some((b) => b.fuels[id]?.tests)).map((id) => ({ id, label: FUEL_LABELS[id] }));
  $('legend').replaceChildren(
    ...fuels.map((f) => {
      const item = el('li', 'wuk-legend__item');
      item.append(el('span', `wuk-mark wuk-mark--${f.id}`), el('span', '', f.label));
      return item;
    }),
  );
  const bands = mot.bands.filter(keepBand);
  const all = bands.flatMap((b) => fuels.map((f) => passRate(b.fuels[f.id]))).filter((v) => v !== null);
  const lo = Math.floor(Math.min(...all) * 20) / 20;
  const at = (v) => `${((v - lo) / (1 - lo)) * 100}%`;
  $('dots').replaceChildren(
    ...bands.map((b) => {
      const li = el('li', 'wuk-dotrow');
      const track = el('span', 'wuk-dotrow__track');
      track.setAttribute('aria-hidden', 'true');
      for (const f of fuels) {
        const v = passRate(b.fuels[f.id]);
        if (v === null) continue;
        const mark = el('span', `wuk-mark wuk-mark--${f.id}`);
        mark.style.left = at(v);
        track.append(mark);
      }
      const words = fuels.filter((f) => b.fuels[f.id]?.tests).map((f) => `${f.label} ${pct1.format(passRate(b.fuels[f.id]))}`);
      li.append(el('span', 'wuk-dotrow__label', b.label), hidden(`: ${words.join(', ')}`), track);
      return li;
    }),
  );
  $('dots').after(el('p', 'govuk-body-s wuk-dotrow-scale', `Scale: ${pct0.format(lo)} to 100% passing first time.`));
  if (bands.length) $('summary').textContent = summarise(bands);
  renderTable($('table'), {
    caption: `MOT results by fuel and age, ${mot.year}`,
    columns: [
      { label: 'Age of car', value: (r) => r.band },
      { label: 'Fuel', value: (r) => r.fuel },
      { label: 'Tests', value: (r) => count.format(r.o.tests), numeric: true },
      { label: 'Passed first time', value: (r) => pct1.format(r.o.pass / r.o.tests), numeric: true },
      { label: 'Average mileage', value: (r) => (r.o.meanMiles === null ? 'Not known' : count.format(r.o.meanMiles)), numeric: true },
    ],
    rows: mot.bands.flatMap((b) => fuels.filter((f) => b.fuels[f.id]?.tests).map((f) => ({ band: b.label, fuel: f.label, o: b.fuels[f.id] }))),
  });
}
