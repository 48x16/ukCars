// Line chart of licensed cars over time, one line per fuel group, with cars declared off
// the road (SORN) as a pale area behind them: the only area, so it never reads as a fuel.
// Line colour and dash come from .wuk-line--<group> in the stylesheet, so identity never
// rests on colour alone: greys differ by dash pattern, and lines carry direct labels.

import {
  area,
  axisBottom,
  axisLeft,
  bisector,
  format,
  line,
  max,
  pointer,
  scaleLinear,
  scaleUtc,
  select,
  utcFormat,
  utcYear,
} from 'd3';
import { totalAt } from './series.js';

const HEIGHT = 340;
const NARROW = 520;
const LABEL_GAP = 16;
const count = new Intl.NumberFormat('en-GB');
const tickCount = format('.3~s');
const year = utcFormat('%Y');

export const formatCount = (v) => (v === null ? 'Suppressed' : count.format(v));

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Keys a series in the legend and tooltip, mirroring its mark: a stroke for lines, a block for the area. */
function seriesKey(id) {
  const svg = select(document.createElementNS('http://www.w3.org/2000/svg', 'svg'))
    .attr('class', 'wuk-key')
    .attr('viewBox', '0 0 24 8')
    .attr('aria-hidden', 'true');
  if (id === 'sorn') {
    svg.append('rect').attr('class', 'wuk-sorn__area').attr('x', 1).attr('y', 0).attr('width', 22).attr('height', 8);
    svg.append('line').attr('class', 'wuk-sorn__edge').attr('x1', 1).attr('x2', 23).attr('y1', 0.75).attr('y2', 0.75);
  } else {
    svg.append('line').attr('class', `wuk-line wuk-line--${id}`).attr('x1', 1).attr('x2', 23).attr('y1', 4).attr('y2', 4);
  }
  return svg.node();
}

export function createChart(root) {
  const legend = el('ul', 'wuk-legend');
  const frame = el('div', 'wuk-chart__frame');
  const tooltip = el('div', 'wuk-tooltip');
  tooltip.hidden = true;
  tooltip.setAttribute('aria-live', 'polite');
  const svg = select(frame)
    .append('svg')
    .attr('class', 'wuk-chart__svg')
    .attr('role', 'img')
    .attr('tabindex', 0);
  frame.append(tooltip);
  root.replaceChildren(legend, frame);

  let data = null;
  let geometry = null;

  function drawLegend() {
    legend.replaceChildren(
      ...data.plotted.map((s) => {
        const item = el('li', 'wuk-legend__item');
        item.append(seriesKey(s.id), el('span', null, s.label));
        return item;
      }),
    );
  }

  function draw() {
    if (!data) return;
    const width = frame.clientWidth;
    const narrow = width < NARROW;
    const directLabels = !narrow && data.plotted.length <= 5;
    const m = { top: 16, right: directLabels ? 156 : 16, bottom: 32, left: 52 };
    const { dates, series, sorn, plotted } = data;

    const x = scaleUtc()
      .domain([dates[0], dates[dates.length - 1]])
      .range([m.left, width - m.right]);
    const y = scaleLinear()
      .domain([0, max(plotted, (s) => max(s.values)) || 1])
      .nice()
      .range([HEIGHT - m.bottom, m.top]);
    geometry = { x, y, m, width };

    svg.attr('viewBox', `0 0 ${width} ${HEIGHT}`).attr('height', HEIGHT);
    svg.selectAll('*').remove();

    svg
      .append('g')
      .attr('class', 'wuk-chart__grid')
      .selectAll('line')
      .data(y.ticks(5))
      .join('line')
      .attr('x1', m.left)
      .attr('x2', width - m.right)
      .attr('y1', (d) => y(d))
      .attr('y2', (d) => y(d));

    svg
      .append('g')
      .attr('class', 'wuk-chart__axis')
      .attr('transform', `translate(0,${HEIGHT - m.bottom})`)
      .call(axisBottom(x).ticks(utcYear.every(narrow ? 4 : 2)).tickFormat(year).tickSizeOuter(0));
    svg
      .append('g')
      .attr('class', 'wuk-chart__axis wuk-chart__axis--y')
      .attr('transform', `translate(${m.left},0)`)
      .call(axisLeft(y).ticks(5).tickFormat(tickCount).tickSize(0).tickPadding(8))
      .call((g) => g.select('.domain').remove());

    if (sorn) {
      const defined = (v) => v !== null;
      const sornArea = area()
        .defined(defined)
        .x((_, i) => x(dates[i]))
        .y0(y(0))
        .y1((v) => y(v));
      const sornEdge = line()
        .defined(defined)
        .x((_, i) => x(dates[i]))
        .y((v) => y(v));
      const g = svg.append('g').attr('class', 'wuk-sorn');
      g.append('path').attr('class', 'wuk-sorn__area').attr('d', sornArea(sorn.values));
      g.append('path').attr('class', 'wuk-sorn__edge').attr('d', sornEdge(sorn.values));
    }

    const path = line()
      .defined((v) => v !== null)
      .x((_, i) => x(dates[i]))
      .y((v) => y(v));
    svg
      .append('g')
      .selectAll('path')
      .data(series)
      .join('path')
      .attr('class', (s) => `wuk-line wuk-line--${s.id}`)
      .attr('d', (s) => path(s.values));

    if (directLabels) drawDirectLabels(plotted, dates, x, y, width - m.right + 8);

    const focus = svg.append('g').attr('class', 'wuk-chart__focus').style('display', 'none');
    focus.append('line').attr('class', 'wuk-chart__crosshair').attr('y1', m.top).attr('y2', HEIGHT - m.bottom);
    focus
      .selectAll('circle')
      .data(plotted)
      .join('circle')
      .attr('class', (s) => `wuk-dot wuk-dot--${s.id}`)
      .attr('r', 4);

    // The pointer only needs to be nearest a quarter, never on a line.
    svg
      .append('rect')
      .attr('class', 'wuk-chart__hit')
      .attr('x', m.left)
      .attr('y', m.top)
      .attr('width', Math.max(0, width - m.left - m.right))
      .attr('height', HEIGHT - m.top - m.bottom)
      .on('pointermove', (event) => showFocus(nearestIndex(event)))
      .on('pointerleave', hideFocus);
  }

  function drawDirectLabels(series, dates, x, y, labelX) {
    const last = dates.length - 1;
    const labels = series
      .map((s) => ({ s, y: s.values[last] === null ? null : y(s.values[last]) }))
      .filter((l) => l.y !== null)
      .sort((a, b) => a.y - b.y);
    // Push overlapping labels apart, top to bottom.
    for (let i = 1; i < labels.length; i++) {
      labels[i].y = Math.max(labels[i].y, labels[i - 1].y + LABEL_GAP);
    }
    svg
      .append('g')
      .attr('class', 'wuk-chart__labels')
      .selectAll('text')
      .data(labels)
      .join('text')
      .attr('x', labelX)
      .attr('y', (l) => l.y)
      .attr('dy', '0.32em')
      .text((l) => l.s.label);
  }

  function nearestIndex(event) {
    const [px] = pointer(event, svg.node());
    const date = geometry.x.invert(px);
    const i = bisector((d) => d).center(data.dates, date);
    return Math.max(0, Math.min(data.dates.length - 1, i));
  }

  function showFocus(i) {
    data.focusIndex = i;
    const { x, y, width } = geometry;
    const cx = x(data.dates[i]);
    const focus = svg.select('.wuk-chart__focus').style('display', null);
    focus.select('.wuk-chart__crosshair').attr('x1', cx).attr('x2', cx);
    focus
      .selectAll('circle')
      .attr('cx', cx)
      .attr('cy', (s) => (s.values[i] === null ? -99 : y(s.values[i])));

    renderTooltip(i);
    tooltip.hidden = false;
    const box = tooltip.getBoundingClientRect();
    const left = cx + 12 + box.width > width ? cx - 12 - box.width : cx + 12;
    tooltip.style.left = `${Math.max(0, left)}px`;
    tooltip.style.top = `${geometry.m.top}px`;
  }

  function hideFocus() {
    data.focusIndex = null;
    svg.select('.wuk-chart__focus').style('display', 'none');
    tooltip.hidden = true;
  }

  function renderTooltip(i) {
    // Values lead, labels follow: the reader already knows the series and wants the number.
    const row = (value, label, key, modifier = '') => {
      const node = el('div', `wuk-tooltip__row ${modifier}`);
      const name = el('span', 'wuk-tooltip__label');
      if (key) name.append(key);
      name.append(el('span', null, label));
      node.append(el('span', 'wuk-tooltip__value', formatCount(value)), name);
      return node;
    };
    const ordered = [...data.series].sort((a, b) => (b.values[i] ?? -1) - (a.values[i] ?? -1));
    const rows = ordered.map((s) => row(s.values[i], s.label, seriesKey(s.id)));
    if (ordered.length > 1) {
      rows.push(row(totalAt(data.series, i), 'Total licensed', null, 'wuk-tooltip__row--total'));
    }
    // SORN sits apart from the licensed figures: it isn't part of their total.
    if (data.sorn) {
      rows.push(row(data.sorn.values[i], data.sorn.label, seriesKey('sorn'), 'wuk-tooltip__row--total'));
    }
    tooltip.replaceChildren(el('p', 'wuk-tooltip__title', data.quarters[i]), ...rows);
  }

  // Keyboard: focus the chart, then use arrow keys, Home and End to move between quarters.
  svg.on('focus', () => showFocus(data.dates.length - 1));
  svg.on('blur', hideFocus);
  svg.on('keydown', (event) => {
    const last = data.dates.length - 1;
    const current = data.focusIndex ?? last;
    const next = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: last }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    showFocus(Math.max(0, Math.min(last, next)));
  });

  new ResizeObserver(() => draw()).observe(frame);

  return {
    /**
     * `quarters` are labels, `dates` their quarter-end dates, `series` from seriesByFuel,
     * and `sorn` from sornSeries (or null).
     */
    update({ quarters, dates, series, sorn, summary }) {
      data = { quarters, dates, series, sorn, plotted: sorn ? [...series, sorn] : series, focusIndex: null };
      svg.attr('aria-label', summary);
      tooltip.hidden = true;
      drawLegend();
      draw();
    },
  };
}
