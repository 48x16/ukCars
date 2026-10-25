// New Minis, year by year since 2004 -> public/data/features/mini.json.
//
//   npm run mini              download the DfT CSV
//   npm run mini -- --cached  use the copy in .cache/
//   npm run mini -- --fixture tiny test file, for CI (part of `npm run data:fixture`)
//
// Source: DfT and DVLA, VEH0160 (cars registered for the first time), Great Britain. The GB
// file goes back to 2001; the UK one only to 2014. First registrations are the nearest public
// figure to new cars sold. DVLA names the model but not the body, so convertibles, coupés and
// the like are counted with their hatch (a Cooper convertible is a Cooper).

import { existsSync } from 'node:fs';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_PAGE_URL } from './sources.js';
import { download, fetchText, findCsvUrl } from './fetch.js';
import { splitCsv } from './mot.js';
import { expandSeries } from '../src/series.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CSV_FILE_NAME = 'df_VEH0160_GB.csv';
export const START_YEAR = 2001;
/** A model counts as on sale in a year with at least this many new cars (stragglers aside). */
export const ON_SALE = 100;
/** One-off editions, shown together. */
const SPECIAL_EDITIONS = ['MINI CHALLENGE', 'MINI GT', 'MINI INSPIRED', 'MINI PADDY HOPKIRK'];
const SPECIAL = { key: 'SPECIAL', id: 'special', label: 'Special editions' };
/** The original, built by Rover until October 2000: its last new cars were registered in 2001. */
const CLASSIC = { key: 'ROVER MINI', id: 'classic', label: 'Classic Mini' };

/** The model group a DVLA make and generic model belong to, or null if it isn't a Mini (or its model wasn't recorded). */
export function groupOf(make, genModel) {
  if (make === 'ROVER' && genModel === CLASSIC.key) return CLASSIC;
  if (make !== 'MINI' || genModel === 'MINI MODEL MISSING') return null;
  if (SPECIAL_EDITIONS.includes(genModel)) return SPECIAL;
  const name = genModel.replace(/^MINI /, '');
  return {
    key: genModel,
    id: name.toLowerCase().replace(/\W+/g, '-'),
    label: name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
  };
}

/**
 * Sums VEH0160's quarterly columns into calendar years for each Mini model, from START_YEAR.
 * A year with fewer than four quarters published is marked partial.
 */
export function buildMini(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const header = splitCsv(lines[0]).map((h) => h.trim());
  const fixed = ['BodyType', 'Make', 'GenModel', 'Model', 'Fuel'];
  if (fixed.some((h, i) => header[i] !== h)) throw new Error(`VEH0160 columns changed: ${header.slice(0, 5).join(', ')}`);
  const quarters = header.slice(fixed.length);
  if (quarters.some((q) => !/^\d{4} Q[1-4]$/.test(q))) throw new Error('VEH0160 has a column that is not a quarter');

  const latest = [...quarters].sort().at(-1);
  const lastYear = Number(latest.slice(0, 4));
  const years = [];
  for (let y = START_YEAR; y <= lastYear; y++) years.push(y);
  const quartersIn = (y) => quarters.filter((q) => q.startsWith(String(y))).length;
  if (years.slice(0, -1).some((y) => quartersIn(y) !== 4)) throw new Error('VEH0160 is missing quarters before the latest year');

  const zeros = () => years.map(() => 0);
  const firstQuarter = quarters.indexOf([...quarters].sort()[0]);
  const byModel = new Map(); // key -> { group, values, before: new cars in the file's first quarter }
  const electric = zeros();
  const totals = zeros();
  let minis = 0;
  for (const line of lines.slice(1)) {
    const f = splitCsv(line);
    if (f[0] !== 'Cars' || (f[1] !== 'MINI' && f[1] !== 'ROVER')) continue;
    const group = groupOf(f[1], f[2]);
    if (!group && f[1] !== 'MINI') continue;
    if (f[1] === 'MINI') minis++;
    let model = group && byModel.get(group.key);
    if (group && !model) byModel.set(group.key, (model = { group, values: zeros(), before: 0 }));
    quarters.forEach((q, i) => {
      const y = years.indexOf(Number(q.slice(0, 4)));
      const n = Number(f[fixed.length + i]); // [c], 1 to 4 cars, counts as zero
      if (!Number.isFinite(n)) return;
      if (model && i === firstQuarter) model.before += n;
      if (y === -1) return;
      if (model) model.values[y] += n;
      totals[y] += n; // unrecorded models count here, not as a model
      if (f[4] === 'Battery electric') electric[y] += n;
    });
  }
  if (minis === 0) throw new Error('VEH0160 has no Mini cars');
  const full = totals.slice(0, quartersIn(lastYear) === 4 ? undefined : -1);
  // Real years run from about 12,000 (2001, the launch year) to 68,000; the test fixture has fewer rows.
  if (full.some((t) => t < 5_000 || t > 200_000)) throw new Error(`Implausible yearly Mini totals: ${full.join(', ')}`);

  const models = [...byModel.values()]
    .map(({ group, values, before }) => {
      const onSale = years.filter((_, i) => values[i] >= ON_SALE);
      const special = group === SPECIAL;
      const first = onSale[0];
      const last = onSale.at(-1);
      return {
        id: group.id,
        label: group.label,
        values,
        // Launches and farewells: not for one-off editions, nor for models already on sale when the data starts.
        launched: special || first === undefined || before > 0 ? null : first,
        ended: special || last === undefined || last >= lastYear - 1 ? null : last,
      };
    })
    .filter((m) => m.values.some((v) => v > 0))
    .sort((a, b) => a.values.findIndex((v) => v >= ON_SALE) - b.values.findIndex((v) => v >= ON_SALE) || b.values.reduce((s, v) => s + v) - a.values.reduce((s, v) => s + v));
  const firstElectric = years.find((_, i) => electric[i] >= ON_SALE) ?? null;

  return {
    source: SOURCE_PAGE_URL,
    file: CSV_FILE_NAME,
    years,
    latestQuarter: latest,
    partial: quartersIn(lastYear) < 4 ? { year: lastYear, quarters: quartersIn(lastYear) } : null,
    totals,
    electric,
    firstElectric,
    models,
  };
}

/**
 * Licensed and declared off the road (SORN), quarter by quarter since 2014, from the per-model
 * files the main pipeline writes (VEH0120, UK). Grouped as on the road; suppressed counts as zero.
 */
export function buildFleet(files) {
  if (!files.length) return null;
  const quarters = files[0].quarters;
  const groups = new Map();
  for (const file of files) {
    const group = groupOf(file.make, file.genModel);
    if (!group) continue;
    if (!groups.has(group.key)) groups.set(group.key, { id: group.id, label: group.label, licensed: quarters.map(() => 0), sorn: quarters.map(() => 0) });
    const g = groups.get(group.key);
    for (const v of file.variants) {
      expandSeries(v.licensed, quarters.length).forEach((n, i) => (g.licensed[i] += n ?? 0));
      expandSeries(v.sorn, quarters.length).forEach((n, i) => (g.sorn[i] += n ?? 0));
    }
  }
  return {
    quarters,
    models: [...groups.values()]
      .sort((a, b) => b.licensed.at(-1) + b.sorn.at(-1) - (a.licensed.at(-1) + a.sorn.at(-1))),
  };
}

/** Minis need this many MOT tests from a first-use year for its favourite colour to count. */
export const MIN_COLOUR_TESTS = 100;

/**
 * Minis at the MOT, from the yearly summary (pipeline/mot.js): where they're tested, engine
 * sizes, colours (overall, against all cars, and the favourite of each year's survivors) and
 * mileage. Null if the summary has no Mini spotlight.
 */
export function buildMot(summary) {
  const spot = summary?.spotlight?.MINI;
  if (!spot?.tests) return null;
  const sumColours = ({ series }) => Object.fromEntries(series.map((s) => [s.name, s.total]));
  const allTests = Object.fromEntries(summary.areas.map((a) => [a.area, a.tests]));
  const byYear = {};
  spot.colours.years.forEach((year, i) => {
    const counts = spot.colours.series.map((s) => [s.name, s.values[i]]).filter(([name]) => name !== 'NOT STATED');
    const tests = counts.reduce((n, [, v]) => n + v, 0);
    if (tests < MIN_COLOUR_TESTS) return;
    const [top, n] = counts.sort((a, b) => b[1] - a[1])[0];
    byYear[year] = { colour: top, share: n / tests, tests };
  });
  return {
    year: summary.year,
    tests: spot.tests,
    areas: Object.entries(spot.areas)
      .filter(([area]) => allTests[area])
      .map(([area, tests]) => ({ area, tests, all: allTests[area] })),
    engines: spot.engines,
    colours: { minis: sumColours(spot.colours), allCars: sumColours(summary.colours), byYear },
    mileage: spot.mileage,
  };
}

async function main() {
  let text;
  if (process.argv.includes('--fixture')) {
    text = await readFile(join(ROOT, 'test', 'fixtures', 'mini_VEH0160_GB.csv'), 'utf8');
  } else {
    const path = join(ROOT, '.cache', CSV_FILE_NAME);
    if (!process.argv.includes('--cached')) {
      const url = findCsvUrl(await fetchText(SOURCE_PAGE_URL), CSV_FILE_NAME);
      console.log(`Downloading ${url}`);
      await download(url, path);
    }
    text = await readFile(path, 'utf8');
  }
  const mini = buildMini(text);
  const models = join(ROOT, 'public', 'data', 'models');
  const paths = [
    ...(existsSync(join(models, 'mini')) ? (await readdir(join(models, 'mini'))).map((f) => join(models, 'mini', f)) : []),
    join(models, 'rover', 'rover-mini.json'),
  ].filter((p) => existsSync(p));
  mini.fleet = buildFleet(await Promise.all(paths.map(async (p) => JSON.parse(await readFile(p, 'utf8')))));
  const motDir = join(ROOT, 'data', 'mot');
  const motFile = existsSync(motDir) ? (await readdir(motDir)).filter((f) => /^\d{4}\.json$/.test(f)).sort().at(-1) : undefined;
  mini.mot = motFile ? buildMot(JSON.parse(await readFile(join(motDir, motFile), 'utf8'))) : null;
  const out = join(ROOT, 'public', 'data', 'features', 'mini.json');
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(mini));
  console.log(`Wrote ${out}: ${mini.years[0]} to ${mini.latestQuarter}, ${mini.models.length} models`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
