// Which first-use years to show colours for: an unbroken run back from the newest year that's
// due an MOT, stopping at the first year with too few cars tested to give steady shares.
// (Years like 1992 and 1993, when fewer new cars were sold, mustn't leave gaps.)

export const MIN_TESTS_PER_YEAR = 10_000;
export const FIRST_MOT_AGE = 3;

export function colourYears(years, totals, testYear) {
  const keep = years.map(() => false);
  for (let i = years.length - 1; i >= 0; i--) {
    if (years[i] > testYear - FIRST_MOT_AGE) continue;
    if (totals[i] < MIN_TESTS_PER_YEAR) break;
    keep[i] = true;
  }
  return keep;
}
