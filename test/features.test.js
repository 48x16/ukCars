import { describe, expect, it } from 'vitest';
import { originOf } from '../pipeline/categories.js';
import { apportion, bavarian, colours, electricCars, origins, outToPlay, seasons } from '../pipeline/features.js';
import { colourYears } from '../src/colour-years.js';

const QUARTERS = ['2024 Q3', '2024 Q4', '2025 Q1', '2025 Q2', '2025 Q3', '2025 Q4', '2026 Q1', '2026 Q2'];
const model = (make, name, licensed, sorn = licensed.map(() => 0)) => ({
  make,
  name,
  makeSlug: make.toLowerCase(),
  modelSlug: name.toLowerCase().replace(/ /g, '-'),
  licensed,
  sorn,
});

describe('seasons', () => {
  it('compares winter snapshots (December, March) with summer ones (June, September)', () => {
    // Summer: 60 licensed, 40 off the road (40%). Winter: 40 licensed, 60 off (60%).
    const licensed = [60, 40, 40, 60, 60, 40, 40, 60];
    const sorn = licensed.map((l) => 100 - l);
    const s = seasons(QUARTERS, licensed, sorn);
    expect(s.summer).toBeCloseTo(0.4);
    expect(s.winter).toBeCloseTo(0.6);
    expect(s.swing).toBeCloseTo(0.2);
    expect(s.turnout).toBe(20);
  });
});

describe('outToPlay', () => {
  it('ranks the most seasonal models and builds the groups', () => {
    const caterham = model('CATERHAM', 'CATERHAM SEVEN', [1500, 1000, 1000, 1500, 1500, 1000, 1000, 1500], [1000, 1500, 1500, 1000, 1000, 1500, 1500, 1000]);
    const fiesta = model('FORD', 'FORD FIESTA', [9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000], [500, 500, 500, 500, 500, 500, 500, 500]);
    const tiny = model('TVR', 'TVR GRIFFITH', [10, 5, 5, 10, 10, 5, 5, 10], [5, 10, 10, 5, 5, 10, 10, 5]);
    const result = outToPlay([fiesta, caterham, tiny], QUARTERS);
    expect(result.models.map((m) => m.name)).toEqual(['CATERHAM SEVEN', 'FORD FIESTA']); // the TVR is too small
    expect(result.groups.find((g) => g.id === 'kit').turnout).toBe(505);
    expect(result.groups.find((g) => g.id === 'everyone').known).toBe(1500 + 1000 + 9000 + 500 + 10 + 5);
  });
});

describe('bavarian', () => {
  it('merges Mercedes-Benz into Mercedes and finds the leader in every quarter', () => {
    const q = ['2025 Q1', '2025 Q2', '2025 Q3'];
    const files = [];
    const models = [
      model('BMW', 'BMW 3 SERIES', [10, 19, 30]),
      model('MERCEDES', 'MERCEDES C CLASS', [15, 15, 15]),
      model('MERCEDES-BENZ', 'MERCEDES-BENZ C CLASS', [5, 5, 5]),
      model('AUDI', 'AUDI A3', [1, 1, 1]),
    ];
    const b = bavarian(files, models, q, null);
    expect(b.makes.map((m) => m.licensed)).toEqual([
      [10, 19, 30],
      [20, 20, 20],
      [1, 1, 1],
    ]);
    expect(b.firstLeader).toBe('MERCEDES');
    expect(b.leader).toBe('BMW');
    expect(b.leadChanges).toEqual([{ quarter: '2025 Q3', from: 'MERCEDES', to: 'BMW' }]);
  });
});

describe('origins', () => {
  it('places makes by home country, splitting MG and Smart by model', () => {
    expect(originOf('MINI', 'MINI COOPER')).toBe('british');
    expect(originOf('MG', 'MG ZS')).toBe('chinese');
    expect(originOf('MG', 'MG B')).toBe('british');
    expect(originOf('SMART', 'SMART 1')).toBe('chinese');
    expect(originOf('SMART', 'SMART FORTWO')).toBe('german');
    expect(originOf('NO SUCH MAKE', 'NO SUCH MAKE X')).toBe('other');
  });

  it('adds up shares and turns the latest into a hundred cars', () => {
    const o = origins([model('FORD', 'FORD KA', [50, 30]), model('BMW', 'BMW X1', [50, 70])], ['2014 Q3', '2026 Q2']);
    const german = o.groups.find((g) => g.id === 'german');
    expect(german.share).toEqual([0.5, 0.7]);
    expect(german.of100).toBe(70);
    expect(o.groups.reduce((n, g) => n + g.of100, 0)).toBe(100);
  });

  it('apportions whole numbers that always add up', () => {
    expect(apportion([1, 1, 1], 100)).toEqual([34, 33, 33]);
    expect(apportion([0, 0], 100)).toEqual([0, 0]);
  });
});

describe('colours', () => {
  it('keeps an unbroken run of years with enough tests, up to the first MOT age', () => {
    const years = [1990, 1991, 1992, 1993, 2021, 2022, 2023];
    const totals = [20_000, 5_000, 30_000, 30_000, 30_000, 30_000, 30_000];
    expect(colourYears(years, totals, 2025)).toEqual([false, false, true, true, true, true, false]);
  });

  it('finds the colour of each year and the most colourful makes', () => {
    const mot = {
      year: 2025,
      colours: {
        years: [2021, 2022],
        series: [
          { name: 'SILVER', values: [20_000, 5_000] },
          { name: 'GREY', values: [10_000, 25_000] },
        ],
      },
      recentColours: {
        ages: { from: 3, to: 7 },
        byMake: [
          { make: 'HONDA', tests: 10, colours: { RED: 6, BLACK: 4 } },
          { make: 'MERCEDES-BENZ', tests: 10, colours: { BLACK: 9, BLUE: 1 } },
        ],
        byFuel: [{ fuel: 'electric', colours: { WHITE: 3, GREY: 1 } }],
      },
    };
    const c = colours(mot);
    expect(c.colourOfYear.map((y) => y.colour)).toEqual(['SILVER', 'GREY']);
    expect(c.makes.find((m) => m.make === 'HONDA').colourful).toBeCloseTo(0.6);
    expect(c.makes.find((m) => m.make === 'MERCEDES').colourful).toBeCloseTo(0.1); // DVSA's name, DVLA's make
    expect(c.fuels[0]).toMatchObject({ fuel: 'electric', WHITE: 0.75 });
  });
});

describe('electricCars', () => {
  const file = (make, genModel, variants) => ({ path: `models/${make.toLowerCase()}/${genModel.toLowerCase().replace(/ /g, '-')}.json`, data: { make, genModel, variants } });
  const series = (values) => ({ from: 0, values });
  it('counts the electric fleet, models, makes and origins', () => {
    const q = ['2025 Q1', '2025 Q2', '2025 Q3', '2025 Q4', '2026 Q1'];
    const files = [
      file('TESLA', 'TESLA MODEL 3', [{ fuel: 'Battery electric', licensed: series([10, 20, 30, 40, 50]) }]),
      file('KIA', 'KIA NIRO', [
        { fuel: 'Battery electric', licensed: series([5, 5, 5, 5, 10]) },
        { fuel: 'Petrol', licensed: series([90, 90, 90, 90, 90]) },
        { fuel: 'Plug-in hybrid electric (petrol)', licensed: series([1, 1, 1, 1, 1]) },
      ]),
    ];
    const e = electricCars(files, q, null);
    expect(e.fleet.electric).toEqual([15, 25, 35, 45, 60]);
    expect(e.fleet.plugin).toEqual([1, 1, 1, 1, 1]);
    expect(e.models.map((m) => [m.name, m.latest, m.yearAgo])).toEqual([['TESLA MODEL 3', 50, 10], ['KIA NIRO', 10, 5]]);
    expect(e.makes[0]).toMatchObject({ make: 'TESLA', electric: 50, share: 1 });
    expect(e.origins.find((o) => o.id === 'american').of100).toBe(83);
    expect(e.mot).toBeNull();
  });
});
