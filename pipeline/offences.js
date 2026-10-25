// Caught out: drink-driving and motoring offences -> public/data/features/offences.json.
//
//   npm run offences              download DfT's drink-drive tables
//   npm run offences -- --cached  use the copies in .cache/ras/
//   npm run offences -- --fixture one tiny workbook, for CI (part of `npm run data:fixture`)
//
// Sources (Open Government Licence):
// - DfT road safety statistics, Great Britain: drink-drive collisions (RAS2001, by year since
//   1979; RAS2011, by month; RAS2012, by hour; RAS2013, by region; RAS2021, by the drink-driver's
//   sex), breath tests after collisions (RAS2041) and roadside screening results by reason, England
//   and Wales (RAS2042). Collisions only: by the site's rules, no deaths or casualty counts.
// - data/offences/annual.json, the committed Home Office and MoJ summary (npm run offences-annual).
// - public/data/features/traffic.json (npm run traffic, run first), for collisions per mile driven.

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { download, fetchText, findCsvUrl } from './fetch.js';
import { num, rowsUnder } from './offences-annual.js';
import { readWorkbook } from './ods.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const RAS_PAGE = 'https://www.gov.uk/government/statistical-data-sets/road-safety-statistics-data-tables';
export const TABLES = ['ras2001', 'ras2011', 'ras2012', 'ras2013', 'ras2021', 'ras2041', 'ras2042'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const sheetOf = (book, prefix) => {
  const name = book.names.find((n) => n.startsWith(prefix));
  if (!name) throw new Error(`No sheet starting "${prefix}"`);
  return book.sheet(name);
};
const yearRows = (rows) => rows.filter((r) => /^\d{4}$/.test(String(r['Collision year'] ?? r['Year of test'] ?? '').trim()));
const total = (r) => num(r['Total collisions']);

/**
 * `books` maps each RAS table to an opened workbook; `annual` is data/offences/annual.json;
 * `traffic` is the traffic feature (its regions' vehicle miles by year), or null.
 */
export function buildOffences(books, annual, traffic) {
  const collisions = yearRows(rowsUnder(sheetOf(books.ras2001, 'Collisions'), 'Collision year', 'RAS2001'))
    .map((r) => ({ year: Number(r['Collision year']), collisions: total(r) }))
    .sort((a, b) => a.year - b.year);
  if (!collisions.length) throw new Error('RAS2001: no collision years');

  const sexOf = (prefix) => new Map(yearRows(rowsUnder(sheetOf(books.ras2021, prefix), 'Collision year', 'RAS2021')).map((r) => [Number(r['Collision year']), total(r)]));
  const male = sexOf('Collisions_male');
  const female = sexOf('Collisions_female');
  const drivers = collisions.map(({ year }) => ({ year, male: male.get(year) ?? null, female: female.get(year) ?? null }));

  // Months and hours: summed over the ten years, as single years are small and rounded to tens.
  const monthRows = yearRows(rowsUnder(sheetOf(books.ras2011, 'Month'), 'Collision year', 'RAS2011'));
  const months = MONTHS.map((month) => ({ month, collisions: monthRows.filter((r) => r['Collision month'] === month).reduce((n, r) => n + (num(r.Collisions) ?? 0), 0) }));
  const hourRows = yearRows(rowsUnder(sheetOf(books.ras2012, 'Hour'), 'Collision year', 'RAS2012')).filter((r) => /^\d{2}:00/.test(r['Time of Day']));
  const hours = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    collisions: hourRows.filter((r) => Number(r['Time of Day'].slice(0, 2)) === h).reduce((n, r) => n + (total(r) ?? 0), 0),
  }));
  const span = [Math.min(...monthRows.map((r) => Number(r['Collision year']))), Math.max(...monthRows.map((r) => Number(r['Collision year'])))];

  // Regions: collisions over the ten years per billion vehicle miles driven there in those years.
  const regionRows = yearRows(rowsUnder(sheetOf(books.ras2013, 'Collisions'), 'Collision year', 'RAS2013'));
  const regionYears = [...new Set(regionRows.map((r) => Number(r['Collision year'])))];
  const milesIn = (name) => {
    const r = traffic?.regions.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!r) return null;
    return regionYears.reduce((n, y) => {
      const i = traffic.years.indexOf(y);
      return i === -1 || r.all[i] === null ? n : n + r.all[i];
    }, 0);
  };
  const regions = [...new Set(regionRows.map((r) => r['Region or country']))]
    .filter((name) => name !== 'Great Britain' && name !== 'England') // English regions, Scotland and Wales
    .map((name) => {
      const sum = regionRows.filter((r) => r['Region or country'] === name).reduce((n, r) => n + (total(r) ?? 0), 0);
      const miles = milesIn(name);
      return { name, collisions: sum, perBillionMiles: miles ? sum / (miles / 1e9) : null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const tested = rowsUnder(sheetOf(books.ras2041, 'Breath'), 'Occupant type', 'RAS2041')
    .filter((r) => r['Occupant type'] === 'All drivers or riders' && /^\d{4}$/.test(String(r['Collision year'])))
    .map((r) => ({ year: Number(r['Collision year']), involved: num(r['Number involved in collisions']), tested: num(r['Number breath tested']), failed: num(r['Number of breath test failures']) }))
    .sort((a, b) => a.year - b.year);

  const screening = yearRows(rowsUnder(sheetOf(books.ras2042, 'Digital'), 'Year of test', 'RAS2042'));
  const screenYear = Math.max(...screening.map((r) => Number(r['Year of test'])));
  const reasons = screening
    .filter((r) => Number(r['Year of test']) === screenYear && r['Reason for test'] !== 'All')
    .map((r) => {
      const over = ['36 to 50 mcg', '51 to 80 mcg', 'Over 80  mcg', 'Over 80 mcg'].reduce((n, k) => n + (num(r[k]) ?? 0), 0);
      return { reason: r['Reason for test'], tests: num(r.Total), over };
    });

  return {
    sources: { ras: RAS_PAGE, ...annual.sources },
    collisions,
    drivers,
    months: { from: span[0], to: span[1], months },
    hours,
    regions: { from: Math.min(...regionYears), to: Math.max(...regionYears), regions },
    tested,
    screening: { year: screenYear, reasons },
    breath: annual.breath,
    offences: annual.offences,
    courts: annual.courts ?? null,
  };
}

function arg(name) {
  return process.argv.includes(name);
}

async function open(fixture) {
  if (fixture) {
    const book = await readWorkbook(join(ROOT, 'test', 'fixtures', 'mini_ras.ods'));
    return Object.fromEntries(
      TABLES.map((t) => {
        const names = book.names.filter((n) => n.startsWith(`${t} `)).map((n) => n.slice(t.length + 1));
        return [t, { names, sheet: (n) => book.sheet(`${t} ${n}`) }];
      }),
    );
  }
  const dir = join(ROOT, '.cache', 'ras');
  if (!arg('--cached')) {
    const html = await fetchText(RAS_PAGE);
    for (const t of TABLES) {
      console.log(`Downloading ${t}.ods`);
      await download(findCsvUrl(html, `${t}.ods`), join(dir, `${t}.ods`));
    }
  }
  const books = {};
  for (const t of TABLES) books[t] = await readWorkbook(join(dir, `${t}.ods`));
  return books;
}

async function main() {
  const annual = JSON.parse(await readFile(join(ROOT, 'data', 'offences', 'annual.json'), 'utf8'));
  let traffic = null;
  try {
    traffic = JSON.parse(await readFile(join(ROOT, 'public', 'data', 'features', 'traffic.json'), 'utf8'));
  } catch {
    console.warn('No traffic.json (run npm run traffic first): regions will have no rate per mile');
  }
  const data = buildOffences(await open(arg('--fixture')), annual, traffic);
  const out = join(ROOT, 'public', 'data', 'features');
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'offences.json'), JSON.stringify(data));
  console.log(`Wrote the offences story: drink-drive collisions ${data.collisions[0].year} to ${data.collisions.at(-1).year}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
