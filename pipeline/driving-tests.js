// Learning to drive: DVSA's car driving test statistics -> public/data/features/driving.json (the
// national story) and public/data/test-centres/ (one file per test centre, plus an index).
//
//   npm run driving-tests              download the DVSA tables
//   npm run driving-tests -- --cached  use the copies in .cache/drt/
//   npm run driving-tests -- --fixture one tiny workbook, for CI (part of `npm run data:fixture`)
//
// Source: DVSA, driving test and theory test data: cars (Open Government Licence), Great Britain.
// National tables by financial year (DRT121A, C, E, F) and month (DRT121G, with waiting times);
// per test centre (DRT122A pass rates, C first attempts, D ages 17 to 25, E automatics, F waits).
// Centres are joined by name, which DVSA keeps the same across its tables. Suppressed and
// unavailable cells ("..", [c], [r], [x], [z], [n]) are null, never zero.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { download, fetchText, findCsvUrl } from './fetch.js';
import { readWorkbook } from './ods.js';
import { slugify } from './slice.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DRIVING_PAGE_URL = 'https://www.gov.uk/government/statistical-data-sets/driving-test-and-theory-test-data-cars';
export const TABLES = {
  '121c': 'drt121c-car-driving-tests-year-gender-age-great-britain.ods',
  '121e': 'drt121e-car-driving-tests-with-zero-faults.ods',
  '121f': 'drt121f-car-driving-tests-top-10-faults.ods',
  '121g': 'drt121g-car-driving-test-availability-by-country-and-region.ods',
  '122a': 'drt122a-car-driving-test-by-test-centre.ods',
  '122c': 'drt122c-car-driving-test-first-attempt-by-test-centre.ods',
  '122d': 'drt122d-car-driving-test-by-age-by-test-centre.ods',
  '122e': 'drt122e-car-driving-test-automatic-by-test-centre.ods',
  '122f': 'drt122f-car-driving-test-availability-by-driving-test-centre.ods',
};
/** Centres are ranked (pass rate, wait) only with this many tests in the year: fewer is mostly noise. */
export const MIN_RANKED_TESTS = 500;
const RANKED = 5;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const YEAR_SHEET = /^\d{4}-\d{2}$/;

/** A count or rate, or null where DVSA has suppressed or not given it. */
export function num(cell) {
  const s = String(cell ?? '').trim().replace(/,/g, '');
  return s === '' || !Number.isFinite(Number(s)) ? null : Number(s);
}

/** "September-2026" -> "2026-09". */
export function monthKey(label) {
  const [name, year] = String(label).trim().split('-');
  const m = MONTHS.indexOf(name);
  if (m === -1 || !/^\d{4}$/.test(year)) throw new Error(`Unexpected month "${label}"`);
  return `${year}-${String(m + 1).padStart(2, '0')}`;
}

/** "April 2025 to March 2026", "2025 to 2026" or "2025/26" -> "2025-26". */
export function yearKey(label) {
  const m = /(\d{4})\D+(\d{2})(\d{2})?/.exec(String(label));
  if (!m) throw new Error(`Unexpected year "${label}"`);
  return `${m[1]}-${m[3] ?? m[2]}`;
}

function header(rows, first, what) {
  const i = rows.findIndex((r) => String(r[0]).trim() === first);
  if (i === -1) throw new Error(`${what}: no header row starting "${first}"`);
  return i;
}

const isMonthRow = (cell) => /^\s/.test(cell) || MONTHS.some((m) => cell.startsWith(m));

/**
 * DRT122A, one year's sheet: each centre is a name row, its month rows, then a total row that
 * repeats its name. Returns the totals by centre name, and the national row.
 */
export function centreTotals(rows) {
  const centres = new Map();
  let national = null;
  for (const r of rows) {
    const name = String(r[0] ?? '');
    if (r.length < 12 || !name.trim() || isMonthRow(name) || num(r[9]) === null) continue;
    const row = { male: { tests: num(r[1]), passes: num(r[2]) }, female: { tests: num(r[5]), passes: num(r[6]) }, tests: num(r[9]), passes: num(r[10]) };
    if (/^national/i.test(name.trim())) national = row;
    else centres.set(name.trim(), row);
  }
  if (!centres.size) throw new Error('DRT122A: no centre totals found');
  return { centres, national };
}

/** DRT122C: first attempts by centre (the totals block: attempts, passes, rate, zero faults). */
export function firstAttempts(rows) {
  const out = new Map();
  for (const r of rows) {
    const name = String(r[0] ?? '').trim();
    if (r.length < 15 || !name || num(r[11]) === null) continue;
    out.set(/^national/i.test(name) ? '' : name, { tests: num(r[11]), passes: num(r[12]), zeroFaults: num(r[14]) });
  }
  return out;
}

/** DRT122E: automatic-car tests by centre (the totals block); the national row is keyed ''. */
export function automatics(rows) {
  const out = new Map();
  for (const r of rows) {
    const name = String(r[0] ?? '').trim();
    if (r.length < 11 || !name || num(r[9]) === null) continue;
    out.set(/^national/i.test(name) ? '' : name, { tests: num(r[9]), passes: num(r[10]) });
  }
  return out;
}

/** DRT122D: a name row, then a row per age (17 to 25) and a total; ages kept 17 to 25. */
export function centreAges(rows) {
  const out = new Map();
  let ages = null;
  for (const r of rows) {
    if (r.length === 1 && String(r[0]).trim() && !/^DRT/.test(r[0])) {
      ages = [];
      out.set(String(r[0]).trim(), ages);
    } else if (ages && /^(1[7-9]|2[0-5])$/.test(String(r[1]).trim())) {
      ages.push({ age: Number(r[1]), tests: num(r[8]), passes: num(r[9]) });
    }
  }
  return out;
}

/** DRT122F: monthly waiting times per open centre (closed centres are prefixed "[z]"). */
export function centreWaits(rows) {
  const h = header(rows, 'Country', 'DRT122F');
  const out = new Map();
  for (const r of rows.slice(h + 1)) {
    const name = String(r[2] ?? '').trim();
    if (!name || name.startsWith('[z]')) continue;
    let c = out.get(name);
    if (!c) out.set(name, (c = { country: String(r[0]).trim(), region: String(r[1]).trim(), months: [] }));
    c.months.push({ month: monthKey(r[3]), wait: num(r[6]), within7: num(r[7]), over21: num(r[10]) });
  }
  for (const c of out.values()) c.months.sort((a, b) => a.month.localeCompare(b.month));
  return out;
}

/** DRT121G: Great Britain and each country and region, by month. */
export function areaMonths(rows) {
  const h = header(rows, 'Geographic level', 'DRT121G');
  const out = new Map();
  for (const r of rows.slice(h + 1)) {
    const name = String(r[1] ?? '').trim();
    if (!name) continue;
    if (!out.has(name)) out.set(name, { level: String(r[0]).trim(), months: [] });
    out.get(name).months.push({ month: monthKey(r[2]), tests: num(r[3]), passes: num(r[4]), wait: num(r[8]), within7: num(r[9]) });
  }
  if (!out.has('Great Britain')) throw new Error('DRT121G: no Great Britain rows');
  return out;
}

/** DRT121E: tests, passes and zero-fault passes by financial year. */
export function yearsWithZeroFaults(rows) {
  return rows
    .filter((r) => /^April \d{4}/.test(String(r[0]).trim()) && num(r[1]) !== null)
    .map((r) => ({ year: yearKey(r[0]), tests: num(r[1]), passes: num(r[2]), zeroFaults: num(r[3]) }));
}

/** DRT121C: the latest year's tests and passes by age (17 to 59, then 60 and over), and by gender. */
export function agesAndGender(rows) {
  const h = header(rows, 'Date', 'DRT121C');
  const body = rows.slice(h + 1).filter((r) => num(r[3]) !== null);
  const latest = body[0] && body.map((r) => String(r[0])).sort().at(-1);
  const year = body.filter((r) => r[0] === latest);
  const ages = year
    .filter((r) => r[1] === 'Total' && (/^\d+$/.test(r[2]) ? Number(r[2]) >= 17 : r[2] === '60 and over'))
    .map((r) => ({ age: r[2] === '60 and over' ? '60+' : r[2], tests: num(r[3]), passes: num(r[4]) }));
  const gender = Object.fromEntries(
    ['Male', 'Female'].map((g) => {
      const r = year.find((x) => x[1] === g && x[2] === 'Total');
      return [g.toLowerCase(), r ? { tests: num(r[3]), passes: num(r[4]) } : null];
    }),
  );
  return { year: yearKey(latest), ages, gender };
}

/** DRT121F: the ten commonest faults, by financial year, newest first. */
export function topFaults(rows) {
  const byYear = new Map();
  for (const r of rows) {
    if (!/\d{4}/.test(String(r[0])) || !/^\d+$/.test(String(r[1]).trim())) continue;
    const year = yearKey(r[0]);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)[Number(r[1]) - 1] = String(r[2]).trim().replace('progess', 'progress');
  }
  return [...byYear].map(([year, faults]) => ({ year, faults })).sort((a, b) => b.year.localeCompare(a.year));
}

const rate = (o) => (o && o.tests ? o.passes / o.tests : null);
const sum = (rows, key) => rows.reduce((t, r) => t + (r[key] ?? 0), 0);
const last12 = (months) => months.slice(-12);

/**
 * Everything the pages need. `books` holds each table, read: { name: { names, sheet } }.
 * Returns { feature, index, centres }.
 */
export function buildDriving(books) {
  const yearSheets = books['122a'].names.filter((n) => YEAR_SHEET.test(n)).sort();
  if (!yearSheets.length) throw new Error('DRT122A: no year sheets');
  const latest = yearSheets.at(-1);
  const { centres: totals, national } = centreTotals(books['122a'].sheet(latest));
  const history = new Map();
  for (const y of yearSheets) {
    for (const [name, t] of centreTotals(books['122a'].sheet(y)).centres) {
      if (!history.has(name)) history.set(name, []);
      history.get(name).push({ year: y, tests: t.tests, passes: t.passes });
    }
  }
  const first = firstAttempts(books['122c'].sheet(latest));
  const auto = automatics(books['122e'].sheet(latest));
  const ages = centreAges(books['122d'].sheet(latest));
  const waits = centreWaits(books['122f'].sheet(books['122f'].names.find((n) => /^DRT122F$/i.test(n)) ?? 'DRT122F'));
  const areas = areaMonths(books['121g'].sheet(books['121g'].names.find((n) => /^DRT121G$/i.test(n)) ?? 'DRT121G'));
  const gb = areas.get('Great Britain').months;
  const latestMonth = gb.at(-1).month;

  const autoAll = auto.get('') ?? null;
  const nationalFirst = first.get('') ?? null;
  const nationalWait = gb.at(-1).wait;

  // English regions, plus Scotland and Wales (which DVSA doesn't split into regions).
  const areaRows = [...areas]
    .filter(([name, a]) => a.level === 'Region' || name === 'Scotland' || name === 'Wales')
    .map(([name, a]) => {
      const year = last12(a.months);
      return { name, tests: sum(year, 'tests'), passes: sum(year, 'passes'), wait: a.months.at(-1).wait, within7: a.months.at(-1).within7 };
    });

  const index = [];
  const centres = [];
  for (const [name, t] of totals) {
    const w = waits.get(name);
    const now = w?.months.at(-1);
    const slug = slugify(name);
    const region = w?.region ?? null;
    index.push({ slug, name, region, tests: t.tests, rate: rate(t), wait: now?.wait ?? null });
    centres.push({
      slug,
      name,
      region,
      country: w?.country ?? null,
      year: latest,
      tests: t.tests,
      passes: t.passes,
      male: t.male,
      female: t.female,
      firstAttempt: first.get(name) ?? null,
      automatic: auto.get(name) ?? null,
      ages: ages.get(name) ?? [],
      history: history.get(name) ?? [],
      waits: w?.months ?? [],
    });
  }
  index.sort((a, b) => a.name.localeCompare(b.name));

  // Each centre's file carries what it's compared with: Great Britain and its region.
  // DVSA spells regions differently between tables ("Yorkshire and The Humber"), so match on lower case.
  const regionRow = new Map(areaRows.map((r) => [r.name.toLowerCase(), r]));
  for (const c of centres) {
    const r = regionRow.get(c.region?.toLowerCase()) ?? regionRow.get(c.country?.toLowerCase());
    c.compare = {
      gb: { rate: rate(national), firstRate: rate(nationalFirst), autoRate: rate(autoAll), wait: nationalWait },
      region: r ? { name: r.name, rate: rate(r), wait: r.wait } : null,
    };
  }

  const ranked = index.filter((c) => c.tests >= MIN_RANKED_TESTS);
  const waited = ranked.filter((c) => c.wait !== null);
  const pick = (list, key, dir) => [...list].sort((a, b) => dir * (a[key] - b[key]) || a.name.localeCompare(b.name)).slice(0, RANKED).map(({ slug, name, region, tests, rate: r, wait }) => ({ slug, name, region, tests, rate: r, wait }));

  const national121 = agesAndGender(books['121c'].sheet(books['121c'].names.find((n) => /^DRT121C$/i.test(n)) ?? 'DRT121C'));
  const feature = {
    source: DRIVING_PAGE_URL,
    year: latest,
    latestMonth,
    years: yearsWithZeroFaults(books['121e'].sheet(books['121e'].names[0])),
    ages: national121.ages,
    gender: national121.gender,
    faults: topFaults(books['121f'].sheet(books['121f'].names[0])),
    months: gb,
    regions: areaRows.sort((a, b) => a.name.localeCompare(b.name)),
    firstAttempt: nationalFirst,
    automatic: autoAll,
    manual: national && autoAll ? { tests: national.tests - autoAll.tests, passes: national.passes - autoAll.passes } : null,
    centres: {
      count: index.length,
      minRankedTests: MIN_RANKED_TESTS,
      highest: pick(ranked, 'rate', -1),
      lowest: pick(ranked, 'rate', 1),
      longestWait: pick(waited, 'wait', -1),
      shortestWait: pick(waited, 'wait', 1),
    },
  };
  return { feature, index, centres };
}

function arg(name) {
  return process.argv.includes(name);
}

async function open(fixture) {
  if (fixture) {
    // One workbook holds every table, its sheets named "<table> <sheet>".
    const book = await readWorkbook(join(ROOT, 'test', 'fixtures', 'mini_drt.ods'));
    return Object.fromEntries(
      Object.keys(TABLES).map((t) => {
        const names = book.names.filter((n) => n.startsWith(`${t} `)).map((n) => n.slice(t.length + 1));
        return [t, { names, sheet: (n) => book.sheet(`${t} ${n}`) }];
      }),
    );
  }
  const dir = join(ROOT, '.cache', 'drt');
  if (!arg('--cached')) {
    const html = await fetchText(DRIVING_PAGE_URL);
    for (const file of Object.values(TABLES)) {
      console.log(`Downloading ${file}`);
      await download(findCsvUrl(html, file), join(dir, file));
    }
  }
  const books = {};
  for (const [t, file] of Object.entries(TABLES)) books[t] = await readWorkbook(join(dir, file));
  return books;
}

async function main() {
  const { feature, index, centres } = buildDriving(await open(arg('--fixture')));
  const out = join(ROOT, 'public', 'data');
  await mkdir(join(out, 'features'), { recursive: true });
  await writeFile(join(out, 'features', 'driving.json'), JSON.stringify(feature));
  await rm(join(out, 'test-centres'), { recursive: true, force: true });
  await mkdir(join(out, 'test-centres'), { recursive: true });
  await writeFile(join(out, 'test-centres', 'index.json'), JSON.stringify(index));
  for (const c of centres) await writeFile(join(out, 'test-centres', `${c.slug}.json`), JSON.stringify(c));
  console.log(`Wrote the driving test story (${feature.year}, to ${feature.latestMonth}) and ${centres.length} test centres`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
