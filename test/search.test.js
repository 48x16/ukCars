import { describe, expect, it } from 'vitest';
import { buildEntries, searchEntries } from '../src/search.js';

const index = {
  latestQuarter: '2026 Q2',
  makes: [
    {
      name: 'FORD',
      slug: 'ford',
      latest: 3000,
      models: [
        { name: 'FORD FIESTA', slug: 'ford-fiesta', latest: 2000 },
        { name: 'FORD FOCUS', slug: 'ford-focus', latest: 900 },
        { name: 'FORD KA+', slug: 'ford-ka-plus', latest: 100 },
      ],
    },
    {
      name: 'TESLA',
      slug: 'tesla',
      latest: 500,
      models: [
        { name: 'TESLA MODEL 3', slug: 'tesla-model-3', latest: 300 },
        { name: 'TESLA MODEL Y', slug: 'tesla-model-y', latest: 200 },
      ],
    },
    {
      name: 'FIAT',
      slug: 'fiat',
      latest: 800,
      models: [{ name: 'FIAT 500', slug: 'fiat-500', latest: 800 }],
    },
  ],
};

const entries = buildEntries(index);
const labels = (query, limit) => searchEntries(entries, query, limit).map((e) => e.label);

describe('buildEntries', () => {
  it('lists every make and model with what selecting it needs', () => {
    expect(entries).toHaveLength(9);
    expect(entries.find((e) => e.label === 'TESLA MODEL 3')).toMatchObject({
      kind: 'model',
      makeSlug: 'tesla',
      modelSlug: 'tesla-model-3',
    });
    expect(entries.find((e) => e.label === 'FORD')).toMatchObject({ kind: 'make', modelCount: 3 });
  });
});

describe('searchEntries', () => {
  it('matches the start of any word, ignoring case', () => {
    expect(labels('fie')).toEqual(['FORD FIESTA']);
    expect(labels('FIESTA')).toEqual(['FORD FIESTA']);
  });

  it('needs every word typed to match', () => {
    expect(labels('ford fo')).toEqual(['FORD FOCUS']);
    expect(labels('model 3')).toEqual(['TESLA MODEL 3']);
  });

  it('matches each word typed against a different word in the name', () => {
    expect(labels('f ford')).toEqual(['FORD FIESTA', 'FORD FOCUS']);
    expect(labels('fiesta ford')).toEqual(['FORD FIESTA']);
  });

  it('does not match the middle of a word', () => {
    expect(labels('esta')).toEqual([]);
  });

  it('puts an exact name first, then names starting with the query, then the most licensed', () => {
    expect(labels('ford')).toEqual(['FORD', 'FORD FIESTA', 'FORD FOCUS', 'FORD KA+']);
    expect(labels('f')).toEqual(['FORD', 'FORD FIESTA', 'FORD FOCUS', 'FIAT', 'FIAT 500', 'FORD KA+']);
  });

  it('keeps + in names searchable', () => {
    expect(labels('ka+')).toEqual(['FORD KA+']);
  });

  it('returns nothing for an empty or punctuation-only query', () => {
    expect(labels('')).toEqual([]);
    expect(labels('  - ')).toEqual([]);
  });

  it('limits the number of results', () => {
    expect(labels('f', 2)).toEqual(['FORD', 'FORD FIESTA']);
  });
});
