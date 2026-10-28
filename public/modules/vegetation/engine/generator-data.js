import { normalizeShapeOperation } from './shape-operation-data.js';
import { normalizeSections } from './branch-shaping.js';
const clamp = (value, min, max, fallback) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : fallback));
export const GENERATION_MODES = ['LEGACY', 'COUNT', 'INTERVAL', 'WHORLED', 'BEND'];
export function normalizeProfile(value, fallback = [1, 1, 1]) {
  if (Array.isArray(value)) return value.length >= 2 ? value.slice(0, 32).map((v) => clamp(v, 0, 3, 1)) : [...fallback];
  if (!Array.isArray(value?.points) || !value.points.length) return [...fallback];
  const byX = new Map(value.points.slice(0, 32).filter((p) => Array.isArray(p) && p.length >= 2).map((p) => [clamp(p[0], 0, 1, 0), clamp(p[1], 0, 3, 1)]));
  const points = [...byX].sort((a, b) => a[0] - b[0]);
  if (points.length < 2) return [...fallback];
  points[0][0] = 0; points.at(-1)[0] = 1;
  return { points, interpolation: value.interpolation === 'SMOOTH' ? 'SMOOTH' : 'LINEAR' };
}
export function curvePoints(value) {
  return Array.isArray(value) ? value.map((v, i) => [i / Math.max(1, value.length - 1), v]) : value.points.map((p) => [...p]);
}
export function profileValue(value, t, fallback = 1) {
  const points = Array.isArray(value) ? value.map((v, i) => [i / Math.max(1, value.length - 1), v]) : value?.points;
  if (!points?.length) return fallback;
  t = clamp(t, 0, 1, 0);
  let i = points.findIndex((p) => p[0] >= t);
  if (i < 0) return points.at(-1)[1];
  if (!i) return points[0][1];
  let a = (t - points[i - 1][0]) / Math.max(1e-8, points[i][0] - points[i - 1][0]);
  if (value.interpolation === 'SMOOTH') a = a * a * (3 - 2 * a);
  return points[i - 1][1] + (points[i][1] - points[i - 1][1]) * a;
}
export function normalizeGenerator(raw = {}, index = 1) {
  const first = clamp(raw.start, 0, 1, 0.15); const last = clamp(raw.end, 0, 1, 0.95);
  return {
    id: String(raw.id || `GROUP_${index}`).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48), name: String(raw.name || `独立枝组 ${index}`).slice(0, 64),
    order: Math.round(clamp(raw.order, 1, 3, 1)), parent_group: String(raw.parent_group || 'ANY'), enabled: raw.enabled !== false,
    mode: GENERATION_MODES.includes(raw.mode) ? raw.mode : 'COUNT', start: Math.min(first, last), end: Math.max(first, last),
    count: Math.round(clamp(raw.count, 0, 40, 4)), spacing: clamp(raw.spacing, 0.03, 5, 0.3),
    layers: Math.round(clamp(raw.layers, 1, 20, 3)), per_layer: Math.round(clamp(raw.per_layer, 1, 12, 3)),
    rotation: clamp(raw.rotation, -180, 180, 0), threshold: clamp(raw.threshold, 0, 90, 5),
    length: clamp(raw.length, 0.05, 3, 1), radius: clamp(raw.radius, 0.05, 3, 1), angle: clamp(raw.angle, -75, 75, 0),
    length_variation: clamp(raw.length_variation, 0, 1, 0.25), radius_variation: clamp(raw.radius_variation, 0, 1, 0.1),
    angle_variation: clamp(raw.angle_variation, 0, 90, 10), leaf_scale: clamp(raw.leaf_scale, 0.05, 3, 1),
    use_profiles: raw.use_profiles === true,
    leaf_scale_variation: clamp(raw.leaf_scale_variation, 0, 1, 0.25),
    profiles: Object.fromEntries(['branch_length', 'branch_density', 'branch_angle', 'radius_taper', 'leaf_density', 'leaf_scale'].map((key) => [key, normalizeProfile(raw.profiles?.[key])])),
  };
}
export function normalizeLayers(raw = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  // Every retained operation is needed to reproduce saved geometry. UI paging
  // must never truncate the project or its evaluation stack.
  return raw.filter((layer) => layer && typeof layer === 'object').map((layer, index) => ({
    id: String(layer.id || `SCULPT_${index}`).slice(0, 64), name: String(layer.name || `雕刻层 ${index + 1}`).slice(0, 64),
    enabled: layer.enabled !== false, strength: clamp(layer.strength, 0, 1, 1),
    operation: normalizeShapeOperation(layer.operation),
    branches: Object.fromEntries(Object.entries(layer.branches || {}).filter(([, record]) => record && typeof record === 'object').map(([id, record]) => [id, {
      parent: String(record.parent || ''),
      ...(record.sections?.length ? { sections: normalizeSections(record.sections) } : {}),
      root_offset: [0, 1, 2].map((i) => clamp(record.root_offset?.[i], -100, 100, 0)),
      deltas: (Array.isArray(record.deltas) ? record.deltas : []).slice(0, 512).map((p) => [0, 1, 2].map((i) => clamp(p?.[i], -100, 100, 0))),
      knot_deltas: (Array.isArray(record.knot_deltas) ? record.knot_deltas : []).slice(0, 64).map((p) => [0, 1, 2].map((i) => clamp(p?.[i], -100, 100, 0))),
    }]).filter(([, record]) => record.deltas.length >= 2)),
  })).filter((layer) => { if (seen.has(layer.id)) return false; seen.add(layer.id); return true; });
}
