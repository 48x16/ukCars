import { describe, expect, it } from 'vitest';
import { findCsvUrl } from '../pipeline/fetch.js';

// Trimmed from the real DfT page: each file is linked twice (title and download link).
const PAGE = `
  <a class="govuk-link" href="https://assets.publishing.service.gov.uk/media/6aad4b12ce3f006bd4346ccf/df_VEH0120_GB.csv">df_VEH0120_GB</a>
  <a class="govuk-link" href="https://assets.publishing.service.gov.uk/media/6aad4b12086ce7c57b8186f3/df_VEH0120_UK.csv">df_VEH0120_UK</a>
  <a href="https://assets.publishing.service.gov.uk/media/6aad4b12086ce7c57b8186f3/df_VEH0120_UK.csv" download>Download CSV</a>
`;

describe('findCsvUrl', () => {
  it('finds the current link by file name', () => {
    expect(findCsvUrl(PAGE, 'df_VEH0120_UK.csv')).toBe(
      'https://assets.publishing.service.gov.uk/media/6aad4b12086ce7c57b8186f3/df_VEH0120_UK.csv',
    );
  });

  it('fails clearly when the file is no longer listed', () => {
    expect(() => findCsvUrl(PAGE, 'df_VEH0121_UK.csv')).toThrow('No link to df_VEH0121_UK.csv');
  });

  it('fails when two different links match', () => {
    const page = `${PAGE}<a href="https://assets.publishing.service.gov.uk/media/zzz/df_VEH0120_UK.csv">old</a>`;
    expect(() => findCsvUrl(page, 'df_VEH0120_UK.csv')).toThrow('Several links');
  });
});
