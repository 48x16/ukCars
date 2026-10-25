// Plug-in vehicles and public chargers by local authority -> public/data/electric.json.
//
//   npm run electric             download the latest DfT tables and the ONS lookup
//   npm run electric -- --cached use the copies in .cache/
//   npm run electric -- --fixture tiny test files, for CI (part of `npm run data:fixture`)
//
// Runs after `npm run data`, which clears public/data/. Sources, all Open Government Licence:
// - DfT VEH0145: licensed plug-in vehicles by small area (LSOA / data zone), quarterly.
// - DfT EVCI0102: public EV chargers by local authority, quarterly, with per-100,000 rates.
// - ONS postcode lookup, which places every small area in its local authority.
//
// Only privately kept plug-ins are counted. Company vehicles are registered where the company
// is, often a leasing firm's head office, so they'd pile up in a handful of places.

import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse';
import { download, fetchText, findCsvUrl } from './fetch.js';
import { readSheet } from './ods.js';
import { SOURCE_PAGE_URL } from './sources.js';
import { listEntries, openEntry } from './zip.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache');
export const CHARGERS_PAGE_URL =
  'https://www.gov.uk/government/statistical-data-sets/electric-vehicle-charging-infrastructure-statistics-data-tables-evci';
export const LOOKUP_URL = 'https://www.arcgis.com/sharing/rest/content/items/c4f84c38814d4b82aa4760ade686c3cc/data';
export const LOOKUP_PAGE_URL =
  'https://www.data.gov.uk/dataset/postcode-to-oa-2021-to-lsoa-to-msoa-to-lad-november-2025-best-fit-lookup-in-the-uk';
const CHARGERS_SHEET = 'EVCI0102e'; // the machine-readable version of the table

/** Quarters of plug-in history kept per council: five years and the quarter before. */
export const COUNCIL_QUARTERS = 21;

const NATIONS = { E: 'England', W: 'Wales', S: 'Scotland', N: 'Northern Ireland' };
// Each small area's "Total" row is suppressed far less often than its per-fuel rows, so totals
// come from it. Suppressed counts go to a "Miscellaneous" row, which keeps national sums exact.
const FUELS = { Total: 'total', 'Battery electric': 'electric' };

/** The link to the EVCI0102 workbook on the DfT page. Its name carries the release month. */
export function findChargersUrl(html) {
  const urls = new Set(
    [...html.matchAll(/https:\/\/assets\.publishing\.service\.gov\.uk\/media\/[^"\\\s]*\/evci0102_[^"\\\s]*\.ods/g)].map((m) => m[0]),
  );
  if (urls.size !== 1) throw new Error(`Expected one EVCI0102 link on the DfT page, found ${urls.size}`);
  return [...urls][0];
}

/**
 * Small area -> local authority, from postcode rows. Only live postcodes count, and each
 * small area goes to the authority holding most of its postcodes (they're best-fit anyway).
 */
export async function buildLookup(rows) {
  const counts = new Map();
  const names = new Map();
  for await (const r of rows) {
    if (r.doterm || !r.lsoa21cd || !r.ladcd) continue;
    const byLad = counts.get(r.lsoa21cd) ?? new Map();
    byLad.set(r.ladcd, (byLad.get(r.ladcd) ?? 0) + 1);
    counts.set(r.lsoa21cd, byLad);
    names.set(r.ladcd, r.ladnm);
  }
  const areas = new Map();
  for (const [lsoa, byLad] of counts) areas.set(lsoa, [...byLad].sort((a, b) => b[1] - a[1])[0][0]);
  return { areas, names };
}

/** Private plug-ins per council and quarter, from VEH0145 rows (header first). */
export async function plugInsByCouncil(rows, lookup) {
  let quarters;
  const councils = new Map();
  const uk = {};
  let unplaced = 0;
  for await (const r of rows) {
    if (!quarters) {
      if (r[0] !== 'LSOA21CD' || r[2] !== 'Fuel' || r[3] !== 'Keepership') throw new Error('VEH0145 has unexpected columns');
      quarters = r.slice(4).reverse(); // oldest first, like the rest of the site
      for (const fuel of Object.values(FUELS)) uk[fuel] = new Array(quarters.length).fill(0);
      continue;
    }
    const fuel = FUELS[r[2]];
    if (r[3] !== 'Private' || !fuel) continue;
    // Suppressed counts ([c], 1 to 4 vehicles) count as zero, as on the Insights page.
    const values = r.slice(4).reverse().map((v) => (/^\d+$/.test(v) ? Number(v) : 0));
    values.forEach((v, i) => (uk[fuel][i] += v));
    const code = lookup.areas.get(r[0]);
    if (!code) {
      if (fuel === 'total') unplaced += values.at(-1);
      continue;
    }
    const c = councils.get(code) ?? { total: new Array(quarters.length).fill(0), electric: new Array(quarters.length).fill(0) };
    values.forEach((v, i) => (c[fuel][i] += v));
    councils.set(code, c);
  }
  if (!quarters) throw new Error('VEH0145 is empty');
  return { quarters, councils, uk, unplaced };
}

/** The latest date's chargers per council from the machine-readable EVCI0102 sheet. */
export function chargersByCouncil(sheet) {
  const header = sheet.findIndex((r) => r[0] === 'Date' && r.includes('Local authority code'));
  if (header === -1) throw new Error(`${CHARGERS_SHEET} has no header row`);
  const col = Object.fromEntries(sheet[header].map((name, i) => [name, i]));
  for (const name of ['Date', 'Local authority code', 'Local authority', 'Key', 'Value']) {
    if (!(name in col)) throw new Error(`${CHARGERS_SHEET} is missing the "${name}" column`);
  }
  const rows = sheet.slice(header + 1).filter((r) => r[col['Local authority code']]);
  const latest = rows.reduce((d, r) => {
    const date = r[col.Date];
    return !d || Date.parse(date) > Date.parse(d) ? date : d;
  }, null);
  const councils = new Map();
  for (const r of rows) {
    if (r[col.Date] !== latest) continue;
    const code = r[col['Local authority code']];
    const c = councils.get(code) ?? { name: r[col['Local authority']] };
    const value = Number(r[col.Value]);
    if (Number.isFinite(value)) c[r[col.Key]] = value;
    councils.set(code, c);
  }
  return { date: latest, councils };
}

/** Joins plug-ins to chargers. Population comes from DfT's own per-100,000 rate. */
export function buildElectric({ plugIns, chargers }) {
  const { quarters } = plugIns;
  const last = quarters.length - 1;
  const yearAgo = last - 4;
  const keep = Math.min(COUNCIL_QUARTERS, quarters.length);
  const councils = [];
  const missing = [];
  for (const [code, c] of chargers.councils) {
    const p = plugIns.councils.get(code);
    if (!p) {
      missing.push(code);
      continue;
    }
    const total = p.total;
    const devices = c['EV chargers'] ?? 0;
    const rate = c['EV chargers per 100k'];
    const population = devices && rate ? Math.round((devices / rate) * 100_000) : null;
    councils.push({
      code,
      name: c.name,
      nation: NATIONS[code[0]] ?? null,
      chargers: devices,
      rapid: c['50kW+ EV chargers'] ?? 0,
      chargersPer100k: rate ?? null,
      population,
      plugIns: total[last],
      electric: p.electric[last],
      plugInsYearAgo: yearAgo >= 0 ? total[yearAgo] : null,
      plugInsPerCharger: devices ? total[last] / devices : null,
      plugInsPer1000: population ? (total[last] / population) * 1000 : null,
      history: total.slice(-keep),
    });
  }
  const extra = [...plugIns.councils.keys()].filter((code) => !chargers.councils.has(code));
  if (missing.length || extra.length) {
    throw new Error(`Councils don't match: no plug-ins for ${missing.join(', ') || 'none'}; no chargers for ${extra.join(', ') || 'none'}`);
  }
  const sum = (key) => councils.reduce((n, c) => n + c[key], 0);
  return {
    plugInQuarter: quarters[last],
    chargersDate: chargers.date,
    quarters: quarters.slice(-keep),
    uk: {
      quarters,
      plugIns: plugIns.uk.total,
      electric: plugIns.uk.electric,
      chargers: sum('chargers'),
      rapid: sum('rapid'),
    },
    unplacedPlugIns: plugIns.unplaced,
    councils: councils.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function csvRows(stream, options = {}) {
  return stream.pipe(parse({ bom: true, relax_column_count: true, ...options }));
}

/** The ONS lookup is a zipped CSV; the test fixture is a plain one. */
async function openLookup(path) {
  if (path.endsWith('.csv')) return createReadStream(path);
  const entry = (await listEntries(path)).find((e) => /\.csv$/i.test(e.name));
  if (!entry) throw new Error('No CSV in the ONS postcode lookup');
  return openEntry(path, entry);
}

async function main() {
  const fixture = process.argv.includes('--fixture');
  const fixtures = join(ROOT, 'test', 'fixtures');
  const paths = fixture
    ? {
        veh0145: join(fixtures, 'mini_VEH0145.csv'),
        chargers: join(fixtures, 'mini_evci0102.ods'),
        lookup: join(fixtures, 'mini_lookup.csv'),
      }
    : {
        veh0145: join(CACHE, 'df_VEH0145.csv'),
        chargers: join(CACHE, 'evci0102.ods'),
        lookup: join(CACHE, 'pcd_lookup.zip'),
      };
  if (!fixture && !process.argv.includes('--cached')) {
    const vehUrl = findCsvUrl(await fetchText(SOURCE_PAGE_URL), 'df_VEH0145.csv');
    const chargersUrl = findChargersUrl(await fetchText(CHARGERS_PAGE_URL));
    for (const [url, path] of [
      [vehUrl, paths.veh0145],
      [chargersUrl, paths.chargers],
      [LOOKUP_URL, paths.lookup],
    ]) {
      console.log(`Downloading ${url}`);
      await download(url, path);
    }
  }

  const lookup = await buildLookup(csvRows(await openLookup(paths.lookup), { columns: true }));
  const plugIns = await plugInsByCouncil(csvRows(createReadStream(paths.veh0145)), lookup);
  const chargers = chargersByCouncil(await readSheet(paths.chargers, CHARGERS_SHEET));
  const electric = buildElectric({ plugIns, chargers });

  const out = join(ROOT, 'public', 'data', 'electric.json');
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(electric));
  console.log(
    `Wrote ${out}: ${electric.councils.length} councils, plug-ins to ${electric.plugInQuarter}, ` +
      `chargers at ${electric.chargersDate}, ${electric.unplacedPlugIns} plug-ins not placed in a council`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

