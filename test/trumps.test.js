import { describe, expect, it } from 'vitest';
import { cardFigures, play, sharedBand } from '../src/trumps-calc.js';

const file = (licensed, sorn) => ({ quarters: ['2026 Q1', '2026 Q2'], variants: [{ licensed: { from: 0, values: [1, licensed] }, sorn: { from: 0, values: [1, sorn] } }] });
const band = (tests, pass) => ({ tests, pass, prs: 0, fail: tests - pass });
const mot = (meanMiles, meanAge, bands) => ({ meanMiles, meanAge, bands });
const LABELS = ['3 to 5 years', '6 to 9 years', '10 to 14 years', '15 years or more'];

describe('Top Trumps', () => {
  const a = cardFigures({
    file: file(900, 100),
    mot: mot(80_000, 10, [band(500, 450), band(500, 400), band(500, 300), band(50, 40)]),
    story: { values: [10, 300, 200] },
    years: [2001, 2002, 2003],
  });
  const b = cardFigures({
    file: file(500, 500),
    mot: mot(30_000, 10, [band(500, 480), band(500, 420), band(500, 350), band(500, 300)]),
    story: null,
    years: [],
  });

  it('works out each card’s figures', () => {
    expect(a).toMatchObject({ licensed: 900, offShare: 0.1, soldNew: 510, bestYear: { year: 2002, value: 300 }, milesPerYear: 8_000, meanAge: 10 });
    expect(b).toMatchObject({ soldNew: null, bestYear: null, offShare: 0.5 });
  });

  it('compares the MOT at the same age, preferring 10 to 14 years', () => {
    expect(sharedBand(a, b)).toBe(2);
    expect(sharedBand(a, { bands: null })).toBeNull();
  });

  it('scores each category, lower winning for off the road, and a missing figure for nobody', () => {
    const game = play(a, b, LABELS);
    const winner = Object.fromEntries(game.rows.map((r) => [r.id, r.winner]));
    expect(winner).toEqual({ licensed: 'a', sold: null, best: null, off: 'a', miles: 'a', age: null, mot: 'b' });
    expect(game.score).toEqual({ a: 3, b: 1 });
    expect(game.rows.find((r) => r.id === 'mot').label).toBe('Passes the MOT first time, at 10 to 14 years');
  });
});
