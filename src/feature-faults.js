// "Why cars fail": what fails at the MOT, the commonest faults, how it changes with age and
// fuel, and model by model, compared at the same age. Every fact is built from the data.

import { quintileBreaks, stepOf } from './council-map.js';
import { displayName } from './feature-charts.js';
import { $, fill, startFeature } from './feature-page.js';
import { el, emptyNote } from './insight-charts.js';
import { bars } from './make-story.js';

const count = new Intl.NumberFormat('en-GB');
const pct0 = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
const pct1 = new Intl.NumberFormat('en-GB', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** A model needs this many tests in an age band to be shown there. */
const MIN_BAND_TESTS = 1_000;
/** Part names mid-sentence: "Number plates and VIN" becomes "number plates and VIN". */
const lower = (s) => s[0].toLowerCase() + s.slice(1);
/** The band models are compared in first: 10 to 14 years, where cars part company. */
const PREFERRED_BAND = 2;

function tile(value, label) {
  const li = el('li', 'wuk-tile');
  li.append(el('span', 'wuk-tile__value', value), el('span', 'wuk-tile__label', label));
  return li;
}

/** Bars of shares (of tests), each with a pink marker for the comparison, if given. */
function shareBars(labels, shares, compare) {
  const scale = Math.max(...shares, ...(compare ?? []), 0.01);
  const list = bars(
    labels.map((label, i) => ({ label, value: shares[i], text: pct1.format(shares[i]) })),
    scale,
  );
  if (compare) {
    [...list.children].forEach((li, i) => {
      const mark = el('span', 'wuk-road__average');
      mark.style.left = `${(compare[i] / scale) * 100}%`;
      li.querySelector('.wuk-road__track').append(mark);
    });
  }
  return list;
}

function renderHeat(data) {
  const table = $('age-table');
  const head = el('tr', 'govuk-table__row');
  const corner = el('th', 'govuk-table__header', 'Part');
  corner.scope = 'col';
  head.append(corner);
  for (const b of data.bands) {
    const th = el('th', 'govuk-table__header govuk-table__header--numeric', b.label);
    th.scope = 'col';
    head.append(th);
  }
  const shares = data.bands.map((b) => b.counts.map((c) => c / b.tests));
  const breaks = quintileBreaks(shares.flat());
  const body = el('tbody', 'govuk-table__body');
  data.sections.forEach((name, s) => {
    const tr = el('tr', 'govuk-table__row');
    const th = el('th', 'govuk-table__header', name);
    th.scope = 'row';
    tr.append(th);
    data.bands.forEach((_, b) => {
      const v = shares[b][s];
      const td = el('td', 'govuk-table__cell govuk-table__cell--numeric wuk-heat__cell', pct1.format(v));
      td.dataset.step = String(stepOf(v, breaks));
      tr.append(td);
    });
    body.append(tr);
  });
  const thead = el('thead', 'govuk-table__head');
  thead.append(head);
  table.replaceChildren(el('caption', 'govuk-table__caption govuk-table__caption--s', 'Share of MOTs failing on each part, by age of car'), thead, body);

  // The part whose failures rise most with age, in percentage points (a ratio runs away when the young barely fail).
  const growth = data.sections.map((name, s) => ({ name, young: shares[0][s], old: shares.at(-1)[s], rise: shares.at(-1)[s] - shares[0][s] }));
  const steepest = [...growth].sort((a, b) => b.rise - a.rise)[0];
  // The flattest of the big four parts (the small ones barely fail at any age).
  const flattest = growth.slice(0, 4).sort((a, b) => Math.abs(a.rise) - Math.abs(b.rise))[0];
  const young = data.bands[0].label.toLowerCase();
  const old = data.bands.at(-1).label.toLowerCase();
  $('age-summary').textContent =
    `${steepest.name} failures rise the most with age: from ${pct1.format(steepest.young)} of MOTs for cars aged ${young} to ${pct1.format(steepest.old)} for cars aged ${old}. ` +
    (flattest !== steepest ? `${flattest.name} barely change: ${pct1.format(flattest.young)} to ${pct1.format(flattest.old)}.` : '');
}

function renderModels(data) {
  const select = $('model');
  if (!data.models.length) {
    select.closest('.govuk-form-group').hidden = true;
    $('model-chart').replaceChildren(emptyNote());
    return;
  }
  select.replaceChildren(
    ...[...data.models]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((m) => {
        const option = el('option', '', displayName(m.name));
        option.value = `${m.makeSlug}/${m.modelSlug}`;
        return option;
      }),
  );
  const show = () => {
    const m = data.models.find((x) => `${x.makeSlug}/${x.modelSlug}` === select.value);
    const band = [PREFERRED_BAND, 1, 3, 0].find((b) => m.bandTests[b] >= MIN_BAND_TESTS) ?? m.bandTests.indexOf(Math.max(...m.bandTests));
    const all = data.bands[band];
    const mine = m.counts[band].map((c) => c / m.bandTests[band]);
    const average = all.counts.map((c) => c / all.tests);
    $('model-chart').replaceChildren(shareBars(data.sections, mine, average));
    const worse = data.sections
      .map((name, s) => ({ name, ratio: average[s] ? mine[s] / average[s] : 1 }))
      .sort((a, b) => b.ratio - a.ratio);
    const name = displayName(m.name);
    $('model-summary').textContent =
      `At ${all.label.toLowerCase()} old (${count.format(m.bandTests[band])} tests), the ${name}'s weakest spot against all cars that age is ${lower(worse[0].name)}: ` +
      `${pct1.format(mine[data.sections.indexOf(worse[0].name)])} fail on it, against ${pct1.format(average[data.sections.indexOf(worse[0].name)])}. ` +
      `Its strongest is ${lower(worse.at(-1).name)}.`;
    history.replaceState(null, '', `#${select.value}`);
  };
  select.addEventListener('change', show);
  const fromHash = decodeURIComponent(location.hash.slice(1));
  select.value = data.models.some((m) => `${m.makeSlug}/${m.modelSlug}` === fromHash) ? fromHash : `${data.models[0].makeSlug}/${data.models[0].modelSlug}`;
  show();
}

startFeature('faults', (data) => {
  fill('latest-quarter', `${data.year} MOT tests`);
  fill('mot-year', String(data.year));
  fill('tests', count.format(data.tests));
  const national = data.national.map((c) => c / data.tests);
  const tiles = el('ul', 'wuk-tiles');
  tiles.append(
    tile(pct0.format(data.failed / data.tests), `of cars failed their MOT in ${data.year}, or passed only after a repair at the test`),
    tile(pct0.format(national[0]), `failed on ${lower(data.sections[0])}, the commonest part to fail`),
  );
  $('hero-graphic').replaceChildren(tiles);

  $('parts-chart').replaceChildren(shareBars(data.sections, national));
  $('parts-summary').textContent =
    `${data.sections[0]} fail most often: ${pct1.format(national[0])} of all MOTs. Then ${lower(data.sections[1])} (${pct1.format(national[1])}) and ${lower(data.sections[2])} (${pct1.format(national[2])}). ` +
    `A car can fail on more than one, so these add up to more than the ${pct0.format(data.failed / data.tests)} that fail.`;

  // Faults found per 100 MOTs, not a share of tests: one car can have the same fault twice.
  const per100 = (d) => (d.count / data.tests) * 100;
  $('defects-chart').replaceChildren(
    bars(
      data.defects.map((d) => ({ label: d.text, value: per100(d), text: per100(d).toFixed(1) })),
      per100(data.defects[0]),
      'wuk-road__models wuk-defects',
    ),
  );
  $('defects-summary').textContent = `The commonest fault: ${lower(data.defects[0].text)}, found ${per100(data.defects[0]).toFixed(1)} times for every 100 MOTs.`;

  renderHeat(data);

  const fuel = (id) => data.fuels.find((f) => f.id === id);
  const fuels = ['petrol', 'diesel', 'hybrid', 'electric'].map(fuel).filter(Boolean);
  $('fuels').replaceChildren(
    ...fuels.map((f) => {
      const col = el('div', 'wuk-fuel-band');
      col.append(el('h3', 'govuk-heading-s', `${f.label} (${count.format(f.tests)} tests)`));
      col.append(shareBars(data.sections.slice(0, 5), f.counts.slice(0, 5).map((c) => c / f.tests)));
      return col;
    }),
  );
  const ev = fuel('electric');
  const petrol = fuel('petrol');
  if (ev && petrol) {
    const tyres = data.sections.findIndex((s) => /tyre/i.test(s));
    const evTyres = ev.counts[tyres] / ev.tests;
    const petrolTyres = petrol.counts[tyres] / petrol.tests;
    $('fuels-summary').textContent =
      tyres === -1
        ? ''
        : `Electric cars fail on tyres in ${pct1.format(evTyres)} of MOTs, against ${pct1.format(petrolTyres)} for petrol cars` +
          (evTyres > petrolTyres
            ? `, despite being younger on average. They're heavy, which can wear tyres faster.`
            : `. They're younger on average, which counts in their favour.`);
  }

  renderModels(data);
});
