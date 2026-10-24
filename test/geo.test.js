import { describe, expect, it } from 'vitest';
import { buildOutline, simplify, snapRing } from '../pipeline/geo.js';

// A 10 km square with a 50 m kink along its bottom edge.
const square = [
  [0, 0],
  [5_000, 50],
  [10_000, 0],
  [10_000, 10_000],
  [0, 10_000],
  [0, 0],
];

describe('simplify', () => {
  it('drops points that stay within the tolerance and keeps the corners', () => {
    expect(simplify(square, 100)).toEqual([[0, 0], [10_000, 0], [10_000, 10_000], [0, 10_000], [0, 0]]);
  });
  it('keeps points further out than the tolerance', () => {
    expect(simplify(square, 10)).toHaveLength(6);
  });
});

describe('snapRing', () => {
  it('snaps to the grid and removes repeated points', () => {
    const ring = [[0, 0], [120, 90], [10_010, 0], [10_000, 9_990], [0, 10_000], [0, 0]];
    expect(snapRing(ring, { grid: 500, tolerance: 0 })).toEqual([[0, 0], [10_000, 0], [10_000, 10_000], [0, 10_000], [0, 0]]);
  });
  it('drops islets too small to see', () => {
    expect(snapRing([[0, 0], [1_000, 0], [1_000, 1_000], [0, 1_000], [0, 0]])).toBeNull();
  });
});

describe('buildOutline', () => {
  const feature = (code, name) => ({
    properties: { CTRY25CD: code, CTRY25NM: name },
    geometry: { type: 'MultiPolygon', coordinates: [[square, [[1, 1], [2, 1], [2, 2], [1, 1]]]] },
  });

  it('keeps Great Britain, leaves out Northern Ireland and lakes', () => {
    const outline = buildOutline({ features: [feature('E92000001', 'England'), feature('N92000002', 'Northern Ireland')] });
    expect(outline.features.map((f) => f.properties.name)).toEqual(['England']);
    expect(outline.features[0].geometry.coordinates).toEqual([[[[0, 0], [10_000, 0], [10_000, 10_000], [0, 10_000], [0, 0]]]]);
  });
});
