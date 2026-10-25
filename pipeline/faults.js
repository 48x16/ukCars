// "Why cars fail": the committed failure-reason summary (pipeline/mot-faults.js, in DVSA's names)
// joined to DVLA's models -> public/data/features/faults.json. Called by pipeline/run.js.

import { createMatcher } from './mot-join.js';

/** Sections need this share of all tests to be shown; the rest (towbars, say) are too rare to chart. */
export const MIN_SECTION_SHARE = 0.001;
/** Models need this many first tests to be compared. */
export const MIN_FAULT_MODEL_TESTS = 5_000;
const FUEL_LABELS = { petrol: 'Petrol', diesel: 'Diesel', hybrid: 'Hybrid', electric: 'Electric' };
/** Everyday names for DVSA's sections (by their lower-case name); others keep DVSA's. */
const SHORT = {
  'lamps, reflectors and electrical equipment': 'Lights',
  'body, chassis, structure': 'Body and chassis',
  'noise, emissions and leaks': 'Emissions and leaks',
  'seat belts and supplementary restraint systems': 'Seat belts and airbags',
  'identification of the vehicle': 'Number plates and VIN',
  visibility: 'Visibility (wipers, glass, mirrors)',
};
const shortLabel = (section) => SHORT[section.key ?? section.label.toLowerCase()] ?? section.label;
const DEFECTS = 15;

/**
 * `summary` is data/mot/<year>-faults.json; `mot` the site's joined mot.json (its models are the
 * cars, so vans and the like stay out); `index` DVLA's model index, for the matcher.
 */
export function buildFaults(summary, mot, index) {
  const { tests } = summary;
  const keep = summary.sections
    .map((s, i) => ({ ...s, i, count: summary.national[i] }))
    .filter((s) => s.count / tests.all >= MIN_SECTION_SHARE)
    .sort((a, b) => b.count - a.count);
  const pick = (counts) => keep.map((s) => counts[s.i]);

  const cars = new Map(mot.models.map((m) => [`${m.makeSlug}/${m.modelSlug}`, m]));
  const match = createMatcher(index);
  const bands = summary.bands.length;
  const models = new Map();
  for (const row of summary.models) {
    const found = match(row.make, row.model);
    const car = found?.modelSlug && cars.get(`${found.makeSlug}/${found.modelSlug}`);
    if (!car) continue;
    const key = `${car.makeSlug}/${car.modelSlug}`;
    let m = models.get(key);
    if (!m) {
      m = { name: car.name, makeSlug: car.makeSlug, modelSlug: car.modelSlug, tests: 0, failed: 0, bandTests: new Array(bands).fill(0), counts: Array.from({ length: bands }, () => keep.map(() => 0)) };
      models.set(key, m);
    }
    m.tests += row.tests;
    m.failed += row.failed;
    row.bandTests.forEach((n, b) => (m.bandTests[b] += n));
    row.counts.forEach((c, b) => pick(c).forEach((n, s) => (m.counts[b][s] += n)));
  }

  return {
    year: summary.year,
    source: summary.source,
    sections: keep.map(shortLabel),
    tests: tests.all,
    failed: tests.failed,
    national: pick(summary.national),
    bands: summary.bands.map((b) => ({ label: b.label, tests: b.tests, counts: pick(b.counts) })),
    fuels: summary.fuels.filter((f) => FUEL_LABELS[f.id]).map((f) => ({ id: f.id, label: FUEL_LABELS[f.id], tests: f.tests, counts: pick(f.counts) })),
    // Faults found, not tests: a car with two worn tyres counts twice.
    defects: summary.defects.slice(0, DEFECTS).map((d) => ({ text: d.text, section: shortLabel(summary.sections[d.section]), count: d.count })),
    models: [...models.values()].filter((m) => m.tests >= MIN_FAULT_MODEL_TESTS).sort((a, b) => b.tests - a.tests),
  };
}
