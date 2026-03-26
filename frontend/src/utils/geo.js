/**
 * Generate points along a great-circle arc between two coordinates.
 * Used to draw curved flight paths on Google Maps.
 */
export function greatCirclePoints(start, end, numPoints = 50) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;

  const lat1 = toRad(start.lat);
  const lng1 = toRad(start.lng);
  const lat2 = toRad(end.lat);
  const lng2 = toRad(end.lng);

  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2
      )
    );

  if (d < 1e-10) return [start, end];

  const points = [];
  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);

    const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
    const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);

    points.push({
      lat: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))),
      lng: toDeg(Math.atan2(y, x)),
    });
  }

  return points;
}

/** Internal globe radius; must match three-globe `GLOBE_RADIUS` (see node_modules/three-globe). */
export const THREE_GLOBE_RADIUS = 100;

/**
 * Same mapping as three-globe `polar2Cartesian` (lat, lng in degrees, relative altitude).
 */
export function polarToCartesianThreeGlobe(lat, lng, relAltitude = 0) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((90 - lng) * Math.PI) / 180;
  const r = THREE_GLOBE_RADIUS * (1 + relAltitude);
  const phiSin = Math.sin(phi);
  return {
    x: r * phiSin * Math.cos(theta),
    y: r * Math.cos(phi),
    z: r * phiSin * Math.sin(theta),
  };
}

/**
 * Inverse of polarToCartesianThreeGlobe (matches three-globe `cartesian2Polar`).
 */
export function cartesianToLatLngAltThreeGlobe(x, y, z) {
  const r = Math.sqrt(x * x + y * y + z * z);
  if (r < 1e-12) {
    return { lat: 0, lng: 0, altitude: 0 };
  }
  const phi = Math.acos(Math.min(1, Math.max(-1, y / r)));
  const theta = Math.atan2(z, x);
  let lng = 90 - (theta * 180) / Math.PI;
  if (theta < -Math.PI / 2) lng -= 360;
  return {
    lat: 90 - (phi * 180) / Math.PI,
    lng,
    altitude: r / THREE_GLOBE_RADIUS - 1,
  };
}

function greatCircleAngularDistanceRad(start, end) {
  const lat1 = (start.lat * Math.PI) / 180;
  const lng1 = (start.lng * Math.PI) / 180;
  const lat2 = (end.lat * Math.PI) / 180;
  const lng2 = (end.lng * Math.PI) / 180;
  return (
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2
      )
    )
  );
}

/**
 * d3-style geoInterpolate([lng,lat],[lng,lat]) → (t) => [lng, lat] in degrees.
 * Matches three-globe's `geoInterpolate` output used for arc control points.
 */
function geoInterpolateLngLatPair(startLng, startLat, endLng, endLat) {
  const radians = Math.PI / 180;
  const degrees = 180 / Math.PI;
  const x0 = startLng * radians;
  const y0 = startLat * radians;
  const x1 = endLng * radians;
  const y1 = endLat * radians;
  const cy0 = Math.cos(y0);
  const sy0 = Math.sin(y0);
  const cy1 = Math.cos(y1);
  const sy1 = Math.sin(y1);
  const kx0 = cy0 * Math.cos(x0);
  const ky0 = cy0 * Math.sin(x0);
  const kx1 = cy1 * Math.cos(x1);
  const ky1 = cy1 * Math.sin(x1);
  const haversin = (a) => (1 - Math.cos(a)) / 2;
  const d = 2 * Math.asin(Math.sqrt(haversin(y1 - y0) + cy0 * cy1 * haversin(x1 - x0)));
  const k = Math.sin(d);
  if (!d || !k) {
    return () => [startLng, startLat];
  }
  return (t) => {
    const td = t * d;
    const B = Math.sin(td) / k;
    const A = Math.sin(d - td) / k;
    const x = A * kx0 + B * kx1;
    const y = A * ky0 + B * ky1;
    const zz = A * sy0 + B * sy1;
    const lng = Math.atan2(y, x) * degrees;
    const lat = Math.atan2(zz, Math.sqrt(x * x + y * y)) * degrees;
    return [lng, lat];
  };
}

function calcAltCp(a0, a1) {
  return a1 + (a1 - a0) * (a0 < a1 ? 0.5 : 0.25);
}

function cubicBezierPoint3(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  const c0 = uu * u;
  const c1 = 3 * uu * t;
  const c2 = 3 * u * tt;
  const c3 = t * tt;
  return {
    x: c0 * p0.x + c1 * p1.x + c2 * p2.x + c3 * p3.x,
    y: c0 * p0.y + c1 * p1.y + c2 * p2.y + c3 * p3.y,
    z: c0 * p0.z + c1 * p1.z + c2 * p2.z + c3 * p3.z,
  };
}

/**
 * Position at t ∈ [0,1] on the same 3D curve three-globe uses for arcs (CubicBezierCurve3
 * when altitude is set, else great circle slightly above ground).
 * Pass the same `arcAltitude`, `arcAltitudeAutoScale`, endpoint alts as on the Globe component.
 */
export function interpolateAlongGlobeArcSameAsThreeGlobe(
  start,
  end,
  t,
  {
    arcAltitude = null,
    arcAltitudeAutoScale = 0.24,
    startAlt = 0,
    endAlt = 0,
  } = {}
) {
  const startLng = start.lng;
  const startLat = start.lat;
  const endLng = end.lng;
  const endLat = end.lat;
  const clampedT = Math.max(0, Math.min(1, t));

  let altitude = arcAltitude;
  if (altitude === null || altitude === undefined) {
    const geoDistRad = greatCircleAngularDistanceRad(start, end);
    altitude = (geoDistRad / 2) * arcAltitudeAutoScale + Math.max(startAlt, endAlt);
  }

  const vec = (lng, lat, alt) => polarToCartesianThreeGlobe(lat, lng, alt);

  if (altitude || startAlt || endAlt) {
    const interpolate = geoInterpolateLngLatPair(startLng, startLat, endLng, endLat);
    const m1 = interpolate(0.25);
    const m2 = interpolate(0.75);
    const m1Alt = calcAltCp(startAlt, altitude);
    const m2Alt = calcAltCp(endAlt, altitude);
    const p0 = vec(startLng, startLat, startAlt);
    const p1 = vec(m1[0], m1[1], m1Alt);
    const p2 = vec(m2[0], m2[1], m2Alt);
    const p3 = vec(endLng, endLat, endAlt);
    const c = cubicBezierPoint3(p0, p1, p2, p3, clampedT);
    return cartesianToLatLngAltThreeGlobe(c.x, c.y, c.z);
  }

  const ground = 0.001;
  const p0 = vec(startLng, startLat, ground);
  const p1 = vec(endLng, endLat, ground);
  const angle = Math.acos(
    Math.min(1, Math.max(-1, (p0.x * p1.x + p0.y * p1.y + p0.z * p1.z) / (THREE_GLOBE_RADIUS * (1 + ground)) ** 2))
  );
  if (!angle || angle < 1e-8) {
    return cartesianToLatLngAltThreeGlobe(p0.x, p0.y, p0.z);
  }
  const st = Math.sin(angle);
  const a = Math.sin((1 - clampedT) * angle) / st;
  const b = Math.sin(clampedT * angle) / st;
  const c = {
    x: p0.x * a + p1.x * b,
    y: p0.y * a + p1.y * b,
    z: p0.z * a + p1.z * b,
  };
  return cartesianToLatLngAltThreeGlobe(c.x, c.y, c.z);
}

/**
 * Point at fraction t ∈ [0,1] along the great-circle arc from start to end.
 */
export function interpolateAlongGreatCircle(start, end, t) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;

  const lat1 = toRad(start.lat);
  const lng1 = toRad(start.lng);
  const lat2 = toRad(end.lat);
  const lng2 = toRad(end.lng);

  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2
      )
    );

  if (d < 1e-10) return { lat: start.lat, lng: start.lng };

  const f = Math.max(0, Math.min(1, t));
  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);

  const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
  const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
  const z = A * Math.sin(lat1) + B * Math.sin(lat2);

  return {
    lat: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))),
    lng: toDeg(Math.atan2(y, x)),
  };
}

/**
 * Haversine distance in km.
 */
export function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Format minutes into "Xh Ym" string.
 */
export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Format price to USD string.
 */
export function formatPrice(usd) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(usd);
}

/**
 * Color interpolation for score-based coloring.
 * score 0 (best) → cyan, score 1 (worst) → magenta
 */
export function scoreToColor(score) {
  const clamped = Math.max(0, Math.min(1, score));
  // cyan: 0, 212, 255 → magenta: 255, 61, 138
  const r = Math.round(0 + clamped * 255);
  const g = Math.round(212 - clamped * 151);
  const b = Math.round(255 - clamped * 117);
  return `rgb(${r}, ${g}, ${b})`;
}

/** RGB tuple for the same gradient as scoreToColor. */
export function scoreToRgb(score) {
  const clamped = Math.max(0, Math.min(1, score));
  return [
    Math.round(0 + clamped * 255),
    Math.round(212 - clamped * 151),
    Math.round(255 - clamped * 117),
  ];
}

/**
 * Per-leg accent along cyan → emerald so leg order reads on the map.
 */
export function legOrderAccentRgb(legIndex, totalLegs) {
  const t = totalLegs <= 1 ? 0 : legIndex / (totalLegs - 1);
  const r = Math.round(0 + t * 40);
  const g = Math.round(212 - t * 20);
  const b = Math.round(255 - t * 90);
  return [r, g, b];
}

/**
 * Blend leg score color with leg-index accent (globe arcs).
 */
export function legArcColor(score, legIndex, totalLegs, blend = 0.38) {
  const s = scoreToRgb(score);
  const l = legOrderAccentRgb(legIndex, totalLegs);
  const rgb = s.map((c, i) => Math.round(c * (1 - blend) + l[i] * blend));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}
