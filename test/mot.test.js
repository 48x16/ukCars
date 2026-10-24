import { createReadStream } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { candidates, createMatcher, joinMot } from '../pipeline/mot-join.js';
import { addCsvStream, ageInYears, createMotAggregator, MAX_AGE, splitCsv } from '../pipeline/mot.js';
import { listEntries, openEntry } from '../pipeline/zip.js';

const CSV = 'test/fixtures/mini_mot.csv';
const ZIP = 'test/fixtures/mini_mot.zip';

async function summarise(stream) {
  const aggregator = createMotAggregator({ minModelTests: 1 });
  await addCsvStream(aggregator, stream);
  return aggregator.result();
}

describe('splitCsv', () => {
  it('splits plain lines', () => {
    expect(splitCsv('a,b,,c')).toEqual(['a', 'b', '', 'c']);
  });
  it('keeps commas and doubled quotes inside quoted fields', () => {
    expect(splitCsv('LAND ROVER,"SERIES 1, 80 INCH",GREEN')).toEqual(['LAND ROVER', 'SERIES 1, 80 INCH', 'GREEN']);
    expect(splitCsv('"say ""hi""",x')).toEqual(['say "hi"', 'x']);
  });
  it("reads DVSA's backslash-escaped quotes", () => {
    expect(splitCsv('LAND ROVER,"SWB 88\\"",GREEN')).toEqual(['LAND ROVER', 'SWB 88"', 'GREEN']);
    expect(splitCsv('x,"SERIES 3 88\\" PETROL",y')).toEqual(['x', 'SERIES 3 88" PETROL', 'y']);
  });
});

describe('ageInYears', () => {
  it('counts calendar years, so an early first MOT is still 3', () => {
    expect(ageInYears('2022-02-20', '2025-01-25')).toBe(3);
    expect(ageInYears('2022-02-20', '2025-02-20')).toBe(3);
  });
  it('rejects unusable dates', () => {
    expect(ageInYears('not-a-date', '2025-01-01')).toBeNull();
    expect(ageInYears('2026-01-01', '2025-01-01')).toBeNull();
    expect(ageInYears('', '2025-01-01')).toBeNull();
  });
});

describe('MOT aggregator', () => {
  it('counts only initial car tests that passed, failed or were fixed on the spot', async () => {
    const s = await summarise(createReadStream(CSV));
    // 10 rows: a motorbike, a retest, an abandoned test and a bad date are left out.
    expect(s.rows).toEqual({ read: 10, malformed: 0, cars: 9, initial: 6, skipped: 1 });
    expect(s.totals).toEqual({ tests: 6, pass: 3, prs: 1, fail: 2 });
  });

  it('groups by age, capping the oldest cars', async () => {
    const s = await summarise(createReadStream(CSV));
    expect(s.byAge).toHaveLength(MAX_AGE + 1);
    expect(s.byAge[3]).toMatchObject({ tests: 1, prs: 1, meanMiles: 30000 });
    expect(s.byAge[10]).toMatchObject({ tests: 1, pass: 1, meanMiles: 45000 });
    expect(s.byAge[MAX_AGE]).toMatchObject({ tests: 1, pass: 1 }); // first used 1949
    expect(s.byAge[4]).toMatchObject({ tests: 1, meanMiles: null }); // mileage 0 isn't a reading
  });

  it('counts mileage bands, months, colours and fuels', async () => {
    const s = await summarise(createReadStream(CSV));
    expect(s.mileage.counts.reduce((a, b) => a + b, 0)).toBe(5);
    expect(s.mileage.counts[12]).toBe(1); // 120,500 miles
    expect(s.byMonth.map((m) => m.tests).slice(0, 3)).toEqual([2, 4, 0]);
    const green = s.colours.series.find((c) => c.name === 'GREEN');
    expect(green.values[s.colours.years.indexOf(1949)]).toBe(1);
    const diesel = s.fuels.series.find((c) => c.name === 'diesel');
    expect(diesel.total).toBe(3);
  });

  it('summarises postcode areas and models, including quoted names', async () => {
    const s = await summarise(createReadStream(CSV));
    const bn = s.areas.find((a) => a.area === 'BN');
    expect(bn).toMatchObject({ tests: 3, pass: 1, fail: 2, meanMiles: Math.round((45000 + 120500 + 88000) / 3) });
    expect(bn.fuels).toMatchObject({ petrol: 1, diesel: 2 });
    expect(s.models.map((m) => m.model)).toContain('SERIES 1, 80 INCH');
    const fiesta = s.models.find((m) => m.model === 'FIESTA');
    expect(fiesta.bands[2]).toEqual({ tests: 1, pass: 1, prs: 0, fail: 0 }); // 10 to 14 years
  });

  it('leaves out models with too few tests', async () => {
    const aggregator = createMotAggregator({ minModelTests: 2 });
    await addCsvStream(aggregator, createReadStream(CSV));
    const s = aggregator.result();
    expect(s.models).toEqual([]);
    expect(s.modelsLeftOut).toBe(6);
  });

  it('counts and leaves out rows with the wrong number of fields', () => {
    const aggregator = createMotAggregator();
    aggregator.header(['test_date', 'test_class_id', 'test_type', 'test_result', 'test_mileage', 'postcode_area', 'make', 'model', 'colour', 'fuel_type', 'first_use_date']);
    aggregator.row(['2025-01-01', '4', 'NT']);
    expect(aggregator.result().rows).toMatchObject({ read: 1, malformed: 1, cars: 0 });
  });

  it('rejects a file without the expected columns', () => {
    expect(() => createMotAggregator().header(['test_id', 'make'])).toThrow(/missing columns: test_date/);
  });

  it('reads the same results from inside a zip', async () => {
    const entries = await listEntries(ZIP);
    expect(entries.map((e) => e.name)).toEqual(['mini_mot.csv']);
    const fromZip = await summarise(await openEntry(ZIP, entries[0]));
    expect(fromZip).toEqual(await summarise(createReadStream(CSV)));
  });
});

describe('joining MOT models to DVLA models', () => {
  const index = {
    makes: [
      {
        name: 'MERCEDES',
        slug: 'mercedes',
        models: [{ name: 'MERCEDES C CLASS', slug: 'mercedes-c-class' }],
      },
      { name: 'BMW', slug: 'bmw', models: [{ name: 'BMW 1 SERIES', slug: 'bmw-1-series' }, { name: 'BMW X1', slug: 'bmw-x1' }] },
      { name: 'TESLA', slug: 'tesla', models: [{ name: 'TESLA MODEL 3', slug: 'tesla-model-3' }] },
      { name: 'JAGUAR', slug: 'jaguar', models: [{ name: 'JAGUAR XF SERIES', slug: 'jaguar-xf-series' }] },
      {
        name: 'FORD',
        slug: 'ford',
        models: [
          { name: 'FORD FIESTA', slug: 'ford-fiesta', latest: 2, sorn: 1 },
          { name: 'FORD TRANSIT CONNECT', slug: 'ford-transit-connect', latest: 1, sorn: 0 },
        ],
      },
    ],
  };
  const match = createMatcher(index);
  const slug = (make, model) => match(make, model)?.modelSlug;

  it('tries the longest names first', () => {
    expect(candidates('TESLA', 'MODEL 3 AWD').slice(0, 3)).toEqual(['MODEL 3 AWD', 'MODEL 3 AWD SERIES', 'MODEL 3 AWD CLASS']);
  });

  it('matches DVSA names to DVLA models', () => {
    expect(slug('MERCEDES-BENZ', 'C220 D')).toBe('mercedes-c-class');
    expect(slug('MERCEDES-BENZ', 'C-CLASS')).toBe('mercedes-c-class');
    expect(slug('MERCEDES-BENZ', 'C')).toBe('mercedes-c-class');
    expect(slug('BMW', '118D')).toBe('bmw-1-series');
    expect(slug('BMW', 'X1')).toBe('bmw-x1');
    expect(slug('TESLA', 'MODEL 3 LONG RANGE AWD')).toBe('tesla-model-3');
    expect(slug('JAGUAR', 'XF')).toBe('jaguar-xf-series');
    expect(slug('FORD', 'FIESTA ZETEC')).toBe('ford-fiesta');
  });

  it('tries looser forms only after the name as given', () => {
    const loose = createMatcher({
      makes: [
        { name: 'FIAT', slug: 'fiat', models: [{ name: 'FIAT 500', slug: 'fiat-500' }] },
        { name: 'LEXUS', slug: 'lexus', models: [{ name: 'LEXUS IS', slug: 'lexus-is' }] },
        { name: 'POLESTAR', slug: 'polestar', models: [{ name: 'POLESTAR 2', slug: 'polestar-2' }] },
        { name: 'VOLKSWAGEN', slug: 'volkswagen', models: [{ name: 'VOLKSWAGEN GOLF', slug: 'volkswagen-golf' }] },
        { name: 'CITROEN', slug: 'citroen', models: [{ name: 'CITROEN C4', slug: 'citroen-c4' }, { name: 'CITROEN E-C4', slug: 'citroen-e-c4' }] },
        { name: 'JAGUAR', slug: 'jaguar', models: [{ name: 'JAGUAR XK SERIES', slug: 'jaguar-xk-series' }] },
      ],
    });
    const s2 = (make, model) => loose(make, model)?.modelSlug;
    expect(s2('FIAT', '500X')).toBe('fiat-500');
    expect(s2('LEXUS', 'IS250')).toBe('lexus-is');
    expect(s2('POLESTAR', 'POLESTAR 2 EV FWD')).toBe('polestar-2');
    expect(s2('VOLKSWAGEN', 'E-GOLF')).toBe('volkswagen-golf');
    expect(s2('CITROEN', 'GRAND C4 PICASSO')).toBe('citroen-c4');
    expect(s2('CITROEN', 'E-C4')).toBe('citroen-e-c4'); // exact beats loose
    expect(s2('JAGUAR', 'XK8')).toBe('jaguar-xk-series');
  });

  it("knows the make even when it can't match the model, and nothing for unknown makes", () => {
    expect(match('FORD', 'MODEL T')).toMatchObject({ makeSlug: 'ford', modelSlug: null });
    expect(match('DETHLEFFS', 'GLOBEBUS')).toBeNull();
  });

  it('combines DVSA names into DVLA models, with test-weighted means', async () => {
    const summary = await summarise(createReadStream(CSV));
    const site = joinMot(summary, index, { minTests: 1 });
    const fiesta = site.models.find((m) => m.modelSlug === 'ford-fiesta');
    expect(fiesta).toMatchObject({ tests: 2, pass: 1, fail: 1, meanMiles: Math.round((45000 + 120500) / 2), meanAge: 12.5 });
    expect(fiesta.dvsaNames).toBe(2); // FIESTA and FIESTA ZETEC
    expect(site.makes.find((m) => m.makeSlug === 'ford').tests).toBe(2);
    expect(site.match.unmatched.map((r) => r.make)).toContain('LAND ROVER');
    expect(site).not.toHaveProperty('models.0.bands.4');
    expect(site.match.testsMatched).toBe(5); // Fiesta x2, C220 D, Tesla, 118D
  });

  it('sets aside models tested far more often than DVLA has cars: mostly vans', () => {
    const row = (model, tests) => ({ make: 'FORD', model, tests, pass: tests, prs: 0, fail: 0, meanMiles: 1, meanAge: 5, bands: [] });
    const summary = { ageBands: [], colours: { years: [], series: [] }, modelsLeftOut: 0, models: [row('FIESTA', 3), row('TRANSIT CONNECT', 900)] };
    const site = joinMot(summary, index, { minTests: 1 });
    expect(site.models.map((m) => m.name)).toEqual(['FORD FIESTA']);
    expect(site.match.notCars).toEqual([{ name: 'FORD TRANSIT CONNECT', tests: 900, known: 1 }]);
    expect(site.makes.find((m) => m.makeSlug === 'ford').tests).toBe(3);
  });
});
