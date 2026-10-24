// GOV.UK form errors: a summary at the top linking to each field, and a message on the field
// itself. Each field (an input or select, by id) sits in a .govuk-form-group with an error
// message element `<id>-error`. The field's own description (its hint) is kept and restored.

import { el } from './insight-charts.js';

const $ = (id) => document.getElementById(id);

function parts(field) {
  const input = $(field);
  if (input.dataset.describedby === undefined) input.dataset.describedby = input.getAttribute('aria-describedby') ?? '';
  return { input, group: input.closest('.govuk-form-group'), message: $(`${field}-error`) };
}

export function clearErrors(fields) {
  $('form-errors').hidden = true;
  for (const field of fields) {
    const { input, group, message } = parts(field);
    message.hidden = true;
    group.classList.remove('govuk-form-group--error');
    input.classList.remove('govuk-input--error', 'govuk-select--error');
    if (input.dataset.describedby) input.setAttribute('aria-describedby', input.dataset.describedby);
    else input.removeAttribute('aria-describedby');
  }
}

/** `errors` is [{ field, message }]; the summary takes focus so it's announced. */
export function showErrors(errors) {
  $('form-error-list').replaceChildren(
    ...errors.map(({ field, message }) => {
      const link = el('a', '', message);
      link.href = `#${field}`;
      const li = el('li', '');
      li.append(link);
      return li;
    }),
  );
  for (const { field, message: text } of errors) {
    const { input, group, message } = parts(field);
    message.replaceChildren(el('span', 'govuk-visually-hidden', 'Error: '), document.createTextNode(text));
    message.hidden = false;
    group.classList.add('govuk-form-group--error');
    input.classList.add(input.tagName === 'SELECT' ? 'govuk-select--error' : 'govuk-input--error');
    input.setAttribute('aria-describedby', [input.dataset.describedby, `${field}-error`].filter(Boolean).join(' '));
  }
  $('form-errors').hidden = false;
  $('form-errors').focus();
}
