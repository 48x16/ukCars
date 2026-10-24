// "Where cars come from": licensed cars by their make's home country.

import { displayName, miniLine, renderChangeDots, renderPictogram } from './feature-charts.js';
import { $, startFeature } from './feature-page.js';
import { el, renderTable } from './insight-charts.js';

const count = new Intl.NumberFormat('en-GB');
const pct1 = new Intl.NumberFormat('en-GB', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const points = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)} points`;

startFeature('origins', (data) => {
  const { quarters, groups } = data;
  const last = quarters.length - 1;
  const named = groups.filter((g) => g.id !== 'other');
  const byNow = [...named].sort((a, b) => b.share[last] - a.share[last]);
  const change = (g) => g.share[last] - g.share[0];
  const riser = [...named].sort((a, b) => change(b) - change(a))[0];
  const faller = [...named].sort((a, b) => change(a) - change(b))[0];

  // Hero: the top three, big.
  const tiles = el('ul', 'wuk-tiles');
  for (const g of byNow.slice(0, 4)) {
    const tile = el('li', 'wuk-tile');
    tile.append(el('span', 'wuk-tile__value', String(g.of100)), el('span', 'wuk-tile__label', `in every 100 cars are ${g.label === 'Rest of Europe' ? 'from the rest of Europe' : g.label}`));
    tiles.append(tile);
  }
  $('hero-graphic').replaceChildren(tiles);

  $('hundred-summary').textContent =
    `Of every 100 cars licensed at the end of ${quarters[last]}, ${byNow[0].of100} are ${byNow[0].label}, ` +
    `${byNow[1].of100} ${byNow[1].label} and ${byNow[2].of100} ${byNow[2].label}. The biggest gainer since ${quarters[0]} is in pink.`;
  renderPictogram($('pictogram'), byNow.concat(groups.filter((g) => g.id === 'other')), { highlight: (g) => g === riser });

  $('change-summary').textContent =
    `${riser.label} makes gained most since ${quarters[0]} (${points(change(riser))}); ` +
    `${faller.label} makes lost most (${points(change(faller))}).`;
  renderChangeDots(
    $('changes'),
    byNow.map((g) => ({ label: g.label, from: g.share[0], to: g.share[last] })),
    (v) => pct1.format(v),
  );

  const top = Math.max(...named.flatMap((g) => g.share));
  $('multiples').replaceChildren(
    ...byNow.map((g) => {
      const card = el('li', `wuk-multiple${g === riser ? ' wuk-multiple--highlight' : ''}`);
      card.append(
        el('h3', 'govuk-heading-s wuk-multiple__title', g.label),
        el('p', 'wuk-multiple__value', pct1.format(g.share[last])),
        el('p', 'wuk-multiple__change', `${points(change(g))} since ${quarters[0]}`),
        miniLine(g.share, { top }),
        el('p', 'wuk-multiple__makes', g.topMakes.map((m) => displayName(m.make)).join(', ')),
      );
      return card;
    }),
  );
  renderTable($('origin-table'), {
    caption: `Licensed cars by where their make is from`,
    columns: [
      { label: 'From', value: (g) => g.label },
      { label: `Share ${quarters[0]}`, value: (g) => pct1.format(g.share[0]), numeric: true },
      { label: `Share ${quarters[last]}`, value: (g) => pct1.format(g.share[last]), numeric: true },
      { label: `Licensed ${quarters[last]}`, value: (g) => count.format(g.licensed[last]), numeric: true },
      { label: 'Biggest makes', value: (g) => g.topMakes.map((m) => displayName(m.make)).join(', ') },
    ],
    rows: [...byNow, ...groups.filter((g) => g.id === 'other')],
  });
});
