import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildFleet, buildMini, buildMot, groupOf, START_YEAR } from '../pipeline/mini.js';

const fixture = readFileSync('test/fixtures/mini_VEH0160_GB.csv', 'utf8');

/**
 * A tiny VEH0160 file: quarters from START_YEAR Q1 to `last`, newest first as DfT publishes
 * them. `perQuarter` is a count for every quarter, or a function of the quarter.
 */
function csv(rows, last = '2003 Q2') {
  const quarters = [];
  for (let y = START_YEAR; ; y++) {
    for (let q = 1; q <= 4; q++) {
      quarters.push(`${y} Q${q}`);
      if (`${y} Q${q}` === last) {
        quarters.reverse();
        const header = ['BodyType', 'Make', 'GenModel', 'Model', 'Fuel', ...quarters].join(',');
        const cells = (perQuarter) => quarters.map((qq) => (typeof perQuarter === 'function' ? perQuarter(qq) : perQuarter));
        return [header, ...rows.map(([make, genModel, fuel, perQuarter]) => ['Cars', make, genModel, 'X', fuel, ...cells(perQuarter)].join(','))].join('\n');
      }
    }
  }
}

describe('Mini model groups', () => {
  it('names models, groups special editions, takes in the classic, and leaves out the rest', () => {
    expect(groupOf('MINI', 'MINI JOHN COOPER WORKS')).toMatchObject({ id: 'john-cooper-works', label: 'John Cooper Works' });
    expect(groupOf('MINI', 'MINI GT')).toMatchObject({ id: 'special', label: 'Special editions' });
    expect(groupOf('ROVER', 'ROVER MINI')).toMatchObject({ id: 'classic', label: 'Classic Mini' });
    expect(groupOf('MINI', 'MINI MODEL MISSING')).toBeNull();
    expect(groupOf('ROVER', 'ROVER 75')).toBeNull();
  });
});

describe('new Minis, year by year', () => {
  it('sums quarters into years, marks the partial year, and leaves out other makes', () => {
    const m = buildMini(csv([['MINI', 'MINI COOPER', 'Petrol', 3000], ['FORD', 'FORD KA', 'Petrol', 999]]));
    expect(m.years).toEqual([2001, 2002, 2003]);
    expect(m.totals).toEqual([12_000, 12_000, 6_000]);
    expect(m.partial).toEqual({ year: 2003, quarters: 2 });
    expect(m.latestQuarter).toBe('2003 Q2');
  });

  it('counts electric cars, groups special editions, and keeps unrecorded models in the total only', () => {
    const m = buildMini(
      csv(
        [
          ['MINI', 'MINI COOPER', 'Battery electric', 2000],
          ['MINI', 'MINI GT', 'Petrol', 500],
          ['MINI', 'MINI PADDY HOPKIRK', 'Petrol', 500],
          ['MINI', 'MINI MODEL MISSING', 'Petrol', 100],
          ['MINI', 'MINI ONE', 'Petrol', '[c]'],
        ],
        '2002 Q4',
      ),
    );
    expect(m.electric).toEqual([8_000, 8_000]);
    expect(m.totals).toEqual([12_400, 12_400]);
    expect(m.models.map((x) => x.label)).toEqual(['Cooper', 'Special editions']);
    expect(m.models.find((x) => x.id === 'special').values).toEqual([4_000, 4_000]);
  });

  it('launches a model that starts within the data, but not one already on sale when it starts', () => {
    const m = buildMini(
      csv([
        ['MINI', 'MINI ONE', 'Petrol', (q) => (q === '2001 Q1' ? 0 : 3000)],
        ['ROVER', 'ROVER MINI', 'Petrol', (q) => (q.startsWith('2001') ? 300 : 0)],
        ['MINI', 'MINI COOPER', 'Petrol', 3000],
      ]),
    );
    const model = (id) => m.models.find((x) => x.id === id);
    expect(model('one').launched).toBe(2001);
    expect(model('cooper').launched).toBeNull();
    expect(model('classic')).toMatchObject({ launched: null, ended: 2001 });
  });

  it('marks launches and farewells from the real file', () => {
    const m = buildMini(fixture);
    expect(m.years[0]).toBe(START_YEAR);
    const model = (id) => m.models.find((x) => x.id === id);
    expect(model('cooper')).toMatchObject({ launched: 2001, ended: null });
    expect(model('one')).toMatchObject({ launched: 2001, ended: 2022 });
    expect(model('countryman').launched).toBe(2010);
    expect(model('roadster')).toMatchObject({ launched: 2012, ended: 2015 });
    expect(model('special')).toMatchObject({ launched: null, ended: null });
    expect(m.firstElectric).toBe(2020);
  });

  it('rejects a changed layout, a gap in the quarters, or implausible totals', () => {
    expect(() => buildMini('BodyType,Make,Model\nCars,MINI,X')).toThrow(/columns changed/);
    const gap = csv([['MINI', 'MINI COOPER', 'Petrol', 3000]]).replace(',2001 Q3', ',2001 Q9');
    expect(() => buildMini(gap)).toThrow(/not a quarter/);
    expect(() => buildMini(csv([['MINI', 'MINI COOPER', 'Petrol', 10]]))).toThrow(/Implausible/);
    expect(() => buildMini(csv([['FORD', 'FORD KA', 'Petrol', 3000]]))).toThrow(/no Mini cars/);
  });
});

describe('Minis on and off the road', () => {
  const file = (make, genModel, variants) => ({ make, genModel, quarters: ['2014 Q3', '2014 Q4', '2015 Q1'], variants });
  const series = (from, values) => ({ from, values });

  it('sums variants into model groups, counting suppressed and missing quarters as zero', () => {
    const fleet = buildFleet([
      file('MINI', 'MINI ONE', [{ licensed: series(0, [100, 90, 80]), sorn: series(1, [10, null]) }, { licensed: series(0, [5, 5, 5]), sorn: null }]),
      file('ROVER', 'ROVER MINI', [{ licensed: series(0, [20, 15, 10]), sorn: series(0, [30, 35, 40]) }]),
      file('MINI', 'MINI MODEL MISSING', [{ licensed: series(0, [999, 999, 999]), sorn: null }]),
    ]);
    expect(fleet.quarters).toEqual(['2014 Q3', '2014 Q4', '2015 Q1']);
    expect(fleet.models).toEqual([
      { id: 'one', label: 'One', licensed: [105, 95, 85], sorn: [0, 10, 0] },
      { id: 'classic', label: 'Classic Mini', licensed: [20, 15, 10], sorn: [30, 35, 40] },
    ]);
    expect(buildFleet([])).toBeNull();
  });
});

describe('Minis at the MOT', () => {
  const summary = {
    year: 2025,
    areas: [
      { area: 'BN', tests: 1000 },
      { area: 'KT', tests: 2000 },
    ],
    colours: { years: [2010], series: [{ name: 'SILVER', total: 900, values: [900] }] },
    spotlight: {
      MINI: {
        tests: 300,
        areas: { BN: 100, KT: 150, ZZ: 50 },
        engines: { band: 100, counts: [10, 0, 290] },
        colours: {
          years: [2010, 2020],
          series: [
            { name: 'WHITE', total: 120, values: [100, 20] },
            { name: 'NOT STATED', total: 150, values: [150, 0] },
            { name: 'RED', total: 30, values: [30, 0] },
          ],
        },
        mileage: { band: 10_000, counts: [1, 2] },
      },
    },
  };

  it('pairs Mini tests with all tests by area, and finds each year’s favourite colour', () => {
    const mot = buildMot(summary);
    expect(mot.areas).toEqual([
      { area: 'BN', tests: 100, all: 1000 },
      { area: 'KT', tests: 150, all: 2000 },
    ]);
    expect(mot.colours.make).toEqual({ WHITE: 120, 'NOT STATED': 150, RED: 30 });
    expect(mot.colours.allCars).toEqual({ SILVER: 900 });
    // 2020 has too few tests to count; colours not stated are left out of the shares.
    expect(mot.colours.byYear).toEqual({ 2010: { colour: 'WHITE', share: 100 / 130, tests: 130 } });
  });

  it('is null when the summary has no Mini spotlight', () => {
    expect(buildMot({ ...summary, spotlight: undefined })).toBeNull();
    expect(buildMot(null)).toBeNull();
  });
});
