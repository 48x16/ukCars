// Search over makes and models (GenModels) from index.json.
// Every word typed must match the start of a word in the name, so "fie", "ford fie" and
// "model 3" all work. The combobox follows the WAI-ARIA 1.2 list autocomplete pattern.

import { createElement, Search, X } from 'lucide';

const words = (text) => text.toLowerCase().split(/[^a-z0-9+]+/).filter(Boolean);

export function buildEntries(index) {
  const entries = [];
  for (const make of index.makes) {
    entries.push({
      kind: 'make',
      label: make.name,
      makeSlug: make.slug,
      modelCount: make.models.length,
      latest: make.latest,
      sorn: make.sorn,
      words: words(make.name),
    });
    for (const model of make.models) {
      entries.push({
        kind: 'model',
        label: model.name,
        makeSlug: make.slug,
        modelSlug: model.slug,
        latest: model.latest,
        sorn: model.sorn,
        words: words(model.name),
      });
    }
  }
  return entries;
}

/** Each term must start a different word, so "ford fo" doesn't match plain "FORD" twice over. */
function matches(entryWords, terms) {
  const unused = [...entryWords];
  // Longest terms first, so a short term can't take the only word a longer one fits.
  for (const term of [...terms].sort((a, b) => b.length - a.length)) {
    const i = unused.findIndex((w) => w.startsWith(term));
    if (i === -1) return false;
    unused.splice(i, 1);
  }
  return true;
}

/** Best matches first: exact name, then names starting with the query, then most licensed. */
export function searchEntries(entries, query, limit = 8) {
  const terms = words(query);
  if (terms.length === 0) return [];
  const phrase = terms.join(' ');

  return entries
    .filter((e) => matches(e.words, terms))
    .map((e) => {
      const name = e.words.join(' ');
      const rank = name === phrase ? 0 : name.startsWith(phrase) ? 1 : 2;
      return { e, rank };
    })
    .sort((a, b) => a.rank - b.rank || (b.e.latest ?? 0) - (a.e.latest ?? 0))
    .slice(0, limit)
    .map(({ e }) => e);
}

const count = new Intl.NumberFormat('en-GB');

function describe(entry) {
  const licensed =
    entry.latest === null
      ? 'some suppressed figures'
      : entry.latest === 0 && entry.sorn > 0
        ? `${count.format(entry.sorn)} off the road (SORN)`
        : `${count.format(entry.latest)} licensed`;
  return entry.kind === 'make'
    ? `Make · ${entry.modelCount} ${entry.modelCount === 1 ? 'model' : 'models'} · ${licensed}`
    : licensed;
}

/** Wires the combobox in `root` (see index.html). Calls `onSelect(entry)` when one is chosen. */
export function createSearch(root, entries, onSelect) {
  const input = root.querySelector('[role="combobox"]');
  const listbox = root.querySelector('[role="listbox"]');
  const status = root.querySelector('.wuk-search__status');
  const clear = root.querySelector('.wuk-search__clear');

  root.querySelector('.wuk-search__icon').append(createElement(Search, { 'aria-hidden': 'true' }));
  clear.append(createElement(X, { 'aria-hidden': 'true' }));

  let results = [];
  let active = -1;

  function setActive(i) {
    active = i;
    [...listbox.children].forEach((option, j) => option.setAttribute('aria-selected', String(j === i)));
    if (i === -1) {
      input.removeAttribute('aria-activedescendant');
    } else {
      input.setAttribute('aria-activedescendant', listbox.children[i].id);
      listbox.children[i].scrollIntoView({ block: 'nearest' });
    }
  }

  function close() {
    listbox.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    setActive(-1);
  }

  function update() {
    clear.hidden = input.value === '';
    results = searchEntries(entries, input.value);
    listbox.replaceChildren(
      ...results.map((entry, i) => {
        const option = document.createElement('li');
        option.id = `${listbox.id}-option-${i}`; // unique when a page has two searches
        option.className = 'wuk-search__option';
        option.setAttribute('role', 'option');
        const name = document.createElement('span');
        name.className = 'wuk-search__name';
        name.textContent = entry.label;
        const detail = document.createElement('span');
        detail.className = 'wuk-search__detail';
        detail.textContent = describe(entry);
        option.append(name, detail);
        return option;
      }),
    );

    const open = input.value.trim() !== '';
    listbox.hidden = !open || results.length === 0;
    input.setAttribute('aria-expanded', String(!listbox.hidden));
    setActive(-1);
    status.textContent = !open
      ? ''
      : results.length === 0
        ? 'No cars match'
        : `${results.length} ${results.length === 1 ? 'result' : 'results'} available`;
  }

  function choose(i) {
    const entry = results[i];
    if (!entry) return;
    input.value = entry.label;
    clear.hidden = false;
    close();
    status.textContent = `${entry.label} selected`;
    onSelect(entry);
  }

  input.addEventListener('input', update);
  input.addEventListener('keydown', (event) => {
    const last = results.length - 1;
    if (event.key === 'ArrowDown' && results.length) {
      event.preventDefault();
      if (listbox.hidden) update();
      setActive(active >= last ? 0 : active + 1);
    } else if (event.key === 'ArrowUp' && results.length) {
      event.preventDefault();
      setActive(active <= 0 ? last : active - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(active === -1 ? 0 : active);
    } else if (event.key === 'Escape') {
      if (listbox.hidden) input.value = '';
      close();
      clear.hidden = input.value === '';
    }
  });
  input.addEventListener('blur', close);

  // pointerdown would blur the input and close the list before the click lands.
  listbox.addEventListener('pointerdown', (event) => event.preventDefault());
  listbox.addEventListener('click', (event) => {
    const option = event.target.closest('[role="option"]');
    if (option) choose([...listbox.children].indexOf(option));
  });

  clear.addEventListener('click', () => {
    input.value = '';
    update();
    input.focus();
  });
}
