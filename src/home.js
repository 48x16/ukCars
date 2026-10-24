// The front door: a headline number, search that jumps straight into Explore, and a doorway
// to each section with its own live figure and mini-chart. Every figure comes from home.json.

import { loadHome, loadIndex } from './data.js';
import { miniLine } from './feature-charts.js';
import { $, drawIcons, fill } from './feature-page.js';
import { modelLink } from './insight-charts.js';
import { buildEntries, createSearch } from './search.js';

const count = new Intl.NumberFormat('en-GB');
const big = new Intl.NumberFormat('en-GB', { notation: 'compact', compactDisplay: 'long', maximumFractionDigits: 1 });
const bigger = new Intl.NumberFormat('en-GB', { notation: 'compact', compactDisplay: 'long', maximumFractionDigits: 2 });
const pct0 = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
const pct1 = new Intl.NumberFormat('en-GB', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });

function door(id, value, label, values) {
  $(`door-${id}-value`).textContent = value;
  if (label) $(`door-${id}-label`).textContent = label;
  if (values?.length > 1) $(`door-${id}-chart`).replaceChildren(miniLine(values, { width: 240, height: 56 }));
}

async function startSearch() {
  try {
    const index = await loadIndex();
    // Picking a car goes straight to it in Explore.
    createSearch($('search'), buildEntries(index), (entry) => {
      location.href = modelLink(entry);
    });
    $('filters').addEventListener('submit', (event) => event.preventDefault());
  } catch {
    $('search').hidden = true;
  }
}

async function start() {
  drawIcons();
  startSearch();
  let h;
  try {
    h = await loadHome();
  } catch (err) {
    $('error').hidden = false;
    $('error-message').textContent = navigator.onLine ? err.message : "You're offline, and the latest figures haven't been saved on this device yet.";
    return;
  }
  const last = h.quarters.length - 1;
  fill('latest-quarter', h.quarters[last]);
  $('big-number').textContent = bigger.format(h.licensed[last]);
  const growth = h.licensed[last] - h.licensed[0];
  $('big-label').textContent =
    `cars licensed in the UK at the end of ${h.quarters[last]}, ${growth >= 0 ? 'up' : 'down'} ${big.format(Math.abs(growth))} since ${h.quarters[0]}. ` +
    `Another ${big.format(h.sorn)} are declared off the road.`;
  // On its own scale, so the growth shows; the words say how much.
  const chart = miniLine(h.licensed, { width: 520, height: 90, zero: false });
  chart.setAttribute('role', 'img');
  chart.removeAttribute('aria-hidden');
  chart.setAttribute(
    'aria-label',
    `Licensed cars, ${h.quarters[0]} to ${h.quarters[last]}: ${big.format(h.licensed[0])} to ${big.format(h.licensed[last])}.`,
  );
  $('big-chart').replaceChildren(chart);

  door('explore', count.format(h.models), `models from ${count.format(h.makes)} makes, every quarter since ${h.quarters[0]}.`);
  if (h.diesel) {
    door(
      'insights',
      pct0.format(h.diesel.share[last]),
      `of cars are diesel, down from a peak of ${pct0.format(h.diesel.peak)} in ${h.diesel.peakQuarter}.`,
      h.diesel.share,
    );
  }
  door(
    'electric',
    bigger.format(h.electric.values[last]),
    `battery electric cars, ${pct1.format(h.electric.share)} of all cars, and the public chargers near you.`,
    h.electric.values.slice(h.quarters.findIndex((q) => q.startsWith('2018'))),
  );
  if (h.mot) {
    door(
      'mot',
      pct1.format(h.mot.passRate),
      `of ${big.format(h.mot.tests)} car MOTs passed first time in ${h.mot.year}. The line: pass rate by age.`,
      h.mot.byAge.map((a) => a.passRate),
    );
  }
}

start();
