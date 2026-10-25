// Top Trumps: pick two models and play them head to head, card against card. Nothing typed here
// leaves the device; the two cars are kept in the URL's #.

import './shell.js';
import { loadIndex, loadMakeStory, loadModel, loadMot } from './data.js';
import { displayName } from './feature-charts.js';
import { $, drawIcons, fill } from './feature-page.js';
import { clearErrors, showErrors } from './form-errors.js';
import { el } from './insight-charts.js';
import { buildEntries, createSearch } from './search.js';
import { cardFigures, play } from './trumps-calc.js';

const count = new Intl.NumberFormat('en-GB');
const pct0 = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
const FIELDS = ['car-a', 'car-b'];
const chosen = { a: null, b: null };
let mot = null;

const formats = {
  licensed: count.format,
  sold: count.format,
  best: (v) => count.format(v),
  off: pct0.format,
  miles: count.format,
  age: (v) => `${v.toFixed(1)} years`,
  mot: pct0.format,
};

async function figuresFor(entry) {
  const [file, story] = await Promise.all([loadModel(entry.makeSlug, entry.modelSlug), loadMakeStory(entry.makeSlug).catch(() => null)]);
  const motRow = mot?.models.find((m) => m.makeSlug === entry.makeSlug && m.modelSlug === entry.modelSlug) ?? null;
  return cardFigures({ file, mot: motRow, story: story?.models.find((m) => m.id === entry.modelSlug) ?? null, years: story?.years ?? [] });
}

function card(side, entry, game) {
  const won = game.score[side] > game.score[side === 'a' ? 'b' : 'a'];
  const box = el('article', `wuk-trump${won ? ' wuk-trump--winner' : ''}`);
  const head = el('header', 'wuk-trump__head');
  head.append(el('h3', 'wuk-trump__name', displayName(entry.label)), el('p', 'wuk-trump__score', `${game.score[side]} of ${game.rows.length}${won ? ': winner' : ''}`));
  const list = el('dl', 'wuk-trump__rows');
  for (const r of game.rows) {
    const value = r[side];
    const row = el('div', `wuk-trump__row${r.winner === side ? ' wuk-trump__row--won' : ''}`);
    let text = value === null ? 'No data' : formats[r.id](value);
    if (r.id === 'best' && value !== null) text += ` (${r.years[side === 'a' ? 0 : 1]})`;
    const dd = el('dd', '', text);
    if (r.winner === side) dd.append(el('span', 'govuk-visually-hidden', ', wins'));
    row.append(el('dt', '', r.label), dd);
    list.append(row);
  }
  box.append(head, list);
  return box;
}

async function show() {
  clearErrors(FIELDS);
  const errors = [];
  for (const [side, field, which] of [['a', 'car-a', 'first'], ['b', 'car-b', 'second']]) {
    const entry = chosen[side];
    if (!entry) errors.push({ field, message: `Choose the ${which} car from the list, by make and model` });
    else if (entry.kind === 'make') errors.push({ field, message: `Choose a model of ${displayName(entry.label)} for the ${which} car, not just the make` });
  }
  if (!errors.length && chosen.a.makeSlug === chosen.b.makeSlug && chosen.a.modelSlug === chosen.b.modelSlug) errors.push({ field: 'car-b', message: 'Choose a different second car' });
  if (errors.length) return showErrors(errors);

  history.replaceState(null, '', `#${chosen.a.makeSlug}/${chosen.a.modelSlug}/${chosen.b.makeSlug}/${chosen.b.modelSlug}`);
  const [a, b] = await Promise.all([figuresFor(chosen.a), figuresFor(chosen.b)]);
  const game = play(a, b, mot?.ageBands.map((band) => band.label) ?? []);
  const name = (side) => displayName(chosen[side].label);
  const { score } = game;
  $('play-summary').textContent =
    score.a === score.b
      ? `A draw: ${score.a} each.`
      : `The ${name(score.a > score.b ? 'a' : 'b')} wins, ${Math.max(score.a, score.b)} to ${Math.min(score.a, score.b)}.`;
  $('cards').replaceChildren(card('a', chosen.a, game), card('b', chosen.b, game));
  $('play-title').scrollIntoView({ block: 'start' });
}

async function start() {
  drawIcons();
  let index;
  try {
    index = await loadIndex();
  } catch (err) {
    $('error').hidden = false;
    $('error-message').textContent = navigator.onLine ? err.message : "You're offline, and this tool hasn't been used on this device yet.";
    $('finder').hidden = true;
    return;
  }
  fill('latest-quarter', index.latestQuarter);
  mot = await loadMot().catch(() => null); // the MOT categories are extras: the game works without them
  if (mot) fill('mot-year', String(mot.year));

  const entries = buildEntries(index);
  for (const side of ['a', 'b']) {
    createSearch($(`search-${side}`), entries, (entry) => (chosen[side] = entry));
    $(`car-${side}`).addEventListener('input', () => (chosen[side] = null));
  }
  $('finder').addEventListener('submit', (event) => {
    event.preventDefault();
    show();
  });

  const [ma, ka, mb, kb] = location.hash.slice(1).split('/');
  const find = (makeSlug, modelSlug) => entries.find((e) => e.kind === 'model' && e.makeSlug === makeSlug && e.modelSlug === modelSlug);
  if (find(ma, ka) && find(mb, kb)) {
    chosen.a = find(ma, ka);
    chosen.b = find(mb, kb);
    $('car-a').value = chosen.a.label;
    $('car-b').value = chosen.b.label;
    show();
  }
}

start();
