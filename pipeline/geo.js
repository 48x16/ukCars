// Builds the map files the site draws. All are in British National Grid metres, so pages draw
// them without a map projection. Run by hand (`npm run geo`) when the sources change, and
// commit the results.
//
// data/geo/gb.json, for the MOT map: an outline of Great Britain and a point per postcode area.
// - Outline: ONS Countries (December 2025) Boundaries UK BUC, ultra generalised (500 m).
//   Northern Ireland is left out: MOT data covers Great Britain only.
// - Points: OS Code-Point Open, the position of every postcode. Each area's point is the
//   average of its postcodes, so it sits where people live rather than at a geometric centre.
//
// data/geo/councils.json, for the electric map: the UK's local authorities as TopoJSON, so
// neighbouring councils share one simplified border instead of each drawing their own.
// - ONS Local Authority Districts (December 2025) Boundaries UK BUC.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quantize } from 'topojson-client';
import { topology } from 'topojson-server';
import { presimplify, simplify as simplifyTopology } from 'topojson-simplify';
import { download } from './fetch.js';
import { splitCsv } from './mot.js';
import { listEntries, openEntry } from './zip.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTLINE_URL =
  'https://open-geography-portalx-ons.hub.arcgis.com/api/download/v1/items/818212ae5b2948bcb352842081c03762/geojson?layers=0';
const COUNCILS_URL =
  'https://open-geography-portalx-ons.hub.arcgis.com/api/download/v1/items/837dd9c41a7b458c974caf6e4ca56e7b/geojson?layers=0';
const CODEPOINT_URL = 'https://api.os.uk/downloads/v1/products/CodePointOpen/downloads?area=GB&format=CSV&redirect';
const GRID = 500; // metres: the outline's own precision
const TOLERANCE = 1000; // metres a simplified line may stray from the original: under a pixel on the map
const MIN_RING_AREA = 4 * 1000 * 1000; // drop islets under 4 km², invisible at this scale

export const ATTRIBUTION = [
  'Source: Office for National Statistics licensed under the Open Government Licence v3.0.',
  'Contains OS data © Crown copyright and database right 2026.',
  'Contains Royal Mail data © Royal Mail copyright and database right 2026.',
  'Contains National Statistics data © Crown copyright and database right 2026.',
];

/** Postcode areas, named after their main post town (or the region, where that's clearer). */
export const AREA_NAMES = {
  AB: 'Aberdeen', AL: 'St Albans', B: 'Birmingham', BA: 'Bath', BB: 'Blackburn', BD: 'Bradford',
  BH: 'Bournemouth', BL: 'Bolton', BN: 'Brighton', BR: 'Bromley', BS: 'Bristol', CA: 'Carlisle',
  CB: 'Cambridge', CF: 'Cardiff', CH: 'Chester', CM: 'Chelmsford', CO: 'Colchester', CR: 'Croydon',
  CT: 'Canterbury', CV: 'Coventry', CW: 'Crewe', DA: 'Dartford', DD: 'Dundee', DE: 'Derby',
  DG: 'Dumfries', DH: 'Durham', DL: 'Darlington', DN: 'Doncaster', DT: 'Dorchester', DY: 'Dudley',
  E: 'East London', EC: 'Central London (EC)', EH: 'Edinburgh', EN: 'Enfield', EX: 'Exeter',
  FK: 'Falkirk', FY: 'Blackpool', G: 'Glasgow', GL: 'Gloucester', GU: 'Guildford', HA: 'Harrow',
  HD: 'Huddersfield', HG: 'Harrogate', HP: 'Hemel Hempstead', HR: 'Hereford', HS: 'Outer Hebrides',
  HU: 'Hull', HX: 'Halifax', IG: 'Ilford', IP: 'Ipswich', IV: 'Inverness', KA: 'Kilmarnock',
  KT: 'Kingston upon Thames', KW: 'Kirkwall', KY: 'Kirkcaldy', L: 'Liverpool', LA: 'Lancaster',
  LD: 'Llandrindod Wells', LE: 'Leicester', LL: 'Llandudno', LN: 'Lincoln', LS: 'Leeds', LU: 'Luton',
  M: 'Manchester', ME: 'Medway', MK: 'Milton Keynes', ML: 'Motherwell', N: 'North London',
  NE: 'Newcastle upon Tyne', NG: 'Nottingham', NN: 'Northampton', NP: 'Newport', NR: 'Norwich',
  NW: 'North West London', OL: 'Oldham', OX: 'Oxford', PA: 'Paisley', PE: 'Peterborough', PH: 'Perth',
  PL: 'Plymouth', PO: 'Portsmouth', PR: 'Preston', RG: 'Reading', RH: 'Redhill', RM: 'Romford',
  S: 'Sheffield', SA: 'Swansea', SE: 'South East London', SG: 'Stevenage', SK: 'Stockport', SL: 'Slough',
  SM: 'Sutton', SN: 'Swindon', SO: 'Southampton', SP: 'Salisbury', SR: 'Sunderland', SS: 'Southend-on-Sea',
  ST: 'Stoke-on-Trent', SW: 'South West London', SY: 'Shrewsbury', TA: 'Taunton', TD: 'Galashiels',
  TF: 'Telford', TN: 'Tonbridge', TQ: 'Torquay', TR: 'Truro', TS: 'Cleveland', TW: 'Twickenham',
  UB: 'Southall', W: 'West London', WA: 'Warrington', WC: 'Central London (WC)', WD: 'Watford',
  WF: 'Wakefield', WN: 'Wigan', WR: 'Worcester', WS: 'Walsall', WV: 'Wolverhampton', YO: 'York',
  ZE: 'Shetland',
};

/** Shoelace area of a ring, in square metres. */
function ringArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(sum / 2);
}

/** Distance from point p to the segment a-b. */
function segmentDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Douglas-Peucker: keeps only the points needed to stay within `tolerance` of the line. */
export function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let worst = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = segmentDistance(points[i], points[first], points[last]);
      if (d > worst) [worst, index] = [d, i];
    }
    if (worst > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Simplifies a ring and snaps it to the grid, dropping repeated points. Null if too small to see. */
export function snapRing(ring, { grid = GRID, tolerance = TOLERANCE } = {}) {
  const out = [];
  for (const [x, y] of simplify(ring, tolerance)) {
    const p = [Math.round(x / grid) * grid, Math.round(y / grid) * grid];
    const last = out.at(-1);
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  if (out.length < 4 || ringArea(out) < MIN_RING_AREA) return null;
  return out;
}

/** England, Scotland and Wales as snapped MultiPolygons. */
export function buildOutline(geojson) {
  return {
    type: 'FeatureCollection',
    features: geojson.features
      .filter((f) => !f.properties.CTRY25CD.startsWith('N'))
      .map((f) => ({
        type: 'Feature',
        properties: { name: f.properties.CTRY25NM },
        geometry: {
          type: 'MultiPolygon',
          coordinates: f.geometry.coordinates
            .map((polygon) => [snapRing(polygon[0])]) // outer rings only: holes are lakes
            .filter(([outer]) => outer),
        },
      })),
  };
}

/** Smallest triangle (m²) a simplified council border keeps: about half a pixel on the map. */
const MIN_COUNCIL_WEIGHT = 1_500_000;

/** UK local authorities as TopoJSON, borders simplified once and shared between neighbours. */
export function buildCouncils(geojson, { minWeight = MIN_COUNCIL_WEIGHT } = {}) {
  const features = geojson.features.map((f) => ({
    type: 'Feature',
    properties: { code: f.properties.LAD25CD, name: f.properties.LAD25NM },
    geometry: f.geometry,
  }));
  const simplified = simplifyTopology(presimplify(topology({ councils: { type: 'FeatureCollection', features } })), minWeight);
  // Whole-number steps on a 10,000-point grid (about 66 m): far finer than a pixel, and compact.
  return quantize(simplified, 1e4);
}

/** One point per postcode area: the mean position of its postcodes, to the nearest 100 m. */
export async function buildAreas(zipPath) {
  const areas = [];
  for (const entry of await listEntries(zipPath)) {
    const m = /^Data\/CSV\/([a-z]+)\.csv$/i.exec(entry.name);
    if (!m) continue;
    let text = '';
    for await (const chunk of await openEntry(zipPath, entry)) text += chunk;
    let x = 0;
    let y = 0;
    let n = 0;
    for (const line of text.split('\n')) {
      if (!line) continue;
      const [, , e, north] = splitCsv(line.trimEnd());
      if (Number(e) > 0 && Number(north) > 0) {
        x += Number(e);
        y += Number(north);
        n++;
      }
    }
    const area = m[1].toUpperCase();
    if (!AREA_NAMES[area]) throw new Error(`No name for postcode area ${area}: add it to AREA_NAMES`);
    areas.push({ area, name: AREA_NAMES[area], x: Math.round(x / n / 100) * 100, y: Math.round(y / n / 100) * 100, postcodes: n });
  }
  return areas.sort((a, b) => a.area.localeCompare(b.area));
}

async function main() {
  const cache = join(ROOT, '.cache');
  const outlinePath = join(cache, 'countries_buc.geojson');
  const codepointPath = join(cache, 'codepo_gb.zip');
  const councilsPath = join(cache, 'lad_buc.geojson');
  if (!process.argv.includes('--cached')) {
    console.log('Downloading ONS country and council outlines and OS Code-Point Open');
    await download(OUTLINE_URL, outlinePath);
    await download(COUNCILS_URL, councilsPath);
    await download(CODEPOINT_URL, codepointPath);
  }
  const outline = buildOutline(JSON.parse(await readFile(outlinePath, 'utf8')));
  const areas = await buildAreas(codepointPath);
  const out = join(ROOT, 'data', 'geo', 'gb.json');
  await mkdir(dirname(out), { recursive: true });
  const json = JSON.stringify({ crs: 'EPSG:27700', attribution: ATTRIBUTION, outline, areas });
  await writeFile(out, json);
  const points = outline.features.reduce((n, f) => n + f.geometry.coordinates.flat(2).length, 0);
  console.log(`Wrote ${out}: ${areas.length} postcode areas, outline of ${points} points, ${Math.round(json.length / 1024)} KB`);

  const councils = buildCouncils(JSON.parse(await readFile(councilsPath, 'utf8')));
  const councilsJson = JSON.stringify({ attribution: ATTRIBUTION.slice(0, 2), ...councils });
  await writeFile(join(ROOT, 'data', 'geo', 'councils.json'), councilsJson);
  console.log(`Wrote councils.json: ${councils.objects.councils.geometries.length} councils, ${Math.round(councilsJson.length / 1024)} KB`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
