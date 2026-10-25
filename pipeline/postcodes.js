// Every postcode in Great Britain -> public/data/postcodes/<district>.json, for the finder tools.
//
//   npm run postcodes               download OS Code-Point Open (about 14 MB)
//   npm run postcodes -- --cached   use the copy in .cache/
//   npm run postcodes -- --fixture  tiny test file, for CI (part of `npm run data:fixture`)
//
// One small file per postcode district ("BN1", "SW1A"), so looking up a postcode downloads just
// its district and never sends the postcode to anyone. Each maps the rest of the postcode
// ("1AA") to its National Grid position, to the nearest 10 metres (stored in tens of metres).
// Contains OS data © Crown copyright and database right; Royal Mail and ONS data too.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { download } from './fetch.js';
import { splitCsv } from './mot.js';
import { listEntries, openEntry } from './zip.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'data', 'postcodes');
const CODEPOINT_URL = 'https://api.os.uk/downloads/v1/products/CodePointOpen/downloads?area=GB&format=CSV&redirect';

/** "SW1A 1AA" -> ["SW1A", "1AA"]; null if it isn't a full postcode. */
export function splitPostcode(text) {
  const compact = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = /^([A-Z]{1,2}[0-9][A-Z0-9]?)([0-9][A-Z]{2})$/.exec(compact);
  return m ? [m[1], m[2]] : null;
}

/** Groups Code-Point rows ("AB10 1AB",10,394235,806529,...) by district. */
export function byDistrict(lines) {
  const districts = new Map();
  for (const line of lines) {
    if (!line.trim()) continue;
    const [postcode, , e, n] = splitCsv(line.trim());
    const parts = splitPostcode(postcode ?? '');
    if (!parts || !(Number(e) > 0) || !(Number(n) > 0)) continue; // a few postcodes have no position
    const [district, inward] = parts;
    if (!districts.has(district)) districts.set(district, {});
    districts.get(district)[inward] = [Math.round(Number(e) / 10), Math.round(Number(n) / 10)];
  }
  return districts;
}

async function main() {
  const zipPath = process.argv.includes('--fixture') ? join(ROOT, 'test', 'fixtures', 'mini_codepo.zip') : join(ROOT, '.cache', 'codepo_gb.zip');
  if (!process.argv.includes('--fixture') && !process.argv.includes('--cached')) {
    console.log('Downloading OS Code-Point Open');
    await download(CODEPOINT_URL, zipPath);
  }
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  let files = 0;
  let postcodes = 0;
  for (const entry of await listEntries(zipPath)) {
    // Either path separator: zips made on Windows use backslashes.
    if (!/^Data[/\\]CSV[/\\][a-z]+\.csv$/i.test(entry.name)) continue;
    let text = '';
    for await (const chunk of await openEntry(zipPath, entry)) text += chunk;
    for (const [district, map] of byDistrict(text.split('\n'))) {
      await writeFile(join(OUT_DIR, `${district}.json`), JSON.stringify(map));
      files++;
      postcodes += Object.keys(map).length;
    }
  }
  if (postcodes === 0) throw new Error('No postcodes found');
  console.log(`Wrote ${postcodes.toLocaleString('en-GB')} postcodes in ${files} district files`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
