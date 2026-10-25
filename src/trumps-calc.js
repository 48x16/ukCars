// Top Trumps scoring, kept apart from the page so it can be tested.

import { expandSeries } from './series.js';

/** Bands tried for a fair MOT comparison, in order: 10 to 14 years first, where cars part company. */
const BAND_ORDER = [2, 1, 0, 3];
/** Tests each car needs in a band to compare them there. */
export const MIN_BAND_TESTS = 100;

const sum = (values) => values.reduce((a, b) => a + b, 0);

/** A model's figures, from its licensing file, its MOT row (or null) and its new-car history (or null). */
export function cardFigures({ file, mot, story, years }) {
  const n = file.quarters.length;
  const latest = (key) => sum(file.variants.map((v) => expandSeries(v[key], n)[n - 1] ?? 0));
  const licensed = latest('licensed');
  const sorn = latest('sorn');
  const best = story ? story.values.indexOf(Math.max(...story.values)) : -1;
  return {
    licensed,
    offShare: licensed + sorn ? sorn / (licensed + sorn) : null,
    soldNew: story ? sum(story.values) : null,
    bestYear: story && story.values[best] > 0 ? { year: years[best], value: story.values[best] } : null,
    milesPerYear: mot?.meanMiles && mot.meanAge >= 3 ? Math.round(mot.meanMiles / mot.meanAge) : null,
    meanAge: mot?.meanAge ?? null,
    bands: mot?.bands ?? null,
  };
}

/** The age band where both cars have enough MOT tests to compare, or null. */
export function sharedBand(a, b) {
  if (!a.bands || !b.bands) return null;
  return BAND_ORDER.find((i) => a.bands[i]?.tests >= MIN_BAND_TESTS && b.bands[i]?.tests >= MIN_BAND_TESTS) ?? null;
}

/**
 * The categories, each with both values and the winner ('a', 'b' or null for a draw or a
 * missing figure). `ageBands` labels the MOT bands.
 */
export function play(a, b, ageBands) {
  const band = sharedBand(a, b);
  const rate = (f) => (band === null ? null : f.bands[band].pass / f.bands[band].tests);
  const rows = [
    { id: 'licensed', label: 'On the road', a: a.licensed, b: b.licensed, higher: true },
    { id: 'sold', label: 'Sold new since 2001', a: a.soldNew, b: b.soldNew, higher: true },
    { id: 'best', label: 'Best year', a: a.bestYear?.value ?? null, b: b.bestYear?.value ?? null, higher: true, years: [a.bestYear?.year, b.bestYear?.year] },
    { id: 'off', label: 'Off the road', a: a.offShare, b: b.offShare, higher: false },
    { id: 'miles', label: 'Miles a year', a: a.milesPerYear, b: b.milesPerYear, higher: true },
    { id: 'age', label: 'Average age at the MOT', a: a.meanAge, b: b.meanAge, higher: true },
    { id: 'mot', label: band === null ? 'Passes the MOT first time' : `Passes the MOT first time, at ${ageBands[band].toLowerCase()}`, a: rate(a), b: rate(b), higher: true },
  ];
  for (const r of rows) {
    r.winner = r.a === null || r.b === null || r.a === r.b ? null : (r.a > r.b) === r.higher ? 'a' : 'b';
  }
  const score = { a: rows.filter((r) => r.winner === 'a').length, b: rows.filter((r) => r.winner === 'b').length };
  return { rows, score };
}
