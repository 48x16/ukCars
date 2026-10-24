import { BODY_TYPE } from './sources.js';

/** LicenceStatus values in the CSV, and the keys they're stored under. */
const STATUS_KEYS = { Licensed: 'licensed', SORN: 'sorn' };

/** "[c]", "[x]" and "[z]" become null: unknown, not zero. */
export function parseCount(cell) {
  return cell.startsWith('[') ? null : Number(cell);
}

/** Adds two counts; unknown plus anything stays unknown, so no total looks more exact than it is. */
export function addCounts(a, b) {
  return a === null || b === null ? null : a + b;
}

export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\+/g, ' plus ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Collects cars into Make -> GenModel -> variant (Model + Fuel), each variant holding a
 * licensed series and a SORN (off the road) series.
 * `quarters` are in file order (newest first); output series are oldest first.
 */
export function createAggregator(quarters) {
  const makes = new Map();

  function add(row) {
    const [bodyType, make, genModel, model, fuel, status] = row;
    const statusKey = STATUS_KEYS[status];
    if (bodyType !== BODY_TYPE || !statusKey) return;

    const values = row.slice(6).map(parseCount).reverse();

    if (!makes.has(make)) makes.set(make, new Map());
    const genModels = makes.get(make);
    if (!genModels.has(genModel)) genModels.set(genModel, new Map());
    const variants = genModels.get(genModel);

    const key = `${model}\u0000${fuel}`;
    if (!variants.has(key)) variants.set(key, { model, fuel });
    const variant = variants.get(key);
    variant[statusKey] = variant[statusKey]
      ? variant[statusKey].map((v, i) => addCounts(v, values[i]))
      : values;
  }

  function result() {
    const oldestFirst = [...quarters].reverse();
    const files = [];
    const indexMakes = [];
    const makeSlugs = new Map();

    for (const make of [...makes.keys()].sort()) {
      const makeSlug = claimSlug(makeSlugs, make, 'make');
      const genSlugs = new Map();
      const indexModels = [];

      for (const genModel of [...makes.get(make).keys()].sort()) {
        const genSlug = claimSlug(genSlugs, genModel, `model of ${make}`);
        const variants = [...makes.get(make).get(genModel).values()]
          .map(compactVariant)
          .filter(Boolean)
          .sort((a, b) => a.model.localeCompare(b.model) || a.fuel.localeCompare(b.fuel));
        if (variants.length === 0) continue;

        files.push({
          path: `models/${makeSlug}/${genSlug}.json`,
          data: { make, genModel, quarters: oldestFirst, variants },
        });
        indexModels.push({
          name: genModel,
          slug: genSlug,
          latest: latestTotal(variants, 'licensed'),
          sorn: latestTotal(variants, 'sorn'),
        });
      }

      if (indexModels.length === 0) continue;
      indexMakes.push({
        name: make,
        slug: makeSlug,
        latest: indexModels.reduce((sum, m) => addCounts(sum, m.latest), 0),
        sorn: indexModels.reduce((sum, m) => addCounts(sum, m.sorn), 0),
        models: indexModels,
      });
    }

    return { index: { latestQuarter: quarters[0], makes: indexMakes }, files };
  }

  return { add, result };
}

/**
 * DVLA sometimes records one make under two spellings ("LONDON TAXIS INT" and "LONDON TAXIS INT.").
 * Names are kept as published; a clashing slug gets a suffix hashed from the exact name,
 * so file names stay stable from one release to the next.
 */
function claimSlug(taken, name, what) {
  const base = slugify(name);
  if (!base) throw new Error(`${what} "${name}" has no usable characters for a file name`);
  const slug = taken.has(base) ? `${base}-${shortHash(name)}` : base;
  if (taken.has(slug)) {
    throw new Error(`${what} "${name}" and "${taken.get(slug)}" both slugify to "${slug}"`);
  }
  taken.set(slug, name);
  return slug;
}

/** FNV-1a, base 36: short, deterministic, not cryptographic. */
export function shortHash(text) {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).slice(0, 5);
}

/**
 * Drops leading zeros (quarters before the variant existed); `from` says where values start.
 * A series that's zero throughout becomes null.
 */
export function compactSeries(values) {
  const from = values ? values.findIndex((v) => v !== 0) : -1;
  return from === -1 ? null : { from, values: values.slice(from) };
}

/** A variant with neither licensed nor SORN vehicles in any quarter is dropped. */
function compactVariant({ model, fuel, licensed, sorn }) {
  const out = { model, fuel, licensed: compactSeries(licensed), sorn: compactSeries(sorn) };
  return out.licensed || out.sorn ? out : null;
}

/** Only leading zeros are trimmed, so a series' last value is always the latest quarter. */
function latestTotal(variants, key) {
  return variants.reduce((sum, v) => addCounts(sum, v[key] ? v[key].values.at(-1) : 0), 0);
}
