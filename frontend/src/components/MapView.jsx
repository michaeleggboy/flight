import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import * as THREE from 'three';
import Globe from 'react-globe.gl';
import { Plane, X } from 'lucide-react';
import { legArcColor, interpolateAlongGlobeArcSameAsThreeGlobe } from '../utils/geo';
import { globeTokens } from '../theme/tokens';
import macroGlobeLabels from '../data/macroGlobeLabels.json';

// ─── Globe textures (free, no API key) — photoreal surface per three-globe examples ──

const GLOBE_IMAGE = '//unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
const BUMP_IMAGE = '//unpkg.com/three-globe/example/img/earth-topology.png';
/** Same asset as [react-globe.gl clouds example](https://github.com/vasturiano/react-globe.gl/tree/master/example/clouds). */
const CLOUDS_TEXTURE_URL =
  'https://cdn.jsdelivr.net/gh/vasturiano/react-globe.gl@master/example/clouds/clouds.png';
const CLOUDS_ALT = 0.004;
const CLOUDS_ROTATION_DEG_PER_FRAME = -0.006;
/** Star shell radius vs globe; camera stays well inside so stars read as sky around Earth. */
const STARFIELD_RADIUS_MULT = 36;
const STARFIELD_COUNT = 2400;
const STARFIELD_POINT_SIZE = 2.15;
const STARFIELD_OPACITY = 0.72;

/** Slightly lower emissive so land polygons + texture read more clearly. */
const LAND_POLYGON_ALTITUDE = 0.014;
/** Points, rings, labels sit above polygon caps so motion reads in front of land. */
const POINT_ALTITUDE = 0.022;
const RING_SURFACE_ALT = 0.026;
const ROUTE_LABEL_ALT = 0.028;
const MACRO_LABEL_ALT = 0.02;
/**
 * Arc mid-height scale (three-globe). Slightly higher so curves clear extruded land polygons;
 * must match `interpolateAlongGlobeArcSameAsThreeGlobe` options.
 */
const ARC_ALTITUDE_AUTO_SCALE = 0.24;
/** Arc endpoints: same band as city points, above `LAND_POLYGON_ALTITUDE` land mesh. */
const ARC_ENDPOINT_ALT = POINT_ALTITUDE;
/** Nudge leg badges slightly above the sampled arc so they stay readable. */
const LEG_HTML_ALT_LIFT = 0.01;
const MACRO_LABEL_MAX_ALTITUDE = 1.65;

/** Leg badge orbit — between the old ~3.3s loop and the 0.7s “fast” pass. */
const LEG_MARKER_TICK_MS = 56;
const LEG_MARKER_PHASE_STEP = 0.03;
/** Arc dash travel along path (ms). */
const ARC_DASH_ANIMATE_MS = 1500;
/** Camera glide when framing route (ms). */
const CAMERA_POV_MS = 720;

/** Lower = closer zoom (globe.gl camera altitude). */
const DEFAULT_CAMERA_ALTITUDE = 0.95;
const ROUTE_CAMERA_ALT_MIN = 0.62;
const ROUTE_CAMERA_ALT_MAX = 1.22;
/** Tighter framing than spread/55 — keep routes / airport network large on screen. */
const ROUTE_ALT_SPREAD_DIVISOR = 30;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatLatLng(lat, lng) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lng).toFixed(2)}°${ew}`;
}

function stopRoleLabel(tripType, idx, total, order, code) {
  if (idx < 0 || total === 0) return '';
  const returnDupe = order.length > 1 && order[0] === code && order[order.length - 1] === code;
  let base = '';
  if (idx === 0) {
    if (tripType === 'round_trip') base = 'Origin · round trip';
    else if (tripType === 'multi_city') base = 'Origin · fixed visit order';
    else base = 'Origin · flexible routing';
    if (returnDupe) base += ' · also return';
  } else if (tripType === 'round_trip') {
    base = total <= 2 ? 'Away · return to origin' : `Stop ${idx + 1} · round trip`;
  } else if (tripType === 'multi_city') {
    base = `Stop ${idx + 1} · list order`;
  } else {
    base = `Stop ${idx + 1} · order optimized`;
  }
  return base;
}

/** Hover tooltip for all airports on the globe (pool + trip selection). */
function airportGlobeLabelHtml(d, tripType, planning) {
  if (!d?.code) return '';
  const e = escapeHtml;
  const nameLine = d.name ? `<div class="globe-country-tooltip__meta">${e(d.name)}</div>` : '';
  const cityFrag = d.city ? `<span class="globe-airport-tooltip__city"> · ${e(d.city)}</span>` : '';
  const codeFrag = `<span style="font-family:ui-monospace,monospace;font-weight:600">${e(d.code)}</span>`;

  if (d.isPool) {
    const modeHint =
      tripType === 'round_trip'
        ? 'Round trip: origin first, then other cities; we permute the middle.'
        : tripType === 'multi_city'
          ? 'Multi-city: your list order is the visit order (then return to start).'
          : 'Flexible: we search permutations; origin stays first.';
    const action = planning
      ? 'Click to add · Right-click: make origin'
      : 'Select a result in the panel to edit the trip';
    return `
      <div class="globe-country-tooltip globe-airport-tooltip">
        <div class="globe-country-tooltip__name">${codeFrag}${cityFrag}</div>
        ${nameLine}
        <div class="globe-country-tooltip__pop">${e(action)}</div>
        <div class="globe-airport-tooltip__hint">${e(modeHint)}</div>
      </div>
    `;
  }

  const role = d.roleLabel
    ? e(d.roleLabel)
    : d.isOrigin
      ? 'Origin'
      : e(`Stop ${d.stopIndex ?? ''}`);
  const action = planning ? 'Click to remove · Right-click: make origin' : 'Chosen itinerary';
  return `
    <div class="globe-country-tooltip globe-airport-tooltip">
      <div class="globe-country-tooltip__name">${codeFrag}${cityFrag}</div>
      ${nameLine}
      <div class="globe-country-tooltip__pop">${role}</div>
      <div class="globe-airport-tooltip__hint subtle">${e(action)}</div>
    </div>
  `;
}

/** Phong material tuned so Blue Marble stays vivid; map comes from `globeImageUrl` (see react-globe.gl). */
/** Uniform distribution on a sphere (random direction). */
function createStarfieldPoints(globeRadius) {
  const r = globeRadius * STARFIELD_RADIUS_MULT;
  const positions = new Float32Array(STARFIELD_COUNT * 3);
  for (let i = 0; i < STARFIELD_COUNT; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const sinP = Math.sin(phi);
    positions[i * 3] = r * sinP * Math.cos(theta);
    positions[i * 3 + 1] = r * sinP * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: new THREE.Color(globeTokens.starField),
    size: STARFIELD_POINT_SIZE,
    sizeAttenuation: true,
    transparent: true,
    opacity: STARFIELD_OPACITY,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, mat);
}

function createGlobeMaterial() {
  return new THREE.MeshPhongMaterial({
    color: globeTokens.meshColor,
    emissive: new THREE.Color(globeTokens.meshEmissive),
    emissiveIntensity: 0.12,
    shininess: 12,
    specular: new THREE.Color(globeTokens.meshSpecular),
  });
}

export default function MapView({
  airports = [],
  selectedCities = [],
  selectedItinerary = null,
  tripType = 'flexible',
  onGlobeAirportPick,
  /** Fill parent with no inset border/radius (map under floating UI) */
  edgeToEdge = false,
}) {
  const globeRef = useRef();
  const containerRef = useRef();
  const legMarkerElCacheRef = useRef(new Map());
  const cloudsMeshRef = useRef(null);
  const starfieldMeshRef = useRef(null);
  const cloudsRafRef = useRef(null);
  const reduceMotionRef = useRef(false);
  const cloudsLoadGenRef = useRef(0);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [countriesFeatures, setCountriesFeatures] = useState([]);
  const [viewAltitude, setViewAltitude] = useState(DEFAULT_CAMERA_ALTITUDE);
  const [animPhase, setAnimPhase] = useState(0);
  const [reduceGlobeMotion, setReduceGlobeMotion] = useState(false);
  const [hoveredAirportPoint, setHoveredAirportPoint] = useState(null);
  const [pinnedAirport, setPinnedAirport] = useState(null);
  const globeMaterial = useMemo(() => createGlobeMaterial(), []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceGlobeMotion(mq.matches);
    const fn = () => setReduceGlobeMotion(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  useEffect(() => {
    reduceMotionRef.current = reduceGlobeMotion;
  }, [reduceGlobeMotion]);

  function disposeGlobeCustomLayers() {
    if (cloudsRafRef.current != null) {
      cancelAnimationFrame(cloudsRafRef.current);
      cloudsRafRef.current = null;
    }
    const globe = globeRef.current;

    const clouds = cloudsMeshRef.current;
    if (clouds) {
      if (globe) {
        try {
          globe.scene().remove(clouds);
        } catch {
          /* scene may be torn down */
        }
      }
      clouds.geometry?.dispose();
      const cmat = clouds.material;
      if (cmat) {
        if (cmat.map) cmat.map.dispose();
        cmat.dispose();
      }
    }
    cloudsMeshRef.current = null;

    const stars = starfieldMeshRef.current;
    if (stars) {
      if (globe) {
        try {
          globe.scene().remove(stars);
        } catch {
          /* scene may be torn down */
        }
      }
      stars.geometry?.dispose();
      stars.material?.dispose();
    }
    starfieldMeshRef.current = null;
  }

  useEffect(() => () => disposeGlobeCustomLayers(), []);

  // ─── Natural Earth countries (land vs water + hover labels) ──────────────

  useEffect(() => {
    let cancelled = false;
    fetch('/geo/ne_110m_admin_0_countries.geojson')
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText);
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data?.features) return;
        setCountriesFeatures(data.features);
      })
      .catch(() => {
        if (!cancelled) setCountriesFeatures([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Picker order (API search list) ────────────────────────────────────────

  const cityAirports = useMemo(() => {
    return selectedCities
      .map((code) => airports.find((a) => a.code === code))
      .filter(Boolean);
  }, [selectedCities, airports]);

  // ─── Visit order: API city_order when an itinerary is selected ───────────

  const routeAirports = useMemo(() => {
    if (selectedItinerary?.city_order?.length) {
      return selectedItinerary.city_order
        .map((code) => airports.find((a) => a.code === code))
        .filter(Boolean);
    }
    return cityAirports;
  }, [selectedItinerary, airports, cityAirports]);

  /** Distinct IATA codes (itinerary `city_order` repeats origin at end, e.g. JFK→…→JFK). */
  const uniqueGlobeCityCount = useMemo(() => {
    if (routeAirports.length === 0) return 0;
    return new Set(routeAirports.map((a) => a.code)).size;
  }, [routeAirports]);

  // ─── Points to frame in the camera (legs when itinerary, else route stops) ─

  const cameraAnchorPoints = useMemo(() => {
    if (selectedItinerary?.legs?.length) {
      const pts = [];
      for (const leg of selectedItinerary.legs) {
        pts.push({ lat: leg.flight.origin.lat, lng: leg.flight.origin.lng });
        pts.push({ lat: leg.flight.destination.lat, lng: leg.flight.destination.lng });
      }
      return pts;
    }
    if (routeAirports.length) {
      return routeAirports.map((a) => ({ lat: a.lat, lng: a.lng }));
    }
    if (airports.length) {
      return airports
        .filter((a) => typeof a.lat === 'number' && typeof a.lng === 'number')
        .map((a) => ({ lat: a.lat, lng: a.lng }));
    }
    return [];
  }, [selectedItinerary, routeAirports, airports]);

  // ─── Responsive sizing ───────────────────────────────────────────────────

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width, height: Math.max(height, 500) });
      }
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // ─── Globe settings on mount ─────────────────────────────────────────────

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    globe.controls().autoRotate = false;
    globe.controls().enableZoom = true;
    globe.controls().minDistance = 92;
    globe.controls().maxDistance = 520;

    globe.pointOfView({ lat: 24, lng: 10, altitude: DEFAULT_CAMERA_ALTITUDE }, 0);
    setViewAltitude(DEFAULT_CAMERA_ALTITUDE);
  }, []);

  // ─── Camera: refit when cities, itinerary, or leg geometry changes ─────────

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    if (cameraAnchorPoints.length === 0) {
      globe.pointOfView({ lat: 24, lng: 10, altitude: DEFAULT_CAMERA_ALTITUDE }, CAMERA_POV_MS);
      setViewAltitude(DEFAULT_CAMERA_ALTITUDE);
      return;
    }

    const avgLat =
      cameraAnchorPoints.reduce((s, p) => s + p.lat, 0) / cameraAnchorPoints.length;
    const avgLng =
      cameraAnchorPoints.reduce((s, p) => s + p.lng, 0) / cameraAnchorPoints.length;
    const latSpread =
      Math.max(...cameraAnchorPoints.map((p) => p.lat)) -
      Math.min(...cameraAnchorPoints.map((p) => p.lat));
    const lngSpread =
      Math.max(...cameraAnchorPoints.map((p) => p.lng)) -
      Math.min(...cameraAnchorPoints.map((p) => p.lng));
    const spread = Math.max(latSpread, lngSpread);
    const altitude = Math.min(
      ROUTE_CAMERA_ALT_MAX,
      Math.max(ROUTE_CAMERA_ALT_MIN, spread / ROUTE_ALT_SPREAD_DIVISOR)
    );

    globe.pointOfView({ lat: avgLat, lng: avgLng, altitude }, CAMERA_POV_MS);
    setViewAltitude(altitude);
  }, [cameraAnchorPoints, selectedItinerary?.id]);

  const onGlobeReady = useCallback(() => {
    const globe = globeRef.current;
    if (!globe) return;
    globe.lights([
      new THREE.AmbientLight(globeTokens.ambientLight, Math.PI * 1.05),
      new THREE.DirectionalLight(globeTokens.directionalLight, 0.92 * Math.PI),
    ]);

    disposeGlobeCustomLayers();

    const globeR = globe.getGlobeRadius();
    const stars = createStarfieldPoints(globeR);
    globe.scene().add(stars);
    starfieldMeshRef.current = stars;

    const loadGen = ++cloudsLoadGenRef.current;
    const loader = new THREE.TextureLoader();
    loader.load(
      CLOUDS_TEXTURE_URL,
      (cloudsTexture) => {
        if (loadGen !== cloudsLoadGenRef.current) {
          cloudsTexture.dispose();
          return;
        }
        const g = globeRef.current;
        if (!g) {
          cloudsTexture.dispose();
          return;
        }
        const radius = g.getGlobeRadius() * (1 + CLOUDS_ALT);
        const clouds = new THREE.Mesh(
          new THREE.SphereGeometry(radius, 75, 75),
          new THREE.MeshPhongMaterial({
            map: cloudsTexture,
            transparent: true,
            opacity: 0.36,
            depthWrite: false,
          })
        );
        g.scene().add(clouds);
        cloudsMeshRef.current = clouds;

        const rotateClouds = () => {
          const mesh = cloudsMeshRef.current;
          if (mesh && !reduceMotionRef.current) {
            mesh.rotation.y += (CLOUDS_ROTATION_DEG_PER_FRAME * Math.PI) / 180;
          }
          cloudsRafRef.current = requestAnimationFrame(rotateClouds);
        };
        cloudsRafRef.current = requestAnimationFrame(rotateClouds);
      },
      undefined,
      () => {
        /* texture failed (offline / CORS); globe still works */
      }
    );
  }, []);

  // ─── Points: full airport network + trip selection (planning or itinerary) ─

  const planningMode = !selectedItinerary && typeof onGlobeAirportPick === 'function';

  const airportGlobePointsData = useMemo(() => {
    const order = selectedItinerary?.city_order?.length
      ? selectedItinerary.city_order
      : selectedCities;
    return airports
      .filter((a) => typeof a.lat === 'number' && typeof a.lng === 'number')
      .map((a) => {
        const idx = order.indexOf(a.code);
        const inTrip = idx >= 0;
        const total = order.length;
        const roleLabel = inTrip ? stopRoleLabel(tripType, idx, total, order, a.code) : '';
        return {
          lat: a.lat,
          lng: a.lng,
          code: a.code,
          city: a.city,
          name: a.name,
          isPool: !inTrip,
          stopIndex: inTrip ? idx + 1 : null,
          isOrigin: inTrip && idx === 0,
          roleLabel,
          size: inTrip ? (idx === 0 ? 0.86 : 0.62) : 0.44,
          color: inTrip
            ? idx === 0
              ? globeTokens.pointOrigin
              : globeTokens.pointStop
            : globeTokens.pointPool,
          alt: inTrip ? POINT_ALTITUDE + (idx === 0 ? 0.006 : 0.002) : POINT_ALTITUDE - 0.002,
        };
      });
  }, [airports, selectedCities, selectedItinerary, tripType]);

  const pointLabelFn = useCallback(
    (d) => airportGlobeLabelHtml(d, tripType, planningMode),
    [tripType, planningMode]
  );

  useEffect(() => {
    if (planningMode && selectedCities.length === 0) setPinnedAirport(null);
  }, [planningMode, selectedCities.length]);

  // ─── Labels: macro geography (zoomed out) + route stops ────────────────────

  const labelsData = useMemo(() => {
    const macro =
      viewAltitude > MACRO_LABEL_MAX_ALTITUDE
        ? macroGlobeLabels.map((row) => ({
            lat: row.lat,
            lng: row.lng,
            text: row.text,
            color: row.color,
            size: row.size,
            labelAltitude: MACRO_LABEL_ALT,
          }))
        : [];

    const route = routeAirports.map((airport, idx) => ({
      lat: airport.lat,
      lng: airport.lng,
      text: `${idx + 1}·${airport.code}`,
      color: idx === 0 ? globeTokens.pointOrigin : globeTokens.labelRouteSecondary,
      size: idx === 0 ? 1.0 : 0.75,
      labelAltitude: ROUTE_LABEL_ALT,
    }));

    return [...macro, ...route];
  }, [routeAirports, viewAltitude]);

  const onZoom = useCallback((pov) => {
    if (typeof pov?.altitude === 'number') {
      setViewAltitude(pov.altitude);
    }
  }, []);

  /** Land polygons stay visible but ignore pointer so airport markers receive hover/click. */
  const pointerEventsFilter = useCallback(
    (obj) => obj?.__globeObjType !== 'polygon',
    []
  );

  const onPointHover = useCallback((pt) => {
    setHoveredAirportPoint(pt);
  }, []);

  const onPointClick = useCallback(
    (p, _evt, coords) => {
      if (!p?.code) return;
      if (planningMode) {
        const wasSelected = selectedCities.includes(p.code);
        onGlobeAirportPick(p.code);
        if (wasSelected) setPinnedAirport(null);
        else {
          setPinnedAirport({
            code: p.code,
            city: p.city,
            name: p.name,
            lat: coords.lat,
            lng: coords.lng,
            stopLabel: 'Added to trip',
          });
        }
        return;
      }
      setPinnedAirport({
        code: p.code,
        city: p.city,
        name: p.name,
        lat: coords.lat,
        lng: coords.lng,
        stopLabel: p.isPool ? 'Not in this itinerary' : p.roleLabel || 'Itinerary stop',
      });
    },
    [planningMode, selectedCities, onGlobeAirportPick]
  );

  const onPointRightClick = useCallback(
    (p, evt, coords) => {
      evt?.preventDefault?.();
      if (!p?.code || !planningMode) return;
      onGlobeAirportPick(p.code, { asOrigin: true });
      setPinnedAirport({
        code: p.code,
        city: p.city,
        name: p.name,
        lat: coords.lat,
        lng: coords.lng,
        stopLabel: 'Now origin (first in trip)',
      });
    },
    [planningMode, onGlobeAirportPick]
  );

  const pointRadiusFn = useCallback(
    (d) => d.size * (d === hoveredAirportPoint ? 1.45 : 1),
    [hoveredAirportPoint]
  );

  const showPointerCursorFn = useCallback((objType) => objType === 'point', []);

  // ─── Arcs — stable ids + leg color + dash variation ───────────────────────

  const arcsData = useMemo(() => {
    if (selectedItinerary) {
      const n = selectedItinerary.legs.length;
      return selectedItinerary.legs.map((leg, idx) => ({
        arcId: `${selectedItinerary.id}-${leg.flight.id}-${idx}`,
        startLat: leg.flight.origin.lat,
        startLng: leg.flight.origin.lng,
        endLat: leg.flight.destination.lat,
        endLng: leg.flight.destination.lng,
        arcStartAlt: ARC_ENDPOINT_ALT,
        arcEndAlt: ARC_ENDPOINT_ALT,
        color: legArcColor(leg.leg_score, idx, n),
        stroke: 1.5,
        dashGap: 0.08 + (idx % 3) * 0.06,
        dashLength: 0.82 + (idx % 2) * 0.1,
        order: idx,
      }));
    }

    if (routeAirports.length < 2) return [];

    const arcs = [];
    for (let i = 0; i < routeAirports.length - 1; i++) {
      arcs.push({
        arcId: `draft-${routeAirports[i].code}-${routeAirports[i + 1].code}`,
        startLat: routeAirports[i].lat,
        startLng: routeAirports[i].lng,
        endLat: routeAirports[i + 1].lat,
        endLng: routeAirports[i + 1].lng,
        arcStartAlt: ARC_ENDPOINT_ALT,
        arcEndAlt: ARC_ENDPOINT_ALT,
        color: globeTokens.draftArc,
        stroke: 0.8,
        dashGap: 0.5,
        dashLength: 0.5,
        order: i,
      });
    }
    return arcs;
  }, [routeAirports, selectedItinerary]);

  const arcCount = arcsData.length;

  useEffect(() => {
    if (reduceGlobeMotion || arcCount === 0) return undefined;
    const id = window.setInterval(() => {
      setAnimPhase((p) => {
        const n = p + LEG_MARKER_PHASE_STEP;
        return n >= 1 ? n - 1 : n;
      });
    }, LEG_MARKER_TICK_MS);
    return () => window.clearInterval(id);
  }, [reduceGlobeMotion, arcCount]);

  const legHtmlData = useMemo(() => {
    if (arcsData.length === 0) return [];
    return arcsData.map((arc, i) => {
      const offset = (i * 0.23) % 1;
      const t = reduceGlobeMotion ? 0.52 : (animPhase + offset) % 1;
      const pos = interpolateAlongGlobeArcSameAsThreeGlobe(
        { lat: arc.startLat, lng: arc.startLng },
        { lat: arc.endLat, lng: arc.endLng },
        t,
        {
          arcAltitudeAutoScale: ARC_ALTITUDE_AUTO_SCALE,
          startAlt: ARC_ENDPOINT_ALT,
          endAlt: ARC_ENDPOINT_ALT,
        }
      );
      const legNum = arc.order + 1;
      return {
        elId: arc.arcId,
        legNum,
        lat: pos.lat,
        lng: pos.lng,
        alt: pos.altitude + LEG_HTML_ALT_LIFT,
      };
    });
  }, [arcsData, animPhase, reduceGlobeMotion]);

  const htmlLegMarkerElement = useCallback((d) => {
    const key = d.elId;
    let node = legMarkerElCacheRef.current.get(key);
    if (!node) {
      node = document.createElement('div');
      node.className = 'globe-leg-marker';
      node.setAttribute('aria-hidden', 'true');
      const inner = document.createElement('span');
      inner.className = 'globe-leg-marker__inner';
      node.appendChild(inner);
      legMarkerElCacheRef.current.set(key, node);
    }
    const inner = node.querySelector('.globe-leg-marker__inner');
    if (inner) inner.textContent = String(d.legNum);
    return node;
  }, []);

  // ─── Rings (pulse) — same visit order as markers ───────────────────────────

  const ringsData = useMemo(() => {
    return routeAirports.map((airport, idx) => ({
      lat: airport.lat,
      lng: airport.lng,
      ringAltitude: RING_SURFACE_ALT,
      maxR: idx === 0 ? 3 : 2,
      propagationSpeed: 1.5,
      repeatPeriod: 1400,
      color: idx === 0 ? globeTokens.ringOrigin : globeTokens.ringOther,
    }));
  }, [routeAirports]);

  return (
    <div
      ref={containerRef}
      className={`globe-viz-host relative flex-1 w-full h-full min-h-[400px] ${
        edgeToEdge ? 'min-h-full rounded-none border-0' : 'map-container min-h-[500px]'
      }`}
      style={{ background: globeTokens.canvasBg }}
      aria-label="Interactive globe: drag to rotate, scroll to zoom. Click airports to build your trip; right-click sets origin. Trip mode affects stop labels."
    >
      <Globe
        ref={globeRef}
        width={dimensions.width}
        height={dimensions.height}
        globeImageUrl={GLOBE_IMAGE}
        bumpImageUrl={BUMP_IMAGE}
        globeMaterial={globeMaterial}
        onGlobeReady={onGlobeReady}
        onZoom={onZoom}
        pointerEventsFilter={pointerEventsFilter}
        showGraticules
        backgroundImageUrl=""
        backgroundColor="rgba(0,0,0,0)"
        atmosphereColor={globeTokens.atmosphere}
        atmosphereAltitude={0.18}
        polygonsData={countriesFeatures}
        polygonGeoJsonGeometry="geometry"
        polygonCapColor={() => globeTokens.polygonCap}
        polygonSideColor={() => globeTokens.polygonSide}
        polygonStrokeColor={() => globeTokens.polygonStroke}
        polygonAltitude={LAND_POLYGON_ALTITUDE}
        polygonCapCurvatureResolution={2}
        polygonLabel={() => ''}
        polygonsTransitionDuration={400}
        pointsData={airportGlobePointsData}
        pointLat="lat"
        pointLng="lng"
        pointAltitude="alt"
        pointRadius={pointRadiusFn}
        pointColor="color"
        pointLabel={pointLabelFn}
        onPointHover={onPointHover}
        onPointClick={onPointClick}
        onPointRightClick={onPointRightClick}
        pointsMerge={false}
        pointResolution={14}
        pointsTransitionDuration={220}
        showPointerCursor={showPointerCursorFn}
        labelsData={labelsData}
        labelLat="lat"
        labelLng="lng"
        labelText="text"
        labelColor="color"
        labelSize="size"
        labelDotRadius={0.4}
        labelAltitude="labelAltitude"
        labelResolution={2}
        labelsTransitionDuration={420}
        arcsData={arcsData}
        arcStartLat="startLat"
        arcStartLng="startLng"
        arcStartAltitude="arcStartAlt"
        arcEndLat="endLat"
        arcEndLng="endLng"
        arcEndAltitude="arcEndAlt"
        arcColor="color"
        arcStroke="stroke"
        arcDashLength="dashLength"
        arcDashGap="dashGap"
        arcDashAnimateTime={() => ARC_DASH_ANIMATE_MS}
        arcsTransitionDuration={520}
        arcAltitudeAutoScale={ARC_ALTITUDE_AUTO_SCALE}
        ringsData={ringsData}
        ringLat="lat"
        ringLng="lng"
        ringAltitude="ringAltitude"
        ringMaxRadius="maxR"
        ringPropagationSpeed="propagationSpeed"
        ringRepeatPeriod="repeatPeriod"
        ringColor="color"
        htmlElementsData={legHtmlData}
        htmlLat="lat"
        htmlLng="lng"
        htmlAltitude="alt"
        htmlElement={htmlLegMarkerElement}
        htmlTransitionDuration={0}
      />

      {uniqueGlobeCityCount > 0 && (
        <div className="absolute top-4 left-4 z-10 glass rounded-lg px-3 py-2 text-xs text-white/50 pointer-events-none">
          <span className="text-accent-cyan font-mono font-bold">{uniqueGlobeCityCount}</span>
          {' '}
          {uniqueGlobeCityCount === 1 ? 'city on globe' : 'cities on globe'}
        </div>
      )}

      <div className="absolute bottom-4 left-4 z-10 text-[10px] text-white/45 max-w-[11rem] leading-snug text-left md:left-auto md:right-4 md:text-right pointer-events-none">
        Drag · Scroll · Click airport: add/remove · Right-click: origin
      </div>

      {pinnedAirport && (
        <div
          className="absolute bottom-4 left-4 z-20 max-w-[min(18rem,calc(100vw-2rem))] pointer-events-auto"
          role="status"
        >
          <div className="glass rounded-xl border border-white/12 px-3 py-2.5 shadow-lg shadow-black/50 ring-1 ring-white/8 flex gap-2.5 items-start">
            <Plane size={16} className="text-accent-cyan shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                <span className="font-mono text-sm font-semibold text-accent-cyan tabular-nums">
                  {pinnedAirport.code}
                </span>
                <span className="text-[11px] text-white/50 uppercase tracking-wider">
                  {pinnedAirport.stopLabel}
                </span>
              </div>
              {pinnedAirport.city && (
                <p className="text-xs text-white/80 leading-snug truncate" title={pinnedAirport.city}>
                  {pinnedAirport.city}
                </p>
              )}
              {pinnedAirport.name && (
                <p className="text-[11px] text-white/45 leading-snug line-clamp-2" title={pinnedAirport.name}>
                  {pinnedAirport.name}
                </p>
              )}
              <p className="font-mono text-[11px] text-white/40 tabular-nums leading-snug pt-0.5 border-t border-white/8">
                {formatLatLng(pinnedAirport.lat, pinnedAirport.lng)}
              </p>
              {planningMode && (
                <p className="text-[10px] text-white/35 leading-snug pt-1">
                  Trip type controls how stops are labeled and optimized. Order follows the header chips;
                  right-click an airport to move it to origin.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setPinnedAirport(null)}
              className="shrink-0 p-1.5 rounded-lg text-white/45 hover:text-white/85 hover:bg-white/8 transition-colors"
              aria-label="Dismiss airport details"
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
