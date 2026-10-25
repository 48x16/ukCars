import { describe, expect, it } from 'vitest';
import {
  aggregateRegistrations,
  arrivalsStory,
  dieselStory,
  makeStory,
  modelLabel,
  platesStory,
  rankModels,
  storyMakes,
  suvStory,
  titleCase,
} from '../pipeline/registrations.js';

/** A tiny VEH0160 file, 2001 Q1 to 2002 Q2, newest quarter first as DfT publishes it. */
const QUARTERS = ['2002 Q2', '2002 Q1', '2001 Q4', '2001 Q3', '2001 Q2', '2001 Q1'];
const row = (make, genModel, model, fuel, values) => ['Cars', make, genModel, model, fuel, ...values].join(',');
const csv = (rows) => [['BodyType', 'Make', 'GenModel', 'Model', 'Fuel', ...QUARTERS].join(','), ...rows].join('\n');
const each = (n) => QUARTERS.map(() => n);

const file = csv([
  row('NISSAN', 'NISSAN QASHQAI', 'QASHQAI N-CONNECTA', 'Petrol', each(100)),
  row('FORD', 'FORD FOCUS', 'FOCUS ZETEC', 'Diesel', [10, 20, 30, 40, 50, 60]),
  row('CITROEN', 'CITROEN C4', 'C4 PICASSO VTR', 'Diesel', each(5)),
  row('BYD', 'BYD SEAL', 'SEAL DESIGN', 'Battery electric', each(200)),
  row('MG', 'MG ZS', 'ZS 120', 'Petrol', each(7)),
  row('MERCEDES-BENZ', 'MERCEDES-BENZ C CLASS', 'C 200', 'Petrol', each(3)),
  row('MERCEDES', 'MERCEDES C CLASS', 'C 220 D', 'Diesel', each(4)),
  row('FORD', 'FORD MODEL MISSING', 'X', 'Petrol', each(1)),
  row('HONDA', 'HONDA JAZZ', 'JAZZ EX', 'Petrol', each(999)),
  row('HONDA', 'HONDA CBR', 'CBR600', 'Petrol', each(999)), // a motorbike in DVLA's car figures: left out
  row('Light goods', 'FORD', 'FORD TRANSIT', 'Diesel', each(500)).replace(/^Cars,/, ''),
]);

describe('names', () => {
  it('title-cases as the site does, keeping short words and hyphen parts in capitals', () => {
    expect(titleCase('LAND ROVER')).toBe('Land Rover');
    expect(titleCase('HONDA CR-V')).toBe('Honda CR-V');
    expect(titleCase('NISSAN X-TRAIL')).toBe('Nissan X-Trail');
    expect(modelLabel('LAND ROVER', 'LAND ROVER RANGE ROVER EVOQUE')).toBe('Range Rover Evoque');
    expect(modelLabel('BMW', 'BMW 3 SERIES')).toBe('3 Series');
  });
});

describe('new cars since 2001', () => {
  const agg = aggregateRegistrations(file);

  it('sums quarters into years, oldest first, and marks the partial year', () => {
    expect(agg.years).toEqual([2001, 2002]);
    expect(agg.quarters).toEqual(['2001 Q1', '2001 Q2', '2001 Q3', '2001 Q4', '2002 Q1', '2002 Q2']);
    expect(agg.partial).toEqual({ year: 2002, quarters: 2 });
    const focus = agg.models.find((m) => m.genModel === 'FORD FOCUS');
    expect(focus.values).toEqual([60 + 50 + 40 + 30, 20 + 10]);
    expect(focus.before).toBe(60); // new cars in the file's first quarter
  });

  it('counts cars only (no vans or motorbikes), and treats Mercedes-Benz as Mercedes', () => {
    expect(agg.models.some((m) => m.genModel === 'FORD TRANSIT' || m.genModel === 'HONDA CBR')).toBe(false);
    const mercedes = agg.models.filter((m) => m.make === 'MERCEDES');
    expect(mercedes.map((m) => m.genModel)).toEqual(['MERCEDES C CLASS']);
    expect(mercedes[0].values).toEqual([28, 14]);
  });

  it('splits fuels, body styles (variant rules included) and origins', () => {
    const d = dieselStory(agg);
    expect(d.fuels.find((f) => f.id === 'diesel').values).toEqual([180 + 20 + 16, 30 + 10 + 8]);
    const s = suvStory(agg);
    const body = (id) => s.bodies.find((b) => b.id === id).values;
    expect(body('suv')[0]).toBe(400); // Qashqai; the 2001 MG ZS was MG Rover's hatch
    expect(body('mpv')[0]).toBe(20); // the C4 Picasso, filed under C4
    expect(s.bodies.find((b) => b.id === 'suv').leaders[0].label).toBe('Nissan Qashqai');
    expect(s.unclassified[0]).toBe(4); // the unrecorded Ford
  });

  it('counts Chinese arrivals, with MGs only from SAIC’s time', () => {
    const a = arrivalsStory(agg);
    expect(a.makes.map((m) => m.label)).toEqual(['BYD']);
    expect(a.chinese).toEqual([800, 400]);
  });

  it('keeps every quarter for the plate days', () => {
    const plates = platesStory(agg);
    expect(plates.quarters).toHaveLength(6);
    expect(plates.values[0]).toBe(100 + 60 + 5 + 200 + 7 + 3 + 4 + 1 + 999); // 2001 Q1
  });

  it('ranks models each year, leaving out unrecorded models', () => {
    const ranks = rankModels(agg);
    const rank = (genModel) => ranks.get(agg.models.find((m) => m.genModel === genModel));
    expect(rank('HONDA JAZZ')).toEqual([1, 1]);
    expect(rank('NISSAN QASHQAI')).toEqual([3, 3]);
    expect(rank('FORD MODEL MISSING')).toBeUndefined();
  });

  it('builds a make’s story in the Mini page’s shape, with launches and slugs', () => {
    const ranks = rankModels(agg);
    const ford = makeStory(agg, 'FORD', { ranks, slugs: { make: 'ford', models: { 'FORD FOCUS': 'ford-focus' } } });
    expect(ford.label).toBe('Ford');
    expect(ford.totals).toEqual([184, 32]); // unrecorded models count in the total
    expect(ford.models.map((m) => m.id)).toEqual(['ford-focus']);
    expect(ford.models[0]).toMatchObject({ label: 'Focus', launched: null, ended: null, ranks: [4, 4] });
    expect(ford.fleet).toBeNull();
    expect(storyMakes(agg)).toEqual([{ make: 'HONDA', total: 5994 }, { make: 'BYD', total: 1200 }]);
  });
});
