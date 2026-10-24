import { isQuarter, quarterIndex } from '../src/quarters.js';
import {
  FIXED_COLUMNS,
  FIRST_QUARTER,
  KNOWN_FUELS,
  LICENCE_STATUSES,
  MIN_ROWS,
  SYMBOLS,
} from './sources.js';

export class SchemaError extends Error {
  constructor(problems) {
    super(`DfT data failed validation:\n  - ${problems.join('\n  - ')}`);
    this.name = 'SchemaError';
    this.problems = problems;
  }
}

const COUNT_RE = /^\d+$/;

/**
 * Checks the header row and returns the quarter labels in file order (newest first).
 * Collects every problem before throwing, so one run shows the whole picture.
 */
export function validateHeader(header, { firstQuarter = FIRST_QUARTER } = {}) {
  const problems = [];

  FIXED_COLUMNS.forEach((expected, i) => {
    const found = header[i];
    if (found === undefined) {
      problems.push(`column ${i + 1}: expected "${expected}", but the header ends early`);
    } else if (found !== expected) {
      problems.push(`column ${i + 1}: expected "${expected}", found "${found}"`);
    }
  });

  const quarters = header.slice(FIXED_COLUMNS.length);
  if (quarters.length === 0) problems.push('no quarter columns after the fixed columns');

  const bad = quarters.filter((q) => !isQuarter(q));
  bad.forEach((q) => problems.push(`unexpected column "${q}" (quarter columns must look like "2026 Q2")`));

  if (bad.length === 0 && quarters.length > 0) {
    for (let i = 1; i < quarters.length; i++) {
      if (quarterIndex(quarters[i - 1]) - quarterIndex(quarters[i]) !== 1) {
        problems.push(`quarters not consecutive newest-first: "${quarters[i - 1]}" then "${quarters[i]}"`);
      }
    }
    const earliest = quarters[quarters.length - 1];
    if (earliest !== firstQuarter) {
      problems.push(`earliest quarter is "${earliest}", expected "${firstQuarter}"`);
    }
  }

  if (problems.length) throw new SchemaError(problems);
  return quarters;
}

/** Checks one data row (as an array of cells). Returns problems rather than throwing. */
export function validateRow(row, quarterCount) {
  const errors = [];
  const warnings = [];
  const expectedLength = FIXED_COLUMNS.length + quarterCount;

  if (row.length !== expectedLength) {
    errors.push(`has ${row.length} cells, expected ${expectedLength}`);
    return { errors, warnings };
  }

  const status = row[5];
  if (!LICENCE_STATUSES.includes(status)) errors.push(`unknown LicenceStatus "${status}"`);

  const fuel = row[4];
  if (!KNOWN_FUELS.includes(fuel)) warnings.push(`new fuel type "${fuel}"`);

  for (let i = FIXED_COLUMNS.length; i < row.length; i++) {
    const cell = row[i];
    if (!COUNT_RE.test(cell) && !SYMBOLS.includes(cell)) {
      errors.push(`invalid count "${cell}" in quarter column ${i - FIXED_COLUMNS.length + 1}`);
    }
  }

  return { errors, warnings };
}

/** File-level checks once every row has been read. */
export function validateFile({ rowCount, latestQuarter, previousLatestQuarter, minRows = MIN_ROWS }) {
  const problems = [];
  if (rowCount < minRows) {
    problems.push(`only ${rowCount} data rows, expected at least ${minRows} (truncated download?)`);
  }
  if (previousLatestQuarter && quarterIndex(latestQuarter) < quarterIndex(previousLatestQuarter)) {
    problems.push(`latest quarter "${latestQuarter}" is older than the deployed "${previousLatestQuarter}"`);
  }
  if (problems.length) throw new SchemaError(problems);
}
