// The Mini story -> public/data/features/mini.json, written by pipeline/registrations.js.
//
// Source: DfT and DVLA, VEH0160 (cars registered for the first time), Great Britain. The GB
// file goes back to 2001; the UK one only to 2014. First registrations are the nearest public
// figure to new cars sold. DVLA names the model but not the body, so convertibles, coupés and
// the like are counted with their hatch (a Cooper convertible is a Cooper).

import { SOURCE_PAGE_URL } from './sources.js';
import { splitCsv } from './mot.js';
import { expandSeries } from '../src/series.js';

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
 * A model's launch and farewell: its first and last years with at least ON_SALE new cars. Not
 * for one-off editions, nor a launch for a model already on sale when the data starts (`before`:
 * its new cars in the file's first quarter), nor a farewell in the last two years (it may be
 * between generations).
 */
export function lifecycle(values, years, { before = 0, lastYear = years.at(-1), special = false } = {}) {
  const onSale = years.filter((_, i) => values[i] >= ON_SALE);
  const first = onSale[0];
  const last = onSale.at(-1);
  return {
    launched: special || first === undefined || before > 0 ? null : first,
    ended: special || last === undefined || last >= lastYear - 1 ? null : last,
  };
}

const sum = (values) => values.reduce((a, b) => a + b, 0);
/** The first year a model was on sale; never (a few imports, say) sorts last. */
const onSaleFrom = (m) => {
  const i = m.values.findIndex((v) => v >= ON_SALE);
  return i === -1 ? Infinity : i;
};
/** Oldest first, then biggest. */
export const byLaunch = (a, b) => onSaleFrom(a) - onSaleFrom(b) || sum(b.values) - sum(a.values);

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
    .map(({ group, values, before }) => ({
      id: group.id,
      label: group.label,
      values,
      ...lifecycle(values, years, { before, lastYear, special: group === SPECIAL }),
    }))
    .filter((m) => m.values.some((v) => v > 0))
    .sort(byLaunch);
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
export function buildFleet(files, groupFor = (file) => groupOf(file.make, file.genModel)) {
  if (!files.length) return null;
  const quarters = files[0].quarters;
  const groups = new Map();
  for (const file of files) {
    const group = groupFor(file);
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

/** A make needs this many MOT tests from a first-use year for its favourite colour to count. */
export const MIN_COLOUR_TESTS = 100;

/**
 * A make at the MOT, from the yearly summary (pipeline/mot.js): where it's tested, engine
 * sizes, colours (overall, against all cars, and the favourite of each year's survivors) and
 * mileage. `make` is DVSA's name. Null if the summary has no spotlight on it.
 */
export function buildMot(summary, make = 'MINI') {
  const spot = summary?.spotlight?.[make];
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
    colours: { make: sumColours(spot.colours), allCars: sumColours(summary.colours), byYear },
    mileage: spot.mileage,
  };
}

/** The whole Mini story: new cars by year, plus the fleet (`modelFiles`: Mini and Rover Mini) and the MOT. */
export function buildMiniStory(text, { modelFiles = [], motSummary = null } = {}) {
  return { ...buildMini(text), fleet: buildFleet(modelFiles), mot: buildMot(motSummary) };
}
