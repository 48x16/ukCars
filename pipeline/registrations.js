// New cars registered since 2001 -> the stories and per-make files built on them:
//
//   public/data/features/suv.json            The SUV takeover: body styles by year
//   public/data/features/diesel.json         Peak diesel: fuels by year
//   public/data/features/plates.json         Plate days: new cars each quarter
//   public/data/features/arrivals.json       The new arrivals: Chinese makes by year
//   public/data/features/mini.json           Mini, year by year (pipeline/mini.js)
//   public/data/registrations/<make>.json    Any make, year by year, with its MOT spotlight
//   public/data/registrations/index.json     The makes that have one
//
//   npm run registrations              download the DfT CSV
//   npm run registrations -- --cached  use the copy in .cache/
//   npm run registrations -- --fixture tiny test file, for CI (part of `npm run data:fixture`)
//
// Source: DfT and DVLA, VEH0160 (cars registered for the first time), Great Britain, from 2001.
// Runs after `npm run data`, which writes the per-model licensing files and index this reads
// (and empties public/data first).

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FUEL_GROUPS, fuelGroupOf } from '../src/series.js';
import { BODY_STYLES, bodyOf, isMotorbike, NOT_A_MAKE, ORIGINS, originOf } from './categories.js';
import { download, fetchText, findCsvUrl } from './fetch.js';
import { buildFleet, buildMiniStory, buildMot, byLaunch, CSV_FILE_NAME, lifecycle, ON_SALE, START_YEAR } from './mini.js';
import { MAKE_ALIASES } from './mot-join.js';
import { splitCsv } from './mot.js';
import { slugify } from './slice.js';
import { SOURCE_PAGE_URL } from './sources.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXED = ['BodyType', 'Make', 'GenModel', 'Model', 'Fuel'];
/** Makes get a "year by year" page with at least this many new cars since 2001. */
export const MIN_MAKE_TOTAL = 1_000;
/** Models shown as leaders of each body style, and the top arrivals. */
const LEADERS = 6;
/** SAIC's MGs start here: earlier MGs are MG Rover's, and British. */
const SAIC_MG_FROM = 2011;

const zeros = (n) => new Array(n).fill(0);
const sum = (values) => values.reduce((a, b) => a + b, 0);
const isModelMissing = (genModel) => /MODEL MISSING$/.test(genModel);

/** Title case as on the rest of the site, keeping short words (BMW, GTI) and hyphen parts (CR-V) in capitals. */
export function titleCase(name) {
  return name
    .split(' ')
    .map((w) =>
      w
        .split('-')
        .map((p) => (/\d/.test(p) || p.length <= 3 ? p : p.charAt(0) + p.slice(1).toLowerCase()))
        .join('-'),
    )
    .join(' ');
}

/** A model's name without its make: "LAND ROVER RANGE ROVER EVOQUE" -> "Range Rover Evoque". */
export const modelLabel = (make, genModel) => titleCase(genModel.startsWith(`${make} `) ? genModel.slice(make.length + 1) : genModel);

/**
 * One pass over VEH0160: years from START_YEAR (the latest perhaps partial), and totals by
 * quarter, fuel, body style, origin and model.
 */
export function aggregateRegistrations(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const header = splitCsv(lines[0]).map((h) => h.trim());
  if (FIXED.some((h, i) => header[i] !== h)) throw new Error(`VEH0160 columns changed: ${header.slice(0, 5).join(', ')}`);
  const columns = header.slice(FIXED.length);
  if (columns.some((q) => !/^\d{4} Q[1-4]$/.test(q))) throw new Error('VEH0160 has a column that is not a quarter');
  const quarters = columns.filter((q) => Number(q.slice(0, 4)) >= START_YEAR).sort();
  const latestQuarter = quarters.at(-1);
  const lastYear = Number(latestQuarter.slice(0, 4));
  const years = [];
  for (let y = START_YEAR; y <= lastYear; y++) years.push(y);
  const quartersIn = (y) => quarters.filter((q) => q.startsWith(String(y))).length;
  if (years.slice(0, -1).some((y) => quartersIn(y) !== 4)) throw new Error('VEH0160 is missing quarters before the latest year');
  // Where each kept quarter sits in a row, and which year it belongs to.
  const cells = quarters.map((q) => ({ at: FIXED.length + columns.indexOf(q), y: years.indexOf(Number(q.slice(0, 4))) }));
  // The file's first quarter: a model with new cars here was on sale before the data starts.
  const firstColumn = FIXED.length + columns.indexOf([...columns].sort()[0]);

  const quarterly = zeros(quarters.length);
  const totals = zeros(years.length);
  const fuels = Object.fromEntries(FUEL_GROUPS.map((g) => [g.id, zeros(years.length)]));
  const bodies = Object.fromEntries([...BODY_STYLES.map((b) => b.id), 'none'].map((id) => [id, zeros(years.length)]));
  const origins = Object.fromEntries(ORIGINS.map((o) => [o.id, zeros(years.length)]));
  const models = new Map(); // make \t genModel -> { make, genModel, values, electric, bodies, origin, before }
  for (const line of lines.slice(1)) {
    const f = splitCsv(line);
    if (f[0] !== 'Cars') continue;
    const [, dvlaMake, dvlaGenModel, model, fuel] = f;
    // DVLA started using "MERCEDES-BENZ" alongside "MERCEDES" in 2025: they're the same make.
    const make = dvlaMake === 'MERCEDES-BENZ' ? 'MERCEDES' : dvlaMake;
    const genModel = dvlaMake === 'MERCEDES-BENZ' ? dvlaGenModel.replace(/^MERCEDES-BENZ /, 'MERCEDES ') : dvlaGenModel;
    if (isMotorbike(make, genModel)) continue;
    const key = `${make}\t${genModel}`;
    let m = models.get(key);
    if (!m) models.set(key, (m = { make, genModel, values: zeros(years.length), electric: zeros(years.length), bodies: {}, before: 0 }));
    const group = fuelGroupOf(fuel);
    const first = Number(f[firstColumn]);
    if (Number.isFinite(first)) m.before += first;
    cells.forEach(({ at, y }, qi) => {
      const n = Number(f[at]); // [c], 1 to 4 cars, counts as zero
      if (!Number.isFinite(n) || n === 0) return;
      const year = years[y];
      quarterly[qi] += n;
      totals[y] += n;
      fuels[group][y] += n;
      m.values[y] += n;
      if (group === 'electric') m.electric[y] += n;
      const body = bodyOf(genModel, model, year, make) ?? 'none';
      bodies[body][y] += n;
      (m.bodies[body] ??= zeros(years.length))[y] += n;
      const origin = make === 'MG' && year < SAIC_MG_FROM ? 'british' : originOf(make, genModel);
      origins[origin][y] += n;
    });
  }
  if (!models.size) throw new Error('VEH0160 has no cars');
  return {
    years,
    quarters,
    latestQuarter,
    partial: quartersIn(lastYear) < 4 ? { year: lastYear, quarters: quartersIn(lastYear) } : null,
    quarterly,
    totals,
    fuels,
    bodies,
    origins,
    models: [...models.values()],
  };
}

const meta = (agg) => ({ source: SOURCE_PAGE_URL, years: agg.years, latestQuarter: agg.latestQuarter, partial: agg.partial, totals: agg.totals });

/** The SUV takeover: new cars by body style, and each style's biggest models. */
export function suvStory(agg) {
  const leaders = (body) =>
    agg.models
      .filter((m) => m.bodies[body])
      .map((m) => ({ make: m.make, label: titleCase(m.genModel), values: m.bodies[body] }))
      .sort((a, b) => sum(b.values) - sum(a.values))
      .slice(0, LEADERS);
  return {
    ...meta(agg),
    bodies: BODY_STYLES.map((b) => ({ ...b, values: agg.bodies[b.id], leaders: leaders(b.id) })),
    unclassified: agg.bodies.none,
  };
}

/** Peak diesel: new cars by fuel. */
export function dieselStory(agg) {
  return { ...meta(agg), fuels: FUEL_GROUPS.map((g) => ({ id: g.id, label: g.label, values: agg.fuels[g.id] })) };
}

/** Plate days: new cars each quarter. */
export function platesStory(agg) {
  return { source: SOURCE_PAGE_URL, quarters: agg.quarters, values: agg.quarterly };
}

/** The new arrivals: Chinese makes (and SAIC's MGs) by year, and their biggest models. */
export function arrivalsStory(agg) {
  const chinese = (m, y) => (m.make === 'MG' ? agg.years[y] >= SAIC_MG_FROM : originOf(m.make, m.genModel) === 'chinese');
  const byMake = new Map();
  const models = [];
  for (const m of agg.models) {
    const values = m.values.map((v, y) => (chinese(m, y) ? v : 0));
    if (!sum(values)) continue;
    if (!byMake.has(m.make)) byMake.set(m.make, zeros(agg.years.length));
    values.forEach((v, y) => (byMake.get(m.make)[y] += v));
    if (!isModelMissing(m.genModel)) models.push({ make: m.make, label: titleCase(m.genModel), values });
  }
  const last = agg.partial ? agg.years.length - 2 : agg.years.length - 1;
  return {
    ...meta(agg),
    chinese: agg.origins.chinese,
    makes: [...byMake]
      .map(([make, values]) => ({ make, label: make === 'MG' ? 'MG' : titleCase(make), values, first: agg.years.find((_, y) => values[y] >= ON_SALE) ?? null }))
      .filter((m) => m.first !== null)
      .sort((a, b) => b.values[last] - a.values[last]),
    models: models.sort((a, b) => b.values[last] - a.values[last]).slice(0, LEADERS * 2),
  };
}

/** Each model's rank among all models, year by year (1 = best seller; null if none sold). */
export function rankModels(agg) {
  const ranked = agg.models.filter((m) => !isModelMissing(m.genModel) && !NOT_A_MAKE.some((re) => re.test(m.make)));
  const ranks = new Map(ranked.map((m) => [m, agg.years.map(() => null)]));
  agg.years.forEach((_, y) => {
    [...ranked]
      .filter((m) => m.values[y] > 0)
      .sort((a, b) => b.values[y] - a.values[y])
      .forEach((m, i) => (ranks.get(m)[y] = i + 1));
  });
  return ranks;
}

/**
 * One make, year by year: the shape of mini.json, so the same page draws it. `slugs` maps
 * DVLA's make and model names to the site's slugs (from the licensing index), `fleetFiles` are
 * its per-model licensing files and `mot` its MOT spotlight (or null).
 */
export function makeStory(agg, make, { ranks, slugs = {}, fleetFiles = [], mot = null } = {}) {
  const rows = agg.models.filter((m) => m.make === make);
  const totals = zeros(agg.years.length);
  const electric = zeros(agg.years.length);
  for (const m of rows) m.values.forEach((v, y) => ((totals[y] += v), (electric[y] += m.electric[y])));
  const lastYear = agg.years.at(-1);
  const models = rows
    .filter((m) => !isModelMissing(m.genModel) && sum(m.values) > 0)
    .map((m) => ({
      id: slugs.models?.[m.genModel] ?? slugify(m.genModel),
      name: m.genModel,
      label: modelLabel(make, m.genModel),
      values: m.values,
      ranks: ranks?.get(m) ?? null,
      ...lifecycle(m.values, agg.years, { before: m.before, lastYear }),
    }))
    .sort(byLaunch);
  return {
    ...meta(agg),
    make,
    slug: slugs.make ?? slugify(make),
    label: titleCase(make),
    totals,
    electric,
    firstElectric: agg.years.find((_, y) => electric[y] >= ON_SALE) ?? null,
    models,
    fleet: buildFleet(fleetFiles, (file) => ({ key: file.genModel, id: slugs.models?.[file.genModel] ?? slugify(file.genModel), label: modelLabel(make, file.genModel) })),
    mot,
  };
}

/** The makes worth a page: enough new cars, a real make, and not a motorbike. */
export function storyMakes(agg) {
  const byMake = new Map();
  for (const m of agg.models) byMake.set(m.make, (byMake.get(m.make) ?? 0) + sum(m.values));
  return [...byMake]
    .filter(([make, total]) => total >= MIN_MAKE_TOTAL && !NOT_A_MAKE.some((re) => re.test(make)))
    .sort((a, b) => b[1] - a[1])
    .map(([make, total]) => ({ make, total }));
}

/** DVSA's make names that mean a DVLA make (the reverse of MAKE_ALIASES), for the MOT spotlight. */
const dvsaNames = (make) => [make, ...Object.entries(MAKE_ALIASES).filter(([, to]) => to === make).map(([from]) => from)];

async function readJson(path) {
  return existsSync(path) ? JSON.parse(await readFile(path, 'utf8')) : null;
}

async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data));
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
  const data = join(ROOT, 'public', 'data');
  const modelsDir = join(data, 'models');
  const readModels = async (makeSlug) => {
    const dir = join(modelsDir, makeSlug);
    return existsSync(dir) ? Promise.all((await readdir(dir)).map((f) => readJson(join(dir, f)))) : [];
  };
  const motDir = join(ROOT, 'data', 'mot');
  const motFile = existsSync(motDir) ? (await readdir(motDir)).filter((f) => /^\d{4}\.json$/.test(f)).sort().at(-1) : undefined;
  const motSummary = motFile ? await readJson(join(motDir, motFile)) : null;
  const index = await readJson(join(data, 'index.json'));

  const agg = aggregateRegistrations(text);
  await writeJson(join(data, 'features', 'suv.json'), suvStory(agg));
  await writeJson(join(data, 'features', 'diesel.json'), dieselStory(agg));
  await writeJson(join(data, 'features', 'plates.json'), platesStory(agg));
  await writeJson(join(data, 'features', 'arrivals.json'), arrivalsStory(agg));

  const roverMini = await readJson(join(modelsDir, 'rover', 'rover-mini.json'));
  const mini = buildMiniStory(text, { modelFiles: [...(await readModels('mini')), ...(roverMini ? [roverMini] : [])], motSummary });
  await writeJson(join(data, 'features', 'mini.json'), mini);

  const ranks = rankModels(agg);
  const makes = storyMakes(agg);
  const listed = [];
  for (const { make, total } of makes) {
    const known = index?.makes.find((m) => m.name === make);
    const slugs = { make: known?.slug, models: Object.fromEntries((known?.models ?? []).map((m) => [m.name, m.slug])) };
    // DVSA may use more than one name for a make; the one with the most tests stands for it.
    const dvsa = dvsaNames(make)
      .filter((name) => motSummary?.spotlight?.[name])
      .sort((a, b) => motSummary.spotlight[b].tests - motSummary.spotlight[a].tests)[0];
    const story = makeStory(agg, make, {
      ranks,
      slugs,
      fleetFiles: known ? await readModels(known.slug) : [],
      mot: dvsa ? buildMot(motSummary, dvsa) : null,
    });
    await writeJson(join(data, 'registrations', `${story.slug}.json`), story);
    listed.push({ make, slug: story.slug, label: story.label, total });
  }
  await writeJson(join(data, 'registrations', 'index.json'), { latestQuarter: agg.latestQuarter, makes: listed });
  console.log(`Wrote the SUV, diesel, plates, arrivals and Mini stories and ${listed.length} makes, ${agg.years[0]} to ${agg.latestQuarter}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
