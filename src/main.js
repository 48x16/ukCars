import '@fontsource-variable/inter';
import './styles/main.scss';
import { createElement, WifiOff } from 'lucide';
import { createChart, formatCount } from './chart.js';
import { loadIndex, loadMeta, loadModel } from './data.js';
import { quarterEndDate } from './quarters.js';
import { buildEntries, createSearch } from './search.js';
import { seriesByFuel, totalAt } from './series.js';
import { renderTable } from './table.js';

const $ = (id) => document.getElementById(id);
const makeSelect = $('make');
const modelSelect = $('model');
const variantSelect = $('variant');
const results = $('results');
const chart = createChart($('chart'));

let index;
let file;

function option(value, text) {
  const node = document.createElement('option');
  node.value = value;
  node.textContent = text;
  return node;
}

const biggest = (items) => items.reduce((a, b) => ((b.latest ?? 0) > (a.latest ?? 0) ? b : a));

function fillModels(make, modelSlug) {
  const models = make.models;
  modelSelect.replaceChildren(...models.map((m) => option(m.slug, m.name)));
  modelSelect.value = models.some((m) => m.slug === modelSlug) ? modelSlug : biggest(models).slug;
}

function fillVariants() {
  const fragment = document.createDocumentFragment();
  fragment.append(option('all', `All variants (${count(file.variants.length)})`));
  file.variants.forEach((v, i) => fragment.append(option(String(i), `${v.model} – ${v.fuel}`)));
  variantSelect.replaceChildren(fragment);
}

const count = (n) => new Intl.NumberFormat('en-GB').format(n);

async function showModel() {
  results.classList.add('wuk-results--loading');
  try {
    file = await loadModel(makeSelect.value, modelSelect.value);
  } catch (err) {
    // Don't leave the previous model's chart under the newly selected name.
    results.hidden = true;
    const model = modelSelect.selectedOptions[0]?.textContent;
    showError(
      navigator.onLine
        ? err
        : new Error(`You're offline, and ${model} hasn't been viewed on this device yet, so it isn't saved.`),
    );
    return;
  } finally {
    results.classList.remove('wuk-results--loading');
  }
  $('error').hidden = true;
  results.hidden = false;
  history.replaceState(null, '', `#/${makeSelect.value}/${modelSelect.value}`);
  fillVariants();
  render();
}

function render() {
  const variantIndex = variantSelect.value === 'all' ? null : Number(variantSelect.value);
  const variant = variantIndex === null ? null : file.variants[variantIndex];
  const name = variant ? `${file.make} ${variant.model} (${variant.fuel})` : file.genModel;
  const series = seriesByFuel(file, variantIndex);
  const { quarters } = file;
  const last = quarters.length - 1;
  const latest = totalAt(series, last);
  const yearEarlier = totalAt(series, last - 4);

  $('stat-value').textContent = formatCount(latest);
  $('stat-label').textContent = `licensed at the end of ${quarters[last]}`;
  $('stat-change').textContent = describeChange(latest, yearEarlier);
  $('chart-title').textContent = `${name}: licensed cars by fuel type`;

  chart.update({
    quarters,
    dates: quarters.map(quarterEndDate),
    series,
    summary:
      `Line chart of licensed ${name} cars by fuel type, ${quarters[0]} to ${quarters[last]}. ` +
      `${formatCount(latest)} licensed at the end of ${quarters[last]}. ` +
      'Focus the chart and use the arrow keys to read each quarter, or open the data table below.',
  });
  renderTable($('data-table'), { quarters, series, caption: `Licensed ${name} cars by fuel type` });
}

function describeChange(now, before) {
  if (now === null || before === null) return '';
  if (before === 0) return now > 0 ? 'New in the last year' : '';
  const pct = ((now - before) / before) * 100;
  const rounded = Math.abs(pct) < 1 ? pct.toFixed(1) : Math.round(pct);
  if (Number(rounded) === 0) return 'No change on a year earlier';
  return `${pct > 0 ? 'Up' : 'Down'} ${Math.abs(rounded)}% on a year earlier`;
}

function showError(err) {
  const box = $('error');
  box.hidden = false;
  $('error-message').textContent = err.message;
  console.error(err);
}

async function start() {
  try {
    [index] = await Promise.all([loadIndex(), loadMeta().then(showMeta)]);
  } catch (err) {
    showError(err);
    return;
  }

  const [, makeSlug, modelSlug] = location.hash.split('/');
  const initialMake = index.makes.find((m) => m.slug === makeSlug) ?? biggest(index.makes);
  makeSelect.replaceChildren(...index.makes.map((m) => option(m.slug, m.name)));
  makeSelect.value = initialMake.slug;
  fillModels(initialMake, modelSlug);

  createSearch($('search'), buildEntries(index), (entry) => {
    makeSelect.value = entry.makeSlug;
    fillModels(index.makes.find((m) => m.slug === entry.makeSlug), entry.modelSlug);
    showModel();
  });

  $('filters').addEventListener('submit', (event) => event.preventDefault());
  makeSelect.addEventListener('change', () => {
    fillModels(index.makes.find((m) => m.slug === makeSelect.value));
    showModel();
  });
  modelSelect.addEventListener('change', showModel);
  variantSelect.addEventListener('change', render);

  await showModel();
}

function showMeta(meta) {
  for (const node of document.querySelectorAll('[data-latest-quarter]')) node.textContent = meta.latestQuarter;
  for (const node of document.querySelectorAll('[data-first-quarter]')) node.textContent = meta.firstQuarter;
}

function watchConnection() {
  $('offline').querySelector('.wuk-offline__icon').append(createElement(WifiOff, { 'aria-hidden': 'true' }));
  const update = () => {
    $('offline').hidden = navigator.onLine;
  };
  addEventListener('online', update);
  addEventListener('offline', update);
  update();
}

watchConnection();
start();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((err) => console.error('Service worker not registered', err));
}
