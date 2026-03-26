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

/** Globe / Three.js — derived from the same palette */
export const globeTokens = {
  canvasBg: colors.midnight,
  pointOrigin: colors.accent.cyan,
  pointOther: '#ffffff',
  labelRouteSecondary: 'rgba(255,255,255,0.85)',
  draftArc: colors.accent.cyan,
  atmosphere: 'rgba(0, 212, 255, 0.35)',
  ambientLight: 0x1a2838,
  directionalLight: 0xb8dce8,
  meshColor: 0x040810,
  meshEmissive: 0x001820,
  meshSpecular: 0x2a5566,
  polygonCap: 'rgba(36, 52, 74, 0.42)',
  polygonSide: 'rgba(8, 14, 26, 0.92)',
  polygonStroke: 'rgba(0, 212, 255, 0.28)',
  ringOrigin: 'rgba(0, 212, 255, 0.6)',
  ringOther: 'rgba(255, 255, 255, 0.3)',
};
