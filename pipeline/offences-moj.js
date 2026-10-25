// Drink and drug driving in court, from the Ministry of Justice's outcomes by offence CSVs (a zip
// of about 380 MB). Streams pros_conv_sent_obo_new.csv and adds up convictions for each group of
// Home Office offence codes, by year ending June. Called by offences-annual.js with --moj.
// Offences of causing death are left out, by the site's rules.

import { createInterface } from 'node:readline';
import { listEntries, openEntry } from './zip.js';

const ENTRY = 'pros_conv_sent_obo_new.csv';
/** Home Office offence codes in each group. */
export const GROUPS = [
  { id: 'drink', label: 'Drink driving', codes: ['80302', '80305', '80309', '80311'] },
  { id: 'drug', label: 'Drug driving', codes: ['80310', '80312', '80313', '80314', '80315', '80316'] },
  { id: 'refused', label: 'Refusing a test', codes: ['80303', '80306', '80307', '80308'] },
];
const groupOf = new Map(GROUPS.flatMap((g) => g.codes.map((c) => [c, g.id])));

/** One CSV line of quoted fields (the MoJ quotes every field and uses no embedded quotes). */
export const fields = (line) => line.replace(/^"|"$/g, '').split('","');

/** Adds up convictions by year and group from the CSV's lines (header first). */
export async function summariseLines(lines) {
  let col = null;
  const totals = new Map(); // year -> { drink, drug, refused }
  for await (const line of lines) {
    const f = fields(line);
    if (!col) {
      col = { year: f.indexOf('Year ending June'), code: f.indexOf('HO Offence Code'), convicted: f.indexOf('Convicted') };
      if (Object.values(col).includes(-1)) throw new Error(`${ENTRY}: unexpected header`);
      continue;
    }
    const group = groupOf.get(f[col.code]?.slice(0, 5));
    if (!group) continue;
    const year = Number(/\d{4}/.exec(f[col.year])?.[0]);
    if (!year) continue;
    if (!totals.has(year)) totals.set(year, Object.fromEntries(GROUPS.map((g) => [g.id, 0])));
    totals.get(year)[group] += Number(f[col.convicted]) || 0;
  }
  const years = [...totals.keys()].sort((a, b) => a - b);
  return {
    period: 'Year ending June',
    years,
    series: GROUPS.map((g) => ({ id: g.id, label: g.label, convicted: years.map((y) => totals.get(y)[g.id]) })),
  };
}

export async function summariseCourts(zipPath) {
  const entry = (await listEntries(zipPath)).find((e) => e.name === ENTRY);
  if (!entry) throw new Error(`${zipPath} has no ${ENTRY}`);
  return summariseLines(createInterface({ input: await openEntry(zipPath, entry), crlfDelay: Infinity }));
}
