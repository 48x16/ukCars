// Whole-fleet stories for the Insights page, built from the per-model files the slicer writes.
// Suppressed counts ([c], 1 to 4 vehicles) are counted as zero here: at fleet scale that's
// far below the precision anyone reads, and it stops one cell blanking a national total.

import { expandSeries, FUEL_GROUPS, fuelGroupOf } from '../src/series.js';

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
};

/** One row per GenModel: licensed and SORN totals per quarter. */
function modelTotals(files) {
  return files.map(({ path, data }) => {
    const [, makeSlug, file] = path.split('/');
    const n = data.quarters.length;
    const licensed = data.variants.reduce((acc, v) => add(acc, counted(v.licensed, n)), zeros(n));
    const sorn = data.variants.reduce((acc, v) => add(acc, counted(v.sorn, n)), zeros(n));
    return { make: data.make, name: data.genModel, makeSlug, modelSlug: file.replace(/\.json$/, ''), licensed, sorn };
  });
}

function fleetByFuel(files, n) {
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
function makeRanks(models, quarters, { topMakes }) {
  const last = quarters.length - 1;
  const byMake = new Map();
  for (const m of models) {
    const t = byMake.get(m.make) ?? { make: m.make, makeSlug: m.makeSlug, first: 0, latest: 0 };
    t.first += m.licensed[0];
    t.latest += m.licensed[last];
    byMake.set(m.make, t);
  }
  const all = [...byMake.values()];
  const rankBy = (key) => new Map([...all].sort((a, b) => b[key] - a[key]).map((t, i) => [t.make, i + 1]));
  const firstRank = rankBy('first');
  const latestRank = rankBy('latest');
  return all
    .filter((t) => firstRank.get(t.make) <= topMakes || latestRank.get(t.make) <= topMakes)
    .map((t) => ({ ...t, firstRank: firstRank.get(t.make), latestRank: latestRank.get(t.make) }))
    .sort((a, b) => a.latestRank - b.latestRank);
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
    makes: makeRanks(models, quarters, opts),
    settings: { years: windowQuarters(quarters, opts.years) / 4, minBase: opts.minBase, minSorn: opts.minSorn },
  };
}
