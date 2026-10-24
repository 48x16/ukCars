// Your car: pick a make and model, add its year and (if you like) its mileage, and see how
// rare it is, how its model does at the MOT against others of the same age, and where your
// mileage sits. Nothing typed here leaves the device; the choice is kept in the URL's #.

import './shell.js';
import { loadIndex, loadModel, loadMot } from './data.js';
import { displayName, miniLine } from './feature-charts.js';
import { drawIcons, fill } from './feature-page.js';
import { clearErrors, showErrors } from './form-errors.js';
import { el, formatChange } from './insight-charts.js';
import { buildEntries, createSearch } from './search.js';
import { expandSeries } from './series.js';
import { bandFor, mileagePercentile, nationalBandRate, rarity } from './your-car-calc.js';

const DATA = `${import.meta.env.BASE_URL}data/`;
const $ = (id) => document.getElementById(id);
const count = new Intl.NumberFormat('en-GB');
const pct0 = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
const pct1 = new Intl.NumberFormat('en-GB', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const ordinal = (n) => `${count.format(n)}${{ one: 'st', two: 'nd', few: 'rd', other: 'th' }[new Intl.PluralRules('en-GB', { type: 'ordinal' }).select(n)]}`;
const FIELDS = ['search-input', 'version', 'year', 'miles'];

let index;
let chosen = null;
let chosenFile = null;
let mot = null;
let mileage = null;

function tile(value, label) {
  const node = el('li', 'wuk-tile');
  node.append(el('span', 'wuk-tile__value', value), el('span', 'wuk-tile__label', label));
  return node;
}

/** Cars known to DVLA (licensed plus off the road) each quarter, for some of a model's versions. */
function knownSeries(file, variants) {
  const n = file.quarters.length;
  return file.quarters.map((_, i) => variants.reduce((t, v) => t + (expandSeries(v.licensed, n)[i] ?? 0) + (expandSeries(v.sorn, n)[i] ?? 0), 0));
}

const latestOf = (file, v, key) => expandSeries(v[key], file.quarters.length).at(-1) ?? 0;
const versionLabel = (v) => `${v.model}, ${v.fuel}`;

/** The model's versions, most common first, for the Version list. */
function fillVersions(file) {
  const select = $('version');
  const versions = file.variants
    .map((v, i) => ({ i, v, known: latestOf(file, v, 'licensed') + latestOf(file, v, 'sorn') }))
    .filter((x) => x.known > 0)
    .sort((a, b) => b.known - a.known);
  const all = el('option', '', 'All versions');
  all.value = '';
  select.replaceChildren(
    all,
    ...versions.map(({ i, v, known }) => {
      const option = el('option', '', `${versionLabel(v)} (${count.format(known)})`);
      option.value = String(i);
      return option;
    }),
  );
  select.disabled = false;
}

async function chooseModel(entry) {
  chosen = entry;
  chosenFile = null;
  $('version').disabled = true;
  if (entry.kind !== 'model') return;
  chosenFile = await loadModel(entry.makeSlug, entry.modelSlug);
  if (chosen === entry) fillVersions(chosenFile);
}

function renderRarity(entry, file, versionIndex) {
  const model = displayName(entry.label);
  const version = versionIndex === null ? null : file.variants[versionIndex];
  const n = file.quarters.length;
  let name;
  let known;
  if (version) {
    // DVLA's version names repeat the model ("COOPER S SIDEWALK"), so make + version reads right.
    const make = index.makes.find((m) => m.slug === entry.makeSlug)?.name ?? '';
    name = displayName(`${make} ${version.model}`);
    known = knownSeries(file, [version]);
    const ranked = file.variants.map((v) => latestOf(file, v, 'licensed') + latestOf(file, v, 'sorn')).filter((k) => k > 0);
    const rank = ranked.filter((k) => k > known[n - 1]).length + 1;
    const modelKnown = knownSeries(file, file.variants)[n - 1];
    $('rare-tiles').replaceChildren(
      tile(count.format(latestOf(file, version, 'licensed')), `licensed at the end of ${index.latestQuarter}`),
      tile(count.format(latestOf(file, version, 'sorn')), 'declared off the road (SORN)'),
      tile(ordinal(rank), `most common of ${count.format(ranked.length)} versions of the ${model}`),
    );
    $('rare-summary').textContent =
      `The ${name} (${version.fuel.toLowerCase()}) is ${pct1.format(modelKnown ? known[n - 1] / modelKnown : 0)} of all ${model}s known to DVLA. `;
  } else {
    const r = rarity(index, entry.makeSlug, entry.modelSlug);
    name = model;
    known = knownSeries(file, file.variants);
    $('rare-tiles').replaceChildren(
      tile(count.format(r.latest), `licensed at the end of ${index.latestQuarter}`),
      tile(count.format(r.sorn), 'declared off the road (SORN)'),
      tile(ordinal(r.rank), `most common of ${count.format(r.of)} models`),
    );
    $('rare-summary').textContent = r.oneIn ? `About one in every ${count.format(r.oneIn)} licensed cars is a ${model}. ` : `No ${model} is licensed right now. `;
  }
  const peak = Math.max(...known);
  const change = known[0] ? (known[n - 1] - known[0]) / known[0] : null;
  $('rare-summary').textContent +=
    `${count.format(known[n - 1])} are known to DVLA, licensed or off the road` +
    (change === null ? '.' : `, ${formatChange(change)} since ${file.quarters[0]}`) +
    (peak > known[n - 1] ? `; the most since then was ${count.format(peak)} in ${file.quarters[known.indexOf(peak)]}.` : '.');
  // On its own scale, so the shape shows; the figures above say how many.
  const chart = miniLine(known, { width: 520, height: 90, zero: false });
  chart.setAttribute('role', 'img');
  chart.removeAttribute('aria-hidden');
  chart.setAttribute('aria-label', `${name}s known to DVLA, ${file.quarters[0]} to ${file.quarters[n - 1]}: ${count.format(known[0])} to ${count.format(known[n - 1])}.`);
  $('rare-chart').replaceChildren(chart);
  $('rare-chart').append(el('p', 'govuk-body-s wuk-your-chart__note', `${name}s known to DVLA each quarter, ${file.quarters[0]} to ${file.quarters[n - 1]}.`));
}

function renderMot(entry, year) {
  const tiles = $('mot-tiles');
  const say = (text) => {
    tiles.replaceChildren();
    $('mot-summary').textContent = text;
  };
  if (!mot) return say("The MOT figures couldn't be loaded.");
  if (!year) return say('Choose the year your car was first registered to compare it at the MOT.');
  const age = mot.year - year;
  if (age < 3) return say(`Cars first registered in ${year} weren't due an MOT in ${mot.year}: the first is at three years old.`);
  const band = bandFor(mot.ageBands, age);
  const model = mot.models.find((m) => m.makeSlug === entry.makeSlug && m.modelSlug === entry.modelSlug);
  const all = band && nationalBandRate(mot.byAge, band);
  const mine = band && model?.bands[band.index];
  if (!band || !mine || mine.tests < 100) {
    return say(`There aren't enough MOT results for ${displayName(entry.label)}s of that age (${band?.label ?? `${age} years`}) to compare fairly.`);
  }
  const rate = mine.pass / mine.tests;
  tiles.replaceChildren(tile(pct1.format(rate), `of ${displayName(entry.label)}s aged ${band.label} passed first time`), tile(pct1.format(all), `of all cars that age`));
  const diff = rate - all;
  $('mot-summary').textContent =
    Math.abs(diff) < 0.01
      ? `About the same as the average for cars of that age, from ${count.format(mine.tests)} tests.`
      : `${Math.round(Math.abs(diff) * 100)} percentage points ${diff > 0 ? 'better' : 'worse'} than the average for cars of that age, from ${count.format(mine.tests)} tests.`;
}

function renderMileage(year, miles) {
  const box = $('miles-result');
  const say = (text) => box.replaceChildren(el('p', 'govuk-body', text));
  if (!mileage) return say("The mileage figures couldn't be loaded.");
  if (!year || miles === null) return say('Enter the year and the mileage to see how yours compares.');
  const age = mileage.year - year;
  const counts = mileage.counts[Math.min(Math.max(age, 0), mileage.counts.length - 1)];
  const p = age >= 3 ? mileagePercentile(counts, mileage.band, miles) : null;
  if (!p) return say(`There aren't MOT mileages for cars first registered in ${year} yet.`);
  const meter = el('div', 'wuk-meter');
  const fillBar = el('span', 'wuk-meter__fill');
  fillBar.style.width = `${p.share * 100}%`;
  meter.append(fillBar);
  meter.setAttribute('aria-hidden', 'true');
  box.replaceChildren(
    el('p', 'wuk-bignum__value wuk-meter__value', pct0.format(p.share)),
    el('p', 'govuk-body', `of ${age}-year-old cars at their MOT had done fewer miles than ${count.format(miles)}. The middle one had done about ${count.format(p.median)}.`),
    meter,
    el('p', 'govuk-body-s', `From ${count.format(p.cars)} MOTs in ${mileage.year}. Treat it as a rough guide: mileage is as recorded at the test.`),
  );
}

async function show() {
  clearErrors(FIELDS);
  const errors = [];
  if (!chosen) errors.push({ field: 'search-input', message: 'Choose your car from the list, by make and model' });
  else if (chosen.kind === 'make') errors.push({ field: 'search-input', message: `Choose a model of ${displayName(chosen.label)}, not just the make` });
  const year = Number($('year').value) || null;
  const raw = $('miles').value.replace(/[,\s]/g, '');
  let miles = null;
  if (raw) {
    if (!/^\d+$/.test(raw)) errors.push({ field: 'miles', message: 'Enter the mileage as a number, like 45000' });
    else if (Number(raw) > 999_999) errors.push({ field: 'miles', message: 'Enter a mileage under 1,000,000' });
    else miles = Number(raw);
  }
  if (miles !== null && !year) errors.push({ field: 'year', message: 'Choose the year first registered to compare your mileage' });
  if (errors.length) return showErrors(errors);

  const file = chosenFile ?? (await loadModel(chosen.makeSlug, chosen.modelSlug));
  const versionIndex = $('version').value === '' ? null : Number($('version').value);
  const version = versionIndex === null ? '' : encodeURIComponent(versionLabel(file.variants[versionIndex]));
  history.replaceState(null, '', `#${chosen.makeSlug}/${chosen.modelSlug}/${year ?? ''}/${miles ?? ''}/${version}`);
  $('results').hidden = false;
  renderRarity(chosen, file, versionIndex);
  renderMot(chosen, year);
  renderMileage(year, miles);
  $('rare-title').scrollIntoView({ block: 'start' });
}

async function start() {
  drawIcons();
  try {
    index = await loadIndex();
  } catch (err) {
    $('error').hidden = false;
    $('error-message').textContent = navigator.onLine ? err.message : "You're offline, and this tool hasn't been used on this device yet.";
    $('finder').hidden = true;
    return;
  }
  fill('latest-quarter', index.latestQuarter);
  // The MOT and mileage figures are optional extras: the tool still works without them.
  [mot, mileage] = await Promise.all([
    loadMot().catch(() => null),
    fetch(`${DATA}tools/mileage.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  if (mot) fill('mot-year', String(mot.year));

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: thisYear - 1949 }, (_, i) => thisYear - i);
  $('year').replaceChildren(el('option', '', 'Choose a year'), ...years.map((y) => el('option', '', String(y))));
  $('year').firstChild.value = '';

  const entries = buildEntries(index);
  createSearch($('search'), entries, (entry) => chooseModel(entry));
  $('search-input').addEventListener('input', () => {
    chosen = null;
    chosenFile = null;
    $('version').disabled = true;
  });
  $('finder').addEventListener('submit', (event) => {
    event.preventDefault();
    show();
  });

  const [makeSlug, modelSlug, year, miles, version] = location.hash.slice(1).split('/').map(decodeURIComponent);
  const fromUrl = entries.find((e) => e.kind === 'model' && e.makeSlug === makeSlug && e.modelSlug === modelSlug);
  if (fromUrl) {
    await chooseModel(fromUrl);
    $('search-input').value = fromUrl.label;
    const match = chosenFile?.variants.findIndex((v) => versionLabel(v) === version) ?? -1;
    if (version && match !== -1) $('version').value = String(match);
    if (year) $('year').value = year;
    if (miles) $('miles').value = miles;
    show();
  }
}

start();
