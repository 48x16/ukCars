import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildFuelPrices, findCsvUrls, parseFuelCsv } from '../pipeline/fuel-prices.js';

const fixture = readFileSync('test/fixtures/mini_fuel_prices.csv', 'utf8');

describe('weekly fuel prices', () => {
  it('reads the DESNZ CSV, with its byte-order mark and mixed line endings', () => {
    const rows = parseFuelCsv(fixture);
    expect(rows[0]).toEqual({ date: '2003-06-09', petrol: 74.59, diesel: 76.77, petrolDuty: 45.82, dieselDuty: 45.82, vat: 17.5 });
    expect(rows).toHaveLength(8);
  });

  it('merges files into one weekly series, oldest first, without repeats', () => {
    const header = fixture.split(/\r?\n/)[0];
    const later = [header, '19/10/2026,174.57,199.33,52.95,52.95,20,20', '01/01/2000,70,72,40,40,17.5,17.5'].join('\n');
    const prices = buildFuelPrices([fixture, later]);
    expect(prices.weeks[0]).toBe('2000-01-01');
    expect(prices.weeks.filter((w) => w === '2026-10-19')).toHaveLength(1);
    expect(prices.weeks).toEqual([...prices.weeks].sort());
  });

  it('rejects a changed layout or an impossible price', () => {
    expect(() => parseFuelCsv('Date,Something else\n01/01/2020,1')).toThrow(/missing columns/);
    expect(() => buildFuelPrices([fixture.replace('74.59', '7459')])).toThrow(/out of range on 2003-06-09/);
  });

  it('finds the CSV links on the GOV.UK page', () => {
    const html =
      '<a href="https://assets.publishing.service.gov.uk/media/abc/weekly_road_fuel_prices_2003_to_2017.csv">a</a>' +
      '<a href="https://assets.publishing.service.gov.uk/media/def/CSV__2018_-__.csv">b</a><a href="/x.xlsx">c</a>';
    expect(findCsvUrls(html)).toHaveLength(2);
    expect(() => findCsvUrls('<p>none</p>')).toThrow(/No CSV links/);
  });
});
