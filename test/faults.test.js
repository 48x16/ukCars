import { describe, expect, it } from 'vitest';
import { buildFaults } from '../pipeline/faults.js';

const index = {
  makes: [{ name: 'FORD', slug: 'ford', models: [{ name: 'FORD FIESTA', slug: 'ford-fiesta', latest: 1000, sorn: 0 }] }],
};
const mot = { models: [{ name: 'FORD FIESTA', makeSlug: 'ford', modelSlug: 'ford-fiesta' }] };
const band = (n) => [n, n, n, n];

const summary = {
  year: 2025,
  source: 'https://example',
  sections: [{ label: 'Brakes' }, { label: 'Towbars' }, { label: 'Tyres' }],
  tests: { all: 100_000, failed: 30_000, withReasons: 29_000 },
  national: [5_000, 10, 8_000],
  bands: ['3 to 5 years', '6 to 9 years', '10 to 14 years', '15 years or more'].map((label) => ({ label, tests: 25_000, counts: [1_000, 0, 2_000] })),
  fuels: [
    { id: 'petrol', tests: 60_000, counts: [3_000, 5, 5_000] },
    { id: 'other', tests: 10, counts: [0, 0, 0] },
  ],
  defects: [{ id: 1, section: 2, text: 'Tread depth below 1.6mm', count: 4_000 }],
  models: [
    // Two DVSA spellings of one DVLA model, and a model DVLA doesn't know.
    { make: 'FORD', model: 'FIESTA', tests: 4_000, failed: 1_000, bandTests: band(1_000), counts: [[10, 1, 20], [10, 1, 20], [10, 1, 20], [10, 1, 20]] },
    { make: 'FORD', model: 'FIESTA ZETEC', tests: 2_000, failed: 500, bandTests: band(500), counts: [[5, 0, 5], [5, 0, 5], [5, 0, 5], [5, 0, 5]] },
    { make: 'FORD', model: 'TRANSIT', tests: 9_000, failed: 3_000, bandTests: band(2_250), counts: [[1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1]] },
  ],
};

describe('why cars fail', () => {
  it('keeps sections common enough to show, most common first', () => {
    const f = buildFaults(summary, mot, index);
    expect(f.sections).toEqual(['Tyres', 'Brakes']); // towbars: 0.01% of tests
    expect(f.national).toEqual([8_000, 5_000]);
    expect(f.bands[0].counts).toEqual([2_000, 1_000]);
    expect(f.fuels.map((x) => x.label)).toEqual(['Petrol']);
    expect(f.defects[0]).toEqual({ text: 'Tread depth below 1.6mm', section: 'Tyres', count: 4_000 });
  });

  it('joins DVSA spellings into DVLA models, cars only, with enough tests', () => {
    const f = buildFaults(summary, mot, index);
    expect(f.models).toHaveLength(1);
    expect(f.models[0]).toMatchObject({ name: 'FORD FIESTA', tests: 6_000, failed: 1_500, bandTests: band(1_500) });
    expect(f.models[0].counts[0]).toEqual([25, 15]); // tyres, brakes
  });
});
