// Quiet times for an MOT: the sums, kept apart from the page so they're unit tested.

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** An hour counts as "open" when it has at least this share of the area's busiest hour. */
const OPEN_SHARE = 0.2;

export const hourLabel = (h) => `${String(h).padStart(2, '0')}:00 to ${String((h + 1) % 24).padStart(2, '0')}:00`;

/** "bn1 1aa", "BN1", "bn" -> "BN"; null if it doesn't start like a postcode. */
export function areaOf(text) {
  const m = /^([A-Z]{1,2})(?:[0-9]|$)/.exec(text.toUpperCase().replace(/[^A-Z0-9]/g, ''));
  return m ? m[1] : null;
}

/** Busiest and quietest slots, days and months from an area's counts. */
export function summarise({ grid, month }) {
  const at = (d, h) => grid[d * 24 + h];
  const byHour = Array.from({ length: 24 }, (_, h) => DAYS.reduce((n, _, d) => n + at(d, h), 0));
  const peakHour = Math.max(...byHour);
  const open = byHour.map((v, h) => (v >= peakHour * OPEN_SHARE ? h : null)).filter((h) => h !== null);
  const slots = [];
  for (let d = 0; d < DAYS.length; d++) for (const h of open) slots.push({ d, h, v: at(d, h) });
  const weekdaySlots = slots.filter((s) => s.d < 5);
  const busiest = slots.reduce((a, b) => (b.v > a.v ? b : a));
  const quietest = weekdaySlots.reduce((a, b) => (b.v < a.v ? b : a));
  const days = DAYS.map((name, d) => ({ name, v: open.reduce((n, h) => n + at(d, h), 0) }));
  const weekdays = days.slice(0, 5);
  const months = month.map((v, i) => ({ name: MONTHS[i], v }));
  const byV = (a, b) => b.v - a.v;
  return {
    open,
    busiest,
    quietest,
    busiestDay: [...days].sort(byV)[0],
    quietestWeekday: [...weekdays].sort(byV).at(-1),
    busiestMonth: [...months].sort(byV)[0],
    quietestMonth: [...months].sort(byV).at(-1),
  };
}
