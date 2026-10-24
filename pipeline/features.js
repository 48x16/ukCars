// Data for the feature pages, one JSON file per story, built from the same per-model files as
// the Insights page (and the joined MOT summary, where a story uses it). As there, suppressed
// counts ([c], 1 to 4 vehicles) count as zero at this scale.

import { expandSeries, FUEL_GROUPS, fuelGroupOf } from '../src/series.js';
import { BAVARIAN, ORIGINS, originOf, SUMMER_GROUPS } from './categories.js';
import { MAKE_ALIASES } from './mot-join.js';
import { colourYears } from '../src/colour-years.js';
import { modelTotals } from './insights.js';

const sum = (values) => values.reduce((a, b) => a + b, 0);
const add = (a, b) => a.map((v, i) => v + b[i]);
const zeros = (n) => new Array(n).fill(0);
const counted = (series, n) => expandSeries(series, n).map((v) => v ?? 0);
const mean = (values) => sum(values) / values.length;

/** Quarters used for the seasons: the last two years. */
export const SEASON_QUARTERS = 8;
/** Quarters of sawtooth shown per group. */
export const SAWTOOTH_QUARTERS = 12;
/** Models need this many cars known to DVLA (licensed plus SORN) to rank for the seasons. */
export const MIN_SEASONAL_KNOWN = 2_000;
const isWinter = (quarter) => /Q[41]$/.test(quarter); // snapshots at the end of December and March

/**
 * Winter and summer over the last two years: the average share declared off the road at the
 * end of December and March, against June and September; and how many more cars are licensed
 * in summer than winter.
 */
export function seasons(quarters, licensed, sorn) {
  const start = Math.max(0, quarters.length - SEASON_QUARTERS);
  const winter = { share: [], licensed: [] };
  const summer = { share: [], licensed: [] };
  for (let i = start; i < quarters.length; i++) {
    const known = licensed[i] + sorn[i];
    const side = isWinter(quarters[i]) ? winter : summer;
    side.share.push(known ? sorn[i] / known : 0);
    side.licensed.push(licensed[i]);
  }
  if (!winter.share.length || !summer.share.length) return null;
  return {
    winter: mean(winter.share),
    summer: mean(summer.share),
    swing: mean(winter.share) - mean(summer.share),
    turnout: Math.round(mean(summer.licensed) - mean(winter.licensed)),
  };
}

function sawtooth(quarters, licensed, sorn) {
  const start = Math.max(0, quarters.length - SAWTOOTH_QUARTERS);
  return {
    quarters: quarters.slice(start),
    licensed: licensed.slice(start),
    sornShare: licensed.slice(start).map((l, i) => {
      const s = sorn[start + i];
      return l + s ? s / (l + s) : 0;
    }),
  };
}

/** "Out to play": the cars that are taxed for summer and tucked up for winter. */
export function outToPlay(models, quarters, { hotHatches } = {}) {
  const n = quarters.length;
  const last = n - 1;
  const ranked = models
    .filter((m) => m.licensed[last] + m.sorn[last] >= MIN_SEASONAL_KNOWN)
    .map((m) => ({ m, s: seasons(quarters, m.licensed, m.sorn) }))
    .filter(({ s }) => s)
    .sort((a, b) => b.s.swing - a.s.swing)
    .slice(0, 15)
    .map(({ m, s }) => ({ name: m.name, makeSlug: m.makeSlug, modelSlug: m.modelSlug, known: m.licensed[last] + m.sorn[last], ...s }));

  const groups = [];
  for (const g of SUMMER_GROUPS) {
    const members = models.filter((m) => g.all || g.makes?.includes(m.make) || g.models?.includes(m.name));
    if (!members.length) continue;
    const licensed = members.reduce((acc, m) => add(acc, m.licensed), zeros(n));
    const sorn = members.reduce((acc, m) => add(acc, m.sorn), zeros(n));
    groups.push({ id: g.id, label: g.label, known: licensed[last] + sorn[last], ...seasons(quarters, licensed, sorn), ...sawtooth(quarters, licensed, sorn) });
  }
  if (hotHatches) {
    const { licensed, sorn } = hotHatches.combined;
    const all = groups.findIndex((g) => g.id === 'everyone');
    groups.splice(all === -1 ? groups.length : all, 0, {
      id: 'hothatches',
      label: 'Hot hatch heroes',
      known: licensed[last] + sorn[last],
      ...seasons(quarters, licensed, sorn),
      ...sawtooth(quarters, licensed, sorn),
    });
  }
  return { quarters: quarters.slice(-SEASON_QUARTERS), models: ranked, groups };
}

/** The make a model counts towards here: DVLA lists some Mercedes as "MERCEDES-BENZ". */
const bavarianMake = (make) => (make === 'MERCEDES-BENZ' ? 'MERCEDES' : make);

/** "The Bavarian battle": BMW, Mercedes and Audi since the data begins. */
export function bavarian(files, models, quarters, mot) {
  const n = quarters.length;
  const last = n - 1;
  const fiveYearsAgo = Math.max(0, last - 20);
  const makes = BAVARIAN.map((make) => {
    const own = models.filter((m) => bavarianMake(m.make) === make);
    const ownFiles = files.filter((f) => bavarianMake(f.data.make) === make);
    const licensed = own.reduce((acc, m) => add(acc, m.licensed), zeros(n));
    const byFuel = new Map(FUEL_GROUPS.map((g) => [g.id, zeros(n)]));
    for (const { data } of ownFiles) {
      for (const v of data.variants) byFuel.set(fuelGroupOf(v.fuel), add(byFuel.get(fuelGroupOf(v.fuel)), counted(v.licensed, n)));
    }
    const slug = own[0]?.makeSlug ?? make.toLowerCase();
    const motMake = mot?.makes.find((m) => m.makeSlug === slug);
    return {
      make,
      makeSlug: slug,
      licensed,
      sorn: own.reduce((n2, m) => n2 + m.sorn[last], 0),
      fuels: FUEL_GROUPS.map((g) => ({ id: g.id, label: g.label, latest: byFuel.get(g.id)[last] })).filter((f) => f.latest > 0),
      electric: byFuel.get('electric'),
      topModels: [...own]
        .sort((a, b) => b.licensed[last] - a.licensed[last])
        .slice(0, 5)
        .map((m) => ({
          name: m.name,
          makeSlug: m.makeSlug,
          modelSlug: m.modelSlug,
          latest: m.licensed[last],
          before: m.licensed[fiveYearsAgo],
        })),
      mot: motMake
        ? { tests: motMake.tests, pass: motMake.pass, meanMiles: motMake.meanMiles, meanAge: motMake.meanAge, bands: motMake.bands }
        : null,
    };
  });
  const leaderAt = (i) => makes.reduce((a, b) => (b.licensed[i] > a.licensed[i] ? b : a)).make;
  const leadChanges = [];
  for (let i = 1; i < n; i++) {
    if (leaderAt(i) !== leaderAt(i - 1)) leadChanges.push({ quarter: quarters[i], from: leaderAt(i - 1), to: leaderAt(i) });
  }
  return {
    quarters,
    fiveYearsAgo: quarters[fiveYearsAgo],
    makes,
    leader: leaderAt(last),
    firstLeader: leaderAt(0),
    leadChanges,
    motYear: mot?.year ?? null,
    ageBands: mot?.ageBands ?? null,
  };
}

/** Splits `total` into whole parts in proportion to `values` (largest remainder), e.g. to 100. */
export function apportion(values, total) {
  const all = sum(values);
  if (!all) return values.map(() => 0);
  const exact = values.map((v) => (v / all) * total);
  const parts = exact.map(Math.floor);
  const order = exact.map((v, i) => [v - parts[i], i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < total - sum(parts); k++) parts[order[k][1]]++;
  return parts;
}

/** "Where cars come from": licensed cars by their make's home country. */
export function origins(models, quarters) {
  const n = quarters.length;
  const last = n - 1;
  const byOrigin = new Map(ORIGINS.map((o) => [o.id, { licensed: zeros(n), makes: new Map() }]));
  for (const m of models) {
    const o = byOrigin.get(originOf(m.make, m.name));
    o.licensed = add(o.licensed, m.licensed);
    o.makes.set(m.make, add(o.makes.get(m.make) ?? zeros(n), m.licensed));
  }
  const total = [...byOrigin.values()].reduce((acc, o) => add(acc, o.licensed), zeros(n));
  const groups = ORIGINS.map(({ id, label }) => {
    const o = byOrigin.get(id);
    return {
      id,
      label,
      licensed: o.licensed,
      share: o.licensed.map((v, i) => (total[i] ? v / total[i] : 0)),
      topMakes: [...o.makes]
        .map(([make, values]) => ({ make, latest: values[last], first: values[0] }))
        .sort((a, b) => b.latest - a.latest)
        .slice(0, 4),
    };
  });
  const units = apportion(
    groups.map((g) => g.licensed[last]),
    100,
  );
  groups.forEach((g, i) => (g.of100 = units[i]));
  return { quarters, total, groups };
}

const TOP_RECENT_MAKES = 20;
const NEUTRALS = ['BLACK', 'WHITE', 'GREY', 'SILVER'];

/** "Silver to grey": colours from the MOT summary. */
export function colours(mot) {
  const { year, colours: { years: allYears, series: allSeries } } = mot;
  const totals = allYears.map((_, i) => sum(allSeries.map((s) => s.values[i])));
  const keep = colourYears(allYears, totals, year);
  const years = allYears.filter((_, i) => keep[i]);
  const yearTotals = totals.filter((_, i) => keep[i]);
  const series = allSeries.map((s) => ({
    name: s.name,
    share: s.values.filter((_, i) => keep[i]).map((v, i) => v / yearTotals[i]),
  }));
  const named = series.filter((s) => s.name !== 'OTHER');
  const colourOfYear = years.map((y, i) => {
    const top = named.reduce((a, b) => (b.share[i] > a.share[i] ? b : a));
    return { year: y, colour: top.name, share: top.share[i] };
  });

  const recent = mot.recentColours;
  const shares = (counts) => {
    const all = sum(Object.values(counts));
    return { tests: all, ...Object.fromEntries(Object.entries(counts).map(([c, v]) => [c, v / all])) };
  };
  const byMake = new Map();
  for (const m of recent?.byMake ?? []) {
    const make = MAKE_ALIASES[m.make] ?? m.make;
    const counts = byMake.get(make) ?? {};
    for (const [c, v] of Object.entries(m.colours)) counts[c] = (counts[c] ?? 0) + v;
    byMake.set(make, counts);
  }
  const makes = [...byMake]
    .map(([make, counts]) => ({ make, ...shares(counts) }))
    .sort((a, b) => b.tests - a.tests)
    .slice(0, TOP_RECENT_MAKES)
    .map((m) => ({ ...m, colourful: 1 - sum(NEUTRALS.map((c) => m[c] ?? 0)) }));
  return {
    year,
    years,
    series,
    colourOfYear,
    recentAges: recent?.ages ?? null,
    makes,
    fuels: (recent?.byFuel ?? []).map((f) => ({ fuel: f.fuel, ...shares(f.colours) })),
    neutrals: NEUTRALS,
  };
}

/** Every feature's data, keyed by the file name it's written to. */
export function buildFeatures({ files, insights, mot }) {
  const quarters = files[0].data.quarters;
  const models = modelTotals(files);
  const out = {
    'out-to-play': outToPlay(models, quarters, { hotHatches: insights?.hotHatches }),
    bavarian: bavarian(files, models, quarters, mot),
    origins: origins(models, quarters),
  };
  if (mot) out.colours = colours(mot);
  return out;
}
