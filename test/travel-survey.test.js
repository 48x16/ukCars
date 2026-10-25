import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readWorkbook } from '../pipeline/ods.js';
import { buildMotoring, columnName, num, surveyYear, TABLES, tidy } from '../pipeline/travel-survey.js';

async function fixtureBooks() {
  const book = await readWorkbook(join(import.meta.dirname, 'fixtures', 'mini_nts.ods'));
  return Object.fromEntries(
    Object.keys(TABLES).map((t) => [t, { names: book.names.filter((n) => n.startsWith(`${t} `)).map((n) => n.slice(t.length + 1)), sheet: (n) => book.sheet(`${t} ${n}`) }]),
  );
}

describe('National Travel Survey tables', () => {
  it('reads survey years, placing combined years at their middle and noting breaks', () => {
    expect(surveyYear('1989 to 1991 [note 3] [b]')).toEqual({ year: '1989 to 1991', at: 1990, break: true });
    expect(surveyYear('2025')).toEqual({ year: '2025', at: 2025, break: false });
    expect(surveyYear('Year')).toBeNull();
  });

  it('treats DfT’s markers as unknown', () => {
    for (const cell of ['[x]', '[u]', '[c]', '']) expect(num(cell)).toBeNull();
    expect(num('86')).toBe(86);
  });

  it('names columns without units or notes', () => {
    expect(columnName('Street (%)')).toBe('Street');
    expect(columnName('Hybrid [notes 4, 5]')).toBe('Hybrid');
    expect(columnName('Distance travelled per person per year (miles)')).toBe('Distance travelled per person per year');
  });

  it('turns a sheet into rows keyed by column, from the header row starting "Year"', () => {
    const rows = tidy(
      [['NTS0205a: title'], ['note'], ['Year', 'No car or van (%)', 'One car or van (%)'], ['1951', '86', '13'], ['2025 [b]', '24.9', '[x]']],
      'test',
    );
    expect(rows).toEqual([
      { year: '1951', at: 1951, break: false, 'No car or van': 86, 'One car or van': 13 },
      { year: '2025', at: 2025, break: true, 'No car or van': 24.9, 'One car or van': '[x]' },
    ]);
    expect(() => tidy([['no header']], 'NTS0000')).toThrow(/NTS0000: no header row/);
  });
});

describe('buildMotoring (fixture workbook)', async () => {
  const d = buildMotoring(await fixtureBooks());

  it('spans household cars from 1951 to the latest year', () => {
    expect(d.households[0]).toMatchObject({ year: '1951', none: 86, one: 13, twoPlus: 1 });
    expect(d.latest).toBe('2025');
    expect(d.coverage).toBe('England');
  });

  it('keeps licence holding by sex and age band', () => {
    expect(d.licences.map((l) => l.sex)).toEqual(['All', 'Female', 'Male']);
    expect(d.licences[0].years[0]).toMatchObject({ year: '1975 to 1976', all: 47.93, '17 to 20': 27.54 });
  });

  it('lists the main reasons for not learning, most common first, without totals or sample sizes', () => {
    expect(d.reasons.all).toHaveLength(6);
    expect(d.reasons.all[0].share).toBeGreaterThanOrEqual(d.reasons.all[1].share);
    for (const r of [...d.reasons.all, ...d.reasons.young]) expect(r.reason).not.toMatch(/total|sample/i);
  });

  it('carries mileage, parking, the car itself and trips', () => {
    expect(d.mileage.at(-1).all).toBeGreaterThan(0);
    expect(d.parking.byArea.length).toBeGreaterThan(1);
    expect(d.parking.byArea.every((a) => a.area !== 'All areas')).toBe(true);
    expect(d.transmission.at(-1).automatic).toBeGreaterThan(d.transmission[0].automatic);
    expect(d.modes[0]).toHaveProperty('driverMiles');
  });
});
