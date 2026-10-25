import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildTraffic, readCsv } from '../pipeline/traffic.js';

const read = (name) => readCsv(readFileSync(`test/fixtures/mini_${name}.csv`, 'utf8'));
const files = () => ({
  vehicles: read('region_traffic_by_vehicle_type'),
  roads: read('region_traffic_by_road_type'),
  councils: read('local_authority_traffic'),
});

describe('road traffic', () => {
  it('reads DfT CSVs, quotes and exponents included', () => {
    const [row] = readCsv('"year","region_name","cars_and_taxis"\n1993,"South West",1.96743e+10');
    expect(row).toEqual({ year: 1993, region_name: 'South West', cars_and_taxis: 19_674_300_000 });
  });

  it('adds up regions into Great Britain, by vehicle and by road, oldest year first', () => {
    const t = buildTraffic(files());
    expect(t.years).toEqual([2024, 2025]);
    const sum = (rows, year, key) => rows.filter((r) => r.year === year).reduce((n, r) => n + r[key], 0);
    const vehicles = read('region_traffic_by_vehicle_type');
    expect(t.vehicles.find((v) => v.id === 'vans').values).toEqual([sum(vehicles, 2024, 'LGVs'), sum(vehicles, 2025, 'LGVs')]);
    expect(t.all[1]).toBe(sum(vehicles, 2025, 'all_motor_vehicles'));
    // Each year's road types add up to all traffic, give or take DfT's own rounding.
    expect(Math.abs(t.roads.reduce((n, r) => n + r.values[1], 0) - t.all[1]) / t.all[1]).toBeLessThan(1e-4);
    expect(t.roads.every((r) => r.roadMiles > 0)).toBe(true);
  });

  it('ranks councils by traffic per mile of road, in the latest year', () => {
    const { councils } = buildTraffic(files());
    expect(councils.year).toBe(2025);
    expect(councils.busiest[0].name).toBe('Hillingdon');
    expect(councils.quietest[0].name).toBe('Powys');
    expect(councils.busiest.map((c) => c.perRoadMile)).toEqual([...councils.busiest.map((c) => c.perRoadMile)].sort((a, b) => b - a));
  });

  it('names missing columns', () => {
    expect(() => buildTraffic({ ...files(), roads: [{ year: 2025 }] })).toThrow(/Traffic by road type is missing columns/);
  });
});
