// A map of the UK's councils, shaded in five greys from light (low) to dark (high), with
// London enlarged in an inset. The data is in British National Grid metres, so the map needs
// no projection, only flipping the y axis.
//
// The map is for seeing patterns. Exact values are a tooltip away, and every value is in the
// page's council list and table, which is how keyboard and screen reader users reach them.

import { geoIdentity, geoPath, pointer, select } from 'd3';
import { feature } from 'topojson-client';

const SVG_NS = 'http://www.w3.org/2000/svg';
const WIDTH = 520;
export const STEPS = 5;
const isLondon = (code) => code.startsWith('E09');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Four breaks splitting the values into five groups of about the same size, rounded to 2 figures. */
export function quintileBreaks(values) {
  const sorted = values.filter((v) => v !== null && Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const round = (v) => (v === 0 ? 0 : Number(v.toPrecision(2)));
  const breaks = [1, 2, 3, 4].map((i) => round(sorted[Math.floor((i * sorted.length) / STEPS)]));
  return breaks.filter((b, i) => i === 0 || b > breaks[i - 1]);
}

/** Which of the groups a value falls in: 0 (lowest) up to breaks.length (highest). */
export const stepOf = (value, breaks) => breaks.filter((b) => value >= b).length;

/**
 * `onPick(code)` is called when a council is clicked. Call `update()` with the values to shade
 * by, and `highlight(code)` to outline one council in pink.
 */
export function createCouncilMap(root, { topology, onPick }) {
  const councils = feature(topology, topology.objects.councils).features;
  const main = geoIdentity().reflectY(true).fitWidth(WIDTH, { type: 'FeatureCollection', features: councils });
  const [[, top], [, bottom]] = geoPath(main).bounds({ type: 'FeatureCollection', features: councils });
  const height = Math.ceil(bottom - top) + 2;

  // London, enlarged in the empty sea to the north east.
  const london = councils.filter((f) => isLondon(f.properties.code));
  const inset = { x: WIDTH * 0.62, y: height * 0.06, width: WIDTH * 0.36, height: WIDTH * 0.3 };
  const insetProjection = geoIdentity()
    .reflectY(true)
    .fitExtent(
      [
        [inset.x + 8, inset.y + 26],
        [inset.x + inset.width - 8, inset.y + inset.height - 8],
      ],
      { type: 'FeatureCollection', features: london },
    );

  const wrap = el('div', 'wuk-map');
  const svg = select(document.createElementNS(SVG_NS, 'svg'))
    .attr('class', 'wuk-map__svg')
    .attr('viewBox', `0 0 ${WIDTH} ${height}`)
    .attr('role', 'img');
  const tooltip = el('div', 'wuk-tooltip wuk-map__tooltip');
  tooltip.hidden = true;
  tooltip.setAttribute('aria-hidden', 'true'); // the same facts are in the council list and table

  const paths = new Map(); // code -> [path elements]
  const draw = (group, projection, features) => {
    const path = geoPath(projection);
    group
      .selectAll('path')
      .data(features)
      .join('path')
      .attr('class', 'wuk-map__council')
      .attr('d', path)
      .each(function (f) {
        paths.set(f.properties.code, [...(paths.get(f.properties.code) ?? []), this]);
      });
  };

  draw(svg.append('g'), main, councils);
  if (london.length) {
    const [[x0, y0], [x1, y1]] = geoPath(main).bounds({ type: 'FeatureCollection', features: london });
    svg.append('rect').attr('class', 'wuk-map__inset-marker').attr('x', x0 - 2).attr('y', y0 - 2).attr('width', x1 - x0 + 4).attr('height', y1 - y0 + 4);
    const box = svg.append('g').attr('class', 'wuk-map__inset');
    box.append('rect').attr('class', 'wuk-map__inset-frame').attr('x', inset.x).attr('y', inset.y).attr('width', inset.width).attr('height', inset.height);
    box.append('text').attr('class', 'wuk-map__inset-label').attr('x', inset.x + 8).attr('y', inset.y + 17).text('London');
    draw(box.append('g'), insetProjection, london);
  }
  const raised = svg.append('g').attr('class', 'wuk-map__raised');

  let current = { values: new Map(), breaks: [], format: String };
  let picked = null;

  const showTooltip = (event, f) => {
    const { code, name } = f.properties;
    const value = current.values.get(code);
    tooltip.replaceChildren(
      el('p', 'wuk-tooltip__title', name),
      el('p', 'wuk-tooltip__value wuk-map__tooltip-value', value === null || value === undefined ? 'No data' : current.format(value)),
    );
    tooltip.hidden = false;
    const [x, y] = pointer(event, wrap);
    const left = Math.min(x + 12, wrap.clientWidth - tooltip.offsetWidth - 4);
    tooltip.style.left = `${Math.max(4, left)}px`;
    tooltip.style.top = `${y + 16}px`;
  };

  svg
    .selectAll('path.wuk-map__council')
    .on('pointermove', (event, f) => showTooltip(event, f))
    .on('pointerleave', () => {
      tooltip.hidden = true;
    })
    .on('click', (_, f) => onPick?.(f.properties.code));

  wrap.append(svg.node(), tooltip);
  root.replaceChildren(wrap);

  /** Draws the picked council's outline on top, so its pink edge isn't hidden by neighbours. */
  function highlight(code) {
    picked = code;
    raised.selectAll('*').remove();
    for (const node of paths.get(code) ?? []) {
      raised.append('path').attr('class', 'wuk-map__picked').attr('d', node.getAttribute('d'));
    }
  }

  return {
    update({ values, breaks, format, label }) {
      current = { values, breaks, format };
      for (const [code, nodes] of paths) {
        const value = values.get(code);
        const step = value === null || value === undefined ? 'none' : stepOf(value, breaks);
        for (const node of nodes) node.setAttribute('data-step', step);
      }
      svg.attr('aria-label', label);
      if (picked) highlight(picked);
    },
    highlight,
  };
}

/** The legend: one swatch per group, labelled with its range. */
export function renderMapLegend(list, breaks, format, { noData = false } = {}) {
  const items = [];
  const ranges = [null, ...breaks].map((from, i) => [from, breaks[i] ?? null]);
  ranges.forEach(([from, to], step) => {
    const text = from === null ? `Under ${format(to)}` : to === null ? `${format(from)} or more` : `${format(from)} to under ${format(to)}`;
    items.push([step, text]);
  });
  if (noData) items.push(['none', 'No data']);
  list.replaceChildren(
    ...items.map(([step, text]) => {
      const item = el('li', 'wuk-legend__item');
      const swatch = el('span', 'wuk-map__swatch');
      swatch.setAttribute('data-step', String(step));
      item.append(swatch, el('span', '', text));
      return item;
    }),
  );
}
