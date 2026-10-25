// "Out to play": the cars that come out for summer. Every fact is built from the data.

import { Snowflake, Sun } from 'lucide';
import { displayName, icon, renderSeasonDumbbells, sawtoothCard } from './feature-charts.js';
import { $, fill, startFeature } from './feature-page.js';
import { el, renderTable } from './insight-charts.js';

const pct0 = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
const pct1 = new Intl.NumberFormat('en-GB', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const count = new Intl.NumberFormat('en-GB');
const points = (v) => `${(v * 100).toFixed(1)} points`;
const HERO_GROUPS = ['supercars', 'kit', 'hothatches', 'everyone'];
const PHRASES = { supercars: 'supercars', kit: 'British sports cars', roadsters: 'roadsters', hothatches: 'the hot hatch heroes' };

/** Hero: summer and winter side by side for each group, with the sun and the snowflake. */
function renderHero(groups) {
  const list = el('ul', 'wuk-season-tiles');
  for (const id of HERO_GROUPS) {
    const g = groups.find((x) => x.id === id);
    if (!g) continue;
    const tile = el('li', `wuk-season-tile${id === 'everyone' ? ' wuk-season-tile--quiet' : ''}`);
    tile.append(el('h2', 'wuk-season-tile__label', g.label));
    for (const [season, shape, share] of [
      ['summer', Sun, g.summer],
      ['winter', Snowflake, g.winter],
    ]) {
      const row = el('p', `wuk-season-tile__row wuk-season-tile__row--${season}`);
      row.append(icon(shape, 'wuk-season-tile__icon'), el('span', 'wuk-season-tile__value', pct0.format(share)), el('span', 'wuk-season-tile__words', `off the road in ${season}`));
      tile.append(row);
    }
    list.append(tile);
  }
  $('hero-graphic').replaceChildren(list);
}

startFeature('out-to-play', (data) => {
  const { models, groups } = data;
  fill('min-known', count.format(2000));
  renderHero(groups);

  const top = models[0];
  if (top) {
    $('dumbbell-summary').textContent =
      `The ${displayName(top.name)} is the most seasonal car on Britain's roads: ${pct0.format(top.summer)} are off the road ` +
      `in summer, ${pct0.format(top.winter)} in winter. That's about ${count.format(Math.round(top.turnout / 10) * 10)} more taxed each summer.`;
    const scaleTop = renderSeasonDumbbells($('dumbbells'), models);
    $('dumbbell-scale').textContent = `Scale: 0% to ${pct0.format(scaleTop)} off the road.`;
  } else {
    $('dumbbells').replaceChildren(el('li', 'govuk-body', 'No models meet the criteria in this data.'));
  }
  renderTable($('dumbbell-table'), {
    caption: 'Share off the road in summer and winter, last two years',
    columns: [
      { label: 'Model', value: (m) => displayName(m.name) },
      { label: 'Summer', value: (m) => pct1.format(m.summer), numeric: true },
      { label: 'Winter', value: (m) => pct1.format(m.winter), numeric: true },
      { label: 'Difference', value: (m) => points(m.swing), numeric: true },
      { label: 'More licensed in summer', value: (m) => count.format(m.turnout), numeric: true },
      { label: 'Known to DVLA', value: (m) => count.format(m.known), numeric: true },
    ],
    rows: models,
  });

  const everyone = groups.find((g) => g.id === 'everyone');
  const biggest = groups.filter((g) => g.id !== 'everyone').reduce((a, b) => (!a || b.swing > a.swing ? b : a), null);
  $('saw-summary').textContent =
    (biggest ? `For ${PHRASES[biggest.id] ?? biggest.label}, the share off the road swings by ${points(biggest.swing)} between summer and winter.` : '') +
    (everyone ? ` For every car on the road together, it moves by just ${points(everyone.swing)}: most of us drive all year.` : '');
  // Every car's summer "turnout" is mostly the fleet growing, so it isn't shown.
  $('saws').replaceChildren(...groups.map((g) => sawtoothCard(g.id === 'everyone' ? { ...g, turnout: 0 } : g)));
  renderTable($('saw-table'), {
    caption: 'Share off the road each quarter',
    columns: [{ label: 'Quarter', value: (r) => r.quarter }, ...groups.map((g, i) => ({ label: g.label, value: (r) => pct1.format(r.values[i]), numeric: true }))],
    rows: groups[0].quarters.map((quarter, q) => ({ quarter, values: groups.map((g) => g.sornShare[q]) })),
  });
});
