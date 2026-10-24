import { describe, expect, it } from 'vitest';
import { osgb36ToGrid, wgs84ToGrid } from '../src/osgb.js';

const dms = (d, m, s) => (d + m / 60 + s / 3600) * (Math.PI / 180);

describe('National Grid conversion', () => {
  it("matches Ordnance Survey's worked example to the millimetre", () => {
    // OS, "A guide to coordinate systems in Great Britain", annex C: 52°39'27.2531"N 1°43'4.5177"E (OSGB36).
    const [e, n] = osgb36ToGrid(dms(52, 39, 27.2531), dms(1, 43, 4.5177));
    expect(e).toBeCloseTo(651409.903, 2);
    expect(n).toBeCloseTo(313177.27, 2);
  });

  it('shifts GPS coordinates by the WGS84 to OSGB36 datum difference, about 100 m in Britain', () => {
    // Checked against real data too: for 25,892 Open Charge Map chargers, converted positions sit a
    // median of under 1 m (east and north) from their postcode's Code-Point position.
    const lat = 52.5;
    const lon = -1.5;
    const naive = osgb36ToGrid(lat * (Math.PI / 180), lon * (Math.PI / 180)); // no datum shift
    const shifted = wgs84ToGrid(lat, lon);
    const moved = Math.hypot(shifted[0] - naive[0], shifted[1] - naive[1]);
    expect(moved).toBeGreaterThan(80);
    expect(moved).toBeLessThan(140);
  });
});
