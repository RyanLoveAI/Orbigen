// Portable vine recipes. Dimensions are metres; leaf meshes keep their original UVs.
export const VINE_DEFAULTS = { type: 'EDGE', species: 'GENERIC', leaf_preset: '', width: 3, length: 1.8, depth: 0.22, density: 5, leaf_size: 0.08, foliage: 38, variation: 0.7, natural: 0.65, stem: 0.004, reference: true, leaf_size_variation: .22, leaf_direction_variation: 18, leaf_twist: 23, leaf_pose_seed: 61051 };
export const VINE_PRESETS = {
  EDGE: { label: '边缘垂挂', caption: '顶部成片 · 长短错落', values: {} },
  BUNDLE: { label: '成束垂藤', caption: '几根一撮 · 灵活拼装', values: { width: 0.55, length: 1.6, density: 7, depth: 0.15 } },
  SINGLE: { label: '单根垂藤', caption: '细长单元 · 局部点缀', values: { width: 0.25, length: 2, density: 1, depth: 0.1, foliage: 28 } },
  WALL: { label: '墙面覆盖', caption: '薄层铺展 · 不规则边缘', values: { width: 2.6, length: 1.4, depth: 0.09, density: 7, variation: 0.45, foliage: 44 } },
};
const number = (v, fallback, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(v)) ? Number(v) : fallback));
export function normalizeVine(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const v = { ...VINE_DEFAULTS, ...raw };
  v.type = VINE_PRESETS[v.type] ? v.type : 'EDGE';
  v.species = raw.species === 'IVY' ? 'IVY' : 'GENERIC';
  v.leaf_preset = ['IVY_V1', 'BOUGAINVILLEA_V1'].includes(raw.leaf_preset) ? raw.leaf_preset : '';
  for (const [key, min, max] of [['width', .1, 12], ['length', .15, 10], ['depth', .02, 1], ['density', 1, 14], ['leaf_size', .02, .6], ['foliage', 0, 100], ['variation', 0, 1], ['natural', 0, 1], ['stem', .0012, .025]]) v[key] = number(v[key], VINE_DEFAULTS[key], min, max);
  v.reference = v.reference !== false;
  for (const [key, max] of [['leaf_size_variation', .8], ['leaf_direction_variation', 60], ['leaf_twist', 90], ['leaf_pose_seed', 2147483646]]) v[key] = number(v[key], VINE_DEFAULTS[key], key === 'leaf_pose_seed' ? 1 : 0, max);
  v.leaf_pose_seed = Math.trunc(v.leaf_pose_seed);
  return Object.fromEntries(Object.keys(VINE_DEFAULTS).map((key) => [key, v[key]]));
}
export function vinePreset(type) { return normalizeVine({ ...VINE_DEFAULTS, ...VINE_PRESETS[type]?.values, type }); }
export function vineSettings(settings, vine) {
  if (!vine) return settings;
  return { ...settings, branch_levels: 4, leaf_scale: vine.leaf_size, leaf_density: vine.foliage, leaf_zone_start: 0, tip_cluster: 0, leaf_aspect: vine.species === 'IVY' ? 1 : .72, leaf_twist: vine.leaf_twist, petiole_length: .008, branch_clearance: .004, leaf_min_spacing: .018, junction_collar: false, buds_enabled: false, fruit_enabled: false };
}
