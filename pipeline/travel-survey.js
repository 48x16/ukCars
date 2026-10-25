// Life with the car: the National Travel Survey on cars and the people who drive them ->
// public/data/features/motoring.json.
//
//   npm run travel-survey              download the DfT tables
//   npm run travel-survey -- --cached  use the copies in .cache/nts/
//   npm run travel-survey -- --fixture one tiny workbook, for CI (part of `npm run data:fixture`)
//
// Source: DfT National Travel Survey (Open Government Licence), England. Earlier years of some
// series cover Great Britain; DfT marks breaks in a series with [b]. NTS0205 (household cars,
// 1951 on), NTS0201 (licence holders by age and sex, 1975 on), NTS0203 (reasons for not learning
// to drive), NTS0901 and NTS0904 (car mileage), NTS0905 (occupancy, lone drivers), NTS0908
// (where cars are parked overnight), NTS0909 (fuel and transmission), NTS0101 and NTS0303
// (trips and miles per person). Survey estimates, so they move a little year to year.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { download, fetchText, findCsvUrl } from './fetch.js';
import { readWorkbook } from './ods.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = {
  nts02: 'https://www.gov.uk/government/statistical-data-sets/nts02-driving-licence-holders',
  nts09: 'https://www.gov.uk/government/statistical-data-sets/nts09-vehicle-mileage-and-occupancy',
  nts01: 'https://www.gov.uk/government/statistical-data-sets/nts01-average-number-of-trips-made-and-distance-travelled',
  nts03: 'https://www.gov.uk/government/statistical-data-sets/nts03-modal-comparisons',
};
/** Each table: its file, and the page that links to it. */
export const TABLES = {
  nts0201: 'nts02',
  nts0203: 'nts02',
  nts0205: 'nts02',
  nts0901: 'nts09',
  nts0904: 'nts09',
  nts0905: 'nts09',
  nts0908: 'nts09',
  nts0909: 'nts09',
  nts0101: 'nts01',
  nts0303: 'nts03',
};
export const SOURCE_PAGE = 'https://www.gov.uk/government/collections/national-travel-survey-statistics';
/** Reasons for not learning to drive: the ones shown, most common first. */
const REASONS_SHOWN = 6;

/** A number, or null for DfT's markers ([x] not collected, [u] too few, [c] and so on). */
export function num(cell) {
  const s = String(cell ?? '').trim();
  return s === '' || !Number.isFinite(Number(s)) ? null : Number(s);
}

/**
 * A survey year label, cleaned: "1989 to 1991 [note 3] [b]" -> { year: '1989 to 1991', at: 1990,
 * break: true }. `at` is the middle of the period, for placing it on a chart.
 */
export function surveyYear(label) {
  const text = String(label).trim();
  const years = [...text.matchAll(/\d{4}/g)].map((m) => Number(m[0]));
  if (!years.length) return null;
  return {
    year: text.replace(/\s*\[[^\]]*\]/g, '').trim(),
    at: (years[0] + years.at(-1)) / 2,
    break: /\[b\]/.test(text),
  };
}

/** A column heading, without units or notes: "Street (%)" -> "Street". */
export const columnName = (h) => String(h).replace(/\s*\[[^\]]*\]/g, '').replace(/\s*\((%|number|miles|millions)\)/gi, '').trim();

/**
 * A DfT table as objects: the header row is the first whose first cell starts "Year", and data
 * rows are those that start with a year. Columns are keyed by `columnName`; numbers parsed.
 */
export function tidy(rows, what) {
  const h = rows.findIndex((r) => /^Year/.test(String(r[0] ?? '').trim()));
  if (h === -1) throw new Error(`${what}: no header row starting "Year"`);
  const names = rows[h].map(columnName);
  return rows
    .slice(h + 1)
    .map((r) => ({ r, y: surveyYear(r[0]) }))
    .filter(({ y }) => y)
    .map(({ r, y }) => {
      const row = { ...y };
      names.forEach((n, i) => {
        if (i > 0) row[n] = num(r[i]) ?? (String(r[i] ?? '').trim() || null);
      });
      return row;
    });
}

/** Picks columns by name, failing loudly if DfT renames one. */
function columns(rows, wanted, what) {
  const missing = Object.values(wanted).filter((c) => !(c in (rows[0] ?? {})));
  if (!rows.length || missing.length) throw new Error(`${what} is missing columns: ${missing.join(', ') || 'all rows'}`);
  return rows.map((r) => ({ year: r.year, at: r.at, break: r.break, ...Object.fromEntries(Object.entries(wanted).map(([k, c]) => [k, r[c]])) }));
}

const sheetOf = (book, prefix) => {
  const name = book.names.find((n) => n.startsWith(prefix));
  if (!name) throw new Error(`No sheet starting "${prefix}"`);
  return book.sheet(name);
};

/** `books` maps each table (nts0201, ...) to an opened workbook: { names, sheet }. */
export function buildMotoring(books) {
  const t = (table, prefix) => tidy(sheetOf(books[table], prefix), prefix);

  const households = columns(t('nts0205', 'NTS0205a'), { none: 'No car or van', one: 'One car or van', twoPlus: 'Two or more cars or vans' }, 'NTS0205a');
  const licenceRows = t('nts0201', 'NTS0201a');
  const ages = ['17 to 20', '21 to 29', '30 to 39', '40 to 49', '50 to 59', '60 to 69', '70 and over'];
  const licences = ['All', 'Female', 'Male'].map((sex) => ({
    sex,
    years: columns(
      licenceRows.filter((r) => r.Sex === sex),
      { all: 'All aged 17 and over', ...Object.fromEntries(ages.map((a) => [a, a])) },
      'NTS0201a',
    ),
  }));

  const reasonRows = t('nts0203', 'NTS0203b');
  const latestReasons = reasonRows.at(-1).year;
  const reasonsFor = (age) => {
    const row = reasonRows.find((r) => r.year === latestReasons && r.Age === age);
    if (!row) return [];
    return Object.entries(row)
      .filter(([k, v]) => typeof v === 'number' && !['at', 'Total', 'All reasons'].includes(k) && !/sample size/i.test(k))
      .map(([reason, share]) => ({ reason, share }))
      .sort((a, b) => b.share - a.share)
      .slice(0, REASONS_SHOWN);
  };

  const mileage = columns(t('nts0901', 'NTS0901a'), { petrol: 'Petrol', diesel: 'Diesel', hybrid: 'Hybrid', electric: 'Battery electric', all: 'All cars' }, 'NTS0901a');
  const purpose = columns(t('nts0901', 'NTS0901b'), { business: 'Business mileage', commuting: 'Commuting mileage', other: 'Other private mileage' }, 'NTS0901b');
  const company = columns(t('nts0901', 'NTS0901c'), { company: 'Company cars' }, 'NTS0901c');
  const bandRows = t('nts0904', 'NTS0904');
  const bands = [bandRows[0], bandRows.at(-1)].map((r) => ({
    year: r.year,
    bands: Object.entries(r)
      .filter(([k, v]) => / miles$/.test(k) && typeof v === 'number')
      .map(([band, share]) => ({ band, share })),
  }));

  const occupancy = columns(t('nts0905', 'NTS0905a'), { all: 'All purposes', commuting: 'Commuting' }, 'NTS0905a');
  const loneRows = t('nts0905', 'NTS0905b');
  const purposes = ['Commuting', 'Business', 'Education', 'Shopping', 'Personal business', 'Leisure', 'Holiday or day trip'];
  const lone = {
    years: columns(loneRows, { all: 'All purposes', commuting: 'Commuting' }, 'NTS0905b'),
    byPurpose: [loneRows[0], loneRows.at(-1)].map((r) => ({ year: r.year, purposes: purposes.map((p) => ({ purpose: p, share: r[p] ?? null })) })),
  };

  const parkingRows = t('nts0908', 'NTS0908');
  const parkCols = { garage: 'Garage', drive: 'Private property - not garaged', street: 'Street', other: 'Other' };
  const allAreas = columns(parkingRows.filter((r) => r['Rural-urban classification of residence'] === 'All areas'), parkCols, 'NTS0908');
  const latestParking = parkingRows.at(-1).year;
  const parkingByArea = columns(
    parkingRows.filter((r) => r.year === latestParking && r['Rural-urban classification of residence'] !== 'All areas'),
    { area: 'Rural-urban classification of residence', ...parkCols },
    'NTS0908',
  );

  const fuel = columns(t('nts0909', 'NTS0909a'), { petrol: 'Petrol', diesel: 'Diesel', hybrid: 'Hybrid', electric: 'Battery electric', plugIn: 'Plug-in hybrid' }, 'NTS0909a');
  const transmission = columns(t('nts0909', 'NTS0909b'), { manual: 'A manual transmission vehicle', automatic: 'An automatic or semi-automatic transmission vehicle' }, 'NTS0909b');

  const trips = columns(t('nts0101', 'NTS0101'), { trips: 'All trips per person per year', miles: 'Distance travelled per person per year' }, 'NTS0101');
  const byCar = columns(t('nts0303', 'NTS0303a'), { driverTrips: 'Car or van driver', passengerTrips: 'Car or van passenger', allTrips: 'All modes' }, 'NTS0303a');
  const carMiles = columns(t('nts0303', 'NTS0303c'), { driverMiles: 'Car or van driver', passengerMiles: 'Car or van passenger', allMiles: 'All modes' }, 'NTS0303c');

  return {
    source: SOURCE_PAGE,
    coverage: 'England',
    latest: households.at(-1).year,
    households,
    licences,
    reasons: { year: latestReasons, all: reasonsFor('All aged 17 and over'), young: reasonsFor('17 to 20') },
    mileage,
    purpose,
    company,
    bands,
    occupancy,
    lone,
    parking: { years: allAreas, byArea: parkingByArea },
    fuel,
    transmission,
    trips,
    modes: byCar.map((r, i) => ({ ...r, ...carMiles[i] })),
  };
}

function arg(name) {
  return process.argv.includes(name);
}

async function open(fixture) {
  if (fixture) {
    // One workbook holds every table, its sheets named "<table> <sheet>".
    const book = await readWorkbook(join(ROOT, 'test', 'fixtures', 'mini_nts.ods'));
    return Object.fromEntries(
      Object.keys(TABLES).map((table) => {
        const names = book.names.filter((n) => n.startsWith(`${table} `)).map((n) => n.slice(table.length + 1));
        return [table, { names, sheet: (n) => book.sheet(`${table} ${n}`) }];
      }),
    );
  }
  const dir = join(ROOT, '.cache', 'nts');
  if (!arg('--cached')) {
    const html = {};
    for (const [table, page] of Object.entries(TABLES)) {
      html[page] ??= await fetchText(PAGES[page]);
      console.log(`Downloading ${table}.ods`);
      await download(findCsvUrl(html[page], `${table}.ods`), join(dir, `${table}.ods`));
    }
  }
  const books = {};
  for (const table of Object.keys(TABLES)) books[table] = await readWorkbook(join(dir, `${table}.ods`));
  return books;
}

async function main() {
  const data = buildMotoring(await open(arg('--fixture')));
  const out = join(ROOT, 'public', 'data', 'features');
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'motoring.json'), JSON.stringify(data));
  console.log(`Wrote the National Travel Survey story (to ${data.latest}): ${data.households.length} years of household cars`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
