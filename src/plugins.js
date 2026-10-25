// Plug-ins near you: privately kept plug-in cars in the neighbourhood around a postcode, how
// that has grown, and how it compares. Only the postcode's district (like BN1) is used to fetch
// data; the full postcode stays on this device, and in the URL's #, which browsers never send.

import './shell.js';
import { miniLine } from './feature-charts.js';
import { $, drawIcons, fill } from './feature-page.js';
import { clearErrors, showErrors } from './form-errors.js';
import { el } from './insight-charts.js';
import { bars } from './make-story.js';
import { parsePostcode } from './postcode.js';

const DATA = `${import.meta.env.BASE_URL}data/`;
const count = new Intl.NumberFormat('en-GB');
const pct0 = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
const ordinal = (n) => `${count.format(n)}${{ one: 'st', two: 'nd', few: 'rd', other: 'th' }[new Intl.PluralRules('en-GB', { type: 'ordinal' }).select(n)]}`;
let index;

async function getJson(path) {
  const res = await fetch(DATA + path);
  // Not found: a 404, or (on some servers) a web page served in place of a missing file.
  if (res.status === 404 || (res.ok && !res.headers.get('content-type')?.includes('json'))) return null;
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res.json();
}

function tile(value, label) {
  const li = el('li', 'wuk-tile');
  li.append(el('span', 'wuk-tile__value', value), el('span', 'wuk-tile__label', label));
  return li;
}

/** Share of the nation's neighbourhoods with fewer plug-ins, from its 101-point spread. */
function shareBelow(spread, value) {
  return spread.filter((v) => v < value).length / spread.length;
}

function render(postcode, file, at) {
  const [code, name, total, electric] = file.a[at];
  const { quarters } = index;
  const last = quarters.length - 1;
  const nation = index.nations[code[0]];
  const now = total[last];
  const first = total.findIndex((v) => v > 0);
  const below = nation ? shareBelow(nation.spread, now) : null;

  $('result-title').textContent = name;
  $('result-postcode').textContent = `${postcode.display} is in this neighbourhood (${code}).`;
  const tiles = el('ul', 'wuk-tiles');
  tiles.append(tile(count.format(now), `plug-in cars kept privately here, end of ${quarters[last]}`));
  if (now) tiles.append(tile(pct0.format(electric[last] / now), 'of them fully electric; the rest are plug-in hybrids'));
  if (below !== null) tiles.append(tile(pct0.format(below), `of neighbourhoods in ${nation.name} have fewer`));
  $('result-tiles').replaceChildren(tiles);

  const grew = first !== -1 && first < last && total[first] ? now / total[first] : null;
  $('result-summary').textContent =
    first === -1
      ? `No privately kept plug-in cars here yet, or too few to count (DfT hides counts of 1 to 4).`
      : `${count.format(total[first])} in ${quarters[first]}, ${count.format(now)} now` +
        (grew && grew >= 1.5 ? `: ${grew.toFixed(1)} times as many.` : '.') +
        (nation ? ` The middle neighbourhood in ${nation.name} has ${count.format(nation.spread[50])}.` : '');
  const chart = miniLine(total, { width: 520, height: 90 });
  chart.setAttribute('role', 'img');
  chart.removeAttribute('aria-hidden');
  chart.setAttribute('aria-label', `Privately kept plug-in cars in ${name}, ${quarters[0]} to ${quarters[last]}: ${count.format(total[0])} to ${count.format(now)}.`);
  $('result-chart').replaceChildren(chart, el('p', 'govuk-body-s wuk-your-chart__note', `Each quarter, ${quarters[0]} to ${quarters[last]}.`));

  // Next door: up to five neighbourhoods either side of yours in the postcode district, yours in pink.
  const all = file.a.map(([c, n, t]) => ({ label: n, value: t[last], mine: c === code })).sort((a, b) => b.value - a.value);
  const mine = all.findIndex((r) => r.mine);
  const rows = all.slice(Math.max(0, mine - 5), mine + 6);
  const list = bars(rows, Math.max(1, ...all.map((r) => r.value)));
  [...list.children].forEach((li, i) => rows[i].mine && li.classList.add('wuk-road__model--mine'));
  $('nearby').replaceChildren(list);
  $('nearby-summary').textContent =
    all.length > 1
      ? `Of the ${all.length} neighbourhoods in ${postcode.district}, yours has the ${ordinal(mine + 1)} most plug-ins. The most is ${count.format(all[0].value)}, in ${all[0].label}.`
      : `It's the only neighbourhood in ${postcode.district}.`;
  $('results').hidden = false;
}

async function lookUp() {
  clearErrors(['postcode']);
  const value = $('postcode').value.trim();
  if (!value) return showErrors([{ field: 'postcode', message: 'Enter a postcode' }]);
  const postcode = parsePostcode(value);
  if (!postcode) return showErrors([{ field: 'postcode', message: 'Enter a full postcode, like BN1 1AA' }]);
  let file;
  try {
    file = await getJson(`plugins/${postcode.district}.json`);
  } catch {
    return showErrors([{ field: 'postcode', message: navigator.onLine ? 'The figures could not be loaded. Try again later' : "You're offline, and this area hasn't been looked up on this device before" }]);
  }
  const at = file?.p[postcode.inward];
  if (at === undefined) return showErrors([{ field: 'postcode', message: `We couldn't find ${postcode.display}. Check it's a current UK postcode` }]);
  $('postcode').value = postcode.display;
  history.replaceState(null, '', `#${postcode.display.replace(' ', '')}`);
  render(postcode, file, at);
  $('result-title').scrollIntoView({ block: 'start' });
}

async function start() {
  drawIcons();
  try {
    index = await getJson('plugins/index.json');
    if (!index) throw new Error('The neighbourhood figures are missing');
  } catch (err) {
    $('error').hidden = false;
    $('error-message').textContent = navigator.onLine ? err.message : "You're offline, and this tool hasn't been used on this device yet.";
    $('finder').hidden = true;
    return;
  }
  fill('latest-quarter', index.quarters.at(-1));
  $('finder').addEventListener('submit', (event) => {
    event.preventDefault();
    lookUp();
  });
  const fromHash = () => {
    const code = decodeURIComponent(location.hash.slice(1));
    if (!code) return;
    $('postcode').value = code;
    lookUp();
  };
  window.addEventListener('hashchange', fromHash);
  fromHash();
}

start();
