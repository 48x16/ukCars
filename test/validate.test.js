import { describe, expect, it } from 'vitest';
import { SchemaError, validateFile, validateHeader, validateRow } from '../pipeline/validate.js';

const FIXED = ['BodyType', 'Make', 'GenModel', 'Model', 'Fuel', 'LicenceStatus'];
const QUARTERS = ['2015 Q2', '2015 Q1', '2014 Q4', '2014 Q3'];
const HEADER = [...FIXED, ...QUARTERS];

function problemsOf(fn) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(SchemaError);
    return err.problems;
  }
  throw new Error('expected a SchemaError');
}

describe('validateHeader', () => {
  it('accepts the expected header and returns quarters newest first', () => {
    expect(validateHeader(HEADER)).toEqual(QUARTERS);
  });

  it('names a renamed fixed column', () => {
    const header = [...HEADER];
    header[2] = 'GenericModel';
    expect(problemsOf(() => validateHeader(header))).toEqual([
      'column 3: expected "GenModel", found "GenericModel"',
    ]);
  });

  it('rejects a missing fixed column', () => {
    const header = HEADER.filter((c) => c !== 'Fuel');
    expect(problemsOf(() => validateHeader(header))).toContain(
      'column 5: expected "Fuel", found "LicenceStatus"',
    );
  });

  it('rejects an extra non-quarter column', () => {
    expect(problemsOf(() => validateHeader([...HEADER, 'Notes']))).toContain(
      'unexpected column "Notes" (quarter columns must look like "2026 Q2")',
    );
  });

  it('rejects a badly formatted quarter', () => {
    const header = [...FIXED, '2015-Q2', '2015 Q1', '2014 Q4', '2014 Q3'];
    expect(problemsOf(() => validateHeader(header))).toContain(
      'unexpected column "2015-Q2" (quarter columns must look like "2026 Q2")',
    );
  });

  it('rejects a gap in the quarters', () => {
    const header = [...FIXED, '2015 Q2', '2014 Q4', '2014 Q3'];
    expect(problemsOf(() => validateHeader(header))).toEqual([
      'quarters not consecutive newest-first: "2015 Q2" then "2014 Q4"',
    ]);
  });

  it('rejects oldest-first ordering', () => {
    const header = [...FIXED, ...[...QUARTERS].reverse()];
    expect(problemsOf(() => validateHeader(header)).length).toBeGreaterThan(0);
  });

  it('rejects a changed earliest quarter', () => {
    const header = [...FIXED, '2015 Q2', '2015 Q1', '2014 Q4'];
    expect(problemsOf(() => validateHeader(header))).toEqual([
      'earliest quarter is "2014 Q4", expected "2014 Q3"',
    ]);
  });

  it('reports every problem at once', () => {
    const header = ['Body', 'Make', 'GenModel', 'Model', 'Fuel', 'Status', 'Q2 2015'];
    expect(problemsOf(() => validateHeader(header))).toHaveLength(3);
  });
});

describe('validateRow', () => {
  const row = (overrides = {}) => {
    const r = ['Cars', 'FORD', 'FORD FIESTA', 'FIESTA', 'Petrol', 'Licensed', '10', '9', '8', '7'];
    for (const [i, v] of Object.entries(overrides)) r[i] = v;
    return r;
  };

  it('accepts a normal row', () => {
    expect(validateRow(row(), 4)).toEqual({ errors: [], warnings: [] });
  });

  it('accepts the [c], [x] and [z] symbols', () => {
    expect(validateRow(row({ 6: '[c]', 7: '[x]', 8: '[z]' }), 4).errors).toEqual([]);
  });

  it.each(['-5', 'abc', '1.5', '', '1,000'])('rejects the count "%s"', (cell) => {
    expect(validateRow(row({ 7: cell }), 4).errors).toEqual([`invalid count "${cell}" in quarter column 2`]);
  });

  it('rejects an unknown LicenceStatus', () => {
    expect(validateRow(row({ 5: 'Scrapped' }), 4).errors).toEqual(['unknown LicenceStatus "Scrapped"']);
  });

  it('rejects the wrong number of cells', () => {
    expect(validateRow(row().slice(0, 9), 4).errors).toEqual(['has 9 cells, expected 10']);
  });

  it('warns, but does not fail, on a new fuel type', () => {
    expect(validateRow(row({ 4: 'Hydrogen combustion' }), 4)).toEqual({
      errors: [],
      warnings: ['new fuel type "Hydrogen combustion"'],
    });
  });
});

describe('validateFile', () => {
  it('passes a full-size file newer than the deployed one', () => {
    expect(() =>
      validateFile({ rowCount: 200_000, latestQuarter: '2026 Q3', previousLatestQuarter: '2026 Q2' }),
    ).not.toThrow();
  });

  it('rejects a truncated file', () => {
    expect(problemsOf(() => validateFile({ rowCount: 500, latestQuarter: '2026 Q2' }))).toEqual([
      'only 500 data rows, expected at least 100000 (truncated download?)',
    ]);
  });

  it('rejects data older than what is deployed', () => {
    expect(
      problemsOf(() =>
        validateFile({ rowCount: 200_000, latestQuarter: '2026 Q1', previousLatestQuarter: '2026 Q2' }),
      ),
    ).toEqual(['latest quarter "2026 Q1" is older than the deployed "2026 Q2"']);
  });
});
