// Turns a model file's variants into one series per fuel group, ready to chart, plus one
// series of cars declared off the road (SORN).
//
// DfT has 11 fuel types. A chart reads poorly past ~6 lines, so related fuels are grouped.
// Each group has a fixed style that never depends on which groups are present.

export const FUEL_GROUPS = [
  { id: 'petrol', label: 'Petrol', fuels: ['Petrol'] },
  { id: 'diesel', label: 'Diesel', fuels: ['Diesel'] },
  { id: 'hybrid', label: 'Hybrid', fuels: ['Hybrid electric (petrol)', 'Hybrid electric (diesel)'] },
  {
    id: 'plugin',
    label: 'Plug-in hybrid',
    fuels: ['Plug-in hybrid electric (petrol)', 'Plug-in hybrid electric (diesel)', 'Range extended electric'],
  },
  { id: 'electric', label: 'Battery electric', fuels: ['Battery electric'] },
  // Gas, fuel cell, "Other fuel types", and any fuel DfT adds in future.
  { id: 'other', label: 'Other', fuels: [] },
];

export function fuelGroupOf(fuel) {
  return (FUEL_GROUPS.find((g) => g.fuels.includes(fuel)) ?? FUEL_GROUPS[FUEL_GROUPS.length - 1]).id;
}

/** Expands a compacted series ({ from, values } or null) back to one value per quarter. */
export function expandSeries(series, quarterCount) {
  const out = new Array(quarterCount).fill(0);
  series?.values.forEach((v, i) => {
    out[series.from + i] = v;
  });
  return out;
}

/** Element-wise sum; a null (suppressed) count makes that quarter's total null, never a guess. */
function addSeries(a, b) {
  return a.map((v, i) => (v === null || b[i] === null ? null : v + b[i]));
}

function chosenVariants(file, variantIndex) {
  return variantIndex === null ? file.variants : [file.variants[variantIndex]];
}

/**
 * Sums the chosen variants' licensed counts by fuel group. `variantIndex` of null means all
 * variants. Returns only groups with at least one licensed vehicle, in FUEL_GROUPS order.
 */
export function seriesByFuel(file, variantIndex = null) {
  const n = file.quarters.length;
  const totals = new Map();

  for (const variant of chosenVariants(file, variantIndex)) {
    const id = fuelGroupOf(variant.fuel);
    totals.set(id, addSeries(totals.get(id) ?? new Array(n).fill(0), expandSeries(variant.licensed, n)));
  }

  return FUEL_GROUPS.filter((g) => totals.get(g.id)?.some((v) => v !== 0)).map((g) => ({
    id: g.id,
    label: g.label,
    values: totals.get(g.id),
  }));
}

/** Cars declared off the road (SORN) across the chosen variants, or null if there are none. */
export function sornSeries(file, variantIndex = null) {
  const n = file.quarters.length;
  const values = chosenVariants(file, variantIndex).reduce(
    (sum, v) => addSeries(sum, expandSeries(v.sorn, n)),
    new Array(n).fill(0),
  );
  return values.some((v) => v !== 0) ? { id: 'sorn', label: 'Off the road (SORN)', values } : null;
}

/** Total across series for one quarter; null if any part is suppressed. */
export function totalAt(series, i) {
  return series.reduce((sum, s) => (sum === null || s.values[i] === null ? null : sum + s.values[i]), 0);
}
