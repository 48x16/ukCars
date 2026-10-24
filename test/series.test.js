import { describe, expect, it } from 'vitest';
import { expandSeries, fuelGroupOf, seriesByFuel, sornSeries, totalAt } from '../src/series.js';

const file = {
  make: 'FORD',
  genModel: 'FORD FIESTA',
  quarters: ['2014 Q3', '2014 Q4', '2015 Q1', '2015 Q2'],
  variants: [
    { model: 'FIESTA ST', fuel: 'Petrol', licensed: { from: 0, values: [2, 2, null, 3] }, sorn: null },
    { model: 'FIESTA ZETEC', fuel: 'Diesel', licensed: { from: 2, values: [5, 5] }, sorn: { from: 3, values: [1] } },
    {
      model: 'FIESTA ZETEC',
      fuel: 'Petrol',
      licensed: { from: 0, values: [7, 8, 9, 10] },
      sorn: { from: 0, values: [1, 1, 2, 2] },
    },
    { model: 'FIESTA HYBRID', fuel: 'Hybrid electric (petrol)', licensed: { from: 3, values: [1] }, sorn: null },
    { model: 'FIESTA MHEV', fuel: 'Hybrid electric (diesel)', licensed: { from: 2, values: [4, 4] }, sorn: null },
    { model: 'FIESTA XR2', fuel: 'Petrol', licensed: null, sorn: { from: 0, values: [6, 6, 6, 6] } },
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

describe('expandSeries', () => {
  it('restores the trimmed leading zeros', () => {
    expect(expandSeries({ from: 2, values: [5, 6] }, 4)).toEqual([0, 0, 5, 6]);
  });

  it('treats a missing series as all zeros', () => {
    expect(expandSeries(null, 3)).toEqual([0, 0, 0]);
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

  it('has no fuel lines for a variant that is only off the road', () => {
    expect(seriesByFuel(file, 5)).toEqual([]);
  });
});

describe('sornSeries', () => {
  it('sums SORN counts across every variant and fuel', () => {
    expect(sornSeries(file)).toEqual({ id: 'sorn', label: 'Off the road (SORN)', values: [7, 7, 8, 9] });
  });

  it('follows the chosen variant', () => {
    expect(sornSeries(file, 1).values).toEqual([0, 0, 0, 1]);
  });

  it('is null when nothing is off the road', () => {
    expect(sornSeries(file, 0)).toBeNull();
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
