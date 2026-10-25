// Weekly UK pump prices since 2003 -> public/data/fuel-prices.json.
//
//   npm run fuel-prices              download the DESNZ CSVs
//   npm run fuel-prices -- --cached  use the copies in .cache/
//   npm run fuel-prices -- --fixture tiny test file, for CI (part of `npm run data:fixture`)
//
// Source: Department for Energy Security and Net Zero, weekly road fuel prices (accredited
// official statistics, Open Government Licence). Average pump prices for ultra low sulphur
// unleaded petrol and diesel, with the duty and VAT rates in force.

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { download, fetchText } from './fetch.js';
import { splitCsv } from './mot.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE_PAGE = 'https://www.gov.uk/government/statistics/weekly-road-fuel-prices';
const COLUMNS = {
  date: /^date$/i,
  petrol: /^ULSP.*pump price/i,
  diesel: /^ULSD.*pump price/i,
  petrolDuty: /^ULSP.*duty/i,
  dieselDuty: /^ULSD.*duty/i,
  petrolVat: /^ULSP.*VAT/i,
};

/** The CSV links on the DESNZ page: one file to 2017 and one since 2018. */
export function findCsvUrls(html) {
  const urls = [...new Set([...html.matchAll(/https:\/\/assets\.publishing\.service\.gov\.uk\/media\/[^"\s]+\.csv/g)].map((m) => m[0]))];
  if (urls.length === 0) throw new Error('No CSV links found on the DESNZ weekly fuel prices page');
  return urls;
}

/** Parses one DESNZ CSV into rows of { date, petrol, diesel, petrolDuty, dieselDuty, vat }. */
export function parseFuelCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const header = splitCsv(lines[0]).map((h) => h.trim());
  const col = Object.fromEntries(Object.entries(COLUMNS).map(([key, re]) => [key, header.findIndex((h) => re.test(h))]));
  const missing = Object.entries(col).filter(([, i]) => i === -1).map(([key]) => key);
  if (missing.length) throw new Error(`Fuel prices CSV is missing columns: ${missing.join(', ')}`);
  return lines.slice(1).map((line) => {
    const f = splitCsv(line);
    const [d, m, y] = f[col.date].split('/');
    const number = (key) => {
      const v = Number(f[col[key]]);
      if (!Number.isFinite(v)) throw new Error(`Fuel prices CSV: bad ${key} on ${f[col.date]}`);
      return v;
    };
    return {
      date: `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`,
      petrol: number('petrol'),
      diesel: number('diesel'),
      petrolDuty: number('petrolDuty'),
      dieselDuty: number('dieselDuty'),
      vat: number('petrolVat'),
    };
  });
}

/** Merges the files into one weekly series, oldest first, one row per date. */
export function buildFuelPrices(files) {
  const byDate = new Map();
  for (const text of files) for (const row of parseFuelCsv(text)) byDate.set(row.date, row);
  const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const r of rows) {
    if (r.petrol < 30 || r.petrol > 400 || r.diesel < 30 || r.diesel > 400) throw new Error(`Fuel price out of range on ${r.date}`);
  }
  const series = (key) => rows.map((r) => r[key]);
  return {
    source: SOURCE_PAGE,
    weeks: series('date'),
    petrol: series('petrol'),
    diesel: series('diesel'),
    petrolDuty: series('petrolDuty'),
    dieselDuty: series('dieselDuty'),
    vat: series('vat'),
  };
}

async function main() {
  let texts;
  if (process.argv.includes('--fixture')) {
    texts = [await readFile(join(ROOT, 'test', 'fixtures', 'mini_fuel_prices.csv'), 'utf8')];
  } else {
    const cache = join(ROOT, '.cache');
    const paths = [];
    if (process.argv.includes('--cached')) {
      paths.push(join(cache, 'fuel_2003_2017.csv'), join(cache, 'fuel_2018.csv'));
    } else {
      const urls = findCsvUrls(await fetchText(SOURCE_PAGE));
      for (const [i, url] of urls.entries()) {
        const path = join(cache, `fuel_prices_${i}.csv`);
        console.log(`Downloading ${url}`);
        await download(url, path);
        paths.push(path);
      }
    }
    texts = await Promise.all(paths.map((p) => readFile(p, 'utf8')));
  }
  const prices = buildFuelPrices(texts);
  const out = join(ROOT, 'public', 'data', 'fuel-prices.json');
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(prices));
  console.log(`Wrote ${out}: ${prices.weeks.length} weeks, ${prices.weeks[0]} to ${prices.weeks.at(-1)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
