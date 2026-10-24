// Bubble map of Great Britain's postcode areas: one circle per area, sized by the number of
// tests and shaded in the same five greys as the council map. London's areas crowd together,
// so they're repeated, spread out and labelled, in an inset.
//
// As with the council map, exact values are a tooltip away and every value is in the page's
// area list and table, which is how keyboard and screen reader users reach them.

import { geoIdentity, geoPath, pointer, scaleSqrt, select } from 'd3';
import { stepOf } from './council-map.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const WIDTH = 520;
const MAX_RADIUS = 13;
/** Postcode areas shown again in the London inset. */
export const LONDON_AREAS = ['BR', 'CR', 'DA', 'E', 'EC', 'EN', 'HA', 'IG', 'KT', 'N', 'NW', 'RM', 'SE', 'SM', 'SW', 'TW', 'UB', 'W', 'WC'];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * `geo` is data/geo/gb.json. `onPick(area)` is called when a bubble is clicked. Call `update()`
 * with sizes and values, and `highlight(area)` to ring one area in pink.
 */
export function createAreaMap(root, { geo, onPick }) {
  const main = geoIdentity().reflectY(true).fitWidth(WIDTH, geo.outline);
  const path = geoPath(main);
  const [[, top], [, bottom]] = path.bounds(geo.outline);
  const height = Math.ceil(bottom - top) + 2;
  const point = (a) => main([a.x, a.y]);

  // London, spread out in the empty sea to the east of Scotland.
  const londonAreas = geo.areas.filter((a) => LONDON_AREAS.includes(a.area));
  const inset = { x: WIDTH * 0.6, y: height * 0.3, width: WIDTH * 0.38, height: WIDTH * 0.32 };
  const insetProjection = geoIdentity()
    .reflectY(true)
    .fitExtent(
      [
        [inset.x + 22, inset.y + 36],
        [inset.x + inset.width - 22, inset.y + inset.height - 18],
      ],
      { type: 'MultiPoint', coordinates: londonAreas.map((a) => [a.x, a.y]) },
    );
  const insetPoint = (a) => insetProjection([a.x, a.y]);

  const wrap = el('div', 'wuk-map');
  const svg = select(document.createElementNS(SVG_NS, 'svg'))
    .attr('class', 'wuk-map__svg')
    .attr('viewBox', `0 0 ${WIDTH} ${height}`)
    .attr('role', 'img');
  const tooltip = el('div', 'wuk-tooltip wuk-map__tooltip');
  tooltip.hidden = true;
  tooltip.setAttribute('aria-hidden', 'true');

  svg.append('g').selectAll('path').data(geo.outline.features).join('path').attr('class', 'wuk-map__land').attr('d', path);
  const [[x0, y0], [x1, y1]] = [
    [Math.min(...londonAreas.map((a) => point(a)[0])), Math.min(...londonAreas.map((a) => point(a)[1]))],
    [Math.max(...londonAreas.map((a) => point(a)[0])), Math.max(...londonAreas.map((a) => point(a)[1]))],
  ];
  svg.append('rect').attr('class', 'wuk-map__inset-marker').attr('x', x0 - 6).attr('y', y0 - 6).attr('width', x1 - x0 + 12).attr('height', y1 - y0 + 12);
  const bubbles = svg.append('g');
  const box = svg.append('g').attr('class', 'wuk-map__inset');
  box.append('rect').attr('class', 'wuk-map__inset-frame').attr('x', inset.x).attr('y', inset.y).attr('width', inset.width).attr('height', inset.height);
  box.append('text').attr('class', 'wuk-map__inset-label').attr('x', inset.x + 8).attr('y', inset.y + 17).text('London');
  const insetBubbles = box.append('g');
  const insetLabels = box.append('g').attr('class', 'wuk-map__bubble-labels').attr('aria-hidden', 'true');
  const raised = svg.append('g').attr('class', 'wuk-map__raised');

  wrap.append(svg.node(), tooltip);
  root.replaceChildren(wrap);

  let current = { values: new Map(), format: String };
  let picked = null;
  const circles = new Map(); // area -> [circle elements]

  const showTooltip = (event, a) => {
    const value = current.values.get(a.area);
    tooltip.replaceChildren(
      el('p', 'wuk-tooltip__title', `${a.area} ${a.name}`),
      el('p', 'wuk-tooltip__value wuk-map__tooltip-value', value === null || value === undefined ? 'No data' : current.format(value)),
    );
    tooltip.hidden = false;
    const [x, y] = pointer(event, wrap);
    tooltip.style.left = `${Math.max(4, Math.min(x + 12, wrap.clientWidth - tooltip.offsetWidth - 4))}px`;
    tooltip.style.top = `${y + 16}px`;
  };

  function highlight(area) {
    picked = area;
    raised.selectAll('*').remove();
    for (const c of circles.get(area) ?? []) {
      raised.append('circle').attr('class', 'wuk-map__picked').attr('cx', c.getAttribute('cx')).attr('cy', c.getAttribute('cy')).attr('r', Number(c.getAttribute('r')) + 2);
    }
  }

  return {
    /** `sizes`: area -> number (bubble area), `values`: area -> value to shade by. */
    update({ sizes, values, breaks, format, label }) {
      current = { values, format };
      const radius = scaleSqrt().domain([0, Math.max(...sizes.values())]).range([0, MAX_RADIUS]);
      const areas = geo.areas.filter((a) => sizes.has(a.area)).sort((a, b) => sizes.get(b.area) - sizes.get(a.area));
      const step = (a) => {
        const v = values.get(a.area);
        return v === null || v === undefined ? 'none' : stepOf(v, breaks);
      };
      circles.clear();
      const drawBubbles = (group, list, at) =>
        group
          .selectAll('circle')
          .data(list, (a) => a.area)
          .join('circle')
          .attr('class', 'wuk-map__bubble')
          .attr('cx', (a) => at(a)[0])
          .attr('cy', (a) => at(a)[1])
          .attr('r', (a) => Math.max(2, radius(sizes.get(a.area))))
          .attr('data-step', step)
          .each(function (a) {
            circles.set(a.area, [...(circles.get(a.area) ?? []), this]);
          })
          .on('pointermove', showTooltip)
          .on('pointerleave', () => {
            tooltip.hidden = true;
          })
          .on('click', (_, a) => onPick?.(a.area));
      const londonIn = areas.filter((a) => LONDON_AREAS.includes(a.area));
      drawBubbles(bubbles, areas, point);
      drawBubbles(insetBubbles, londonIn, insetPoint);
      insetLabels
        .selectAll('text')
        .data(londonIn, (a) => a.area)
        .join('text')
        .attr('x', (a) => insetPoint(a)[0])
        .attr('y', (a) => insetPoint(a)[1] - Math.max(2, radius(sizes.get(a.area))) - 3)
        .attr('text-anchor', 'middle')
        .text((a) => a.area);
      svg.attr('aria-label', label);
      if (picked) highlight(picked);
    },
    highlight,
  };
}
