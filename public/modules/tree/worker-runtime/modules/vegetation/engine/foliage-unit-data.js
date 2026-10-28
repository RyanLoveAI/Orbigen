const bounded = (value, fallback, min, max) => {
  const n = Number(value);
  return Math.min(max, Math.max(min, value == null || !Number.isFinite(n) ? fallback : n));
};

// Pure data: authoring/project normalization must also work without THREE.
export function normalizeFoliageUnit(raw = {}) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const mode = String(value.mode || 'SINGLE').toUpperCase();
  return {
    mode: ['SINGLE', 'PINNATE', 'SPRIG', 'TUFT'].includes(mode) ? mode : 'SINGLE',
    pairs: Math.round(bounded(value.pairs, 5, 2, 9)),
    terminal: value.terminal == null ? true : Boolean(value.terminal),
    leaflet_ratio: bounded(value.leaflet_ratio, .3, .12, .6),
    spread: bounded(value.spread, 55, 20, 85),
    bend: bounded(value.bend, .08, -.5, .5),
    procedural: Boolean(value.procedural),
  };
}
