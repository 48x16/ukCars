// Public EV chargers in Great Britain from Open Charge Map -> public/data/chargers/.
//
//   npm run chargers               download (needs OCM_API_KEY, from .env or the environment)
//   npm run chargers -- --cached   use the copies in .cache/
//   npm run chargers -- --fixture  tiny test file, for CI (part of `npm run data:fixture`)
//
// Open Charge Map's own data is CC BY 4.0; data it imports keeps its provider's licence. Only
// chargers from providers flagged as openly licensed, and not non-commercial, are kept, and
// each provider is credited on the page. Chargers are split into 20 km National Grid squares,
// so the page downloads only the squares around you.

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wgs84ToGrid } from '../src/osgb.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'data', 'chargers');
const API = 'https://api.openchargemap.io/v3';
export const SOURCE_URL = 'https://openchargemap.org';
export const TILE = 20_000; // metres
const USER_AGENT = 'whats-on-uk-roads (github.com/48x16/ukCars)';

/** Access types left out: not somewhere a passing driver can charge. */
const PRIVATE_USAGE = /^Private - Restricted|^Privately Owned/i;

/** Providers whose licence lets us republish: openly licensed and not non-commercial. */
export function openProviders(reference) {
  return new Map(
    reference.DataProviders.filter((d) => d.IsOpenDataLicensed === true && !/non-?commercial|\bNC\b|by-nc/i.test(d.License ?? '')).map((d) => [
      d.ID,
      { id: d.ID, title: d.Title, licence: d.License ?? '', url: d.WebsiteURL ?? null },
    ]),
  );
}

/** Ireland, the Isle of Man and the Channel Islands sometimes appear under GB; our postcodes don't cover them. */
export function inGreatBritain(lat, lon, postcode = '') {
  if (/^(BT|IM|GY|JE)\d/i.test(postcode.replace(/\s+/g, ''))) return false;
  if (lat < 49.85) return false; // Channel Islands
  if (lon < -5.3 && lat > 51.4 && lat < 55.45) return false; // the island of Ireland
  if (lon < -4.3 && lon > -4.85 && lat > 54.0 && lat < 54.42) return false; // Isle of Man
  return lat > 49 && lat < 61 && lon > -9 && lon < 2;
}

const round = (v, places) => Number(v.toFixed(places));

/** Reduces Open Charge Map POIs to what the finder needs. */
export function buildChargers(pois, reference) {
  const providers = openProviders(reference);
  const title = (list, id) => list.find((x) => x.ID === id)?.Title ?? null;
  const nonOperational = new Set(reference.StatusTypes.filter((s) => s.IsOperational === false).map((s) => s.ID));
  const counts = { read: pois.length, licence: 0, status: 0, access: 0, place: 0, kept: 0 };
  const chargers = [];
  const usedProviders = new Map();

  for (const p of pois) {
    const provider = providers.get(p.DataProviderID);
    if (!provider) {
      counts.licence++;
      continue;
    }
    if (nonOperational.has(p.StatusTypeID)) {
      counts.status++;
      continue;
    }
    const access = title(reference.UsageTypes, p.UsageTypeID);
    if (access && PRIVATE_USAGE.test(access)) {
      counts.access++;
      continue;
    }
    const a = p.AddressInfo ?? {};
    if (typeof a.Latitude !== 'number' || !inGreatBritain(a.Latitude, a.Longitude, a.Postcode ?? '')) {
      counts.place++;
      continue;
    }
    const [e, n] = wgs84ToGrid(a.Latitude, a.Longitude);
    const connectors = new Map();
    for (const c of p.Connections ?? []) {
      if (nonOperational.has(c.StatusTypeID)) continue;
      const type = title(reference.ConnectionTypes, c.ConnectionTypeID) ?? 'Unknown connector';
      const kw = c.PowerKW ? round(c.PowerKW, 1) : null;
      const key = `${type}|${kw}`;
      const prev = connectors.get(key);
      connectors.set(key, { type, kw, count: (prev?.count ?? 0) + (c.Quantity || 1) });
    }
    const list = [...connectors.values()].sort((x, y) => (y.kw ?? 0) - (x.kw ?? 0));
    chargers.push({
      id: p.ID,
      e: Math.round(e),
      n: Math.round(n),
      lat: round(a.Latitude, 5),
      lon: round(a.Longitude, 5),
      name: a.Title ?? 'Charger',
      place: [a.Town, a.Postcode].filter(Boolean).join(', '),
      operator: title(reference.Operators, p.OperatorID),
      access,
      kw: list.length ? Math.max(...list.map((c) => c.kw ?? 0)) || null : null,
      connectors: list,
      provider: provider.id,
      verified: (p.DateLastVerified ?? p.DateLastStatusUpdate ?? p.DateCreated ?? '').slice(0, 10) || null,
    });
    usedProviders.set(provider.id, (usedProviders.get(provider.id) ?? 0) + 1);
  }
  counts.kept = chargers.length;

  const tiles = new Map();
  for (const c of chargers) {
    const key = `${Math.floor(c.e / TILE)}-${Math.floor(c.n / TILE)}`;
    if (!tiles.has(key)) tiles.set(key, []);
    tiles.get(key).push(c);
  }
  return {
    tiles,
    meta: {
      source: SOURCE_URL,
      tile: TILE,
      // The squares that have chargers, so the page never asks for one that doesn't exist.
      tiles: [...tiles.keys()].sort(),
      counts,
      providers: [...usedProviders].map(([id, count]) => ({ ...providers.get(id), count })).sort((x, y) => y.count - x.count),
    },
  };
}

async function getJson(url, key) {
  const res = await fetch(url, { headers: { 'X-API-Key': key, 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`GET ${url.split('?')[0]} failed: ${res.status} ${res.statusText}`);
  return res.json();
}

async function main() {
  const cache = join(ROOT, '.cache');
  let pois;
  let reference;
  if (process.argv.includes('--fixture')) {
    ({ pois, reference } = JSON.parse(await readFile(join(ROOT, 'test', 'fixtures', 'mini_ocm.json'), 'utf8')));
  } else if (process.argv.includes('--cached')) {
    pois = JSON.parse(await readFile(join(cache, 'ocm-gb.json'), 'utf8'));
    reference = JSON.parse(await readFile(join(cache, 'ocm-reference.json'), 'utf8'));
  } else {
    const key = process.env.OCM_API_KEY;
    if (!key) throw new Error('OCM_API_KEY is not set: add it to .env, or as a repository secret for the workflow');
    console.log('Downloading Open Charge Map data for Great Britain');
    reference = await getJson(`${API}/referencedata/`, key);
    pois = await getJson(`${API}/poi/?countrycode=GB&maxresults=200000&compact=true&verbose=false`, key);
    await mkdir(cache, { recursive: true });
    await writeFile(join(cache, 'ocm-gb.json'), JSON.stringify(pois));
    await writeFile(join(cache, 'ocm-reference.json'), JSON.stringify(reference));
  }

  const { tiles, meta } = buildChargers(pois, reference);
  if (meta.counts.kept === 0) throw new Error('No chargers kept: has the Open Charge Map data changed?');
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  for (const [key, list] of tiles) await writeFile(join(OUT_DIR, `${key}.json`), JSON.stringify(list));
  await writeFile(join(OUT_DIR, 'meta.json'), JSON.stringify({ ...meta, builtAt: new Date().toISOString() }));
  const c = meta.counts;
  console.log(
    `Wrote ${c.kept} chargers in ${tiles.size} squares (of ${c.read}: left out ${c.licence} for licence, ` +
      `${c.status} not operational, ${c.access} private, ${c.place} outside Great Britain)`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
