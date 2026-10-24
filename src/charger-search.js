// The charger finder's sums: which map squares to load, distances, speed bands, charge times
// and ordering. Pure functions, so they're unit tested without a browser.

export const METRES_PER_MILE = 1609.344;
/** A typical electric car's efficiency, for "100 miles in about N minutes". */
export const MILES_PER_KWH = 3.5;

export const SPEED_BANDS = [
  { id: 'ultra', label: 'Ultra-rapid', from: 100 },
  { id: 'rapid', label: 'Rapid', from: 25 },
  { id: 'fast', label: 'Fast', from: 7 },
  { id: 'slow', label: 'Slow', from: 0 },
];

export function speedBand(kw) {
  if (!kw) return { id: 'unknown', label: 'Speed not known' };
  return SPEED_BANDS.find((b) => kw >= b.from);
}

/** Minutes to add `miles` of range at `kw`, at full speed. */
export function minutesFor(miles, kw) {
  return kw ? Math.round((miles / MILES_PER_KWH / kw) * 60) : null;
}

export function formatDuration(minutes) {
  if (minutes === null) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** The keys of every grid square within `radius` metres of a point. */
export function tilesAround(e, n, radius, tile) {
  const keys = [];
  for (let x = Math.floor((e - radius) / tile); x <= Math.floor((e + radius) / tile); x++) {
    for (let y = Math.floor((n - radius) / tile); y <= Math.floor((n + radius) / tile); y++) keys.push(`${x}-${y}`);
  }
  return keys;
}

/**
 * Chargers within `miles` of a point and at least `minKw`, with their distance, ordered fastest
 * first (then nearest) or nearest first.
 */
export function rankChargers(chargers, [e, n], { miles, minKw = 0, order = 'fastest', limit = 25 }) {
  const radius = miles * METRES_PER_MILE;
  const found = chargers
    .map((c) => ({ ...c, distance: Math.hypot(c.e - e, c.n - n) / METRES_PER_MILE }))
    .filter((c) => c.distance * METRES_PER_MILE <= radius && (minKw === 0 || (c.kw ?? 0) >= minKw));
  const nearest = (a, b) => a.distance - b.distance;
  found.sort(order === 'nearest' ? nearest : (a, b) => (b.kw ?? 0) - (a.kw ?? 0) || nearest(a, b));
  return { total: found.length, chargers: found.slice(0, limit) };
}
