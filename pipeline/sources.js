// Expected shape of the DfT VEH0120 UK file. If DfT changes any of this,
// validation fails and the deploy is skipped, so the live site keeps its last good data.

export const SOURCE_PAGE_URL =
  'https://www.gov.uk/government/statistical-data-sets/vehicle-licensing-statistics-data-files';

export const CSV_FILE_NAME = 'df_VEH0120_UK.csv';

export const FIXED_COLUMNS = ['BodyType', 'Make', 'GenModel', 'Model', 'Fuel', 'LicenceStatus'];

/** Earliest quarter the UK file has ever covered. */
export const FIRST_QUARTER = '2014 Q3';

export const LICENCE_STATUSES = ['Licensed', 'SORN'];

/** Fuels seen across all body types. A new one is a warning, not a failure. */
export const KNOWN_FUELS = [
  'Battery electric',
  'Diesel',
  'Fuel cell electric',
  'Gas',
  'Hybrid electric (diesel)',
  'Hybrid electric (petrol)',
  'Other fuel types',
  'Petrol',
  'Plug-in hybrid electric (diesel)',
  'Plug-in hybrid electric (petrol)',
  'Range extended electric',
];

/** Statistical symbols: [c] confidential (1-4 vehicles), [x] not available, [z] not applicable. */
export const SYMBOLS = ['[c]', '[x]', '[z]'];

/** The 2026 Q2 file has ~217,000 rows; far fewer means a truncated or wrong file. */
export const MIN_ROWS = 100_000;

export const BODY_TYPE = 'Cars';
export const LICENCE_STATUS = 'Licensed';
