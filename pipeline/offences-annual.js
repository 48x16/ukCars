// Yearly summary of motoring offences -> data/offences/annual.json (commit it). Run by hand when
// a new edition is out, like the MOT summary: these files are renamed with every edition, so the
// weekly build reads the committed summary instead of fetching them.
//
//   npm run offences-annual                      read the files in .cache/ras/ (names below)
//   npm run offences-annual -- --moj <zip>       also summarise drink and drug driving from the MoJ zip
//
// Sources (Open Government Licence), England and Wales:
// - Home Office, Police powers and procedures: roads policing. Breath tests (BT2a, BT3, BT4) and
//   fixed penalty notices and other outcomes for motoring offences (FPN1a/b, FPN2a/b).
// - Ministry of Justice, Criminal justice statistics: outcomes by offence (prosecutions and
//   convictions for drink and drug driving), when --moj is given.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWorkbook } from './ods.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const HOME_OFFICE_PAGE = 'https://www.gov.uk/government/statistics/police-powers-and-procedures-roads-policing-to-december-2024';
export const MOJ_PAGE = 'https://www.gov.uk/government/collections/criminal-justice-statistics';
const FILES = {
  breath: 'breath-test-statistics-police-powers-and-procedures-year-ending-31-dec-2024.ods',
  fpn: 'FPN-other-motoring-offences-statistics-police-powers-procedures-year-ending-dec-24.ods',
};
/** Police forces are ranked on positive breath tests only with this many tests in the year. */
export const MIN_FORCE_TESTS = 1_000;
/** Everyday names for the Home Office's offence groups (by classification code). */
const OFFENCES = {
  '816': 'Speeding',
  '804b': 'Handheld phone at the wheel',
  '804a': 'Careless driving',
  '825b': 'No seat belt',
  '817-819': 'Ignoring signs and signals',
  '807-810': 'Licence and insurance',
  '813, 815': 'Vehicle test and condition',
  '820': 'Obstruction and parking',
};

/** A number, or null for the Home Office's markers ([z], [x], [c]) and blanks. */
export function num(cell) {
  const s = String(cell ?? '').trim();
  return s === '' || !Number.isFinite(Number(s)) ? null : Number(s);
}

/** Rows after the header row whose first cell is `first`, as objects keyed by the header (notes dropped). */
export function rowsUnder(rows, first, what) {
  const clean = (c) => String(c ?? '').replace(/\s*\[[^\]]*\]/g, '').trim();
  const h = rows.findIndex((r) => clean(r[0]) === first);
  if (h === -1) throw new Error(`${what}: no header row starting "${first}"`);
  const names = rows[h].map(clean);
  return rows.slice(h + 1).map((r) => Object.fromEntries(names.map((n, i) => [n, r[i]])));
}

/** Breath tests: the yearly trend, the latest year by month, and police forces. */
export function breathTests(book) {
  const trend = rowsUnder(book.sheet('BT3'), 'Calendar Year', 'BT3')
    .filter((r) => /^\d{4}$/.test(String(r['Calendar Year']).trim()))
    .map((r) => ({ year: Number(r['Calendar Year']), tests: num(r['Number of tests']), positive: num(r['Positive or refused tests']) }));
  const monthRows = rowsUnder(book.sheet('BT4'), 'Month', 'BT4');
  const testCols = Object.keys(monthRows[0]).filter((k) => /^Number of tests - \d{4}$/.test(k));
  const latestCol = testCols.sort().at(-1);
  const monthYear = Number(latestCol.slice(-4));
  const months = monthRows
    .filter((r) => r.Month && r.Month !== 'Total')
    .map((r) => ({ month: r.Month, tests: num(r[latestCol]), positive: num(r[`Positive or refused tests - ${monthYear}`]) }));
  const forceRows = rowsUnder(book.sheet('BT2a'), 'Calendar Year', 'BT2a');
  const forceYear = Math.max(...forceRows.map((r) => num(r['Calendar Year'])).filter(Number.isFinite));
  const forces = forceRows
    .filter((r) => num(r['Calendar Year']) === forceYear && num(r['Number of tests']) !== null)
    .map((r) => ({ name: String(r['Police Force']).trim(), tests: num(r['Number of tests']), positive: num(r['Positive or refused tests']), perThousand: num(r['Tests per 1,000 population']) }));
  const total = forces.find((f) => /England and Wales/i.test(f.name)) ?? null;
  return {
    trend,
    trendNote: 'To 2023 from the old police returns; from 2023 a new collection that is not comparable with earlier years.',
    months: { year: monthYear, months },
    forces: { year: forceYear, total, forces: forces.filter((f) => !/England and Wales|^Wales$|^England$/i.test(f.name)) },
  };
}

/** One FPN offence table (FPN2a or FPN2b): offence code -> counts by year. */
function offenceTable(rows, what) {
  const h = rows.findIndex((r) => String(r[0]).trim() === 'Offence Classification');
  if (h === -1) throw new Error(`${what}: no "Offence Classification" header`);
  const years = rows[h].slice(2).filter((c) => /^\d{4}$/.test(String(c).trim())).map(Number);
  const out = new Map();
  for (const r of rows.slice(h + 1)) {
    const code = String(r[0] ?? '').trim();
    if (!code) continue;
    out.set(code, years.map((y, i) => ({ year: y, count: num(r[2 + i]) })));
  }
  return { years, rows: out };
}

/** Motoring offences dealt with by fixed penalty, a course or court, England and Wales (the Met added in). */
export function motoringOffences(book) {
  const rest = offenceTable(book.sheet('FPN2a'), 'FPN2a');
  const met = offenceTable(book.sheet('FPN2b'), 'FPN2b');
  const add = (code) => rest.rows.get(code)?.map((c, i) => ({ year: c.year, count: (c.count ?? 0) + (met.rows.get(code)?.[i]?.count ?? 0) }));
  if (!rest.rows.has('Total')) throw new Error('FPN2a: no Total row');
  const outcomes = (sheet) => {
    const rows = sheet.filter((r) => /^Driver retraining|^Total motoring offences/.test(String(r[0]).trim()));
    return Object.fromEntries(rows.map((r) => [/^Driver/.test(r[0]) ? 'retraining' : 'total', r.slice(1, 1 + rest.years.length).map(num)]));
  };
  const a = outcomes(book.sheet('FPN1a'));
  const b = outcomes(book.sheet('FPN1b'));
  return {
    years: rest.years,
    total: add('Total').map((c) => c.count),
    offences: Object.entries(OFFENCES).map(([code, label]) => ({ code, label, counts: (add(code) ?? []).map((c) => c.count) })),
    retraining: rest.years.map((_, i) => (a.retraining?.[i] ?? 0) + (b.retraining?.[i] ?? 0)),
  };
}

async function main() {
  const dir = join(ROOT, '.cache', 'ras');
  const breath = breathTests(await readWorkbook(join(dir, FILES.breath)));
  const offences = motoringOffences(await readWorkbook(join(dir, FILES.fpn)));
  const out = join(ROOT, 'data', 'offences', 'annual.json');
  // The last summary, if any, keeps its court figures when --moj isn't given.
  let previous = {};
  try {
    previous = JSON.parse(await readFile(out, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const mojArg = process.argv.indexOf('--moj');
  let courts = previous.courts ?? null;
  if (mojArg !== -1) {
    const { summariseCourts } = await import('./offences-moj.js');
    courts = await summariseCourts(resolve(process.argv[mojArg + 1]));
  }
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify({ sources: { homeOffice: HOME_OFFICE_PAGE, moj: MOJ_PAGE }, breath, offences, courts }, null, 1)}\n`);
  console.log(`Wrote ${out}: breath tests to ${breath.months.year}, offences ${offences.years[0]} to ${offences.years.at(-1)}${courts ? `, courts to ${courts.years.at(-1)}` : ''}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
