import { describe, expect, it } from 'vitest';
import { expandVariant, fuelGroupOf, seriesByFuel, totalAt } from '../src/series.js';

const file = {
  make: 'FORD',
  genModel: 'FORD FIESTA',
  quarters: ['2014 Q3', '2014 Q4', '2015 Q1', '2015 Q2'],
  variants: [
    { model: 'FIESTA ST', fuel: 'Petrol', from: 0, values: [2, 2, null, 3] },
    { model: 'FIESTA ZETEC', fuel: 'Diesel', from: 2, values: [5, 5] },
    { model: 'FIESTA ZETEC', fuel: 'Petrol', from: 0, values: [7, 8, 9, 10] },
    { model: 'FIESTA HYBRID', fuel: 'Hybrid electric (petrol)', from: 3, values: [1] },
    { model: 'FIESTA MHEV', fuel: 'Hybrid electric (diesel)', from: 2, values: [4, 4] },
  ],
};

describe('fuelGroupOf', () => {
  it('groups related fuels and sends unknown fuels to Other', () => {
    expect(fuelGroupOf('Hybrid electric (diesel)')).toBe('hybrid');
    expect(fuelGroupOf('Range extended electric')).toBe('plugin');
    expect(fuelGroupOf('Gas')).toBe('other');
    expect(fuelGroupOf('Ammonia')).toBe('other');
  });
});

describe('expandVariant', () => {
  it('restores the trimmed leading zeros', () => {
    expect(expandVariant({ from: 2, values: [5, 6] }, 4)).toEqual([0, 0, 5, 6]);
  });
});

describe('seriesByFuel', () => {
  it('sums all variants by fuel group in a fixed order', () => {
    expect(seriesByFuel(file)).toEqual([
      { id: 'petrol', label: 'Petrol', values: [9, 10, null, 13] },
      { id: 'diesel', label: 'Diesel', values: [0, 0, 5, 5] },
      { id: 'hybrid', label: 'Hybrid', values: [0, 0, 4, 5] },
    ]);
  });

  it('charts a single variant', () => {
    expect(seriesByFuel(file, 1)).toEqual([{ id: 'diesel', label: 'Diesel', values: [0, 0, 5, 5] }]);
  });
});

describe('totalAt', () => {
  it('adds every series for a quarter', () => {
    expect(totalAt(seriesByFuel(file), 3)).toBe(23);
  });

  it('is null when any part is suppressed', () => {
    expect(totalAt(seriesByFuel(file), 2)).toBeNull();
  });
});
