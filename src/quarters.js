// Quarter labels look like "2026 Q2". Shared by the pipeline and the front end.

const QUARTER_RE = /^(\d{4}) Q([1-4])$/;

export function isQuarter(label) {
  return QUARTER_RE.test(label);
}

/** Absolute quarter number, so consecutive quarters differ by exactly 1. */
export function quarterIndex(label) {
  const m = QUARTER_RE.exec(label);
  if (!m) throw new Error(`Not a quarter label: "${label}"`);
  return Number(m[1]) * 4 + Number(m[2]) - 1;
}

/** Date of the last day of the quarter (quarter-end snapshot), in UTC. */
export function quarterEndDate(label) {
  const i = quarterIndex(label);
  const year = Math.floor(i / 4);
  const q = (i % 4) + 1;
  return new Date(Date.UTC(year, q * 3, 0));
}
