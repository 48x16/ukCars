// Charts for the Insights page: mover cards with mini-charts, a split bar list, and a rank
// (slope) chart. Names come from DfT data, so they're always set with textContent.

import { area, line, max, scaleLinear, select } from 'd3';

const SVG_NS = 'http://www.w3.org/2000/svg';
const count = new Intl.NumberFormat('en-GB');
const percent = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
const signedPercent = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0, signDisplay: 'always' });

export const formatPercent = (v) => percent.format(v);
export const formatChange = (v) => signedPercent.format(v);

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Links into Explore: a model, or a make (which opens at its most licensed model). */
export const modelLink = (m) => (m.modelSlug ? `./explore.html#/${m.makeSlug}/${m.modelSlug}` : `./explore.html#/${m.makeSlug}`);

/**
 * A mini-chart of one model's licensed cars. Each has its own scale: it shows the shape of
 * the change, and the card's numbers carry the size. The latest point is marked.
 */
function sparkline(values, { width = 200, height = 56 } = {}) {
  const x = scaleLinear().domain([0, values.length - 1]).range([2, width - 6]);
  const y = scaleLinear().domain([0, max(values) || 1]).range([height - 2, 6]);
  const svg = select(document.createElementNS(SVG_NS, 'svg'))
    .attr('class', 'wuk-spark')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'none')
    .attr('aria-hidden', 'true');
  svg
    .append('path')
    .attr('class', 'wuk-spark__area')
    .attr('d', area().x((_, i) => x(i)).y0(height).y1((v) => y(v))(values));
  svg
    .append('path')
    .attr('class', 'wuk-spark__line')
    .attr('vector-effect', 'non-scaling-stroke')
    .attr('d', line().x((_, i) => x(i)).y((v) => y(v))(values));
  return { svg: svg.node(), end: { x: x(values.length - 1) / width, y: y(values.at(-1)) / height } };
}

/** Says so when a list has nothing in it (the CI fixture data, or a quiet quarter). */
export const emptyNote = (tag = 'p', text = 'No models meet the criteria in this data.') => el(tag, 'wuk-empty govuk-body', text);
const emptyItem = () => emptyNote('li');

/**
 * Ranked cards: name, a headline figure (the change, unless `headline` says otherwise),
 * before and after, and a mini-chart.
 */
export function renderMovers(list, items, { startQuarter, latestQuarter, headline = (m) => formatChange(m.change) }) {
  if (items.length === 0) return list.replaceChildren(emptyItem());
  list.replaceChildren(
    ...items.map((m, i) => {
      const card = el('li', 'wuk-mover');
      const rank = el('span', 'wuk-mover__rank', String(i + 1));
      rank.setAttribute('aria-hidden', 'true');
      const name = el('a', 'wuk-mover__name govuk-link', m.name);
      name.href = modelLink(m);
      const change = el('p', 'wuk-mover__change', headline(m));
      const detail = el(
        'p',
        'wuk-mover__detail',
        `${count.format(m.from)} in ${startQuarter} → ${count.format(m.latest)} in ${latestQuarter}`,
      );
      const { svg, end } = sparkline(m.values);
      // The plot box is exactly the mini-chart's size, so the dot's percentages match it.
      const chart = el('div', 'wuk-mover__chart');
      const plot = el('div', 'wuk-mover__plot');
      const dot = el('span', 'wuk-mover__dot');
      dot.style.left = `${end.x * 100}%`;
      dot.style.top = `${end.y * 100}%`;
      plot.append(svg, dot);
      chart.append(plot);
      card.append(rank, name, change, detail, chart);
      return card;
    }),
  );
}

/**
 * Each bar splits a model's cars into SORN (grey) and licensed (black), the same colours
 * as everywhere else on the site. `scale: 'share'` fills each bar to 100%; `scale: 'count'`
 * draws every bar against the biggest total, so lengths compare across rows.
 */
export function renderSplitBars(list, items, { scale = 'share', note } = {}) {
  if (items.length === 0) return list.replaceChildren(emptyItem());
  const maxTotal = Math.max(...items.map((m) => m.sorn + m.licensed));
  list.replaceChildren(
    ...items.map((m) => {
      const total = m.sorn + m.licensed;
      const base = scale === 'share' ? total : maxTotal;
      const row = el('li', 'wuk-bar');
      const name = el('a', 'wuk-bar__name govuk-link', m.name);
      name.href = modelLink(m);
      const track = el('span', 'wuk-bar__track');
      track.setAttribute('aria-hidden', 'true');
      const sorn = el('span', 'wuk-bar__sorn');
      sorn.style.width = `${(m.sorn / base) * 100}%`;
      const licensed = el('span', 'wuk-bar__licensed');
      licensed.style.width = `${(m.licensed / base) * 100}%`;
      track.append(sorn, licensed);
      const value = el('span', 'wuk-bar__value', scale === 'share' ? formatPercent(m.share) : count.format(total));
      const parts = [`${count.format(m.sorn)} off the road, ${count.format(m.licensed)} licensed`];
      if (note) parts.push(note(m));
      const detail = el('span', 'wuk-bar__detail', parts.filter(Boolean).join(' · '));
      row.append(name, value, track, detail);
      return row;
    }),
  );
}

const ordinal = (n) => {
  const s = { one: 'st', two: 'nd', few: 'rd', other: 'th' }[new Intl.PluralRules('en-GB', { type: 'ordinal' }).select(n)];
  return `${n}${s}`;
};

/**
 * Rank chart: where each make stood at the start and now. The biggest climber is pink;
 * focusing or hovering a make lifts it and dims the rest.
 */
export function renderSlope(root, makes, quarters) {
  // Drawn at the container's real width, so labels stay 14px instead of shrinking on phones.
  let drawnWidth = 0;
  const redraw = () => {
    const width = Math.max(320, Math.min(640, Math.round(root.clientWidth)));
    if (width === drawnWidth) return;
    drawnWidth = width;
    drawSlope(root, makes, quarters, width);
  };
  new ResizeObserver(redraw).observe(root);
  redraw();
}

function drawSlope(root, makes, { firstQuarter, latestQuarter }, width) {
  const maxRank = Math.max(...makes.flatMap((m) => [m.firstRank, m.latestRank]));
  const rowHeight = 30;
  const pad = { top: 36, bottom: 12, side: width < 480 ? 112 : 150 };
  const height = pad.top + (maxRank - 1) * rowHeight + pad.bottom;
  const y = (rank) => pad.top + (rank - 1) * rowHeight;
  const left = pad.side;
  const right = width - pad.side;
  const climber = makes.reduce((a, b) => (b.firstRank - b.latestRank > a.firstRank - a.latestRank ? b : a));

  const svg = select(document.createElementNS(SVG_NS, 'svg'))
    .attr('class', 'wuk-slope')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'group')
    .attr('aria-label', `Make rankings by licensed cars, ${firstQuarter} and ${latestQuarter}`);

  svg.append('text').attr('class', 'wuk-slope__head').attr('x', left).attr('y', 14).attr('text-anchor', 'middle').text(firstQuarter);
  svg.append('text').attr('class', 'wuk-slope__head').attr('x', right).attr('y', 14).attr('text-anchor', 'middle').text(latestQuarter);

  const rows = svg
    .selectAll('g.wuk-slope__make')
    .data(makes)
    .join('g')
    .attr('class', (m) => {
      const move = m.firstRank - m.latestRank;
      const kind = m === climber ? 'climber' : move > 0 ? 'up' : move < 0 ? 'down' : 'same';
      return `wuk-slope__make wuk-slope__make--${kind}`;
    })
    .attr('tabindex', 0)
    .attr('aria-label', (m) => `${m.make}: ${ordinal(m.firstRank)} in ${firstQuarter}, ${ordinal(m.latestRank)} in ${latestQuarter}`);

  rows
    .append('line')
    .attr('class', 'wuk-slope__line')
    .attr('x1', left)
    .attr('x2', right)
    .attr('y1', (m) => y(m.firstRank))
    .attr('y2', (m) => y(m.latestRank));
  rows.append('circle').attr('class', 'wuk-slope__dot').attr('cx', left).attr('cy', (m) => y(m.firstRank)).attr('r', 4);
  rows.append('circle').attr('class', 'wuk-slope__dot').attr('cx', right).attr('cy', (m) => y(m.latestRank)).attr('r', 4);
  rows
    .append('text')
    .attr('class', 'wuk-slope__label')
    .attr('x', left - 12)
    .attr('y', (m) => y(m.firstRank))
    .attr('dy', '0.32em')
    .attr('text-anchor', 'end')
    .text((m) => `${m.make} ${m.firstRank}`);
  rows
    .append('text')
    .attr('class', 'wuk-slope__label')
    .attr('x', right + 12)
    .attr('y', (m) => y(m.latestRank))
    .attr('dy', '0.32em')
    .text((m) => `${m.latestRank} ${m.make}`);
  // A wide invisible stroke, so the whole line is easy to hover.
  rows
    .append('line')
    .attr('class', 'wuk-slope__hit')
    .attr('x1', left)
    .attr('x2', right)
    .attr('y1', (m) => y(m.firstRank))
    .attr('y2', (m) => y(m.latestRank));

  const highlight = (target) => svg.classed('wuk-slope--focus', !!target).selectAll('g.wuk-slope__make').classed('is-active', (m) => m === target);
  rows.on('pointerenter focus', (_, m) => highlight(m)).on('pointerleave blur', () => highlight(null));

  root.replaceChildren(svg.node());
}

/** A plain GOV.UK table from column definitions: { label, value(row), numeric }. */
export function renderTable(table, { caption, columns, rows }) {
  const head = el('thead', 'govuk-table__head');
  const headRow = el('tr', 'govuk-table__row');
  for (const c of columns) {
    const th = el('th', `govuk-table__header${c.numeric ? ' govuk-table__header--numeric' : ''}`, c.label);
    th.scope = 'col';
    headRow.append(th);
  }
  head.append(headRow);
  const body = el('tbody', 'govuk-table__body');
  for (const r of rows) {
    const tr = el('tr', 'govuk-table__row');
    columns.forEach((c, i) => {
      const cell = el(i === 0 ? 'th' : 'td', '', c.value(r));
      cell.className = i === 0 ? 'govuk-table__header' : `govuk-table__cell${c.numeric ? ' govuk-table__cell--numeric' : ''}`;
      if (i === 0) cell.scope = 'row';
      tr.append(cell);
    });
    body.append(tr);
  }
  table.replaceChildren(el('caption', 'govuk-table__caption govuk-table__caption--s', caption), head, body);
}
