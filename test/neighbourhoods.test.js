import { describe, expect, it } from 'vitest';
import { neighbourhoodFiles, plugInsByArea, postcodesByDistrict } from '../pipeline/neighbourhoods.js';

const veh0145 = [
  ['LSOA21CD', 'LSOA21NM', 'Fuel', 'Keepership', '2026 Q2', '2026 Q1', '2025 Q4'],
  ['E01000001', 'City 001A', 'Total', 'Private', '10', '9', '8'],
  ['E01000001', 'City 001A', 'Battery electric', 'Private', '6', '[c]', '5'],
  ['E01000001', 'City 001A', 'Total', 'Company', '500', '500', '500'], // a leasing head office: left out
  ['E01000002', 'Barking 001A', 'Total', 'Private', '20', '18', '16'],
  ['S01000001', 'Cults - 01', 'Total', 'Private', '[c]', '0', '0'],
  ['Miscellaneous', 'Miscellaneous', 'Total', 'Private', '3', '3', '3'],
];

const lookup = [
  { pcds: 'EC1A 1AA', lsoa21cd: 'E01000001', doterm: '' },
  { pcds: 'EC1A 1AB', lsoa21cd: 'E01000002', doterm: '' },
  { pcds: 'EC1A 9ZZ', lsoa21cd: 'E01000002', doterm: '201001' }, // terminated
  { pcds: 'AB15 9AA', lsoa21cd: 'S01000001', doterm: '' },
  { pcds: 'AB15 9AB', lsoa21cd: 'S09999999', doterm: '' }, // no plug-in figures for this area
];

describe('plug-ins near you', () => {
  it('keeps private plug-ins per neighbourhood, oldest quarter first, without catch-all rows', async () => {
    const { quarters, areas } = await plugInsByArea(veh0145);
    expect(quarters).toEqual(['2025 Q4', '2026 Q1', '2026 Q2']);
    expect(areas.get('E01000001')).toEqual({ name: 'City 001A', total: [8, 9, 10], electric: [5, 0, 6] });
    expect(areas.get('S01000001').total).toEqual([0, 0, 0]); // suppressed counts as zero
    expect(areas.has('Miscellaneous')).toBe(false);
  });

  it('maps live postcodes to neighbourhoods, district by district', async () => {
    const districts = await postcodesByDistrict(lookup);
    expect([...districts.keys()]).toEqual(['EC1A', 'AB15']);
    expect(Object.fromEntries(districts.get('EC1A'))).toEqual({ '1AA': 'E01000001', '1AB': 'E01000002' });
  });

  it('writes each district with only its own neighbourhoods, and each nation’s spread', async () => {
    const { index, files } = neighbourhoodFiles(await plugInsByArea(veh0145), await postcodesByDistrict(lookup));
    const ec1a = files.get('EC1A');
    expect(ec1a.a.map((a) => a[0])).toEqual(['E01000001', 'E01000002']);
    expect(ec1a.p).toEqual({ '1AA': 0, '1AB': 1 });
    expect(files.get('AB15').p).toEqual({ '9AA': 0 }); // the postcode with no figures is left out
    expect(index.nations.E).toMatchObject({ name: 'England', areas: 2 });
    expect(index.nations.E.spread[0]).toBe(10);
    expect(index.nations.E.spread[100]).toBe(20);
  });

  it('rejects an unexpected VEH0145 layout', async () => {
    await expect(plugInsByArea([['code', 'name']])).rejects.toThrow(/unexpected columns/);
  });
});
