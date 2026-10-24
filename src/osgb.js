// GPS latitude and longitude (WGS84) to British National Grid eastings and northings, the
// coordinates of OS postcodes and our maps. The standard Ordnance Survey method: a Helmert
// shift from WGS84 to the OSGB36 datum (good to a few metres), then the Transverse Mercator
// projection on the Airy 1830 ellipsoid. See OS, "A guide to coordinate systems in Great Britain".

const RAD = Math.PI / 180;

// Ellipsoids
const WGS84 = { a: 6378137, b: 6356752.314245 };
const AIRY = { a: 6377563.396, b: 6356256.909 };

// National Grid projection
const F0 = 0.9996012717;
const LAT0 = 49 * RAD;
const LON0 = -2 * RAD;
const E0 = 400000;
const N0 = -100000;

// WGS84 -> OSGB36 Helmert transform (OS's published parameters).
const HELMERT = { tx: -446.448, ty: 125.157, tz: -542.06, s: 20.4894e-6, rx: -0.1502, ry: -0.247, rz: -0.8421 };

function toCartesian(lat, lon, { a, b }) {
  const e2 = 1 - (b * b) / (a * a);
  const nu = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  return [nu * Math.cos(lat) * Math.cos(lon), nu * Math.cos(lat) * Math.sin(lon), (1 - e2) * nu * Math.sin(lat)];
}

function toLatLon([x, y, z], { a, b }) {
  const e2 = 1 - (b * b) / (a * a);
  const p = Math.hypot(x, y);
  let lat = Math.atan2(z, p * (1 - e2));
  for (let i = 0; i < 10; i++) {
    const nu = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
    lat = Math.atan2(z + e2 * nu * Math.sin(lat), p);
  }
  return [lat, Math.atan2(y, x)];
}

function helmert([x, y, z]) {
  const { tx, ty, tz, s, rx, ry, rz } = HELMERT;
  const [r1, r2, r3] = [rx, ry, rz].map((r) => (r / 3600) * RAD);
  return [tx + (1 + s) * x - r3 * y + r2 * z, ty + r3 * x + (1 + s) * y - r1 * z, tz - r2 * x + r1 * y + (1 + s) * z];
}

/** OSGB36 latitude and longitude (radians) to eastings and northings, in metres. */
export function osgb36ToGrid(lat, lon) {
  const { a, b } = AIRY;
  const e2 = 1 - (b * b) / (a * a);
  const n = (a - b) / (a + b);
  const sin = Math.sin(lat);
  const cos = Math.cos(lat);
  const nu = (a * F0) / Math.sqrt(1 - e2 * sin * sin);
  const rho = (a * F0 * (1 - e2)) / (1 - e2 * sin * sin) ** 1.5;
  const eta2 = nu / rho - 1;
  const dLat = lat - LAT0;
  const sLat = lat + LAT0;
  const M =
    b *
    F0 *
    ((1 + n + (5 / 4) * n ** 2 + (5 / 4) * n ** 3) * dLat -
      (3 * n + 3 * n ** 2 + (21 / 8) * n ** 3) * Math.sin(dLat) * Math.cos(sLat) +
      ((15 / 8) * n ** 2 + (15 / 8) * n ** 3) * Math.sin(2 * dLat) * Math.cos(2 * sLat) -
      (35 / 24) * n ** 3 * Math.sin(3 * dLat) * Math.cos(3 * sLat));
  const tan2 = Math.tan(lat) ** 2;
  const I = M + N0;
  const II = (nu / 2) * sin * cos;
  const III = (nu / 24) * sin * cos ** 3 * (5 - tan2 + 9 * eta2);
  const IIIA = (nu / 720) * sin * cos ** 5 * (61 - 58 * tan2 + tan2 ** 2);
  const IV = nu * cos;
  const V = (nu / 6) * cos ** 3 * (nu / rho - tan2);
  const VI = (nu / 120) * cos ** 5 * (5 - 18 * tan2 + tan2 ** 2 + 14 * eta2 - 58 * tan2 * eta2);
  const dLon = lon - LON0;
  return [E0 + IV * dLon + V * dLon ** 3 + VI * dLon ** 5, I + II * dLon ** 2 + III * dLon ** 4 + IIIA * dLon ** 6];
}

/** GPS (WGS84) latitude and longitude, in degrees, to National Grid eastings and northings. */
export function wgs84ToGrid(latDeg, lonDeg) {
  const [lat, lon] = toLatLon(helmert(toCartesian(latDeg * RAD, lonDeg * RAD, WGS84)), AIRY);
  return osgb36ToGrid(lat, lon);
}
