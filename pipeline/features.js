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

/**
 * Electric cars in detail, for the Electric page: the fleet, the models, the makes, where
 * they're from, and how they do at the MOT against other fuels at the same age.
 */
export function electricCars(files, quarters, mot) {
  const n = quarters.length;
  const last = n - 1;
  const yearAgo = Math.max(0, last - 4);
  const fleet = new Map(FUEL_GROUPS.map((g) => [g.id, zeros(n)]));
  const byMake = new Map();
  const byOrigin = new Map();
  const modelRows = [];
  for (const { path, data } of files) {
    const electric = zeros(n);
    let all = zeros(n);
    for (const v of data.variants) {
      const values = counted(v.licensed, n);
      const group = fuelGroupOf(v.fuel);
      fleet.set(group, add(fleet.get(group), values));
      all = add(all, values);
      if (group === 'electric') for (let i = 0; i < n; i++) electric[i] += values[i];
    }
    const make = bavarianMake(data.make);
    const t = byMake.get(make) ?? { make, electric: zeros(n), all: zeros(n) };
    t.electric = add(t.electric, electric);
    t.all = add(t.all, all);
    byMake.set(make, t);
    const origin = originOf(data.make, data.genModel);
    byOrigin.set(origin, (byOrigin.get(origin) ?? 0) + electric[last]);
    if (electric[last] > 0) {
      const [, makeSlug, file] = path.split('/');
      modelRows.push({ name: data.genModel, makeSlug, modelSlug: file.replace(/\.json$/, ''), latest: electric[last], yearAgo: electric[yearAgo] });
    }
  }
  const licensed = [...fleet.values()].reduce((acc, v) => add(acc, v), zeros(n));
  const makes = [...byMake.values()].map((t) => ({ make: t.make, electric: t.electric[last], yearAgo: t.electric[yearAgo], all: t.all[last], share: t.all[last] ? t.electric[last] / t.all[last] : 0 }));
  const originIds = ORIGINS.map((o) => o.id);
  const units = apportion(originIds.map((id) => byOrigin.get(id) ?? 0), 100);
  const bands = mot?.fuelBands && mot.ageBands ? mot.ageBands.map((b, i) => ({ label: b.label, fuels: Object.fromEntries(Object.entries(mot.fuelBands).map(([fuel, list]) => [fuel, list[i]])) })) : null;
  return {
    quarters,
    yearAgoQuarter: quarters[yearAgo],
    fleet: {
      licensed,
      electric: fleet.get('electric'),
      plugin: fleet.get('plugin'),
      hybrid: fleet.get('hybrid'),
    },
    models: modelRows.sort((a, b) => b.latest - a.latest).slice(0, 15),
    makes: makes.filter((m) => m.electric > 0).sort((a, b) => b.electric - a.electric).slice(0, 12),
    mostElectric: makes
      .filter((m) => m.all >= 20_000)
      .sort((a, b) => b.share - a.share)
      .slice(0, 10),
    origins: ORIGINS.map((o, i) => ({ id: o.id, label: o.label, electric: byOrigin.get(o.id) ?? 0, of100: units[i] })),
    mot: bands ? { year: mot.year, bands } : null,
  };
}

/**
 * Petrol and diesel cars in detail, for the Petrol and diesel page: the fleet, each fuel's
 * favourite models, the makes most reliant on diesel, the diesels disappearing fastest, and
 * the MOT by fuel at the same age.
 */
export function combustionCars(files, quarters, mot) {
  const n = quarters.length;
  const last = n - 1;
  const yearAgo = Math.max(0, last - 4);
  const fiveYearsAgo = Math.max(0, last - 20);
  const fleet = new Map(FUEL_GROUPS.map((g) => [g.id, zeros(n)]));
  const byMake = new Map();
  const models = { petrol: [], diesel: [] };
  for (const { path, data } of files) {
    const own = new Map(FUEL_GROUPS.map((g) => [g.id, zeros(n)]));
    for (const v of data.variants) {
      const group = fuelGroupOf(v.fuel);
      own.set(group, add(own.get(group), counted(v.licensed, n)));
    }
    for (const [group, values] of own) fleet.set(group, add(fleet.get(group), values));
    const make = bavarianMake(data.make);
    const t = byMake.get(make) ?? { make, diesel: zeros(n), petrol: zeros(n), all: zeros(n) };
    t.diesel = add(t.diesel, own.get('diesel'));
    t.petrol = add(t.petrol, own.get('petrol'));
    t.all = add(t.all, [...own.values()].reduce((acc, v) => add(acc, v), zeros(n)));
    byMake.set(make, t);
    const [, makeSlug, file] = path.split('/');
    for (const fuel of ['petrol', 'diesel']) {
      const values = own.get(fuel);
      if (values[last] > 0 || values[fiveYearsAgo] > 0) {
        models[fuel].push({
          name: data.genModel,
          makeSlug,
          modelSlug: file.replace(/\.json$/, ''),
          latest: values[last],
          yearAgo: values[yearAgo],
          fiveYearsAgo: values[fiveYearsAgo],
        });
      }
    }
  }
  const licensed = [...fleet.values()].reduce((acc, v) => add(acc, v), zeros(n));
  const top = (list) => [...list].sort((a, b) => b.latest - a.latest).slice(0, 10);
  const makes = [...byMake.values()].filter((t) => t.all[last] >= 20_000);
  const share = (t, fuel, i = last) => (t.all[i] ? t[fuel][i] / t.all[i] : 0);
  const bands = mot?.fuelBands && mot.ageBands ? mot.ageBands.map((b, i) => ({ label: b.label, fuels: Object.fromEntries(Object.entries(mot.fuelBands).map(([fuel, list]) => [fuel, list[i]])) })) : null;
  return {
    quarters,
    yearAgoQuarter: quarters[yearAgo],
    fiveYearsAgoQuarter: quarters[fiveYearsAgo],
    fleet: { licensed, petrol: fleet.get('petrol'), diesel: fleet.get('diesel'), hybrid: fleet.get('hybrid') },
    petrolModels: top(models.petrol),
    dieselModels: top(models.diesel),
    dieselMakes: makes
      .map((t) => ({ make: t.make, share: share(t, 'diesel'), before: share(t, 'diesel', fiveYearsAgo), diesel: t.diesel[last] }))
      .sort((a, b) => b.share - a.share)
      .slice(0, 10),
    dieselFallers: models.diesel
      .filter((m) => m.fiveYearsAgo >= 10_000)
      .map((m) => ({ ...m, change: (m.latest - m.fiveYearsAgo) / m.fiveYearsAgo }))
      .sort((a, b) => a.change - b.change)
      .slice(0, 10),
    mot: bands ? { year: mot.year, bands } : null,
  };
}

/**
 * The front door's figures: one small file with a headline number and a mini-chart for each
 * section, so the home page doesn't download every section's data.
 */
export function home({ insights, electric, mot, index }) {
  const h = insights.headline;
  const diesel = insights.fuelShare.find((g) => g.id === 'diesel');
  const ages = mot ? mot.byAge.filter((a) => a.age >= 3 && a.age <= 25 && a.tests) : [];
  return {
    quarters: insights.quarters,
    licensed: insights.fleet.licensed,
    sorn: h.sorn,
    makes: index.makes.filter((m) => m.latest > 0).length,
    models: index.makes.reduce((n, m) => n + m.models.length, 0),
    diesel: diesel ? { share: diesel.values, peak: h.dieselPeakShare, peakQuarter: h.dieselPeakQuarter } : null,
    electric: { values: electric.fleet.electric, share: h.electricShare },
    mot: mot
      ? {
          year: mot.year,
          tests: mot.totals.tests,
          passRate: mot.totals.pass / mot.totals.tests,
          byAge: ages.map((a) => ({ age: a.age, passRate: a.pass / a.tests })),
        }
      : null,
  };
}

/** Models need this many MOT tests to rank as workhorses (or the opposite). */
export const MIN_WORKHORSE_TESTS = 5_000;
/** Models need this many tests at 15 years or older to rank as built to last... */
export const MIN_OLD_TESTS = 2_000;
/** ...and this many to count as an everyday car, not a cherished few. */
export const EVERYDAY_OLD_TESTS = 20_000;
const RANKED = 12;

const slugsOf = (m) => ({ name: m.name, makeSlug: m.makeSlug, modelSlug: m.modelSlug });
const passRate = (o) => (o.tests ? o.pass / o.tests : 0);

/**
 * The workhorses: the models doing the most miles a year (average mileage at the MOT over
 * average age), and the fewest. Plus each fuel's average mileage by age band.
 */
export function workhorses(mot) {
  const rows = mot.models
    .filter((m) => m.tests >= MIN_WORKHORSE_TESTS && m.meanMiles && m.meanAge >= 3)
    .map((m) => ({ ...slugsOf(m), milesPerYear: Math.round(m.meanMiles / m.meanAge), meanMiles: m.meanMiles, meanAge: m.meanAge, tests: m.tests }))
    .sort((a, b) => b.milesPerYear - a.milesPerYear);
  const aged = mot.byAge.filter((a) => a.age >= 3 && a.meanMiles);
  const national = Math.round(sum(aged.map((a) => a.meanMiles * a.tests)) / sum(aged.map((a) => a.age * a.tests)));
  return {
    year: mot.year,
    national,
    ranked: rows.length,
    top: rows.slice(0, RANKED),
    bottom: rows.slice(-RANKED).reverse(),
    ageBands: mot.ageBands.map((b) => b.label),
    fuels: Object.fromEntries(Object.entries(mot.fuelBands).filter(([id]) => id !== 'other').map(([id, bands]) => [id, bands.map((b) => (b.tests >= 1_000 ? b.meanMiles : null))])),
  };
}

/** Built to last: first-time MOT pass rates at 15 years or older, best and worst. */
export function builtToLast(mot) {
  const old = mot.ageBands.length - 1; // 15 years or more
  const rows = mot.models
    .filter((m) => m.bands[old].tests >= MIN_OLD_TESTS)
    .map((m) => ({ ...slugsOf(m), rate: passRate(m.bands[old]), tests: m.bands[old].tests, oldShare: m.bands[old].tests / m.tests }))
    .sort((a, b) => b.rate - a.rate);
  const olds = mot.byAge.filter((a) => a.age >= mot.ageBands[old].from);
  return {
    year: mot.year,
    band: mot.ageBands[old].label,
    national: sum(olds.map((a) => a.pass)) / sum(olds.map((a) => a.tests)),
    ranked: rows.length,
    best: rows.slice(0, RANKED),
    worst: rows.slice(-RANKED).reverse(),
    everyday: rows.filter((m) => m.tests >= EVERYDAY_OLD_TESTS).slice(0, RANKED),
  };
}

/** Icons in decline: models with this many licensed at their peak, by the most lost since. */
export const ICON_PEAK = 200_000;
/** Endangered: once-common models with this many licensed at their peak... */
export const ENDANGERED_PEAK = 50_000;
/** ...and at least this share of them gone since. */
export const ENDANGERED_FALL = 0.4;

/**
 * Endangered species: once-common models disappearing from the road fastest, with how many
 * go each day and, if the last two years' fall carried on, the year the last one would go.
 */
export function endangered(models, quarters) {
  const species = speciesOf(models, quarters);
  const icons = species.filter((m) => m.peak >= ICON_PEAK).sort((a, b) => b.peak - b.latest - (a.peak - a.latest)).slice(0, RANKED);
  return {
    quarters: [quarters[0], quarters.at(-1)],
    icons,
    // Not already among the icons.
    nearlyGone: species
      .filter((m) => m.peak >= ENDANGERED_PEAK && m.fall >= ENDANGERED_FALL && !icons.includes(m))
      .sort((a, b) => b.fall - a.fall)
      .slice(0, RANKED),
  };
}

/** Every declining model: its peak since the data began, what's left, and how fast it's going. */
function speciesOf(models, quarters) {
  const n = quarters.length;
  const lastYear = Number(quarters[n - 1].slice(0, 4)) + (Number(quarters[n - 1].slice(-1)) - 0.5) / 4;
  return models
    .filter((m) => !/MODEL MISSING$|^OTHER /.test(m.name))
    .map((m) => {
      const peak = Math.max(...m.licensed);
      const latest = m.licensed[n - 1];
      const before = m.licensed[Math.max(0, n - 9)]; // two years earlier
      const perQuarter = (before - latest) / Math.min(8, n - 1);
      return {
        ...slugsOf(m),
        peak,
        peakQuarter: quarters[m.licensed.indexOf(peak)],
        latest,
        fall: peak ? 1 - latest / peak : 0,
        perDay: Math.round((m.licensed[Math.max(0, n - 5)] - latest) / 365),
        goneBy: perQuarter > 0 ? Math.floor(lastYear + latest / perQuarter / 4) : null,
        values: m.licensed,
      };
    })
    .filter((m) => m.perDay > 0);
}

/** Every feature's data, keyed by the file name it's written to. */
export function buildFeatures({ files, insights, mot }) {
  const quarters = files[0].data.quarters;
  const models = modelTotals(files);
  const out = {
    'out-to-play': outToPlay(models, quarters, { hotHatches: insights?.hotHatches }),
    bavarian: bavarian(files, models, quarters, mot),
    origins: origins(models, quarters),
    'electric-cars': electricCars(files, quarters, mot),
    'petrol-diesel': combustionCars(files, quarters, mot),
    endangered: endangered(models, quarters),
  };
  if (mot) {
    out.colours = colours(mot);
    out.workhorses = workhorses(mot);
    out['built-to-last'] = builtToLast(mot);
  }
  return out;
}
