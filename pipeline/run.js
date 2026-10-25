// Fetch -> validate -> slice -> write public/data/.
//
//   npm run data                     download the current CSV from DfT
//   npm run data -- --csv <path>     use a local copy instead
//   npm run data:fixture             tiny test data, for CI checks that mustn't depend on DfT
//
// Set PREVIOUS_META_URL (the deployed meta.json) in CI so an older publication can't replace newer data.

import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse';
import { download, fetchText, findCsvUrl } from './fetch.js';
import { buildFaults } from './faults.js';
import { buildFeatures, home } from './features.js';
import { buildInsights } from './insights.js';
import { joinMot } from './mot-join.js';
import { createAggregator } from './slice.js';
import { CSV_FILE_NAME, SOURCE_PAGE_URL } from './sources.js';
import { SchemaError, validateFile, validateHeader, validateRow } from './validate.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'data');
const CACHE_PATH = join(ROOT, '.cache', CSV_FILE_NAME);
const MOT_DIR = join(ROOT, 'data', 'mot');
const MAX_REPORTED_ROW_ERRORS = 50;

/** Validates and slices a CSV stream. Throws SchemaError listing every problem found. */
export async function processCsv(input, { previousLatestQuarter, minRows, firstQuarter } = {}) {
  const parser = input.pipe(parse({ bom: true, relax_column_count: true, info: true }));
  const rowErrors = [];
  let rowErrorCount = 0;
  const warnings = new Map();
  let quarters;
  let aggregator;
  let rowCount = 0;

  for await (const { record, info } of parser) {
    if (!quarters) {
      quarters = validateHeader(record, { firstQuarter });
      aggregator = createAggregator(quarters);
      continue;
    }
    rowCount++;
    const { errors, warnings: rowWarnings } = validateRow(record, quarters.length);
    rowWarnings.forEach((w) => warnings.set(w, (warnings.get(w) ?? 0) + 1));
    if (errors.length) {
      rowErrorCount++;
      if (rowErrors.length < MAX_REPORTED_ROW_ERRORS) rowErrors.push(`line ${info.lines}: ${errors.join('; ')}`);
      continue;
    }
    aggregator.add(record);
  }

  if (!quarters) throw new SchemaError(['file is empty']);
  if (rowErrorCount > rowErrors.length) rowErrors.push(`...and ${rowErrorCount - rowErrors.length} more bad rows`);
  if (rowErrors.length) throw new SchemaError(rowErrors);
  validateFile({ rowCount, latestQuarter: quarters[0], previousLatestQuarter, minRows });

  const { index, files } = aggregator.result();
  return {
    index,
    files,
    warnings: [...warnings].map(([w, n]) => `${w} (${n} rows)`),
    meta: {
      latestQuarter: quarters[0],
      firstQuarter: quarters[quarters.length - 1],
      rowCount,
      modelFiles: files.length,
    },
  };
}

async function previousLatestQuarter() {
  try {
    const text = process.env.PREVIOUS_META_URL
      ? await fetchText(process.env.PREVIOUS_META_URL)
      : await readFile(join(OUT_DIR, 'meta.json'), 'utf8');
    return JSON.parse(text).latestQuarter;
  } catch {
    return undefined; // First run, or nothing deployed yet.
  }
}

/** The newest yearly MOT summary (written by `npm run mot` and committed), or null. */
export async function latestMotSummary(dir = MOT_DIR) {
  const years = (await readdir(dir).catch(() => [])).filter((f) => /^\d{4}\.json$/.test(f)).sort();
  return years.length ? JSON.parse(await readFile(join(dir, years.at(-1)), 'utf8')) : null;
}

async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data));
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const csvArg = process.argv.indexOf('--csv');
  const minRows = arg('--min-rows') === undefined ? undefined : Number(arg('--min-rows'));
  let csvPath;
  let csvUrl;

  if (csvArg !== -1) {
    csvPath = resolve(process.argv[csvArg + 1]);
    console.log(`Using local CSV ${csvPath}`);
  } else {
    csvUrl = findCsvUrl(await fetchText(SOURCE_PAGE_URL), CSV_FILE_NAME);
    console.log(`Downloading ${csvUrl}`);
    await download(csvUrl, CACHE_PATH);
    csvPath = CACHE_PATH;
  }

  // --fresh skips the "not older than before" check, e.g. when swapping real data for the fixture.
  const previous = process.argv.includes('--fresh') ? undefined : await previousLatestQuarter();
  const result = await processCsv(createReadStream(csvPath), { previousLatestQuarter: previous, minRows });
  result.warnings.forEach((w) => console.warn(`warning: ${w}`));

  await rm(OUT_DIR, { recursive: true, force: true });
  await writeJson(join(OUT_DIR, 'index.json'), result.index);
  await writeJson(join(OUT_DIR, 'meta.json'), {
    ...result.meta,
    sourcePage: SOURCE_PAGE_URL,
    csvUrl: csvUrl ?? null,
    builtAt: new Date().toISOString(),
  });
  for (const { path, data } of result.files) await writeJson(join(OUT_DIR, path), data);
  const insights = buildInsights(result);
  await writeJson(join(OUT_DIR, 'insights.json'), insights);

  const mot = await latestMotSummary();
  let joined = null;
  if (mot) {
    joined = joinMot(mot, result.index);
    // Busy times and mileage spreads are only for the tools, so they get their own files; each
    // make's spotlight goes in its own file, from pipeline/registrations.js.
    const { busy, ageMiles, spotlight, ...site } = joined;
    await writeJson(join(OUT_DIR, 'mot.json'), site);
    if (busy) {
      const geo = JSON.parse(await readFile(join(ROOT, 'data', 'geo', 'gb.json'), 'utf8'));
      const names = Object.fromEntries(geo.areas.map((a) => [a.area, a.name]));
      const areas = Object.fromEntries(Object.entries(busy.areas).filter(([area]) => names[area]).map(([area, b]) => [area, { name: names[area], ...b }]));
      await writeJson(join(OUT_DIR, 'tools', 'mot-times.json'), { year: mot.year, note: busy.note, areas });
    }
    if (ageMiles) await writeJson(join(OUT_DIR, 'tools', 'mileage.json'), { year: mot.year, ...ageMiles });
    const share = joined.match.testsMatched / joined.match.testsInModels;
    console.log(`Joined ${mot.year} MOT results: ${(share * 100).toFixed(1)}% of tests matched to a DVLA model`);
  } else {
    console.log('No MOT summary in data/mot/, so no mot.json');
  }

  const features = buildFeatures({ files: result.files, insights, mot: joined });
  // Why cars fail: the failure-reason summary for the same MOT year, if it's been built.
  const faultsPath = mot && join(MOT_DIR, `${mot.year}-faults.json`);
  if (faultsPath && existsSync(faultsPath)) features.faults = buildFaults(JSON.parse(await readFile(faultsPath, 'utf8')), joined, result.index);
  for (const [name, data] of Object.entries(features)) await writeJson(join(OUT_DIR, 'features', `${name}.json`), data);
  await writeJson(
    join(OUT_DIR, 'home.json'),
    home({ insights, electric: features['electric-cars'], mot: joined, index: result.index }),
  );
  console.log(`Wrote features: ${Object.keys(features).join(', ')}`);

  console.log(
    `Wrote ${result.files.length} model files for ${result.index.makes.length} makes ` +
      `(${result.meta.firstQuarter} to ${result.meta.latestQuarter}, ${result.meta.rowCount} rows read)`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof SchemaError ? err.message : err);
    process.exitCode = 1;
  });
}
