import { describe, expect, it } from 'vitest';
import { addCounts, compactSeries, createAggregator, parseCount, shortHash, slugify } from '../pipeline/slice.js';

const QUARTERS = ['2015 Q2', '2015 Q1', '2014 Q4', '2014 Q3'];
const OLDEST_FIRST = ['2014 Q3', '2014 Q4', '2015 Q1', '2015 Q2'];

function slice(rows) {
  const agg = createAggregator(QUARTERS);
  rows.forEach((r) => agg.add(r));
  return agg.result();
}

const car = (make, genModel, model, fuel, counts, status = 'Licensed') => [
  'Cars', make, genModel, model, fuel, status, ...counts.map(String),
];

describe('parseCount and addCounts', () => {
  it('turns symbols into null', () => {
    expect(['12', '0', '[c]', '[x]', '[z]'].map(parseCount)).toEqual([12, 0, null, null, null]);
  });

  it('keeps unknown + known as unknown', () => {
    expect(addCounts(3, 4)).toBe(7);
    expect(addCounts(null, 4)).toBeNull();
    expect(addCounts(3, null)).toBeNull();
  });
});

describe('compactSeries', () => {
  it('trims leading zeros and records where values start', () => {
    expect(compactSeries([0, 0, 2, 5])).toEqual({ from: 2, values: [2, 5] });
  });

  it('treats a leading null as data, not as a zero to trim', () => {
    expect(compactSeries([0, null, 2, 5])).toEqual({ from: 1, values: [null, 2, 5] });
  });

  it('turns an all-zero or missing series into null', () => {
    expect(compactSeries([0, 0, 0])).toBeNull();
    expect(compactSeries(undefined)).toBeNull();
  });
});

describe('slugify', () => {
  it.each([
    ['MERCEDES-BENZ', 'mercedes-benz'],
    ['ROLLS ROYCE', 'rolls-royce'],
    ['LYNK & CO', 'lynk-and-co'],
    ['LONDON TAXIS INT.', 'london-taxis-int'],
    ['DS', 'ds'],
    ['BMW 3 SERIES', 'bmw-3-series'],
    ['FORD KA+', 'ford-ka-plus'],
  ])('%s -> %s', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });
});

describe('createAggregator', () => {
  it('keeps only cars', () => {
    const { files } = slice([
      ['Motorcycles', 'HONDA', 'HONDA CBR', 'CBR600', 'Petrol', 'Licensed', '5', '5', '5', '5'],
      car('FORD', 'FORD FIESTA', 'FIESTA', 'Petrol', [4, 3, 2, 1]),
    ]);
    expect(files.map((f) => f.path)).toEqual(['models/ford/ford-fiesta.json']);
  });

  it('writes one file per GenModel with quarters oldest first', () => {
    const { files } = slice([car('FORD', 'FORD FIESTA', 'FIESTA', 'Petrol', [4, 3, 2, 1])]);
    expect(files[0].data).toEqual({
      make: 'FORD',
      genModel: 'FORD FIESTA',
      quarters: OLDEST_FIRST,
      variants: [{ model: 'FIESTA', fuel: 'Petrol', licensed: { from: 0, values: [1, 2, 3, 4] }, sorn: null }],
    });
  });

  it('keeps licensed and SORN counts for the same variant side by side', () => {
    const { files } = slice([
      car('FORD', 'FORD FIESTA', 'FIESTA', 'Petrol', [10, 9, 8, 7]),
      car('FORD', 'FORD FIESTA', 'FIESTA', 'Petrol', [2, 1, 0, 0], 'SORN'),
    ]);
    expect(files[0].data.variants).toEqual([
      {
        model: 'FIESTA',
        fuel: 'Petrol',
        licensed: { from: 0, values: [7, 8, 9, 10] },
        sorn: { from: 2, values: [1, 2] },
      },
    ]);
  });

  it('keeps variants that are only off the road', () => {
    const { files, index } = slice([car('AUSTIN', 'AUSTIN HEALEY', '3000', 'Petrol', [40, 41, 42, 43], 'SORN')]);
    expect(files[0].data.variants[0]).toMatchObject({ licensed: null, sorn: { from: 0, values: [43, 42, 41, 40] } });
    expect(index.makes[0]).toMatchObject({ name: 'AUSTIN', latest: 0, sorn: 40 });
  });

  it('keeps each Model and fuel as its own variant, sorted', () => {
    const { files } = slice([
      car('FORD', 'FORD FIESTA', 'FIESTA ZETEC', 'Petrol', [1, 1, 1, 1]),
      car('FORD', 'FORD FIESTA', 'FIESTA ST', 'Petrol', [2, 2, 2, 2]),
      car('FORD', 'FORD FIESTA', 'FIESTA ZETEC', 'Diesel', [3, 3, 3, 3]),
    ]);
    expect(files[0].data.variants.map((v) => `${v.model}/${v.fuel}`)).toEqual([
      'FIESTA ST/Petrol',
      'FIESTA ZETEC/Diesel',
      'FIESTA ZETEC/Petrol',
    ]);
  });

  it('adds up duplicate variant rows', () => {
    const { files } = slice([
      car('FORD', 'FORD FIESTA', 'FIESTA', 'Petrol', [1, 1, 1, 1]),
      car('FORD', 'FORD FIESTA', 'FIESTA', 'Petrol', [2, '[c]', 2, 2]),
    ]);
    expect(files[0].data.variants[0].licensed.values).toEqual([3, 3, null, 3]);
  });

  it('drops variants that are zero in every quarter, and GenModels left empty', () => {
    const { files, index } = slice([
      car('FORD', 'FORD FOCUS', 'FOCUS OLD', 'Petrol', [0, 0, 0, 0]),
      car('FORD', 'FORD FOCUS', 'FOCUS OLD', 'Petrol', [0, 0, 0, 0], 'SORN'),
      car('FORD', 'FORD FIESTA', 'FIESTA', 'Petrol', [1, 1, 1, 1]),
    ]);
    expect(files).toHaveLength(1);
    expect(index.makes[0].models.map((m) => m.name)).toEqual(['FORD FIESTA']);
  });

  it('builds an index with latest-quarter licensed and SORN totals', () => {
    const { index } = slice([
      car('FORD', 'FORD FIESTA', 'FIESTA', 'Petrol', [10, 9, 8, 7]),
      car('FORD', 'FORD FIESTA', 'FIESTA', 'Petrol', [3, 3, 3, 3], 'SORN'),
      car('FORD', 'FORD FIESTA', 'FIESTA', 'Diesel', [5, 5, 5, 5]),
      car('FORD', 'FORD KA', 'KA', 'Petrol', [0, 0, 4, 4]),
      car('LYNK & CO', 'LYNK & CO 01', '01', 'Petrol', [2, 1, 0, 0]),
    ]);
    expect(index).toEqual({
      latestQuarter: '2015 Q2',
      makes: [
        {
          name: 'FORD',
          slug: 'ford',
          latest: 15,
          sorn: 3,
          models: [
            { name: 'FORD FIESTA', slug: 'ford-fiesta', latest: 15, sorn: 3 },
            { name: 'FORD KA', slug: 'ford-ka', latest: 0, sorn: 0 },
          ],
        },
        {
          name: 'LYNK & CO',
          slug: 'lynk-and-co',
          latest: 2,
          sorn: 0,
          models: [{ name: 'LYNK & CO 01', slug: 'lynk-and-co-01', latest: 2, sorn: 0 }],
        },
      ],
    });
  });

  it('gives names that would share a file name distinct, stable slugs', () => {
    const rows = [
      car('LONDON TAXIS INT', 'LONDON TAXIS INT TX4', 'TX4', 'Diesel', [1, 1, 1, 1]),
      car('LONDON TAXIS INT.', 'LONDON TAXIS INT. TX2', 'TX2', 'Diesel', [1, 1, 1, 1]),
    ];
    const first = slice(rows).index.makes.map((m) => m.slug);
    expect(first[0]).toBe('london-taxis-int');
    expect(first[1]).toBe(`london-taxis-int-${shortHash('LONDON TAXIS INT.')}`);
    expect(slice([...rows].reverse()).index.makes.map((m) => m.slug)).toEqual(first);
  });
});
