import { BODY_TYPE, LICENCE_STATUS } from './sources.js';

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
 * Collects licensed cars into Make -> GenModel -> variant (Model + Fuel) series.
 * `quarters` are in file order (newest first); output series are oldest first.
 */
export function createAggregator(quarters) {
  const makes = new Map();

  function add(row) {
    const [bodyType, make, genModel, model, fuel, status] = row;
    if (bodyType !== BODY_TYPE || status !== LICENCE_STATUS) return;

    const values = row.slice(6).map(parseCount).reverse();

    if (!makes.has(make)) makes.set(make, new Map());
    const genModels = makes.get(make);
    if (!genModels.has(genModel)) genModels.set(genModel, new Map());
    const variants = genModels.get(genModel);

    const key = `${model}\u0000${fuel}`;
    const existing = variants.get(key);
    if (existing) {
      existing.values = existing.values.map((v, i) => addCounts(v, values[i]));
    } else {
      variants.set(key, { model, fuel, values });
    }
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
        indexModels.push({ name: genModel, slug: genSlug, latest: latestTotal(variants, oldestFirst.length) });
      }

      if (indexModels.length === 0) continue;
      indexMakes.push({
        name: make,
        slug: makeSlug,
        latest: indexModels.reduce((sum, m) => addCounts(sum, m.latest), 0),
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

/** Drops leading zeros (quarters before the variant existed); `from` says where values start. */
function compactVariant({ model, fuel, values }) {
  const from = values.findIndex((v) => v !== 0);
  if (from === -1) return null;
  return { model, fuel, from, values: values.slice(from) };
}

function latestTotal(variants, quarterCount) {
  return variants.reduce((sum, v) => {
    const latest = v.from + v.values.length === quarterCount ? v.values[v.values.length - 1] : 0;
    return addCounts(sum, latest);
  }, 0);
}
