// Joins the yearly MOT summary (data/mot/<year>.json, in DVSA's make and model names) to
// DVLA's models from the licensing data, and writes what the site needs.
//
// DVSA's model names are freer than DVLA's: "MERCEDES-BENZ C220 D" for "MERCEDES C CLASS",
// "BMW 118" for "BMW 1 SERIES", "TESLA MODEL 3 LONG RANGE AWD" for "TESLA MODEL 3". So each
// name is tried as given, then with words dropped from the end, plus the CLASS and SERIES
// patterns. The longest match wins; what doesn't match is reported, never guessed.

/** DVSA make -> DVLA make, where they differ. */
export const MAKE_ALIASES = {
  'MERCEDES-BENZ': 'MERCEDES',
  'SMART (MCC)': 'SMART',
};

/** Colours shown by name; the rest are grouped as "Other". */
export const TOP_COLOURS = 11;

const norm = (s) => s.replace(/[^A-Z0-9]/g, '');

/** Candidate DVLA model names (without the make) for one DVSA model name, best first. */
export function candidates(make, model) {
  const words = model.split(/\s+/).filter(Boolean);
  const out = [];
  for (let n = words.length; n > 0; n--) {
    const c = words.slice(0, n).join(' ');
    out.push(c, `${c} SERIES`, `${c} CLASS`);
  }
  const first = words[0] ?? '';
  if (make === 'MERCEDES') {
    // "C", "C220", "C-CLASS", "GLA 200" -> "C CLASS", "GLA CLASS"
    const letters = /^([A-Z]+?)(?:-?CLASS|\d.*)?$/.exec(first)?.[1];
    if (letters) out.push(`${letters} CLASS`);
  }
  if (make === 'BMW') {
    // "118", "320D", "M340I" -> "1 SERIES", "3 SERIES"
    const digit = /^M?([1-8])\d\d/.exec(first)?.[1];
    if (digit) out.push(`${digit} SERIES`);
  }
  return out;
}

/** Builds a matcher over DVLA's index: (dvsaMake, dvsaModel) -> DVLA model, or null. */
export function createMatcher(index) {
  const makes = new Map();
  for (const make of index.makes) {
    const models = new Map();
    for (const m of make.models) {
      const short = m.name.startsWith(`${make.name} `) ? m.name.slice(make.name.length + 1) : m.name;
      models.set(norm(short), { make: make.name, makeSlug: make.slug, name: m.name, modelSlug: m.slug });
    }
    makes.set(make.name, { name: make.name, slug: make.slug, models });
  }
  return function match(dvsaMake, dvsaModel) {
    const make = makes.get(MAKE_ALIASES[dvsaMake] ?? dvsaMake);
    if (!make) return null;
    for (const c of candidates(make.name, dvsaModel)) {
      const found = make.models.get(norm(c));
      if (found) return found;
    }
    return { make: make.name, makeSlug: make.slug, name: null, modelSlug: null };
  };
}

const outcome = () => ({ tests: 0, pass: 0, prs: 0, fail: 0 });

function addOutcome(target, source) {
  for (const k of ['tests', 'pass', 'prs', 'fail']) target[k] += source[k];
}

/** Totals for a group of DVSA rows, with test-weighted means. */
function combine(rows, bandCount) {
  const total = { ...outcome(), miles: 0, milesN: 0, ages: 0, bands: Array.from({ length: bandCount }, outcome) };
  for (const r of rows) {
    addOutcome(total, r);
    if (r.meanMiles !== null) {
      total.miles += r.meanMiles * r.tests;
      total.milesN += r.tests;
    }
    total.ages += r.meanAge * r.tests;
    r.bands.forEach((b, i) => addOutcome(total.bands[i], b));
  }
  return {
    tests: total.tests,
    pass: total.pass,
    prs: total.prs,
    fail: total.fail,
    meanMiles: total.milesN ? Math.round(total.miles / total.milesN) : null,
    meanAge: Math.round((total.ages / total.tests) * 10) / 10,
    bands: total.bands,
  };
}

/** Keeps the top colours by name and folds the rest into "Other". */
function topColours({ years, series }) {
  const kept = series.slice(0, TOP_COLOURS);
  const rest = series.slice(TOP_COLOURS);
  if (rest.length === 0) return { years, series: kept };
  const other = { name: 'OTHER', total: 0, values: years.map(() => 0) };
  for (const s of rest) {
    other.total += s.total;
    s.values.forEach((v, i) => (other.values[i] += v));
  }
  return { years, series: [...kept, other] };
}

/** The site's mot.json: the summary's national figures, plus models and makes in DVLA's names. */
export function joinMot(summary, index) {
  const match = createMatcher(index);
  const byModel = new Map();
  const byMake = new Map();
  const unmatched = [];
  let matchedTests = 0;
  let listedTests = 0;

  for (const row of summary.models) {
    listedTests += row.tests;
    const found = match(row.make, row.model);
    if (!found) {
      unmatched.push(row);
      continue;
    }
    const makeRows = byMake.get(found.makeSlug) ?? { name: found.make, makeSlug: found.makeSlug, rows: [] };
    makeRows.rows.push(row);
    byMake.set(found.makeSlug, makeRows);
    if (!found.modelSlug) {
      unmatched.push(row);
      continue;
    }
    matchedTests += row.tests;
    const key = `${found.makeSlug}/${found.modelSlug}`;
    const modelRows = byModel.get(key) ?? { ...found, rows: [] };
    modelRows.rows.push(row);
    byModel.set(key, modelRows);
  }

  const bandCount = summary.ageBands.length;
  const { models: _, modelsLeftOut, ...national } = summary;
  return {
    ...national,
    colours: topColours(summary.colours),
    match: {
      testsInModels: listedTests,
      testsMatched: matchedTests,
      modelsLeftOut,
      unmatched: unmatched
        .sort((a, b) => b.tests - a.tests)
        .slice(0, 50)
        .map((r) => ({ make: r.make, model: r.model, tests: r.tests })),
    },
    makes: [...byMake.values()]
      .map(({ name, makeSlug, rows }) => ({ name, makeSlug, ...combine(rows, bandCount) }))
      .sort((a, b) => b.tests - a.tests),
    models: [...byModel.values()]
      .map(({ make, name, makeSlug, modelSlug, rows }) => ({
        make,
        name,
        makeSlug,
        modelSlug,
        dvsaNames: rows.map((r) => r.model),
        ...combine(rows, bandCount),
      }))
      .sort((a, b) => b.tests - a.tests),
  };
}
