// DVSA anonymised MOT results -> data/mot/<year>.json, a compact summary that's committed.
//
//   npm run mot                        download this year's results zip from DVSA (about 5 GB)
//   npm run mot -- --zip <path>        use a local copy instead
//   npm run mot -- --csv <path>        a single plain CSV, e.g. the test fixture
//
// The file is far too big to keep, so it's streamed once and boiled down to totals. Only cars
// (test class 4) and their normal tests (not retests) are counted, so each car counts about
// once a year. Abandoned tests are left out. The weekly pipeline joins this summary to DVLA's
// models (pipeline/mot-join.js).

import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { fileURLToPath } from 'node:url';
import { download } from './fetch.js';
import { listEntries, openEntry } from './zip.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MOT_URL = (year) =>
  `https://edh-dvsa-data-gov-uk-files-prod.s3.eu-west-1.amazonaws.com/dft_test_result_extracts_${year}.zip`;
export const MOT_SOURCE_PAGE = 'https://www.data.gov.uk/dataset/c63fca52-ae4c-4b75-bab5-8b4735e1a4c9/anonymised-mot-tests-and-results';

export const COLUMNS = [
  'test_date',
  'test_class_id',
  'test_type',
  'test_result',
  'test_mileage',
  'postcode_area',
  'make',
  'model',
  'colour',
  'fuel_type',
  'first_use_date',
];

/** Ages run 0 to MAX_AGE, the last bucket meaning "MAX_AGE or older". */
export const MAX_AGE = 40;
/** Age bands for comparing models fairly: older cars fail more often. */
export const AGE_BANDS = [
  { label: '3 to 5 years', from: 3, to: 5 },
  { label: '6 to 9 years', from: 6, to: 9 },
  { label: '10 to 14 years', from: 10, to: 14 },
  { label: '15 years or more', from: 15, to: Infinity },
];
/** Mileage histogram: 10,000-mile bands up to MAX_MILES, the last meaning "or more". */
export const MILES_BAND = 10_000;
export const MAX_MILES = 300_000;
/** Makes and models with fewer initial tests than this are left out of the summary. */
export const MIN_MODEL_TESTS = 100;
/** Ages counted as "recent cars" for colours by make and by fuel: what people choose now. */
export const RECENT_AGES = { from: 3, to: 7 };

// DVSA fuel codes, plus the spelled-out values that also appear in the data.
const FUELS = {
  PE: 'petrol',
  DI: 'diesel',
  EL: 'electric',
  ELECTRIC: 'electric',
  HY: 'hybrid',
  'HYBRID ELECTRIC (CLEAN)': 'hybrid',
  ED: 'hybrid', // electric diesel
};
export const FUEL_IDS = ['petrol', 'diesel', 'hybrid', 'electric', 'other'];
export const fuelOf = (code) => FUELS[code] ?? 'other';

/**
 * Splits a CSV line. Quotes are rare in this data, so the quote-aware path only runs when needed.
 * Inside quotes, DVSA escapes a quote as \" (inches: "SWB 88\"") where standard CSV uses "".
 */
export function splitCsv(line) {
  if (!line.includes('"')) return line.split(',');
  const fields = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if ((c === '"' || c === '\\') && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      fields.push(field);
      field = '';
    } else field += c;
  }
  fields.push(field);
  return fields;
}

/**
 * Age as test year minus first-use year, from ISO dates (YYYY-MM-DD...), or null if unusable.
 * Calendar years rather than exact birthdays, because a first MOT can be done a month early:
 * this way every first MOT is "3 years".
 */
export function ageInYears(firstUse, tested) {
  const fy = Number(firstUse.slice(0, 4));
  const ty = Number(tested.slice(0, 4));
  if (!(fy >= 1900) || !(ty >= fy)) return null;
  return ty - fy;
}

const zeros = (n) => new Array(n).fill(0);
const outcome = () => ({ tests: 0, pass: 0, prs: 0, fail: 0 });
const RESULT_KEY = { P: 'pass', PRS: 'prs', F: 'fail' };

/**
 * A copy of a string that doesn't share memory with the text it was cut from. V8 keeps a whole
 * chunk of the file alive while any slice of it is held, so map keys must be copies, or a year
 * of free-text model names pins gigabytes.
 */
const own = (s) => (' ' + s).slice(1);

function tally(map, key, n = 1) {
  const now = map.get(key);
  map.set(now === undefined ? own(key) : key, (now ?? 0) + n);
}

function countOutcome(target, key) {
  target.tests++;
  target[key]++;
}

/** Running totals for one year of MOT results. Feed it lines with `header()` then `row()`. */
export function createMotAggregator({ minModelTests = MIN_MODEL_TESTS } = {}) {
  let col;
  let width;
  const rows = { read: 0, malformed: 0, cars: 0, initial: 0, skipped: 0 };
  const totals = outcome();
  const ages = Array.from({ length: MAX_AGE + 1 }, () => ({ ...outcome(), miles: 0, milesN: 0 }));
  const months = Array.from({ length: 12 }, outcome);
  const miles = zeros(MAX_MILES / MILES_BAND + 1);
  const colours = new Map(); // first-use year -> Map(colour -> count)
  const fuels = new Map(); // first-use year -> Map(fuel -> count)
  const recentByMake = new Map(); // make -> Map(colour -> count), recent cars only
  const recentByFuel = new Map(); // fuel -> Map(colour -> count), recent cars only
  const areas = new Map();
  const models = new Map();

  function header(fields) {
    const names = fields.map((f) => f.trim().toLowerCase());
    col = Object.fromEntries(COLUMNS.map((c) => [c, names.indexOf(c)]));
    width = names.length;
    const missing = COLUMNS.filter((c) => col[c] === -1);
    if (missing.length) throw new Error(`MOT file is missing columns: ${missing.join(', ')}`);
  }

  function row(f) {
    rows.read++;
    // A row the parser couldn't split cleanly is counted and left out, not guessed at.
    if (f.length !== width) {
      rows.malformed++;
      return;
    }
    if (f[col.test_class_id] !== '4') return;
    rows.cars++;
    const key = RESULT_KEY[f[col.test_result]];
    if (f[col.test_type] !== 'NT' || !key) return;
    const tested = f[col.test_date];
    const firstUse = f[col.first_use_date];
    const age = ageInYears(firstUse, tested);
    if (age === null) {
      rows.skipped++;
      return;
    }
    rows.initial++;
    countOutcome(totals, key);

    const mileage = Number(f[col.test_mileage]);
    const hasMiles = mileage > 0 && mileage < 1_000_000;
    const a = ages[Math.min(age, MAX_AGE)];
    countOutcome(a, key);
    if (hasMiles) {
      a.miles += mileage;
      a.milesN++;
      miles[Math.min(Math.floor(mileage / MILES_BAND), miles.length - 1)]++;
    }
    const month = Number(tested.slice(5, 7)) - 1;
    if (month >= 0 && month < 12) countOutcome(months[month], key);

    const year = Number(firstUse.slice(0, 4));
    const fuel = fuelOf(f[col.fuel_type].trim().toUpperCase());
    const colour = f[col.colour].trim().toUpperCase() || 'NOT STATED';
    if (!colours.has(year)) colours.set(year, new Map());
    tally(colours.get(year), colour);
    if (!fuels.has(year)) fuels.set(year, new Map());
    tally(fuels.get(year), fuel);
    if (age >= RECENT_AGES.from && age <= RECENT_AGES.to) {
      const makeName = f[col.make].trim().toUpperCase();
      if (!recentByMake.has(makeName)) recentByMake.set(own(makeName), new Map());
      tally(recentByMake.get(makeName), colour);
      if (!recentByFuel.has(fuel)) recentByFuel.set(fuel, new Map());
      tally(recentByFuel.get(fuel), colour);
    }

    const areaName = f[col.postcode_area].trim().toUpperCase();
    if (areaName) {
      let area = areas.get(areaName);
      if (!area) areas.set(own(areaName), (area = { ...outcome(), miles: 0, milesN: 0, ages: 0, fuels: new Map() }));
      countOutcome(area, key);
      area.ages += age;
      tally(area.fuels, fuel);
      if (hasMiles) {
        area.miles += mileage;
        area.milesN++;
      }
    }

    const make = f[col.make].trim().toUpperCase();
    const model = f[col.model].trim().toUpperCase();
    const modelKey = `${make}\t${model}`;
    let m = models.get(modelKey);
    if (!m) {
      m = { make: own(make), model: own(model), ...outcome(), miles: 0, milesN: 0, ages: 0, bands: AGE_BANDS.map(outcome) };
      models.set(own(modelKey), m);
    }
    countOutcome(m, key);
    m.ages += age;
    if (hasMiles) {
      m.miles += mileage;
      m.milesN++;
    }
    const band = AGE_BANDS.findIndex((b) => age >= b.from && age <= b.to);
    if (band !== -1) countOutcome(m.bands[band], key);
  }

  function result() {
    const mean = (sum, n) => (n ? Math.round(sum / n) : null);
    const byYear = (map) => {
      const years = [...map.keys()].sort((a, b) => a - b);
      const names = new Map();
      for (const counts of map.values()) for (const [name, n] of counts) tally(names, name, n);
      return {
        years,
        series: [...names]
          .sort((a, b) => b[1] - a[1])
          .map(([name, total]) => ({ name, total, values: years.map((y) => map.get(y).get(name) ?? 0) })),
      };
    };
    const outcomeOf = (o) => ({ tests: o.tests, pass: o.pass, prs: o.prs, fail: o.fail });
    return {
      rows,
      totals,
      ageBands: AGE_BANDS.map(({ label, from, to }) => ({ label, from, to: Number.isFinite(to) ? to : null })),
      byAge: ages.map((a, age) => ({ age, ...outcomeOf(a), meanMiles: mean(a.miles, a.milesN) })),
      byMonth: months.map(outcomeOf),
      mileage: { band: MILES_BAND, counts: miles },
      colours: byYear(colours),
      fuels: byYear(fuels),
      recentColours: {
        ages: RECENT_AGES,
        byMake: [...recentByMake]
          .map(([make, counts]) => ({ make, tests: [...counts.values()].reduce((a, b) => a + b, 0), colours: Object.fromEntries(counts) }))
          .filter((m) => m.tests >= minModelTests)
          .sort((a, b) => b.tests - a.tests),
        byFuel: [...recentByFuel].map(([fuel, counts]) => ({ fuel, colours: Object.fromEntries(counts) })),
      },
      areas: [...areas]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([area, a]) => ({
          area,
          ...outcomeOf(a),
          meanMiles: mean(a.miles, a.milesN),
          meanAge: Math.round((a.ages / a.tests) * 10) / 10,
          fuels: Object.fromEntries(FUEL_IDS.map((id) => [id, a.fuels.get(id) ?? 0])),
        })),
      models: [...models.values()]
        .filter((m) => m.tests >= minModelTests)
        .sort((a, b) => b.tests - a.tests)
        .map((m) => ({
          make: m.make,
          model: m.model,
          ...outcomeOf(m),
          meanMiles: mean(m.miles, m.milesN),
          meanAge: Math.round((m.ages / m.tests) * 10) / 10,
          bands: m.bands.map(outcomeOf),
        })),
      modelsLeftOut: [...models.values()].filter((m) => m.tests < minModelTests).length,
    };
  }

  return { header, row, result, progress: () => ({ ...rows }) };
}

/** Feeds a stream of CSV text into the aggregator. The first line of each stream is its header. */
export async function addCsvStream(aggregator, stream) {
  const decoder = new StringDecoder('utf8');
  let rest = '';
  let first = true;
  const take = (line) => {
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (!line) return;
    const fields = splitCsv(line);
    if (first) {
      aggregator.header(fields);
      first = false;
    } else aggregator.row(fields);
  };
  for await (const chunk of stream) {
    const text = rest + (typeof chunk === 'string' ? chunk : decoder.write(chunk));
    const lines = text.split('\n');
    rest = lines.pop();
    for (const line of lines) take(line);
  }
  take(rest + decoder.end());
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const year = Number(arg('--year') ?? new Date().getFullYear() - 1);
  const aggregator = createMotAggregator();
  const started = Date.now();
  let source;

  if (arg('--csv')) {
    source = resolve(arg('--csv'));
    await addCsvStream(aggregator, createReadStream(source));
  } else {
    let zipPath = arg('--zip') && resolve(arg('--zip'));
    if (!zipPath) {
      source = MOT_URL(year);
      zipPath = join(ROOT, '.cache', `dft_test_result_extracts_${year}.zip`);
      console.log(`Downloading ${source}`);
      await download(source, zipPath);
    }
    const entries = (await listEntries(zipPath)).filter((e) => /\.csv$/i.test(e.name));
    if (entries.length === 0) throw new Error(`No CSV files in ${zipPath}`);
    for (const entry of entries) {
      await addCsvStream(aggregator, await openEntry(zipPath, entry));
      const rows = aggregator.progress();
      console.log(`${entry.name}: ${rows.read.toLocaleString('en-GB')} rows so far (${Math.round((Date.now() - started) / 1000)}s)`);
    }
    source ??= zipPath;
  }

  const summary = {
    year,
    source: MOT_SOURCE_PAGE,
    builtAt: new Date().toISOString(),
    ...aggregator.result(),
  };
  if (summary.rows.initial === 0) throw new Error('No car MOT tests found');
  // A handful of odd rows is normal; more than 1 in 10,000 means the format has changed.
  if (summary.rows.malformed > summary.rows.read / 10_000) {
    throw new Error(`${summary.rows.malformed} of ${summary.rows.read} rows couldn't be read: has the file format changed?`);
  }
  const out = arg('--out') ? resolve(arg('--out')) : join(ROOT, 'data', 'mot', `${year}.json`);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(summary));
  const { rows, totals } = summary;
  console.log(
    `Wrote ${out}: ${rows.initial.toLocaleString('en-GB')} initial car tests of ${rows.read.toLocaleString('en-GB')} rows, ` +
      `${((totals.pass / totals.tests) * 100).toFixed(1)}% passed first time, ${summary.models.length} models`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
