// Plug-ins near you: privately kept plug-in cars in each neighbourhood (a small area: an LSOA in
// England and Wales, a data zone in Scotland and Northern Ireland), found by postcode.
//
// Written by pipeline/electric.js, from the same DfT VEH0145 and ONS postcode lookup files:
//   public/data/plugins/<district>.json  each postcode in the district -> its neighbourhood, and
//                                        those neighbourhoods' plug-ins, quarter by quarter
//   public/data/plugins/index.json       the quarters, and each nation's spread, for "more than X%"
//
// As with the postcode files, a lookup downloads only its own district, so a postcode is never
// sent anywhere. Only private plug-ins count (see electric.js: company cars sit at head offices).

/** Quarters kept per neighbourhood: five years and a bit, as on the council map. */
export const AREA_QUARTERS = 21;
const NATIONS = { E: 'England', W: 'Wales', S: 'Scotland', N: 'Northern Ireland' };
const FUELS = { Total: 'total', 'Battery electric': 'electric' };

/** Private plug-ins per neighbourhood, the last AREA_QUARTERS quarters, from VEH0145 rows (header first). */
export async function plugInsByArea(rows) {
  let quarters;
  let keep;
  const areas = new Map();
  for await (const r of rows) {
    if (!quarters) {
      if (r[0] !== 'LSOA21CD' || r[1] !== 'LSOA21NM' || r[3] !== 'Keepership') throw new Error('VEH0145 has unexpected columns');
      const all = r.slice(4).reverse(); // oldest first
      keep = Math.min(AREA_QUARTERS, all.length);
      quarters = all.slice(-keep);
      continue;
    }
    const fuel = FUELS[r[2]];
    if (r[3] !== 'Private' || !fuel || !NATIONS[r[0][0]] || !/\d/.test(r[0])) continue; // not "Miscellaneous"
    let a = areas.get(r[0]);
    if (!a) areas.set(r[0], (a = { name: r[1].trim(), total: new Array(keep).fill(0), electric: new Array(keep).fill(0) }));
    // Suppressed counts ([c], 1 to 4 vehicles) count as zero, as on the rest of the site.
    a[fuel] = r.slice(4).reverse().slice(-keep).map((v) => (/^\d+$/.test(v) ? Number(v) : 0));
  }
  if (!quarters) throw new Error('VEH0145 is empty');
  return { quarters, areas };
}

/** Live postcodes by district: district -> Map(inward code -> neighbourhood code). */
export async function postcodesByDistrict(rows) {
  const districts = new Map();
  for await (const r of rows) {
    if (r.doterm || !r.lsoa21cd || !r.pcds) continue;
    const [district, inward] = r.pcds.trim().split(' ');
    if (!inward) continue;
    if (!districts.has(district)) districts.set(district, new Map());
    districts.get(district).set(inward, r.lsoa21cd);
  }
  return districts;
}

/** Each nation's latest counts as 101 points (0th to 100th percentile), for "more than X% of neighbourhoods". */
function spread(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return Array.from({ length: 101 }, (_, p) => sorted[Math.min(sorted.length - 1, Math.round((p / 100) * (sorted.length - 1)))]);
}

/** The files to write: the index, and one per district holding only its own neighbourhoods. */
export function neighbourhoodFiles({ quarters, areas }, districts) {
  const last = quarters.length - 1;
  const byNation = {};
  for (const [code, a] of areas) (byNation[code[0]] ??= []).push(a.total[last]);
  const files = new Map();
  for (const [district, postcodes] of districts) {
    const used = [...new Set(postcodes.values())].filter((code) => areas.has(code));
    if (!used.length) continue;
    const at = new Map(used.map((code, i) => [code, i]));
    const p = {};
    for (const [inward, code] of postcodes) if (at.has(code)) p[inward] = at.get(code);
    files.set(district, {
      a: used.map((code) => {
        const a = areas.get(code);
        return [code, a.name, a.total, a.electric];
      }),
      p,
    });
  }
  return {
    index: {
      quarters,
      nations: Object.fromEntries(Object.entries(byNation).map(([n, values]) => [n, { name: NATIONS[n], areas: values.length, spread: spread(values) }])),
    },
    files,
  };
}
