/**
 * Single source for brand colors. Keep `src/styles/index.css` :root in sync.
 */
export const colors = {
  midnight: '#0a0e1a',
  slate: {
    850: '#141926',
    750: '#1e2436',
  },
  accent: {
    cyan: '#00d4ff',
    magenta: '#ff3d8a',
    amber: '#ffb020',
    emerald: '#00e5a0',
  },
};

/**
 * Globe / Three.js — photoreal base (Blue Marble + daylight lights) with brand accents on data layers.
 * See README “Globe visualization” for react-globe.gl prop mapping.
 */
export const globeTokens = {
  canvasBg: colors.midnight,
  pointOrigin: colors.accent.cyan,
  /** Non-origin stops on the active trip — high contrast on photoreal globe. */
  pointStop: colors.accent.amber,
  /** Full airport network (not yet in trip) — warm red reads clearly on land and ocean. */
  pointPool: '#ff3d52',
  labelRouteSecondary: 'rgba(255,255,255,0.85)',
  draftArc: colors.accent.cyan,
  /** Atmosphere rim (see `atmosphereColor` in react-globe.gl docs). */
  atmosphere: 'rgba(165, 205, 255, 0.32)',
  /** `THREE.Points` starfield tint — cool white to read with the blue rim. */
  starField: '#dceaff',
  /** Scene fill + sun — readable on satellite imagery. */
  ambientLight: 0x6a7a8c,
  directionalLight: 0xfff8f0,
  /** Globe mesh: let `globeImageUrl` read true; minimal tint (see `globeMaterial`). */
  meshColor: 0xffffff,
  meshEmissive: 0x0a1520,
  /** Lower = weaker ocean “sun glint” on Blue Marble (Phong specular). */
  meshSpecular: 0x8899a8,
  /** Natural Earth polygons: light veil + coastlines over photoreal land/ocean. */
  polygonCap: 'rgba(255, 255, 255, 0.14)',
  polygonSide: 'rgba(12, 20, 36, 0.78)',
  polygonStroke: 'rgba(0, 90, 140, 0.42)',
  ringOrigin: 'rgba(0, 212, 255, 0.55)',
  ringOther: 'rgba(255, 255, 255, 0.35)',
};
