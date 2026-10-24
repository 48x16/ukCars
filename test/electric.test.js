import { describe, expect, it } from 'vitest';
import {
  buildElectric,
  buildLookup,
  chargersByCouncil,
  findChargersUrl,
  plugInsByCouncil,
} from '../pipeline/electric.js';
import { parseSheet } from '../pipeline/ods.js';

describe('parseSheet (ODS)', () => {
  const xml = `<office:document-content><office:body><office:spreadsheet>
    <table:table table:name="Other"><table:table-row><table:table-cell><text:p>no</text:p></table:table-cell></table:table-row></table:table>
    <table:table table:name="Data">
      <table:table-row>
        <table:table-cell office:value-type="string"><text:p>A&amp;B</text:p></table:table-cell>
        <table:table-cell table:number-columns-repeated="2"/>
        <table:table-cell office:value-type="float" office:value="0.125"><text:p>0.13</text:p></table:table-cell>
        <table:table-cell table:number-columns-repeated="16380"/>
      </table:table-row>
      <table:table-row table:number-rows-repeated="2"><table:table-cell><text:p>two<text:s text:c="2"/>spaces</text:p></table:table-cell></table:table-row>
      <table:table-row table:number-rows-repeated="1048000"><table:table-cell table:number-columns-repeated="16384"/></table:table-row>
    </table:table>
  </office:spreadsheet></office:body></office:document-content>`;

  it('reads cells, expanding repeats and preferring exact numbers', () => {
    expect(parseSheet(xml, 'Data')).toEqual([['A&B', '', '', '0.125'], ['two  spaces'], ['two  spaces']]);
  });
  it('names a missing sheet', () => {
    expect(() => parseSheet(xml, 'Nope')).toThrow(/No sheet named "Nope"/);
  });
});

describe('findChargersUrl', () => {
  it('finds the one EVCI0102 workbook link', () => {
    const url = 'https://assets.publishing.service.gov.uk/media/abc/evci0102_2026-07_EV_chargers_by_local_authority_UK.ods';
    expect(findChargersUrl(`<a href="${url}">x</a><a href="${url}">again</a>`)).toBe(url);
    expect(() => findChargersUrl('<p>nothing</p>')).toThrow(/found 0/);
  });
});

const lookupRows = [
  { lsoa21cd: 'E01000001', ladcd: 'E09000001', ladnm: 'City', doterm: '' },
  { lsoa21cd: 'E01000002', ladcd: 'E09000002', ladnm: 'Barking', doterm: '' },
  { lsoa21cd: 'E01000002', ladcd: 'E09000002', ladnm: 'Barking', doterm: '' },
  { lsoa21cd: 'E01000002', ladcd: 'E09000001', ladnm: 'City', doterm: '' }, // minority postcode
  { lsoa21cd: 'E01000002', ladcd: 'E09000001', ladnm: 'City', doterm: '202001' }, // terminated
  { lsoa21cd: 'S01000001', ladcd: 'S12000033', ladnm: 'Aberdeen City', doterm: '' },
];

const veh0145 = [
  ['LSOA21CD', 'LSOA21NM', 'Fuel', 'Keepership', '2026 Q2', '2026 Q1', '2025 Q4', '2025 Q3', '2025 Q2'],
  ['E01000001', 'City 001A', 'Total', 'Private', '10', '9', '8', '7', '6'],
  ['E01000001', 'City 001A', 'Battery electric', 'Private', '6', '[c]', '5', '5', '4'],
  ['E01000001', 'City 001A', 'Total', 'Company', '500', '500', '500', '500', '500'], // leasing HQ
  ['E01000002', 'Barking 001A', 'Total', 'Private', '20', '18', '16', '14', '12'],
  ['E01000002', 'Barking 001A', 'Battery electric', 'Private', '10', '9', '8', '7', '6'],
  ['S01000001', 'Cults - 01', 'Total', 'Private', '[c]', '[c]', '0', '0', '0'],
  ['Miscellaneous', 'Miscellaneous', 'Total', 'Private', '3', '3', '3', '3', '3'],
];

const chargerSheet = [
  ['EVCI0102e: title'],
  ['Date', 'Notes', 'Local authority code', 'Local authority', 'Key', 'Value'],
  ['1 April 2026', '[no note]', 'E09000001', 'City', 'EV chargers', '1'],
  ['1 July 2026', '[no note]', 'E09000001', 'City', 'EV chargers', '5'],
  ['1 July 2026', '[no note]', 'E09000001', 'City', '50kW+ EV chargers', '2'],
  ['1 July 2026', '[no note]', 'E09000001', 'City', 'EV chargers per 100k', '50'],
  ['1 July 2026', '[no note]', 'E09000002', 'Barking', 'EV chargers', '4'],
  ['1 July 2026', '[no note]', 'E09000002', 'Barking', 'EV chargers per 100k', '2'],
  ['1 July 2026', '[no note]', 'S12000033', 'Aberdeen City', 'EV chargers', '0'],
  ['1 July 2026', '[no note]', 'S12000033', 'Aberdeen City', 'EV chargers per 100k', '[x]'],
];

describe('electric pipeline', () => {
  it('places each small area in the council with most of its live postcodes', async () => {
    const { areas, names } = await buildLookup(lookupRows);
    expect(Object.fromEntries(areas)).toEqual({ E01000001: 'E09000001', E01000002: 'E09000002', S01000001: 'S12000033' });
    expect(names.get('S12000033')).toBe('Aberdeen City');
  });

  it('adds up private plug-ins per council, oldest quarter first', async () => {
    const lookup = await buildLookup(lookupRows);
    const p = await plugInsByCouncil(veh0145, lookup);
    expect(p.quarters).toEqual(['2025 Q2', '2025 Q3', '2025 Q4', '2026 Q1', '2026 Q2']);
    expect(p.councils.get('E09000001')).toEqual({ total: [6, 7, 8, 9, 10], electric: [4, 5, 5, 0, 6] });
    expect(p.uk.total).toEqual([21, 24, 27, 30, 33]); // includes Miscellaneous, so it's the national total
    expect(p.unplaced).toBe(3);
  });

  it('rejects an unexpected VEH0145 layout', async () => {
    await expect(plugInsByCouncil([['code', 'name']], { areas: new Map() })).rejects.toThrow(/unexpected columns/);
  });

  it('reads the latest chargers per council', () => {
    const c = chargersByCouncil(chargerSheet);
    expect(c.date).toBe('1 July 2026');
    expect(c.councils.get('E09000001')).toEqual({ name: 'City', 'EV chargers': 5, '50kW+ EV chargers': 2, 'EV chargers per 100k': 50 });
    expect(c.councils.get('S12000033')).toEqual({ name: 'Aberdeen City', 'EV chargers': 0 });
  });

  it('joins plug-ins to chargers, with rates where they can be worked out', async () => {
    const plugIns = await plugInsByCouncil(veh0145, await buildLookup(lookupRows));
    const e = buildElectric({ plugIns, chargers: chargersByCouncil(chargerSheet) });
    expect(e.plugInQuarter).toBe('2026 Q2');
    expect(e.uk).toMatchObject({ chargers: 9, rapid: 2 });
    const city = e.councils.find((c) => c.code === 'E09000001');
    expect(city).toMatchObject({ nation: 'England', plugIns: 10, electric: 6, plugInsYearAgo: 6, population: 10_000, plugInsPerCharger: 2 });
    expect(city.plugInsPer1000).toBe(1);
    expect(city.history).toEqual([6, 7, 8, 9, 10]);
    const aberdeen = e.councils.find((c) => c.code === 'S12000033');
    expect(aberdeen).toMatchObject({ nation: 'Scotland', plugIns: 0, population: null, plugInsPerCharger: null });
  });

  it("fails loudly when the councils don't match", async () => {
    const plugIns = await plugInsByCouncil(veh0145, await buildLookup(lookupRows));
    const chargers = chargersByCouncil(chargerSheet.filter((r) => r[2] !== 'E09000002'));
    expect(() => buildElectric({ plugIns, chargers })).toThrow(/no chargers for E09000002/);
  });
});
