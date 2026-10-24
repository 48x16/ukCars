// Infographics for the feature pages. Each one is plain HTML (lists and grids) wherever it
// can be, so screen readers get real text: every mark has its figure written beside it or in
// visually hidden text, and pages add a table where there's more than a list can carry.

import { area, line, max, scaleLinear, select } from 'd3';
import { Car, createElement, Snowflake, Sun } from 'lucide';
import { el, modelLink } from './insight-charts.js';
import { inkOn } from './paint-chart.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const pct0 = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
const count = new Intl.NumberFormat('en-GB');

export const icon = (shape, className) => {
  const node = createElement(shape, { 'aria-hidden': 'true' });
  if (className) node.setAttribute('class', className);
  return node;
};

export const hidden = (text) => el('span', 'govuk-visually-hidden', text);

/** Figures shown as shorthand ("42% → 58%"), read out in words instead. */
function figures(shown, spoken, className) {
  const wrap = el('span', className);
  const visible = el('span', '', shown);
  visible.setAttribute('aria-hidden', 'true');
  wrap.append(visible, hidden(spoken));
  return wrap;
}

/**
 * Title case for DVLA's capitals: "ASTON MARTIN DB9" -> "Aston Martin DB9". Short words and
 * codes keep their capitals (BMW, TVR, GLA, X1, MX-5).
 */
export function displayName(name) {
  return name
    .replace(/ MODEL MISSING$/, '')
    .split(' ')
    .map((w) => (/\d/.test(w) || w.length <= 3 ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(' ');
}

/**
 * Summer and winter on one line: a sun at the share off the road in summer, a snowflake at
 * the share in winter, joined by a bar. Each row says both figures in words.
 */
export function renderSeasonDumbbells(list, items, { maxShare = null } = {}) {
  const top = maxShare ?? Math.min(1, Math.ceil(Math.max(...items.map((m) => m.winter)) * 10) / 10);
  const at = (v) => `${(v / top) * 100}%`;
  list.replaceChildren(
    ...items.map((m) => {
      const row = el('li', 'wuk-dumbbell');
      const name = m.modelSlug ? el('a', 'govuk-link wuk-dumbbell__name', displayName(m.name)) : el('span', 'wuk-dumbbell__name', m.label);
      if (m.modelSlug) name.href = modelLink(m);
      const track = el('span', 'wuk-dumbbell__track');
      track.setAttribute('aria-hidden', 'true');
      const bar = el('span', 'wuk-dumbbell__bar');
      bar.style.left = at(m.summer);
      bar.style.width = `calc(${at(m.winter)} - ${at(m.summer)})`;
      const sun = el('span', 'wuk-dumbbell__end wuk-dumbbell__end--summer');
      sun.style.left = at(m.summer);
      sun.append(icon(Sun));
      const snow = el('span', 'wuk-dumbbell__end wuk-dumbbell__end--winter');
      snow.style.left = at(m.winter);
      snow.append(icon(Snowflake));
      track.append(bar, sun, snow);
      row.append(name, track, figures(`${pct0.format(m.summer)} → ${pct0.format(m.winter)}`, `: ${pct0.format(m.summer)} off the road in summer, ${pct0.format(m.winter)} in winter`, 'wuk-dumbbell__figures'));
      return row;
    }),
  );
  return top;
}

/**
 * A small multiple: the share off the road over recent quarters, with winter quarters shaded,
 * so the sawtooth reads at a glance. Each has its own scale; the card's figures carry the size.
 */
export function sawtoothCard(group, { width = 260, height = 92 } = {}) {
  const card = el('li', 'wuk-saw');
  card.append(el('h3', 'govuk-heading-s wuk-saw__title', group.label));
  const values = group.sornShare;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.15 || 0.01;
  const x = scaleLinear().domain([0, values.length - 1]).range([4, width - 4]);
  const y = scaleLinear().domain([lo - pad, hi + pad]).range([height - 4, 4]);
  const svg = select(document.createElementNS(SVG_NS, 'svg')).attr('class', 'wuk-saw__svg').attr('viewBox', `0 0 ${width} ${height}`).attr('aria-hidden', 'true');
  const step = values.length > 1 ? x(1) - x(0) : width;
  group.quarters.forEach((q, i) => {
    if (/Q[41]$/.test(q)) svg.append('rect').attr('class', 'wuk-saw__winter').attr('x', x(i) - step / 2).attr('y', 0).attr('width', step).attr('height', height);
  });
  svg.append('path').attr('class', 'wuk-saw__area').attr('d', area().x((_, i) => x(i)).y0(height).y1((v) => y(v))(values));
  svg.append('path').attr('class', 'wuk-saw__line').attr('d', line().x((_, i) => x(i)).y((v) => y(v))(values));
  card.append(svg.node());
  const facts = el('p', 'wuk-saw__facts');
  facts.append(
    el('span', 'wuk-saw__fact', `${pct0.format(group.summer)} off the road in summer`),
    el('span', 'wuk-saw__fact wuk-saw__fact--winter', `${pct0.format(group.winter)} in winter`),
  );
  card.append(facts);
  if (group.turnout > 0) card.append(el('p', 'wuk-saw__turnout', `About ${count.format(Math.round(group.turnout / 10) * 10)} more licensed in summer`));
  return card;
}

/** A podium: first in the middle and tallest, with the figure on each step. */
export function renderPodium(root, entries, format) {
  const order = [1, 0, 2].filter((i) => entries[i]);
  const list = el('ol', 'wuk-podium');
  for (const i of order) {
    const e = entries[i];
    const step = el('li', `wuk-podium__step wuk-podium__step--${i + 1}`);
    // Podium steps show rank, not size: the figure on each says how big.
    step.style.setProperty('--height', String([1, 0.72, 0.5][i]));
    step.style.order = String(order.indexOf(i));
    step.value = i + 1;
    step.append(el('span', 'wuk-podium__name', e.label), el('span', 'wuk-podium__value', format(e.value)), el('span', 'wuk-podium__block', String(i + 1)));
    step.querySelector('.wuk-podium__block').setAttribute('aria-hidden', 'true');
    step.prepend(hidden(`${['First', 'Second', 'Third'][i]}: `));
    list.append(step);
  }
  root.replaceChildren(list);
}

/**
 * A 100% bar split into segments, each labelled when wide enough. `segments` are
 * { id, label, value }; `classFor(id)` gives the segment's fill class, or `paintFor(id)`
 * its actual colour (for paint, where the colour is the data).
 */
export function stackedBar(segments, classFor, { minLabel = 0.07, paintFor = null } = {}) {
  const total = segments.reduce((n, s) => n + s.value, 0);
  const bar = el('span', 'wuk-stack');
  bar.setAttribute('aria-hidden', 'true');
  for (const s of segments) {
    const share = total ? s.value / total : 0;
    if (share <= 0) continue;
    const seg = el('span', `wuk-stack__seg ${classFor?.(s.id) ?? ''}`);
    seg.style.flexBasis = `${share * 100}%`;
    if (paintFor) {
      seg.style.background = paintFor(s.id);
      seg.style.color = inkOn(paintFor(s.id));
    }
    if (share >= minLabel) seg.textContent = pct0.format(share);
    bar.append(seg);
  }
  const words = hidden(segments.filter((s) => s.value > 0).map((s) => `${s.label} ${pct0.format(total ? s.value / total : 0)}`).join(', '));
  return [bar, words];
}

/** "If Britain's cars were 100": a row of little car icons per group, in proportion. */
export function renderPictogram(list, groups, { highlight = () => false } = {}) {
  list.replaceChildren(
    ...groups
      .filter((g) => g.of100 > 0)
      .map((g) => {
        const row = el('li', `wuk-picto${highlight(g) ? ' wuk-picto--highlight' : ''}`);
        const cars = el('span', 'wuk-picto__cars');
        cars.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < g.of100; i++) cars.append(icon(Car));
        const value = el('span', 'wuk-picto__value', String(g.of100));
        value.append(hidden(' in every 100'));
        row.append(el('span', 'wuk-picto__label', g.label), cars, value);
        return row;
      }),
  );
}

/** Then and now on one scale: an open dot for then, a filled one for now, and an arrow between. */
export function renderChangeDots(list, items, format) {
  const top = Math.max(...items.flatMap((i) => [i.from, i.to])) * 1.08;
  const at = (v) => `${(v / top) * 100}%`;
  list.replaceChildren(
    ...items.map((item) => {
      const row = el('li', `wuk-change${item.to >= item.from ? ' wuk-change--up' : ' wuk-change--down'}`);
      const track = el('span', 'wuk-change__track');
      track.setAttribute('aria-hidden', 'true');
      const bar = el('span', 'wuk-change__bar');
      bar.style.left = at(Math.min(item.from, item.to));
      bar.style.width = `calc(${at(Math.max(item.from, item.to))} - ${at(Math.min(item.from, item.to))})`;
      const from = el('span', 'wuk-change__dot wuk-change__dot--from');
      from.style.left = at(item.from);
      const to = el('span', 'wuk-change__dot wuk-change__dot--to');
      to.style.left = at(item.to);
      track.append(bar, from, to);
      row.append(
        el('span', 'wuk-change__label', item.label),
        track,
        figures(`${format(item.from)} → ${format(item.to)}`, `: ${format(item.from)} then, ${format(item.to)} now`, 'wuk-change__figures'),
      );
      return row;
    }),
  );
}

/** A mini line chart for small multiples, on a shared or own scale. */
export function miniLine(values, { width = 220, height = 70, top = null, className = '' } = {}) {
  const x = scaleLinear().domain([0, values.length - 1]).range([2, width - 6]);
  const y = scaleLinear().domain([0, top ?? (max(values) || 1)]).range([height - 2, 6]);
  const svg = select(document.createElementNS(SVG_NS, 'svg'))
    .attr('class', `wuk-mini ${className}`)
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'none')
    .attr('aria-hidden', 'true');
  svg.append('path').attr('class', 'wuk-mini__area').attr('d', area().x((_, i) => x(i)).y0(height).y1((v) => y(v))(values));
  svg.append('path').attr('class', 'wuk-mini__line').attr('vector-effect', 'non-scaling-stroke').attr('d', line().x((_, i) => x(i)).y((v) => y(v))(values));
  return svg.node();
}
