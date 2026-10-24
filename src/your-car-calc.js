// "Your car": the sums, kept apart from the page so they're unit tested.

/** Where a model ranks among all models by cars known to DVLA (licensed plus off the road). */
export function rarity(index, makeSlug, modelSlug) {
  const all = [];
  let mine = null;
  for (const make of index.makes) {
    for (const m of make.models) {
      if (/MODEL MISSING/.test(m.name)) continue;
      const row = { known: (m.latest ?? 0) + (m.sorn ?? 0), latest: m.latest ?? 0, sorn: m.sorn ?? 0 };
      if (row.known > 0) all.push(row);
      if (make.slug === makeSlug && m.slug === modelSlug) mine = { ...row, name: m.name };
    }
  }
  if (!mine) return null;
  const totalLicensed = all.reduce((n, r) => n + r.latest, 0);
  return {
    ...mine,
    rank: all.filter((r) => r.known > mine.known).length + 1,
    of: all.length,
    oneIn: mine.latest ? Math.round(totalLicensed / mine.latest) : null,
  };
}

/**
 * Where a mileage sits among cars of the same age: the share of them with fewer miles, and
 * the median, from counts in fixed-width bands (the last band is "that or more").
 */
export function mileagePercentile(counts, band, miles) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const i = Math.min(Math.floor(miles / band), counts.length - 1);
  const below = counts.slice(0, i).reduce((a, b) => a + b, 0);
  const within = i < counts.length - 1 ? ((miles - i * band) / band) * counts[i] : counts[i] / 2;
  let seen = 0;
  let median = null;
  for (let j = 0; j < counts.length && median === null; j++) {
    if (seen + counts[j] >= total / 2) median = Math.round((j + (total / 2 - seen) / counts[j]) * band);
    seen += counts[j];
  }
  return { share: (below + within) / total, median, cars: total };
}

/** The age band (from the MOT summary) a car of this age falls in, and its index. */
export function bandFor(ageBands, age) {
  const i = ageBands.findIndex((b) => age >= b.from && (b.to === null || age <= b.to));
  return i === -1 ? null : { index: i, ...ageBands[i] };
}

/** First-time pass rate of all cars whose age falls in a band, from the by-age figures. */
export function nationalBandRate(byAge, band) {
  const rows = byAge.filter((a) => a.age >= band.from && (band.to === null || a.age <= band.to));
  const tests = rows.reduce((n, a) => n + a.tests, 0);
  return tests ? rows.reduce((n, a) => n + a.pass, 0) / tests : null;
}
