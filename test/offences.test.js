import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { breathTests, motoringOffences, num, rowsUnder } from '../pipeline/offences-annual.js';
import { buildOffences, TABLES } from '../pipeline/offences.js';
import { readWorkbook } from '../pipeline/ods.js';

async function fixtureBooks() {
  const book = await readWorkbook(join(import.meta.dirname, 'fixtures', 'mini_ras.ods'));
  return Object.fromEntries(TABLES.map((t) => [t, { names: book.names.filter((n) => n.startsWith(`${t} `)).map((n) => n.slice(t.length + 1)), sheet: (n) => book.sheet(`${t} ${n}`) }]));
}
const annual = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'data', 'offences', 'annual.json'), 'utf8'));
/** A workbook from sheets given inline. */
const book = (sheets) => ({ names: Object.keys(sheets), sheet: (n) => sheets[n] });

describe('Home Office tables', () => {
  it('finds the header row whatever notes it carries', () => {
    const rows = rowsUnder([['title'], ['Occupant type [note 2]', 'Collision year'], ['All drivers or riders', '2024']], 'Occupant type', 'test');
    expect(rows).toEqual([{ 'Occupant type': 'All drivers or riders', 'Collision year': '2024' }]);
    expect(num('[z]')).toBeNull();
  });

  it('reads breath tests: the trend, the latest year by month, and forces without the national rows', () => {
    const b = breathTests(
      book({
        BT3: [['Calendar Year', 'Number of tests', 'Positive or refused tests'], ['2002', '464272', '82623'], ['Change (%)', '-0.3', '-4.4']],
        BT4: [['Month', 'Number of tests - 2023', 'Number of tests - 2024', 'Positive or refused tests - 2023', 'Positive or refused tests - 2024'], ['December', '1', '28216', '1', '2681'], ['Total', '9', '9', '9', '9']],
        BT2a: [
          ['Calendar Year', 'Geocode', 'Police Force', 'Number of tests', 'Tests per 1,000 population', 'Positive or refused tests'],
          ['2024', 'x', 'Cumbria', '5558', '10.9', '475'],
          ['2024', 'x', 'Bedfordshire', '[z]', '[z]', '[z]'],
          ['2024', 'x', 'England and Wales', '99', '1', '9'],
        ],
      }),
    );
    expect(b.trend).toEqual([{ year: 2002, tests: 464272, positive: 82623 }]);
    expect(b.months).toEqual({ year: 2024, months: [{ month: 'December', tests: 28216, positive: 2681 }] });
    expect(b.forces.forces.map((f) => f.name)).toEqual(['Cumbria']); // unreported forces and totals left out
    expect(b.forces.total.tests).toBe(99);
  });

  it('adds the Metropolitan Police to the rest of England and Wales, by offence', () => {
    const table = (speeding, total) => [['Offence Classification', 'Offence Description', '2023', '2024'], ['816', 'Speed limit offences', ...speeding], ['Total', '', ...total]];
    const outcomes = (retraining) => [['Outcome', '2023', '2024'], ['Driver retraining [note 18]', ...retraining], ['Total motoring offences', '9', '9']];
    const o = motoringOffences(book({ FPN2a: table(['10', '20'], ['30', '40']), FPN2b: table(['1', '2'], ['3', '4']), FPN1a: outcomes(['5', '6']), FPN1b: outcomes(['1', '1']) }));
    expect(o.years).toEqual([2023, 2024]);
    expect(o.total).toEqual([33, 44]);
    expect(o.offences.find((x) => x.label === 'Speeding').counts).toEqual([11, 22]);
    expect(o.retraining).toEqual([6, 7]);
  });
});

describe('buildOffences (fixture workbook)', async () => {
  const traffic = { years: [2015, 2024], regions: [{ name: 'London', all: [10e9, 10e9] }] };
  const d = buildOffences(await fixtureBooks(), annual, traffic);

  it('keeps collisions only: no deaths or casualty counts anywhere in the output', () => {
    expect(d.collisions[0]).toEqual({ year: 1979, collisions: 19470 });
    expect(JSON.stringify(d)).not.toMatch(/killed|casualt|fatal/i);
  });

  it('sums months and hours over the years, and gives regions a rate per billion miles where traffic is known', () => {
    expect(d.months.months).toHaveLength(12);
    expect(d.hours).toHaveLength(24);
    const london = d.regions.regions.find((r) => r.name === 'London');
    expect(london.perBillionMiles).toBeCloseTo(london.collisions / 20, 5);
    expect(d.regions.regions.find((r) => r.name === 'Scotland').perBillionMiles).toBeNull();
    expect(d.regions.regions.map((r) => r.name)).not.toContain('England');
  });

  it('counts roadside screening over the limit (above 35 mcg) by reason', () => {
    const r = d.screening.reasons[0];
    expect(r.over).toBeGreaterThan(0);
    expect(r.over).toBeLessThan(r.tests);
  });
});

describe('MoJ convictions', () => {
  it('adds up convictions by year for each group of offence codes, leaving others out', async () => {
    const { summariseLines } = await import('../pipeline/offences-moj.js');
    const row = (year, code, convicted) => `"Year ending June ${year}","x","${code} - offence (MOT)","${convicted}"`;
    const out = await summariseLines(['"Year ending June","Offence","HO Offence Code","Convicted"', row(2025, '80302', 3), row(2025, '80313', 2), row(2025, '80302', 1), row(2026, '00406', 9), row(2026, '80303', 4)]);
    expect(out.years).toEqual([2025, 2026]);
    expect(out.series.find((s) => s.id === 'drink').convicted).toEqual([4, 0]);
    expect(out.series.find((s) => s.id === 'drug').convicted).toEqual([2, 0]);
    expect(out.series.find((s) => s.id === 'refused').convicted).toEqual([0, 4]); // causing death (00406) is not counted
  });
});
