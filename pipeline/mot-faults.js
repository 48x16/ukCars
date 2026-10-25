// Why cars fail their MOT: DVSA's failure items -> data/mot/<year>-faults.json, committed.
//
//   npm run mot-faults                         download this year's items zip (about 4.4 GB) and the lookup
//   npm run mot-faults -- --items <zip|csv>    use a local copy of the items, or one month's CSV (results and lookup from .cache/)
//
// Two passes, as the items carry only a test's id: the results file (already in .cache/ from
// `npm run mot`) gives each car's failed first test (failed, or passed after a repair at the test)
// its model, age band and fuel; then each failure item is found by test id and its section
// (brakes, tyres, lights...) is ticked for that test. Tests are kept in sorted number arrays and
// found by binary search, so memory stays in the tens of megabytes. Only cars (class 4) and their
// first tests count, as in pipeline/mot.js. Joined to DVLA's models by pipeline/run.js.

import { createReadStream, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { download } from './fetch.js';
import { addCsvStream, AGE_BANDS, ageInYears, FUEL_IDS, fuelOf, MOT_SOURCE_PAGE, MOT_URL } from './mot.js';
import { listEntries, openEntry } from './zip.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ITEMS_URL = (year) => `https://edh-dvsa-data-gov-uk-files-prod.s3.eu-west-1.amazonaws.com/dft_test_item_extracts_${year}.zip`;
export const LOOKUP_URL = 'https://edh-dvsa-data-gov-uk-files-prod.s3.eu-west-1.amazonaws.com/lookup.zip';
/** Item types that fail a test: F (failed) and P (failed, but repaired at the test). */
const FAILING = new Set(['F', 'P']);
/** DVSA model names need this many first tests to be kept for the join. */
export const MIN_MODEL_TESTS = 100;
const TOP_DEFECTS = 25;

/**
 * Car (test class 4) failure reasons from DVSA's lookup files (pipe-separated): each reason's
 * section, and a readable description. Old (pre-2018) and current sections with the same name
 * ("Brakes", "BRAKES") are one section.
 */
export function faultLookup(detailText, groupText) {
  const rows = (text) => text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map((l) => l.split('|'));
  const [groupHead, ...groups] = rows(groupText);
  const g = Object.fromEntries(groupHead.map((h, i) => [h, i]));
  const sectionNames = new Map();
  for (const r of groups) if (r[g.test_class_id] === '4' && r[g.parent_id] === '0' && r[g.test_item_id] !== '0') sectionNames.set(r[g.test_item_id], r[g.item_name].trim());
  const sections = [];
  const sectionKey = new Map(); // DVSA section id -> our section index
  for (const [id, name] of sectionNames) {
    const key = name.toLowerCase();
    let at = sections.findIndex((s) => s.key === key);
    if (at === -1) at = sections.push({ key, label: name.charAt(0) + name.slice(1).toLowerCase() }) - 1;
    sectionKey.set(id, at);
  }
  if (sections.length > 32) throw new Error(`Too many MOT sections for a 32-bit mask: ${sections.length}`);
  const [detailHead, ...details] = rows(detailText);
  const d = Object.fromEntries(detailHead.map((h, i) => [h, i]));
  const reasons = new Map();
  for (const r of details) {
    if (r[d.test_class_id] !== '4') continue;
    const section = sectionKey.get(r[d.test_item_set_section_id]);
    if (section === undefined) continue;
    const text = (r[d.rfr_insp_manual_desc] || r[d.rfr_desc] || '').trim();
    reasons.set(Number(r[d.rfr_id]), { section, text: text.charAt(0).toUpperCase() + text.slice(1) });
  }
  return { sections, reasons };
}

/**
 * Failing items by reason, commonest first. DVSA has several reasons with the same words (front
 * and rear suspension joints, say): they're one fault here. Counts are items, not tests: a car
 * with two bald tyres counts twice.
 */
function mergeDefects(defects, lookup) {
  const byText = new Map();
  for (const [id, count] of defects) {
    const { section, text } = lookup.reasons.get(id);
    const key = `${section}\t${text}`;
    const d = byText.get(key) ?? { ids: [], section, text, count: 0 };
    d.ids.push(id);
    d.count += count;
    byText.set(key, d);
  }
  return [...byText.values()].sort((a, b) => b.count - a.count);
}

/** Grows a typed array by doubling. */
function grow(array, size) {
  if (size <= array.length) return array;
  const bigger = new array.constructor(Math.max(size, array.length * 2));
  bigger.set(array);
  return bigger;
}

/**
 * The counter. Feed the results file (header() then row()), call sortTests(), then feed the
 * items file through items.header() and items.row(), and call result().
 */
export function createFaultCounter(lookup) {
  const bands = AGE_BANDS.length;
  const modelKeys = new Map();
  const models = []; // { make, model, tests, failed, bandTests }
  const tests = { all: 0, failed: 0 };
  const testsByBand = new Array(bands).fill(0);
  const testsByFuel = Object.fromEntries(FUEL_IDS.map((f) => [f, 0]));
  let ids = new Uint32Array(1 << 20);
  let meta = new Uint32Array(1 << 20); // model << 6 | band << 3 | fuel
  let n = 0;
  let col;
  let masks;
  let itemCol;
  const defects = new Map(); // reason id -> failing items
  const itemRows = { read: 0, failing: 0, matched: 0, unknownReason: 0 };

  const results = {
    header(fields) {
      const names = fields.map((f) => f.trim().toLowerCase());
      col = Object.fromEntries(['test_id', 'test_class_id', 'test_type', 'test_result', 'make', 'model', 'fuel_type', 'first_use_date', 'test_date'].map((c) => [c, names.indexOf(c)]));
      const missing = Object.entries(col).filter(([, i]) => i === -1).map(([c]) => c);
      if (missing.length) throw new Error(`MOT results file is missing columns: ${missing.join(', ')}`);
    },
    row(f) {
      if (f[col.test_class_id] !== '4' || f[col.test_type] !== 'NT') return;
      const result = f[col.test_result];
      if (result !== 'P' && result !== 'F' && result !== 'PRS') return;
      const age = ageInYears(f[col.first_use_date], f[col.test_date]);
      const band = age === null ? -1 : AGE_BANDS.findIndex((b) => age >= b.from && age <= b.to);
      if (band === -1) return; // under three: not due an MOT yet
      const fuel = FUEL_IDS.indexOf(fuelOf(f[col.fuel_type].trim().toUpperCase()));
      const key = `${f[col.make].trim().toUpperCase()}\t${f[col.model].trim().toUpperCase()}`;
      let m = modelKeys.get(key);
      if (m === undefined) {
        m = models.push({ make: key.split('\t')[0], model: key.split('\t')[1], tests: 0, failed: 0, bandTests: new Array(bands).fill(0) }) - 1;
        modelKeys.set((' ' + key).slice(1), m);
      }
      tests.all++;
      testsByBand[band]++;
      testsByFuel[FUEL_IDS[fuel]]++;
      models[m].tests++;
      models[m].bandTests[band]++;
      if (result === 'P') return;
      tests.failed++;
      models[m].failed++;
      ids = grow(ids, n + 1);
      meta = grow(meta, n + 1);
      ids[n] = Number(f[col.test_id]);
      meta[n] = (m << 6) | (band << 3) | fuel;
      n++;
    },
  };

  function sortTests() {
    const order = new Uint32Array(n);
    for (let i = 0; i < n; i++) order[i] = i;
    order.sort((a, b) => ids[a] - ids[b]);
    const sortedIds = new Uint32Array(n);
    const sortedMeta = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      sortedIds[i] = ids[order[i]];
      sortedMeta[i] = meta[order[i]];
    }
    ids = sortedIds;
    meta = sortedMeta;
    masks = new Uint32Array(n);
  }

  /** The position of a test id among the failed tests, or -1. */
  function find(id) {
    let lo = 0;
    let hi = n - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const v = ids[mid];
      if (v === id) return mid;
      if (v < id) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  }

  const items = {
    header(fields) {
      const names = fields.map((f) => f.trim().toLowerCase());
      itemCol = { id: names.indexOf('test_id'), reason: names.indexOf('rfr_id'), type: names.indexOf('rfr_type_code') };
      if (Object.values(itemCol).includes(-1)) throw new Error('MOT items file is missing test_id, rfr_id or rfr_type_code');
    },
    row(f) {
      itemRows.read++;
      if (!FAILING.has(f[itemCol.type])) return;
      itemRows.failing++;
      const at = find(Number(f[itemCol.id]));
      if (at === -1) return; // a retest, another class of vehicle, or a test we left out
      const reasonId = Number(f[itemCol.reason]);
      const reason = lookup.reasons.get(reasonId);
      if (!reason) {
        itemRows.unknownReason++;
        return;
      }
      itemRows.matched++;
      masks[at] |= 1 << reason.section;
      defects.set(reasonId, (defects.get(reasonId) ?? 0) + 1);
    },
  };

  function result() {
    const s = lookup.sections.length;
    const zeros = () => new Array(s).fill(0);
    const national = zeros();
    const byBand = Array.from({ length: bands }, zeros);
    const byFuel = Object.fromEntries(FUEL_IDS.map((f) => [f, zeros()]));
    const byModel = new Map();
    let withReasons = 0;
    for (let i = 0; i < n; i++) {
      const mask = masks[i];
      if (!mask) continue;
      withReasons++;
      const m = meta[i] >>> 6;
      const band = (meta[i] >>> 3) & 7;
      const fuel = FUEL_IDS[meta[i] & 7];
      let counts = byModel.get(m);
      if (!counts) byModel.set(m, (counts = Array.from({ length: bands }, zeros)));
      for (let b = 0; b < s; b++) {
        if (!(mask & (1 << b))) continue;
        national[b]++;
        byBand[band][b]++;
        byFuel[fuel][b]++;
        counts[band][b]++;
      }
    }
    return {
      rows: itemRows,
      sections: lookup.sections,
      tests: { ...tests, withReasons },
      national,
      bands: AGE_BANDS.map((b, i) => ({ label: b.label, tests: testsByBand[i], counts: byBand[i] })),
      fuels: FUEL_IDS.map((f) => ({ id: f, tests: testsByFuel[f], counts: byFuel[f] })),
      defects: mergeDefects(defects, lookup).slice(0, TOP_DEFECTS),
      models: models
        // Each model's failing sections by age band (as its bandTests), so models compare at the same age.
        .map((m, i) => ({ ...m, counts: byModel.get(i) ?? Array.from({ length: bands }, zeros) }))
        .filter((m) => m.tests >= MIN_MODEL_TESTS)
        .sort((a, b) => b.tests - a.tests),
    };
  }

  return { results, sortTests, items, result };
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

/** Each CSV in a zip, or a single plain CSV (handy for trying one month). */
async function zipCsvs(path, onEach) {
  if (path.endsWith('.csv')) return onEach({ name: path }, createReadStream(path));
  const entries = (await listEntries(path)).filter((e) => /\.csv$/i.test(e.name));
  if (!entries.length) throw new Error(`No CSV files in ${path}`);
  for (const entry of entries) await onEach(entry, await openEntry(path, entry));
}

async function main() {
  const year = Number(arg('--year') ?? new Date().getFullYear() - 1);
  const cache = join(ROOT, '.cache');
  const resultsZip = join(cache, `dft_test_result_extracts_${year}.zip`);
  const itemsZip = arg('--items') ? resolve(arg('--items')) : join(cache, `dft_test_item_extracts_${year}.zip`);
  const lookupZip = join(cache, 'lookup.zip');
  if (!existsSync(resultsZip)) {
    console.log(`Downloading ${MOT_URL(year)}`);
    await download(MOT_URL(year), resultsZip);
  }
  if (!arg('--items') && !existsSync(itemsZip)) {
    console.log(`Downloading ${ITEMS_URL(year)}`);
    await download(ITEMS_URL(year), itemsZip);
  }
  if (!existsSync(lookupZip)) await download(LOOKUP_URL, lookupZip);

  const text = async (zip, name) => {
    const entry = (await listEntries(zip)).find((e) => e.name.endsWith(name));
    let s = '';
    for await (const chunk of await openEntry(zip, entry)) s += chunk;
    return s;
  };
  const counter = createFaultCounter(faultLookup(await text(lookupZip, 'item_detail.csv'), await text(lookupZip, 'item_group.csv')));
  const started = Date.now();
  const seconds = () => Math.round((Date.now() - started) / 1000);
  await zipCsvs(resultsZip, async (entry, stream) => {
    await addCsvStream(counter.results, stream);
    console.log(`results ${entry.name} (${seconds()}s)`);
  });
  counter.sortTests();
  await zipCsvs(itemsZip, async (entry, stream) => {
    await addCsvStream(counter.items, stream);
    console.log(`items ${entry.name} (${seconds()}s)`);
  });
  const summary = { year, source: MOT_SOURCE_PAGE, builtAt: new Date().toISOString(), ...counter.result() };
  const { rows, tests } = summary;
  if (!tests.withReasons) throw new Error('No failed tests matched to a failure reason');
  // A handful of unknown reasons is normal; many means DVSA's codes have moved on from the lookup.
  if (rows.unknownReason > rows.failing / 100) throw new Error(`${rows.unknownReason} of ${rows.failing} failing items have a reason the lookup doesn't know`);
  const out = join(ROOT, 'data', 'mot', `${year}-faults.json`);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(summary));
  console.log(`Wrote ${out}: ${tests.withReasons.toLocaleString('en-GB')} of ${tests.failed.toLocaleString('en-GB')} failed tests matched, ${summary.models.length} models`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

