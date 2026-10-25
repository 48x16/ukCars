// Development-only: fills the specimen for each house-style direction with real data.

import '@fontsource-variable/inter';
import '../src/styles/main.scss';
import './directions.scss';
import { createChart } from '../src/chart.js';
import { loadInsights, loadModel } from '../src/data.js';
import { renderMovers } from '../src/insight-charts.js';
import { quarterEndDate } from '../src/quarters.js';
import { seriesByFuel, sornSeries } from '../src/series.js';

const big = new Intl.NumberFormat('en-GB', { notation: 'compact', compactDisplay: 'short', maximumFractionDigits: 1 });
const share = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 1 });

const [insights, escort] = await Promise.all([loadInsights(), loadModel('ford', 'ford-escort')]);
const template = document.getElementById('specimen');

for (const section of document.querySelectorAll('.dir')) {
  const spec = template.content.cloneNode(true);
  const prefix = section.id;

  // Unique ids per copy, so labels still point at their own inputs.
  for (const label of spec.querySelectorAll('[data-for]')) label.htmlFor = `${prefix}-${label.dataset.for}`;
  for (const input of spec.querySelectorAll('[data-id]')) input.id = `${prefix}-${input.dataset.id}`;

  const h = insights.headline;
  spec.querySelector('[data-stat="licensed"]').textContent = big.format(h.licensed);
  spec.querySelector('[data-stat="electric"]').textContent = big.format(h.electric);
  spec.querySelector('[data-stat="diesel"]').textContent = share.format(h.dieselShare);

  spec.querySelector('[data-id="variant"] option').textContent =
    `All variants (${escort.variants.length.toLocaleString('en-GB')})`;

  const last = escort.quarters.length - 1;
  const series = seriesByFuel(escort);
  const sorn = sornSeries(escort);
  const licensedNow = series.reduce((s, x) => s + x.values[last], 0);
  spec.querySelector('[data-stat="escort-sorn"]').textContent = `${(sorn.values[last] / licensedNow).toFixed(1)}×`;

  section.append(spec);
  const root = section.querySelector('.spec');

  createChart(root.querySelector('.spec__chart')).update({
    quarters: escort.quarters,
    dates: escort.quarters.map(quarterEndDate),
    series,
    sorn,
    summary: 'Specimen chart: Ford Escort licensed cars by fuel type, and off the road.',
  });

  const { quarters, settings } = insights;
  renderMovers(root.querySelector('.spec__movers'), [insights.dying[0], insights.growing[0], insights.growing[3]], {
    startQuarter: quarters[quarters.length - 1 - settings.years * 4],
    latestQuarter: quarters.at(-1),
  });
}
