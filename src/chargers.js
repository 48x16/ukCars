// Chargers near you: look up a postcode on this device, load the map squares around it, and
// list the chargers fastest first (or nearest first). The search is kept in the URL's #, which
// browsers never send to the server, so results can be bookmarked without sharing them.

import './shell.js';
import {
  formatDuration,
  METRES_PER_MILE,
  minutesFor,
  rankChargers,
  speedBand,
  tilesAround,
} from './charger-search.js';
import { hidden } from './feature-charts.js';
import { el } from './insight-charts.js';
import { wgs84ToGrid } from './osgb.js';
import { parsePostcode } from './postcode.js';

const DATA = `${import.meta.env.BASE_URL}data/`;
const $ = (id) => document.getElementById(id);
const count = new Intl.NumberFormat('en-GB');
const miles = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
const dates = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });

let meta;
let tileSet;
const tileCache = new Map();

async function getJson(path) {
  const res = await fetch(DATA + path);
  // Not found: a 404, or (on some servers) a web page served in place of a missing file.
  if (res.status === 404 || (res.ok && !res.headers.get('content-type')?.includes('json'))) return null;
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res.json();
}

async function locatePostcode(postcode) {
  const district = await getJson(`postcodes/${postcode.district}.json`);
  const at = district?.[postcode.inward];
  return at ? [at[0] * 10, at[1] * 10] : null;
}

async function loadTiles(keys) {
  const lists = await Promise.all(
    keys.map((key) => {
      if (!tileCache.has(key)) tileCache.set(key, getJson(`chargers/${key}.json`).then((list) => list ?? []));
      return tileCache.get(key);
    }),
  );
  return lists.flat();
}

// Errors, as GOV.UK's error summary and inline message.
function showError(message) {
  const summary = $('form-errors');
  const link = el('a', '', message);
  link.href = '#postcode';
  $('form-error-list').replaceChildren(el('li', '', ''));
  $('form-error-list').firstChild.append(link);
  summary.hidden = false;
  const inline = $('postcode-error');
  inline.replaceChildren(el('span', 'govuk-visually-hidden', 'Error: '), document.createTextNode(message));
  inline.hidden = false;
  $('postcode-group').classList.add('govuk-form-group--error');
  $('postcode').classList.add('govuk-input--error');
  $('postcode').setAttribute('aria-describedby', 'postcode-hint postcode-error');
  summary.focus();
}

function clearError() {
  $('form-errors').hidden = true;
  $('postcode-error').hidden = true;
  $('postcode-group').classList.remove('govuk-form-group--error');
  $('postcode').classList.remove('govuk-input--error');
  $('postcode').setAttribute('aria-describedby', 'postcode-hint');
}

function chargerItem(c) {
  const li = el('li', 'wuk-charger');
  const band = speedBand(c.kw);
  const head = el('div', 'wuk-charger__head');
  head.append(el('h3', 'govuk-heading-s wuk-charger__name', c.name), el('strong', `wuk-speed wuk-speed--${band.id}`, band.label));
  li.append(head);
  if (c.place) li.append(el('p', 'wuk-charger__place', c.place));

  const facts = el('dl', 'wuk-charger__facts');
  const add = (term, value) => value && facts.append(el('dt', '', term), el('dd', '', value));
  add('Distance', `${miles.format(c.distance)} miles`);
  add('Top speed', c.kw ? `${miles.format(c.kw)} kW` : 'Not known');
  add('100 miles in', c.kw ? `about ${formatDuration(minutesFor(100, c.kw))}` : null);
  add('Connectors', c.connectors.map((x) => `${x.count} × ${x.type}${x.kw ? ` (${miles.format(x.kw)} kW)` : ''}`).join(', ') || 'Not known');
  add('Operator', c.operator && !/unknown/i.test(c.operator) ? c.operator : null);
  add('Access', c.access && !/unknown/i.test(c.access) ? c.access : null);
  add('Last checked', c.verified ? dates.format(new Date(c.verified)) : null);
  li.append(facts);

  const links = el('p', 'wuk-charger__links');
  const map = el('a', 'govuk-link', 'Map');
  map.href = `https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lon}#map=17/${c.lat}/${c.lon}`;
  map.append(hidden(` of ${c.name}`));
  const source = el('a', 'govuk-link', 'Details and updates on Open Charge Map');
  source.href = `https://openchargemap.org/site/poi/details/${c.id}`;
  source.append(hidden(` for ${c.name}`));
  links.append(map, document.createTextNode(' · '), source);
  li.append(links);
  return li;
}

async function search({ origin, label, order, within, minKw }) {
  const keys = tilesAround(origin[0], origin[1], within * METRES_PER_MILE, meta.tile).filter((key) => tileSet.has(key));
  const found = rankChargers(await loadTiles(keys), origin, { miles: within, minKw, order });
  const speed = minKw ? ` at ${minKw} kW or faster` : '';
  $('results-title').textContent = found.total ? `${count.format(found.total)} chargers` : 'No chargers found';
  $('results-summary').textContent = found.total
    ? `Within ${within} miles of ${label}${speed}, ${order === 'nearest' ? 'nearest' : 'fastest'} first.` +
      (found.total > found.chargers.length ? ` Showing the first ${found.chargers.length}.` : '')
    : `None within ${within} miles of ${label}${speed}. Try a wider distance or any speed.`;
  $('results').replaceChildren(...found.chargers.map(chargerItem));
  $('results-section').hidden = false;
}

function options() {
  return {
    order: document.querySelector('input[name="order"]:checked').value,
    within: Number($('miles').value),
    minKw: Number($('speed').value),
  };
}

/** Keeps the search in the URL's # (never sent to the server), so it can be bookmarked. */
function remember(postcode) {
  const { order, within, minKw } = options();
  history.replaceState(null, '', `#${encodeURIComponent(postcode.display.replace(' ', ''))}/${order}/${within}/${minKw}`);
}

async function searchPostcode() {
  clearError();
  const value = $('postcode').value.trim();
  if (!value) return showError('Enter a postcode');
  const postcode = parsePostcode(value);
  if (!postcode) return showError('Enter a full postcode, like BN1 1AA');
  let origin;
  try {
    origin = await locatePostcode(postcode);
  } catch {
    return showError(navigator.onLine ? 'Postcodes could not be loaded. Try again later' : "You're offline, and this postcode's area hasn't been looked up on this device before");
  }
  if (!origin) return showError(`We couldn't find ${postcode.display}. Check it's a postcode in Great Britain`);
  $('postcode').value = postcode.display;
  remember(postcode);
  await search({ origin, label: postcode.display, ...options() });
}

function restoreFromUrl() {
  const [code, order, within, minKw] = decodeURIComponent(location.hash.slice(1)).split('/');
  if (!code) return false;
  $('postcode').value = code;
  if (order === 'nearest' || order === 'fastest') document.getElementById(`order-${order}`).checked = true;
  if ([...$('miles').options].some((o) => o.value === within)) $('miles').value = within;
  if ([...$('speed').options].some((o) => o.value === minKw)) $('speed').value = minKw;
  return true;
}

function renderAbout() {
  $('coverage').textContent =
    `This finder lists ${count.format(meta.counts.kept)} public charging locations from Open Charge Map, a community map; ` +
    'DfT counts over 120,000 public chargers (individual devices, often several at one location). Some places are missing, and some details are out of date.';
  $('providers').replaceChildren(
    ...meta.providers.map((p) => {
      const li = el('li', '');
      li.append(el('b', '', p.title), document.createTextNode(` (${count.format(p.count)} locations): ${p.licence}`));
      return li;
    }),
  );
  for (const node of document.querySelectorAll('[data-built]')) node.textContent = `weekly, last on ${new Date(meta.builtAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

async function start() {
  try {
    meta = await getJson('chargers/meta.json');
    if (!meta) throw new Error('No charger data');
  } catch (err) {
    $('error').hidden = false;
    $('error-message').textContent = navigator.onLine ? err.message : "You're offline, and the charger data hasn't been saved on this device yet.";
    $('finder').hidden = true;
    return;
  }
  tileSet = new Set(meta.tiles);
  renderAbout();
  $('finder').addEventListener('submit', (event) => {
    event.preventDefault();
    searchPostcode();
  });

  // "Use my location": converted to grid coordinates on this device, never sent anywhere.
  if ('geolocation' in navigator) {
    const locate = $('locate');
    locate.hidden = false;
    locate.addEventListener('click', () => {
      clearError();
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          history.replaceState(null, '', location.pathname);
          search({ origin: wgs84ToGrid(pos.coords.latitude, pos.coords.longitude), label: 'your location', ...options() });
        },
        () => showError("Your location isn't available. Enter a postcode instead"),
        { enableHighAccuracy: false, timeout: 10_000 },
      );
    });
  }
  if (restoreFromUrl()) searchPostcode();
}

start();
