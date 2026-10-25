// Any make, year by year: pick a make and see its story (make-story.js). The choice is kept in
// the URL's #, so a make's page can be linked to.

import './shell.js';
import { loadMakeList, loadMakeStory } from './data.js';
import { $, drawIcons } from './feature-page.js';
import { el } from './insight-charts.js';
import { renderMakeStory } from './make-story.js';

/** "Ford" -> "Fords"; a name already ending in s (Mercedes, Lexus) stays as it is. */
const plural = (name) => (/s$/i.test(name) ? name : `${name}s`);

function showError(err) {
  $('error').hidden = false;
  $('error-message').textContent = navigator.onLine
    ? err.message
    : "You're offline, and this make hasn't been viewed on this device yet, so its data isn't saved.";
}

async function show(entry) {
  try {
    const data = await loadMakeStory(entry.slug);
    $('error').hidden = true;
    renderMakeStory(data, { one: entry.label, many: plural(entry.label) });
    document.title = `${entry.label}, year by year – Rev Counter`;
  } catch (err) {
    showError(err);
  }
}

async function start() {
  drawIcons();
  let list;
  try {
    list = await loadMakeList();
  } catch (err) {
    showError(err);
    return;
  }
  const makes = [...list.makes].sort((a, b) => a.label.localeCompare(b.label));
  const select = $('make');
  select.replaceChildren(
    ...makes.map((m) => {
      const option = el('option', '', m.label);
      option.value = m.slug;
      return option;
    }),
  );
  // The biggest make (by new cars since 2001) unless the # names another.
  const fromHash = () => makes.find((m) => m.slug === location.hash.slice(1)) ?? list.makes[0];
  const pick = (entry) => {
    select.value = entry.slug;
    show(entry);
  };
  select.addEventListener('change', () => {
    const entry = makes.find((m) => m.slug === select.value);
    history.replaceState(null, '', `#${entry.slug}`);
    show(entry);
  });
  window.addEventListener('hashchange', () => pick(fromHash()));
  pick(fromHash());
}

start();
