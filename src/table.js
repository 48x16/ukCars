// The table twin of the chart: every value, reachable without hovering.

import { formatCount } from './chart.js';
import { totalAt } from './series.js';

function cell(tag, text, className = 'govuk-table__cell') {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

export function renderTable(table, { quarters, series, sorn, caption }) {
  const showTotal = series.length > 1;
  const headRow = document.createElement('tr');
  headRow.className = 'govuk-table__row';
  headRow.append(cell('th', 'Quarter', 'govuk-table__header'));
  for (const s of series) headRow.append(cell('th', s.label, 'govuk-table__header govuk-table__header--numeric'));
  if (showTotal) headRow.append(cell('th', 'Total licensed', 'govuk-table__header govuk-table__header--numeric'));
  if (sorn) headRow.append(cell('th', sorn.label, 'govuk-table__header govuk-table__header--numeric'));
  headRow.querySelectorAll('th').forEach((th) => th.setAttribute('scope', 'col'));

  const rows = [];
  for (let i = quarters.length - 1; i >= 0; i--) {
    const row = document.createElement('tr');
    row.className = 'govuk-table__row';
    const label = cell('th', quarters[i], 'govuk-table__header');
    label.setAttribute('scope', 'row');
    row.append(label);
    for (const s of series) row.append(cell('td', formatCount(s.values[i]), 'govuk-table__cell govuk-table__cell--numeric'));
    if (showTotal) row.append(cell('td', formatCount(totalAt(series, i)), 'govuk-table__cell govuk-table__cell--numeric'));
    if (sorn) row.append(cell('td', formatCount(sorn.values[i]), 'govuk-table__cell govuk-table__cell--numeric'));
    rows.push(row);
  }

  const captionEl = cell('caption', caption, 'govuk-table__caption govuk-table__caption--s');
  const thead = document.createElement('thead');
  thead.className = 'govuk-table__head';
  thead.append(headRow);
  const tbody = document.createElement('tbody');
  tbody.className = 'govuk-table__body';
  tbody.append(...rows);
  table.replaceChildren(captionEl, thead, tbody);
}
