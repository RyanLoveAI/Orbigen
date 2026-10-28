import { normalizeFlowering } from './flowering-data.js';
import { normalizeLeafMaterial } from './leaf-material-data.js';

export const VEGETATION_TYPES = { GRASS: '草丛与枯草', BROADLEAF: '大叶丛生', SHRUB: '自然灌丛', FLOWER: '稀疏开花长枝', AERIAL_ROOT: '垂落气根', GROUND_ROOT: '贴地盘根' };
const defaults = {
  GRASS: { height: .55, width: .45, count: 32, bend: .65, dry: .25, leaf_size: .5, leaf_width: .018, radius: .002 },
  BROADLEAF: { height: 1.6, width: 1.6, count: 10, bend: .4, dry: .08, leaf_size: 1, leaf_width: .26, radius: .06 },
  SHRUB: { height: .8, width: 1, count: 12, bend: .35, dry: .03, leaf_size: .08, leaf_width: .035, radius: .009 },
  FLOWER: { height: 1.5, width: 1.5, count: 8, bend: .65, dry: .03, leaf_size: .06, leaf_width: .025, radius: .005 },
  AERIAL_ROOT: { height: 2, width: 1, count: 12, bend: .3, dry: 0, leaf_size: .08, leaf_width: .02, radius: .02 },
  GROUND_ROOT: { height: .15, width: 2, count: 8, bend: .35, dry: 0, leaf_size: .08, leaf_width: .02, radius: .04 },
};
const number = (v, fallback, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(v)) ? Number(v) : fallback));
export function normalizeVegetationUnit(raw) {
  const unit = normalizeFlowering({source:raw}).source;
  return unit ? {...unit, variant:['GREEN','DRY'].includes(raw.variant)?raw.variant:'ANY'} : null;
}
export function vegetationPreset(kind, raw = {}) {
  raw ||= {};
  const d = defaults[kind] || defaults.GRASS;
  const value = {};
  for (const [key, fallback, min, max] of [['height',d.height,.05,8],['width',d.width,.05,8],['count',d.count,1,80],['bend',d.bend,0,1],['dry',d.dry,0,1],['leaf_size',d.leaf_size,.02,2],['leaf_width',d.leaf_width,.003,.8],['radius',d.radius,.001,.2],['variation',.25,0,.8],['flower_amount',.45,0,1],['flower_size',.04,.015,.2]]) value[key] = number(raw[key],fallback,min,max);
  value.count = Math.round(value.count);
  value.source = normalizeVegetationUnit(raw.source);
  value.sources = (Array.isArray(raw.sources) ? raw.sources : value.source ? [value.source] : []).slice(0, 8).map(normalizeVegetationUnit).filter(Boolean);
  value.source = value.sources[0] || null;
  value.material = normalizeLeafMaterial(raw.material);
  value.flower_source = normalizeFlowering({ source: raw.flower_source }).source;
  value.flower_material = normalizeLeafMaterial(raw.flower_material);
  for (const key of ['asset_preset','flower_preset']) value[key] = ['SCENE_GRASS_V1','SCENE_BROADLEAF_V1','SCENE_FLOWER_V1','BOUGAINVILLEA_LEAVES_V1','CUSTOM','PROCEDURAL'].includes(raw[key]) ? raw[key] : '';
  return value;
}
export function normalizeVegetation(raw = {}) {
  raw ||= {};
  return { enabled: raw.enabled === true, mode: raw.mode === 'REGION' ? 'REGION' : 'SINGLE', kind: VEGETATION_TYPES[raw.kind] ? raw.kind : 'GRASS',
    seed: Math.round(number(raw.seed, 94531, 1, 2147483000)), density: number(raw.density, 3, .1, 20), spacing: number(raw.spacing, .25, .03, 3), slope_min: number(raw.slope_min, 0, 0, 180), slope_max: number(raw.slope_max, 65, 0, 180), align: number(raw.align, .35, 0, 1), max_count: Math.round(number(raw.max_count, 160, 1, 400)),
    weights: Object.fromEntries(['IVY', ...Object.keys(VEGETATION_TYPES)].map(k => [k,number(raw.weights?.[k],k==='GRASS'?1:k==='SHRUB'?.2:k==='IVY'?.5:0,0,1)])),
    species: Object.fromEntries(Object.keys(VEGETATION_TYPES).map(k=>[k,vegetationPreset(k,raw.species?.[k])])) };
}
