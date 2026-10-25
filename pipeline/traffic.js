// How Britain drives: DfT road traffic estimates since 1993 -> public/data/features/traffic.json.
//
//   npm run traffic              download the three DfT summary CSVs
//   npm run traffic -- --cached  use the copies in .cache/
//   npm run traffic -- --fixture tiny test files, for CI (part of `npm run data:fixture`)
//
// Source: DfT road traffic statistics (Open Government Licence), vehicle miles a year for Great
// Britain: by region and vehicle type, by region and road type, and by local authority.

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { download } from './fetch.js';
import { splitCsv } from './mot.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const TRAFFIC_PAGE_URL = 'https://roadtraffic.dft.gov.uk/downloads';
const BASE = 'https://storage.googleapis.com/dft-statistics/road-traffic/downloads/data-gov-uk/';
const FILES = {
  vehicles: 'region_traffic_by_vehicle_type.csv',
  roads: 'region_traffic_by_road_type.csv',
  councils: 'local_authority_traffic.csv',
};
export const VEHICLES = [
  { id: 'cars', label: 'Cars and taxis', column: 'cars_and_taxis' },
  { id: 'vans', label: 'Vans', column: 'LGVs' },
  { id: 'lorries', label: 'Lorries', column: 'all_HGVs' },
  { id: 'buses', label: 'Buses and coaches', column: 'buses_and_coaches' },
  { id: 'motorbikes', label: 'Motorbikes', column: 'two_wheeled_motor_vehicles' },
  { id: 'cycles', label: 'Bicycles', column: 'pedal_cycles' },
];
/** DfT's road categories: trunk and principal motorways and A roads, and minor roads. */
export const ROADS = [
  { id: 'motorway', label: 'Motorways', categories: ['TM', 'PM'] },
  { id: 'aroad', label: 'A roads', categories: ['TA', 'PA'] },
  { id: 'minor', label: 'Minor roads', categories: ['M'] },
];
/** Councils ranked by traffic per mile of road need at least this many miles of road. */
const MIN_ROAD_MILES = 100;
const RANKED = 10;

/** A CSV with a header row as objects; numbers parsed where they look like numbers. */
export function readCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const header = splitCsv(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const f = splitCsv(line);
    return Object.fromEntries(header.map((h, i) => [h, f[i] !== '' && Number.isFinite(Number(f[i])) ? Number(f[i]) : f[i]]));
  });
}

function need(rows, columns, what) {
  const missing = columns.filter((c) => !(c in (rows[0] ?? {})));
  if (!rows.length || missing.length) throw new Error(`${what} is missing columns: ${missing.join(', ') || 'all rows'}`);
}

/** Vehicle miles by year: per vehicle type and road type for Great Britain, per region, and per council for the latest year. */
export function buildTraffic({ vehicles, roads, councils }) {
  need(vehicles, ['year', 'region_name', 'link_length_miles', 'all_motor_vehicles', ...VEHICLES.map((v) => v.column)], 'Traffic by vehicle type');
  need(roads, ['year', 'region_name', 'road_category_name', 'link_length_miles', 'all_motor_vehicles'], 'Traffic by road type');
  need(councils, ['year', 'local_authority_name', 'local_authority_code', 'link_length_miles', 'cars_and_taxis', 'all_motor_vehicles'], 'Traffic by council');
  const years = [...new Set(vehicles.map((r) => r.year))].sort((a, b) => a - b);
  const at = (year) => years.indexOf(year);
  const zeros = () => years.map(() => 0);

  const byVehicle = Object.fromEntries([...VEHICLES.map((v) => v.id), 'all'].map((id) => [id, zeros()]));
  const regions = new Map();
  for (const r of vehicles) {
    const y = at(r.year);
    for (const v of VEHICLES) byVehicle[v.id][y] += r[v.column];
    byVehicle.all[y] += r.all_motor_vehicles;
    if (!regions.has(r.region_name)) regions.set(r.region_name, { name: r.region_name, cars: zeros(), all: zeros(), roadMiles: zeros() });
    const g = regions.get(r.region_name);
    g.cars[y] += r.cars_and_taxis;
    g.all[y] += r.all_motor_vehicles;
    g.roadMiles[y] += r.link_length_miles;
  }
  const latest = years.at(-1);
  const byRoad = Object.fromEntries(ROADS.map((d) => [d.id, zeros()]));
  const roadMiles = Object.fromEntries(ROADS.map((d) => [d.id, 0])); // length of each kind of road, latest year
  for (const r of roads) {
    const road = ROADS.find((d) => d.categories.includes(r.road_category_name));
    if (!road || at(r.year) === -1) continue;
    byRoad[road.id][at(r.year)] += r.all_motor_vehicles;
    if (r.year === latest) roadMiles[road.id] += r.link_length_miles;
  }

  const council = councils
    .filter((r) => r.year === latest && r.link_length_miles >= MIN_ROAD_MILES)
    .map((r) => ({ name: r.local_authority_name, code: r.local_authority_code, roadMiles: r.link_length_miles, all: r.all_motor_vehicles, perRoadMile: r.all_motor_vehicles / r.link_length_miles }))
    .sort((a, b) => b.perRoadMile - a.perRoadMile);
  return {
    source: TRAFFIC_PAGE_URL,
    years,
    vehicles: VEHICLES.map((v) => ({ id: v.id, label: v.label, values: byVehicle[v.id] })),
    all: byVehicle.all,
    roads: ROADS.map((d) => ({ id: d.id, label: d.label, values: byRoad[d.id], roadMiles: roadMiles[d.id] })),
    regions: [...regions.values()].sort((a, b) => a.name.localeCompare(b.name)),
    councils: { year: latest, ranked: council.length, busiest: council.slice(0, RANKED), quietest: council.slice(-RANKED).reverse() },
  };
}

async function main() {
  const fixture = process.argv.includes('--fixture');
  const paths = Object.fromEntries(
    Object.entries(FILES).map(([key, file]) => [key, fixture ? join(ROOT, 'test', 'fixtures', `mini_${file}`) : join(ROOT, '.cache', file)]),
  );
  if (!fixture && !process.argv.includes('--cached')) {
    for (const [key, file] of Object.entries(FILES)) {
      console.log(`Downloading ${BASE}${file}`);
      await download(BASE + file, paths[key]);
    }
  }
  const read = async (key) => readCsv(await readFile(paths[key], 'utf8'));
  const traffic = buildTraffic({ vehicles: await read('vehicles'), roads: await read('roads'), councils: await read('councils') });
  const out = join(ROOT, 'public', 'data', 'features', 'traffic.json');
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(traffic));
  console.log(`Wrote ${out}: ${traffic.years[0]} to ${traffic.years.at(-1)}, ${traffic.councils.ranked} councils ranked`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
