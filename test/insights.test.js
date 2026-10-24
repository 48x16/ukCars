import { describe, expect, it } from 'vitest';
import { buildInsights } from '../pipeline/insights.js';

// Six quarters; a one-year window compares the last quarter with the second (index 1).
const QUARTERS = ['2024 Q1', '2024 Q2', '2024 Q3', '2024 Q4', '2025 Q1', '2025 Q2'];
const series = (values) => ({ from: 0, values });

const model = (make, genModel, variants) => ({
  path: `models/${make.toLowerCase()}/${genModel.toLowerCase().replace(/ /g, '-')}.json`,
  data: { make, genModel, quarters: QUARTERS, variants },
});

const files = [
  // Fading fast: 100 -> 40 over the window (-60%), lots in storage.
  model('FORD', 'FORD KA', [
    { model: 'KA', fuel: 'Petrol', licensed: series([120, 100, 90, 70, 50, 40]), sorn: series([10, 20, 30, 40, 50, 60]) },
  ]),
  // Growing: 50 -> 150 (+200%).
  model('TESLA', 'TESLA MODEL 3', [
    { model: 'MODEL 3', fuel: 'Battery electric', licensed: series([20, 50, 80, 100, 120, 150]), sorn: null },
  ]),
  // Diesel down 200 -> 180, plug-in up 0 -> 20: flat overall. Diesel peaks in share early on.
  model('VW', 'VW GOLF', [
    { model: 'GOLF TDI', fuel: 'Diesel', licensed: series([210, 200, 195, 190, 185, 180]), sorn: series([0, 0, 0, 1, 1, 2]) },
    { model: 'GOLF GTE', fuel: 'Plug-in hybrid electric (petrol)', licensed: { from: 3, values: [5, 10, 20] }, sorn: null },
  ]),
  // Too small at the start of the window to rank, whatever its percentage.
  model('FIAT', 'FIAT X', [
    { model: 'X', fuel: 'Petrol', licensed: series([1, 2, 30, 30, 30, 30]), sorn: series([0, 0, 0, 0, 0, 50]) },
  ]),
  // Suppressed counts are counted as zero at fleet scale.
  model('MG', 'MG B', [
    { model: 'B', fuel: 'Petrol', licensed: series([5, 5, null, 5, 5, 5]), sorn: series([30, 30, 30, 30, 30, 30]) },
  ]),
];

const insights = buildInsights({ files }, { years: 1, minBase: 20, minSorn: 25, top: 2, topMakes: 2 });

describe('buildInsights', () => {
  it('summarises the latest quarter for the whole fleet', () => {
    expect(insights.headline).toMatchObject({
      quarter: '2025 Q2',
      licensed: 40 + 150 + 180 + 20 + 30 + 5,
      sorn: 60 + 2 + 50 + 30,
      electric: 150,
      makes: 5,
      models: 5,
    });
    expect(insights.headline.electricShare).toBeCloseTo(150 / 425);
  });

  it('finds when diesel had its biggest share', () => {
    expect(insights.headline.dieselPeakQuarter).toBe('2024 Q1');
    expect(insights.headline.dieselPeakShare).toBeCloseTo(210 / 356);
  });

  it('lists the fastest-falling models with a meaningful starting base', () => {
    expect(insights.dying.map((m) => [m.name, Math.round(m.change * 100)])).toEqual([
      ['FORD KA', -60],
      ['VW GOLF', 0],
    ]);
    expect(insights.dying[0]).toMatchObject({ makeSlug: 'ford', modelSlug: 'ford-ka', from: 100, latest: 40 });
    expect(insights.dying[0]).toMatchObject({ peak: 120, peakQuarter: '2024 Q1' });
  });

  it('lists the fastest-growing models, skipping ones too small at the start', () => {
    expect(insights.growing.map((m) => m.name)).toEqual(['TESLA MODEL 3', 'VW GOLF']);
  });

  it('ranks garage queens by the share of cars kept off the road, with no licensed base needed', () => {
    expect(insights.garageQueens.map((m) => [m.name, Math.round(m.share * 100)])).toEqual([
      ['MG B', 86],
      ['FIAT X', 63],
    ]);
  });

  it('ranks makes at the first and latest quarter', () => {
    expect(insights.makes.map((m) => [m.make, m.firstRank, m.latestRank])).toEqual([
      ['VW', 1, 1],
      ['TESLA', 3, 2],
      ['FORD', 2, 3],
    ]);
  });

  it('gives each fuel group a share of the licensed fleet, leaving out empty groups', () => {
    const ids = insights.fuelShare.map((g) => g.id);
    expect(ids).toEqual(['petrol', 'diesel', 'plugin', 'electric']);
    const last = QUARTERS.length - 1;
    const total = insights.fuelShare.reduce((s, g) => s + g.values[last], 0);
    expect(total).toBeCloseTo(1);
  });

  it('shortens the window when there is less history than asked for', () => {
    const short = buildInsights({ files }, { years: 5, minBase: 20 });
    expect(short.settings.years).toBe(1.25); // 5 quarters of history
    expect(short.dying[0]).toMatchObject({ name: 'FORD KA', from: 120, latest: 40 });
  });

  it('tracks the electrified groups in counts', () => {
    expect(insights.electrified.map((g) => g.id)).toEqual(['electric', 'plugin']);
    expect(insights.electrified[1].values).toEqual([0, 0, 0, 5, 10, 20]);
  });
});
