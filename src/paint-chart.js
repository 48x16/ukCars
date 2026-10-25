// "Paint chart": each colour's share of the cars first used in each year, stacked to 100%.
// This is the one chart on the site where colour is the data itself, so each band is painted
// its own colour. It never rests on colour alone: bands are labelled by name where they're
// thick enough, there's a legend, a keyboard-readable tooltip, and the page has a table.

import { area, axisBottom, axisLeft, bisector, format, pointer, scaleLinear, select, stack, stackOffsetExpand } from 'd3';

const HEIGHT = 380;
const NARROW = 520;
const MIN_LABEL_HEIGHT = 16;
const percent = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 1 });

/** Paint for each DVSA colour name. Anything unlisted gets a neutral grey. */
export const PAINT = {
  BLACK: '#151515',
  WHITE: '#ffffff',
  GREY: '#7d8086',
  SILVER: '#c4c7cc',
  BLUE: '#2856a6',
  RED: '#c0182b',
  GREEN: '#2f6b34',
  ORANGE: '#e3741c',
  YELLOW: '#f2cb1d',
  BEIGE: '#d9c7a3',
  BROWN: '#6b4a2f',
  PURPLE: '#5e3a87',
  BRONZE: '#9a6b3c',
  GOLD: '#c9a23f',
  TURQUOISE: '#2a9d9a',
  MAROON: '#6d1a2a',
  CREAM: '#efe6cc',
  PINK: '#e489b6',
  'MULTI-COLOUR': '#a0a0a0',
  OTHER: '#b5b5b5',
};
export const paint = (name) => PAINT[name] ?? PAINT.OTHER;

/** Black or white text, whichever reads better on the paint. */
export function inkOn(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.18 ? '#111111' : '#ffffff';
}

const title = (name) => name.charAt(0) + name.slice(1).toLowerCase();

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function swatch(name) {
  const s = el('span', 'wuk-paint__swatch');
  s.style.background = paint(name);
  return s;
}

/** `update({ years, series: [{ name, values }], summary })`; values are counts per year. */
export function createPaintChart(root) {
  const legend = el('ul', 'wuk-legend wuk-paint__legend');
  const frame = el('div', 'wuk-chart__frame');
  const tooltip = el('div', 'wuk-tooltip');
  tooltip.hidden = true;
  tooltip.setAttribute('aria-live', 'polite');
  const svg = select(frame).append('svg').attr('class', 'wuk-chart__svg wuk-paint').attr('role', 'img').attr('tabindex', 0);
  frame.append(tooltip);
  root.replaceChildren(legend, frame);

  let data = null;
  let geometry = null;
  let focusIndex = null;

  function draw() {
    if (!data) return;
    const width = frame.clientWidth;
    const narrow = width < NARROW;
    const m = { top: 8, right: 8, bottom: 32, left: 44 };
    const { years, layers } = data;
    const x = scaleLinear().domain([years[0], years.at(-1)]).range([m.left, width - m.right]);
    const y = scaleLinear().domain([0, 1]).range([HEIGHT - m.bottom, m.top]);
    geometry = { x, y, m, width };

    svg.attr('viewBox', `0 0 ${width} ${HEIGHT}`).attr('height', HEIGHT);
    svg.selectAll('*').remove();

    const band = area()
      .x((d) => x(d.data.year))
      .y0((d) => y(d[0]))
      .y1((d) => y(d[1]));
    svg
      .append('g')
      .selectAll('path')
      .data(layers)
      .join('path')
      .attr('class', 'wuk-paint__band')
      .attr('fill', (l) => paint(l.key))
      .attr('d', band);
    svg.append('rect').attr('class', 'wuk-paint__frame').attr('x', m.left).attr('y', m.top).attr('width', width - m.left - m.right).attr('height', HEIGHT - m.top - m.bottom);

    // Name each band where it's thickest, if there's room.
    const labels = layers
      .map((l) => {
        let best = 0;
        l.forEach((d, i) => {
          if (d[1] - d[0] > l[best][1] - l[best][0]) best = i;
        });
        const d = l[best];
        const i = Math.min(Math.max(best, 2), l.length - 3);
        return { key: l.key, x: x(l[i].data.year), y: y((d[0] + d[1]) / 2), height: y(d[0]) - y(d[1]) };
      })
      .filter((l) => l.height >= MIN_LABEL_HEIGHT);
    svg
      .append('g')
      .attr('class', 'wuk-paint__labels')
      .attr('aria-hidden', 'true')
      .selectAll('text')
      .data(labels)
      .join('text')
      .attr('x', (l) => l.x)
      .attr('y', (l) => l.y)
      .attr('dy', '0.32em')
      .attr('text-anchor', 'middle')
      .attr('fill', (l) => inkOn(paint(l.key)))
      .text((l) => title(l.key));

    svg
      .append('g')
      .attr('class', 'wuk-chart__axis')
      .attr('transform', `translate(0,${HEIGHT - m.bottom})`)
      .call(axisBottom(x).ticks(narrow ? 4 : 8).tickFormat(format('d')).tickSizeOuter(0));
    svg
      .append('g')
      .attr('class', 'wuk-chart__axis wuk-chart__axis--y')
      .attr('transform', `translate(${m.left},0)`)
      .call(axisLeft(y).ticks(5).tickFormat(format('.0%')).tickSize(0).tickPadding(8))
      .call((g) => g.select('.domain').remove());

    const focus = svg.append('g').attr('class', 'wuk-chart__focus').style('display', 'none');
    focus.append('line').attr('class', 'wuk-paint__crosshair').attr('y1', m.top).attr('y2', HEIGHT - m.bottom);
    svg
      .append('rect')
      .attr('class', 'wuk-chart__hit')
      .attr('x', m.left)
      .attr('y', m.top)
      .attr('width', Math.max(0, width - m.left - m.right))
      .attr('height', HEIGHT - m.top - m.bottom)
      .on('pointermove', (event) => {
        const [px] = pointer(event, svg.node());
        showFocus(bisector((d) => d).center(years, x.invert(px)));
      })
      .on('pointerleave', hideFocus);
    if (focusIndex !== null) showFocus(focusIndex);
  }

  function showFocus(i) {
    focusIndex = Math.max(0, Math.min(data.years.length - 1, i));
    const { x, width, m } = geometry;
    const cx = x(data.years[focusIndex]);
    svg.select('.wuk-chart__focus').style('display', null).select('line').attr('x1', cx).attr('x2', cx);
    const total = data.totals[focusIndex];
    const rows = data.series
      .map((s) => ({ name: s.name, share: total ? s.values[focusIndex] / total : 0 }))
      .sort((a, b) => b.share - a.share)
      .map(({ name, share }) => {
        const row = el('div', 'wuk-tooltip__row');
        const label = el('span', 'wuk-tooltip__label');
        label.append(swatch(name), el('span', null, title(name)));
        row.append(el('span', 'wuk-tooltip__value', percent.format(share)), label);
        return row;
      });
    tooltip.replaceChildren(el('p', 'wuk-tooltip__title', `Cars first used in ${data.years[focusIndex]}`), ...rows);
    tooltip.hidden = false;
    const box = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(0, cx + 12 + box.width > width ? cx - 12 - box.width : cx + 12)}px`;
    tooltip.style.top = `${m.top}px`;
  }

  function hideFocus() {
    focusIndex = null;
    svg.select('.wuk-chart__focus').style('display', 'none');
    tooltip.hidden = true;
  }

  svg.on('focus', () => showFocus(data.years.length - 1));
  svg.on('blur', hideFocus);
  svg.on('keydown', (event) => {
    const last = data.years.length - 1;
    const current = focusIndex ?? last;
    const next = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: last }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    showFocus(next);
  });
  new ResizeObserver(() => draw()).observe(frame);

  return {
    update({ years, series, summary }) {
      const rows = years.map((year, i) => Object.fromEntries([['year', year], ...series.map((s) => [s.name, s.values[i]])]));
      const layers = stack()
        .keys(series.map((s) => s.name))
        .offset(stackOffsetExpand)(rows);
      const totals = years.map((_, i) => series.reduce((n, s) => n + s.values[i], 0));
      data = { years, series, layers, totals };
      svg.attr('aria-label', summary);
      legend.replaceChildren(
        ...series.map((s) => {
          const item = el('li', 'wuk-legend__item');
          item.append(swatch(s.name), el('span', null, title(s.name)));
          return item;
        }),
      );
      draw();
    },
  };
}
