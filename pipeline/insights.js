// Whole-fleet stories for the Insights page, built from the per-model files the slicer writes.
// Suppressed counts ([c], 1 to 4 vehicles) are counted as zero here: at fleet scale that's
// far below the precision anyone reads, and it stops one cell blanking a national total.

import { expandSeries, FUEL_GROUPS, fuelGroupOf } from '../src/series.js';
import { ARRIVALS, HOT_HATCHES, isMotorbike, LOST, NOT_A_MAKE, SUPERCAR_MAKES } from './categories.js';

const sum = (values) => values.reduce((a, b) => a + b, 0);
const add = (a, b) => a.map((v, i) => v + b[i]);
const zeros = (n) => new Array(n).fill(0);
const counted = (series, n) => expandSeries(series, n).map((v) => v ?? 0);

export const DEFAULTS = {
  years: 5, // window for "dying" and "growing"
  minBase: 10_000, // licensed at the start of the window, so a percentage means something
  minSorn: 2_000, // off the road now, for the garage queens
  top: 10,
  topMakes: 15,
  supercarMakes: SUPERCAR_MAKES,
  arrivals: ARRIVALS,
  lost: LOST,
  hotHatches: HOT_HATCHES,
};

/** One row per GenModel: licensed and SORN totals per quarter. */
export function modelTotals(files) {
  return files.map(({ path, data }) => {
    const [, makeSlug, file] = path.split('/');
    const n = data.quarters.length;
    const licensed = data.variants.reduce((acc, v) => add(acc, counted(v.licensed, n)), zeros(n));
    const sorn = data.variants.reduce((acc, v) => add(acc, counted(v.sorn, n)), zeros(n));
    return { make: data.make, name: data.genModel, makeSlug, modelSlug: file.replace(/\.json$/, ''), licensed, sorn };
  });
}

export function fleetByFuel(files, n) {
  const totals = new Map(FUEL_GROUPS.map((g) => [g.id, zeros(n)]));
  for (const { data } of files) {
    for (const v of data.variants) {
      const id = fuelGroupOf(v.fuel);
      totals.set(id, add(totals.get(id), counted(v.licensed, n)));
    }
  }
  return FUEL_GROUPS.map((g) => ({ id: g.id, label: g.label, values: totals.get(g.id) }));
}

function peakOf(values, quarters) {
  const peak = Math.max(...values);
  return { peak, peakQuarter: quarters[values.indexOf(peak)] };
}

/** The comparison window in quarters: `years`, or as much history as there is. */
const windowQuarters = (quarters, years) => Math.min(years * 4, quarters.length - 1);

/** Percentage change over the window, for models big enough at its start. */
function movers(models, quarters, { years, minBase, top }, direction) {
  const last = quarters.length - 1;
  const start = last - windowQuarters(quarters, years);
  return models
    .filter((m) => m.licensed[start] >= minBase)
    .map((m) => ({
      make: m.make,
      name: m.name,
      makeSlug: m.makeSlug,
      modelSlug: m.modelSlug,
      from: m.licensed[start],
      latest: m.licensed[last],
      change: (m.licensed[last] - m.licensed[start]) / m.licensed[start],
      ...peakOf(m.licensed, quarters),
      values: m.licensed,
    }))
    .sort((a, b) => direction * (a.change - b.change) || b.from - a.from)
    .slice(0, top);
}

function garageQueens(models, quarters, { minSorn, top }) {
  const last = quarters.length - 1;
  return models
    .filter((m) => m.sorn[last] >= minSorn)
    .map((m) => ({
      make: m.make,
      name: m.name,
      makeSlug: m.makeSlug,
      modelSlug: m.modelSlug,
      licensed: m.licensed[last],
      sorn: m.sorn[last],
      share: m.sorn[last] / (m.sorn[last] + m.licensed[last]),
    }))
    .sort((a, b) => b.share - a.share || b.sorn - a.sorn)
    .slice(0, top);
}

/** Rank of each make at the first and latest quarter, for the makes in the top N at either end. */
function makeRanks(byMake, { topMakes }) {
  const all = [...byMake.values()].map((t) => ({
    make: t.make,
    makeSlug: t.makeSlug,
    first: t.licensed[0],
    latest: t.licensed.at(-1),
  }));
  const rankBy = (key) => new Map([...all].sort((a, b) => b[key] - a[key]).map((t, i) => [t.make, i + 1]));
  const firstRank = rankBy('first');
  const latestRank = rankBy('latest');
  return all
    .filter((t) => firstRank.get(t.make) <= topMakes || latestRank.get(t.make) <= topMakes)
    .map((t) => ({ ...t, firstRank: firstRank.get(t.make), latestRank: latestRank.get(t.make) }))
    .sort((a, b) => a.latestRank - b.latestRank);
}

/** Licensed and SORN totals per make, per quarter. */
export function makeTotals(models, n) {
  const byMake = new Map();
  for (const m of models) {
    const t = byMake.get(m.make) ?? { make: m.make, makeSlug: m.makeSlug, licensed: zeros(n), sorn: zeros(n) };
    t.licensed = add(t.licensed, m.licensed);
    t.sorn = add(t.sorn, m.sorn);
    byMake.set(m.make, t);
  }
  return byMake;
}

/** A make's licensed cars from the first quarter to the latest, shaped like a mover card. */
function makeCard(t, quarters) {
  const from = t.licensed[0];
  const latest = t.licensed.at(-1);
  return {
    name: t.make,
    makeSlug: t.makeSlug,
    from,
    latest,
    change: from ? (latest - from) / from : null,
    ...peakOf(t.licensed, quarters),
    values: t.licensed,
  };
}

const isMake = (name) => !NOT_A_MAKE.some((re) => re.test(name));

function supercars(byMake, quarters, makes) {
  return makes
    .filter((name) => byMake.has(name))
    .map((name) => makeCard(byMake.get(name), quarters))
    .sort((a, b) => b.latest - a.latest);
}

function arrivals(byMake, quarters, { maxStart, minNow }) {
  return [...byMake.values()]
    .filter((t) => isMake(t.make) && t.licensed[0] < maxStart && t.licensed.at(-1) >= minNow)
    .map((t) => makeCard(t, quarters))
    .sort((a, b) => b.latest - a.latest);
}

function lostMakes(byMake, quarters, { minStart, minFall }) {
  return [...byMake.values()]
    .filter((t) => isMake(t.make) && t.licensed[0] >= minStart && t.licensed.at(-1) <= t.licensed[0] * (1 - minFall))
    .map((t) => makeCard(t, quarters))
    .sort((a, b) => a.change - b.change);
}

/**
 * Survivors of each hand-picked hot hatch: the variants matching its rule, licensed and SORN.
 * Also returns the combined series, to show the whole group moving into garages.
 */
function hotHatches(files, rules, n) {
  const byGenModel = new Map(files.map((f) => [f.data.genModel, f]));
  const combined = { licensed: zeros(n), sorn: zeros(n) };
  const items = [];

  for (const rule of rules) {
    const file = byGenModel.get(rule.genModel);
    if (!file) continue;
    const variants = file.data.variants.filter((v) => rule.match.test(v.model));
    if (variants.length === 0) continue;
    const licensed = variants.reduce((acc, v) => add(acc, counted(v.licensed, n)), zeros(n));
    const sorn = variants.reduce((acc, v) => add(acc, counted(v.sorn, n)), zeros(n));
    combined.licensed = add(combined.licensed, licensed);
    combined.sorn = add(combined.sorn, sorn);

    const [, makeSlug, slugFile] = file.path.split('/');
    const total = licensed.at(-1) + sorn.at(-1);
    const startTotal = licensed[0] + sorn[0];
    items.push({
      name: rule.label,
      makeSlug,
      modelSlug: slugFile.replace(/\.json$/, ''),
      variants: variants.map((v) => v.model),
      licensed: licensed.at(-1),
      sorn: sorn.at(-1),
      total,
      startTotal,
      change: startTotal ? (total - startTotal) / startTotal : null,
    });
  }

  return { items: items.sort((a, b) => b.total - a.total), combined };
}

/**
 * Nearly extinct: models with fewer than `maxLeft` still known to DVLA (licensed plus declared
 * off the road) that had at least `minStart` when the data begins, the biggest falls first.
 * Hidden counts (1 to 4) are flagged, so the page can say "at least".
 */
export function nearlyExtinct(files, { maxLeft = 20, minStart = 25, top = 10 } = {}) {
  const rows = [];
  for (const { path, data } of files) {
    if (/MODEL MISSING|^OTHER /.test(data.genModel) || isMotorbike(data.make, data.genModel)) continue;
    const n = data.quarters.length;
    const known = zeros(n);
    let hidden = false;
    for (const v of data.variants) {
      const licensed = expandSeries(v.licensed, n);
      const sorn = expandSeries(v.sorn, n);
      for (let i = 0; i < n; i++) known[i] += (licensed[i] ?? 0) + (sorn[i] ?? 0);
      if (licensed[n - 1] === null || sorn[n - 1] === null) hidden = true;
    }
    const now = known[n - 1];
    if (now > 0 && now < maxLeft && known[0] >= minStart) {
      const [, makeSlug, file] = path.split('/');
      rows.push({ name: data.genModel, makeSlug, modelSlug: file.replace(/\.json$/, ''), from: known[0], latest: now, hidden, values: known });
    }
  }
  return rows.sort((a, b) => b.from - a.from || a.latest - b.latest).slice(0, top);
}

export function buildInsights({ files }, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const quarters = files[0].data.quarters;
  const n = quarters.length;
  const last = n - 1;
  const models = modelTotals(files);
  const byFuel = fleetByFuel(files, n);
  const licensed = byFuel.reduce((acc, g) => add(acc, g.values), zeros(n));
  const sorn = models.reduce((acc, m) => add(acc, m.sorn), zeros(n));
  const share = (values) => values.map((v, i) => (licensed[i] ? v / licensed[i] : 0));
  const fuel = (id) => byFuel.find((g) => g.id === id);
  const dieselShare = share(fuel('diesel').values);
  const dieselPeak = peakOf(dieselShare, quarters);
  const byMake = makeTotals(models, n);

  return {
    quarters,
    headline: {
      quarter: quarters[last],
      licensed: licensed[last],
      sorn: sorn[last],
      electric: fuel('electric').values[last],
      electricShare: share(fuel('electric').values)[last],
      dieselShare: dieselShare[last],
      dieselPeakShare: dieselPeak.peak,
      dieselPeakQuarter: dieselPeak.peakQuarter,
      makes: new Set(models.map((m) => m.make)).size,
      models: models.length,
    },
    fleet: { licensed, sorn },
    fuelShare: byFuel.filter((g) => sum(g.values) > 0).map((g) => ({ ...g, values: share(g.values) })),
    electrified: ['electric', 'plugin', 'hybrid'].map(fuel).filter((g) => sum(g.values) > 0),
    dying: movers(models, quarters, opts, 1),
    growing: movers(models, quarters, opts, -1),
    garageQueens: garageQueens(models, quarters, opts),
    makes: makeRanks(byMake, opts),
    supercars: supercars(byMake, quarters, opts.supercarMakes),
    arrivals: arrivals(byMake, quarters, opts.arrivals),
    lost: lostMakes(byMake, quarters, opts.lost),
    hotHatches: hotHatches(files, opts.hotHatches, n),
    nearlyExtinct: nearlyExtinct(files),
    settings: {
      years: windowQuarters(quarters, opts.years) / 4,
      minBase: opts.minBase,
      minSorn: opts.minSorn,
      arrivals: opts.arrivals,
      lost: opts.lost,
    },
  };
}
