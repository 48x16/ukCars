import { describe, expect, it } from 'vitest';
import { bandFor, mileagePercentile, nationalBandRate, rarity } from '../src/your-car-calc.js';

const index = {
  makes: [
    {
      slug: 'ford',
      models: [
        { name: 'FORD FIESTA', slug: 'ford-fiesta', latest: 1000, sorn: 100 },
        { name: 'FORD KA', slug: 'ford-ka', latest: 300, sorn: 50 },
        { name: 'FORD MODEL MISSING', slug: 'ford-model-missing', latest: 5000, sorn: 0 },
      ],
    },
    { slug: 'kia', models: [{ name: 'KIA CLARUS', slug: 'kia-clarus', latest: 4, sorn: 10 }] },
  ],
};

describe('your car', () => {
  it('ranks a model among all models, leaving out "model missing"', () => {
    expect(rarity(index, 'ford', 'ford-ka')).toMatchObject({ known: 350, rank: 2, of: 3, oneIn: 4 }); // 1,304 licensed / 300
    expect(rarity(index, 'kia', 'kia-clarus')).toMatchObject({ rank: 3, oneIn: 326 });
    expect(rarity(index, 'ford', 'nope')).toBeNull();
  });

  it('places a mileage among cars of the same age', () => {
    // 10,000-mile bands: 10 cars under 10k, 20 from 10k to 20k, 10 at 20k or more.
    const counts = [10, 20, 10];
    expect(mileagePercentile(counts, 10_000, 15_000)).toMatchObject({ share: 0.5, median: 15_000, cars: 40 });
    expect(mileagePercentile(counts, 10_000, 0).share).toBe(0);
    expect(mileagePercentile(counts, 10_000, 99_000).share).toBe(0.875); // the open-ended top band counts half
    expect(mileagePercentile([0, 0], 10_000, 5)).toBeNull();
  });

  it('finds the age band and the pass rate of all cars in it', () => {
    const ageBands = [{ label: '3 to 5 years', from: 3, to: 5 }, { label: '15 years or more', from: 15, to: null }];
    expect(bandFor(ageBands, 4).index).toBe(0);
    expect(bandFor(ageBands, 30).index).toBe(1);
    expect(bandFor(ageBands, 8)).toBeNull();
    const byAge = [{ age: 3, tests: 10, pass: 9 }, { age: 4, tests: 10, pass: 7 }, { age: 9, tests: 99, pass: 0 }];
    expect(nationalBandRate(byAge, ageBands[0])).toBe(0.8);
  });
});
