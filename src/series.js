// Turns a model file's variants into one series per fuel group, ready to chart.
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

/** Expands a compacted variant back to one value per quarter. */
export function expandVariant({ from, values }, quarterCount) {
  const out = new Array(quarterCount).fill(0);
  values.forEach((v, i) => {
    out[from + i] = v;
  });
  return out;
}

/**
 * Sums the chosen variants by fuel group. `variantIndex` of null means all variants.
 * Returns only groups with at least one licensed vehicle, in FUEL_GROUPS order.
 * A null (suppressed) count makes that quarter's group total null, never a guess.
 */
export function seriesByFuel(file, variantIndex = null) {
  const n = file.quarters.length;
  const variants = variantIndex === null ? file.variants : [file.variants[variantIndex]];
  const totals = new Map();

  for (const variant of variants) {
    const id = fuelGroupOf(variant.fuel);
    const values = expandVariant(variant, n);
    const sum = totals.get(id) ?? new Array(n).fill(0);
    totals.set(
      id,
      sum.map((s, i) => (s === null || values[i] === null ? null : s + values[i])),
    );
  }

  return FUEL_GROUPS.filter((g) => totals.get(g.id)?.some((v) => v !== 0)).map((g) => ({
    id: g.id,
    label: g.label,
    values: totals.get(g.id),
  }));
}

/** Total across series for one quarter; null if any part is suppressed. */
export function totalAt(series, i) {
  return series.reduce((sum, s) => (sum === null || s.values[i] === null ? null : sum + s.values[i]), 0);
}
