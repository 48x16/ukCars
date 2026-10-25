import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { automatics, buildDriving, centreAges, centreTotals, MIN_RANKED_TESTS, monthKey, num, TABLES, topFaults, yearKey } from '../pipeline/driving-tests.js';
import { readWorkbook } from '../pipeline/ods.js';

/** The fixture workbook, opened the way the pipeline's --fixture mode does. */
async function fixtureBooks() {
  const book = await readWorkbook(join(import.meta.dirname, 'fixtures', 'mini_drt.ods'));
  return Object.fromEntries(
    Object.keys(TABLES).map((t) => [t, { names: book.names.filter((n) => n.startsWith(`${t} `)).map((n) => n.slice(t.length + 1)), sheet: (n) => book.sheet(`${t} ${n}`) }]),
  );
}

describe('cell and label parsing', () => {
  it('treats suppressed and unavailable cells as unknown, not zero', () => {
    for (const cell of ['..', '[c]', '[r]', '[x]', '[z]', '', undefined]) expect(num(cell)).toBeNull();
    expect(num('1,234')).toBe(1234);
    expect(num('0')).toBe(0);
  });

  it('reads DVSA month and year labels', () => {
    expect(monthKey('September-2026')).toBe('2026-09');
    expect(() => monthKey('Sept 2026')).toThrow(/Unexpected month/);
    expect(yearKey('April 2025 to March 2026')).toBe('2025-26');
    expect(yearKey('2025 to 2026')).toBe('2025-26');
    expect(yearKey('2025/26')).toBe('2025-26');
  });
});

describe('per-centre tables', () => {
  const header = [['', 'Male tests'], ['', 'Conducted', 'Passes', 'Pass rate (%)']];
  const row = (name, m, f, t) => [name, String(m[0]), String(m[1]), '', ' ', String(f[0]), String(f[1]), '', ' ', String(t[0]), String(t[1]), ''];

  it('takes each centre from its total row, skipping the month rows and the national figures', () => {
    const rows = [...header, ['York'], row(' April 2025', [10, 5], [10, 6], [20, 11]), row('York', [100, 50], [80, 44], [180, 94]), row('NATIONAL FIGURES', [9, 4], [9, 5], [18, 9])];
    const { centres, national } = centreTotals(rows);
    expect([...centres.keys()]).toEqual(['York']);
    expect(centres.get('York')).toEqual({ male: { tests: 100, passes: 50 }, female: { tests: 80, passes: 44 }, tests: 180, passes: 94 });
    expect(national.tests).toBe(18);
  });

  it('keys the automatic national row apart from the centres, so it is never summed in', () => {
    const rows = [row('York', [1, 1], [1, 0], [2, 1]), row('National', [5, 2], [5, 3], [10, 5])];
    const auto = automatics(rows);
    expect(auto.get('York').tests).toBe(2);
    expect(auto.get('').tests).toBe(10);
  });

  it('keeps ages 17 to 25 per centre, with suppressed counts as null', () => {
    const ages = centreAges([['York'], ['', '16', '..', '..', '..', '..', '..', '..', '..', '..', '..'], ['', '17', '5', '3', '', '5', '2', '', '10', '5', ''], ['', '25', '..', '..', '..', '..', '..', '..', '..', '..', '53.1'], ['', 'Total', '9', '9']]);
    expect(ages.get('York')).toEqual([{ age: 17, tests: 10, passes: 5 }, { age: 25, tests: null, passes: null }]);
  });

  it('lists the top faults by year, newest first, mending DVSA’s typo', () => {
    const faults = topFaults([['Period', 'Number', 'Fault'], ['April 2024 to March 2025', '1', 'A'], ['April 2025 to March 2026', '2', 'Maintain progess - speed'], ['April 2025 to March 2026', '1', 'B']]);
    expect(faults).toEqual([{ year: '2025-26', faults: ['B', 'Maintain progress - speed'] }, { year: '2024-25', faults: ['A'] }]);
  });
});

describe('buildDriving (fixture workbook)', async () => {
  const { feature, index, centres } = buildDriving(await fixtureBooks());
  const york = centres.find((c) => c.slug === 'york');

  it('builds the national story from the latest year and month', () => {
    expect(feature.year).toBe('2025-26');
    expect(feature.latestMonth).toBe('2026-09');
    expect(feature.ages.map((a) => a.age)).toEqual(['17', '18', '60+']); // 16-year-olds and "Unknown" left out
    expect(feature.automatic).toEqual({ tests: 589483, passes: 263121 }); // DVSA's national row, not a sum
    expect(feature.manual.tests).toBe(1998621 - 589483);
    expect(feature.regions.map((r) => r.name)).toEqual(['London', 'Scotland', 'Yorkshire and the Humber']); // regions, plus Scotland and Wales
  });

  it('writes every open centre, with its history, ages and waits', () => {
    expect(index.map((c) => c.name)).toEqual(['Aberdeen North', 'York']);
    expect(york.history.map((h) => h.year)).toEqual(['2024-25', '2025-26']);
    expect(york.ages).toHaveLength(9);
    expect(york.waits).toHaveLength(3);
    expect(york.firstAttempt.tests).toBeGreaterThan(0);
  });

  it('compares each centre with its region despite DVSA’s different spellings', () => {
    expect(york.region).toBe('Yorkshire and The Humber');
    expect(york.compare.region.name).toBe('Yorkshire and the Humber');
    expect(york.compare.gb.rate).toBeCloseTo(0.5004, 3);
  });

  it('ranks only centres with enough tests to mean something', () => {
    for (const list of Object.values(feature.centres).filter(Array.isArray)) {
      for (const c of list) expect(c.tests).toBeGreaterThanOrEqual(MIN_RANKED_TESTS);
    }
  });
});
