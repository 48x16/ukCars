import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildChargers, inGreatBritain, openProviders, TILE } from '../pipeline/chargers.js';
import { byDistrict, splitPostcode } from '../pipeline/postcodes.js';
import { formatDuration, minutesFor, rankChargers, speedBand, tilesAround } from '../src/charger-search.js';

const { pois, reference } = JSON.parse(readFileSync('test/fixtures/mini_ocm.json', 'utf8'));

describe('openProviders', () => {
  it('keeps openly licensed providers and leaves out non-commercial ones', () => {
    const ids = [...openProviders(reference).keys()];
    expect(ids).toContain(1); // Open Charge Map contributors, CC BY 4.0
    expect(ids).toContain(18); // the UK National Charge Point Registry, OGL
    expect(ids).not.toContain(26); // CC BY-NC-SA
  });
});

describe('inGreatBritain', () => {
  it('keeps Great Britain and leaves out Ireland, the Isle of Man and the Channel Islands', () => {
    expect(inGreatBritain(50.8225, -0.1372, 'BN1 1AA')).toBe(true); // Brighton
    expect(inGreatBritain(49.91, -6.31, 'TR21 0JA')).toBe(true); // Isles of Scilly
    expect(inGreatBritain(53.35, -6.26, '')).toBe(false); // Dublin
    expect(inGreatBritain(54.6, -5.93, 'BT1 1AA')).toBe(false); // Belfast
    expect(inGreatBritain(54.15, -4.48, '')).toBe(false); // Douglas, Isle of Man
    expect(inGreatBritain(49.19, -2.11, '')).toBe(false); // Jersey
  });
});

describe('buildChargers', () => {
  const { tiles, meta } = buildChargers(pois, reference);
  const all = [...tiles.values()].flat();

  it('counts what it keeps and why it leaves the rest out', () => {
    expect(meta.counts).toMatchObject({ read: pois.length, licence: 1, status: 1, place: 1 });
    expect(meta.counts.kept).toBe(all.length);
    expect(meta.providers.map((p) => p.id).sort()).toEqual([...new Set(all.map((c) => c.provider))].sort());
    expect(meta.tiles).toEqual([...tiles.keys()].sort());
  });

  it('gives each charger a grid position, its square, and its fastest connector', () => {
    for (const c of all) {
      expect(c.e).toBeGreaterThan(500_000); // Brighton is around E 531,000
      expect(tiles.get(`${Math.floor(c.e / TILE)}-${Math.floor(c.n / TILE)}`)).toContain(c);
      const fastest = Math.max(0, ...c.connectors.map((x) => x.kw ?? 0));
      expect(c.kw ?? 0).toBe(fastest);
    }
  });
});

describe('postcodes', () => {
  it('splits a postcode into district and the rest, however it is typed', () => {
    expect(splitPostcode('sw1a 1aa')).toEqual(['SW1A', '1AA']);
    expect(splitPostcode('BN11AA')).toEqual(['BN1', '1AA']);
    expect(splitPostcode(' M1  1AE ')).toEqual(['M1', '1AE']);
    expect(splitPostcode('BN1')).toBeNull();
    expect(splitPostcode('not a postcode')).toBeNull();
  });

  it('groups Code-Point rows by district, in tens of metres, skipping ones without a position', () => {
    const districts = byDistrict([
      '"BN1 1AA",10,531234,104567,"E92000001","","E19000002","","E06000043","E05002432"',
      '"BN1 1AB",10,531240,104561,"E92000001","","E19000002","","E06000043","E05002432"',
      '"BN2 0AA",90,0,0,"E92000001","","","","",""',
    ]);
    expect(Object.fromEntries(districts)).toEqual({ BN1: { '1AA': [53123, 10457], '1AB': [53124, 10456] } });
  });
});


describe('charger search', () => {
  it('puts chargers in the usual speed bands', () => {
    expect(speedBand(3.7).label).toBe('Slow');
    expect(speedBand(7).label).toBe('Fast');
    expect(speedBand(50).label).toBe('Rapid');
    expect(speedBand(150).label).toBe('Ultra-rapid');
    expect(speedBand(null).label).toBe('Speed not known');
  });

  it('estimates the time to add 100 miles at full speed', () => {
    expect(minutesFor(100, 150)).toBe(11); // 28.6 kWh at 150 kW
    expect(minutesFor(100, 7)).toBe(245);
    expect(formatDuration(245)).toBe('4 hr 5 min');
    expect(formatDuration(11)).toBe('11 min');
    expect(formatDuration(120)).toBe('2 hr');
    expect(minutesFor(100, null)).toBeNull();
  });

  it('finds every square within reach of a point', () => {
    expect(tilesAround(30_000, 30_000, 5_000, 20_000)).toEqual(['1-1']);
    expect(tilesAround(39_000, 21_000, 5_000, 20_000).sort()).toEqual(['1-0', '1-1', '2-0', '2-1']);
  });

  it('orders by speed then distance, or by distance, within range and above a minimum speed', () => {
    const here = [0, 0];
    const chargers = [
      { id: 'slow-near', e: 100, n: 0, kw: 7 },
      { id: 'rapid-far', e: 3_000, n: 0, kw: 50 },
      { id: 'ultra-mid', e: 0, n: 2_000, kw: 150 },
      { id: 'unknown', e: 50, n: 0, kw: null },
      { id: 'too-far', e: 20_000, n: 0, kw: 350 },
    ];
    const ids = (r) => r.chargers.map((c) => c.id);
    expect(ids(rankChargers(chargers, here, { miles: 5 }))).toEqual(['ultra-mid', 'rapid-far', 'slow-near', 'unknown']);
    expect(ids(rankChargers(chargers, here, { miles: 5, order: 'nearest' }))).toEqual(['unknown', 'slow-near', 'ultra-mid', 'rapid-far']);
    expect(ids(rankChargers(chargers, here, { miles: 5, minKw: 50 }))).toEqual(['ultra-mid', 'rapid-far']);
    expect(rankChargers(chargers, here, { miles: 5, limit: 1 })).toMatchObject({ total: 4 });
  });
});
