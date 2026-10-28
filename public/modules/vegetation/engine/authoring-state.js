import { normalizeUnitEditing } from './unit-authoring.js';
import { normalizeGenerator, normalizeLayers, normalizeProfile, profileValue } from './generator-data.js';
import { copy, normalizeBranchShape, normalizeBranchLibrary, normalizeBranchInstances } from './branch-workbench-data.js';
import { normalizeSections, normalizeJunction } from './branch-shaping.js';
import { normalizeSymmetryGroups } from './shape-operation-data.js';
import { normalizeBranchArrays } from './branch-array-data.js';
import { normalizeInfluenceRegions } from './branch-influence-data.js';
import { normalizeVine } from './vine-data.js';
import { normalizeLeafMaterial } from './leaf-material-data.js';
import { normalizeUnitAssembly } from './plant-unit-data.js';
import { normalizeFlowering } from './flowering-data.js';
import { normalizeSurfaceGrowth } from './surface-growth-data.js';
import { normalizeVegetation } from './vegetation-data.js';
import { normalizeTreeOrgans } from './tree-organ-data.js';
import { normalizeFoliageUnit } from './foliage-unit-data.js';
import { normalizeShrubForm } from './shrub-form-data.js';
import { normalizeLocalBranchGroups, normalizeLocalBranchRecord } from './local-branch-data.js';
export const AUTHORING_VERSION = 4;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clone = copy;

export const DEFAULT_LEVEL_RULES = [
  { enabled: true, count: 1, length: 1, radius: 1, angle: 0, bend: 1, gravity: 1, leaves: 0 },
  { enabled: true, count: 1, length: 1, radius: 1, angle: 0, bend: 1, gravity: 1, leaves: 0.7 },
  { enabled: true, count: 1, length: 1, radius: 1, angle: 0, bend: 1, gravity: 1, leaves: 1 },
  { enabled: true, count: 1, length: 1, radius: 1, angle: 0, bend: 1, gravity: 1, leaves: 1.15 },
];

export const DEFAULT_AUTHORING = {
  version: AUTHORING_VERSION,
  seeds: { topology: 12037, shape: 22040, foliage: 32044, damage: 42046 },
  root_count: 1,
  root_spread: 10,
  root_radial_offset: 0,
  envelope: { type: 'NONE', center: [0, 0, 0], radius: 2.4, height: 3.2, strength: 0.65, flatness: 1 },
  attractor: { enabled: false, x: 0, y: 0, z: 3, strength: 0.35 },
  repeller: { enabled: false, x: 0, y: 0, z: 1.5, radius: 1, strength: 0.5 },
  level_rules: DEFAULT_LEVEL_RULES,
  generation_rules: [0, 1, 2, 3].map((order) => ({ ...normalizeGenerator({ id: `LEVEL_${order}`, order: Math.max(1, order), mode: 'LEGACY' }), enabled: true })),
  generator_groups: [],
  sculpt_layers: [],
  symmetry_groups: [],
  branch_shape: null,
  branch_library: [],
  branch_instances: [],
  branch_arrays: [],
  influence_regions: [],
  active_sculpt_layer: '',
  foliage_range: { start: 0, end: 1 },
  profiles: {
    branch_density: [1, 1, 1],
    branch_length: [0.82, 1, 0.68],
    leaf_density: [0.45, 1, 1.2],
    radius_taper: [1, 1, 1],
    branch_angle: [1, 1, 1],
    leaf_scale: [1, 1, 1],
  },
  overrides: {},
  manual_branches: [],
  local_branch_groups: [],
  leaf_edits: { removed: [], added: [] },
  modifiers: [],
  selection_sets: {},
  foliage_masks: [],
  phenotype: { apical_dominance: 0.55, competition: 0.2, tropism_bias: 0, individual_scale: 1 },
  curve_editor: {
    coordinate_space: 'WORLD', constraint: 'FREE', snap: 0, tangent_mode: 'SMOOTH', tangent_length: 0.12,
    edit_mode: 'SOFT_MOVE', falloff_radius: 0.35, falloff_profile: 'SMOOTH', preserve_length: 0.75,
    lock_root: true, affect_children: true, live_preview: true, knot_count: 7, smooth_strength: 0.45,
    simplify_tolerance: 0.02, subdivision_levels: 1,
  },
  topology: { reparent: {}, attach: {}, suppressed: [], operations: [] },
  attachment_layers: [{
    id: 'ATTACH_LEAVES', name: '主叶片层', type: 'LEAF', enabled: true, density: 1, scale: 1,
    order_min: 1, order_max: 3, start: 0.3, end: 1, season: 'ANY', health_min: 0,
    light_min: 0, material_variant: 0, source: -1,
  }],
  timeline: {
    enabled: false, time: 0.5, loop: false,
    keyframes: [
      { id: 'KEY_START', time: 0, age_progress: 0.1, season_progress: 0, health: 1, leaf_loss: 0, wind_shape: 0 },
      { id: 'KEY_END', time: 1, age_progress: 1, season_progress: 1, health: 1, leaf_loss: 0, wind_shape: 0 },
    ],
    snapshots: [],
  },
  wind_profile: { root_stiffness: 1, branch_stiffness: 0.58, tip_stiffness: 0.18, leaf_flutter: 0.72, gust_frequency: 0.45, turbulence: 0.3 },
  recipe: { name: '未命名配方', tags: [], locked_parameters: [] },
  quality: { max_attachment_overlap: 0.08, require_tangents: true, require_uvs: true },
};

function normalizeVector(value, fallback = [0, 0, 0]) {
  return [0, 1, 2].map((index) => finite(value?.[index], fallback[index]));
}

function normalizeRule(raw, fallback) {
  return {
    enabled: raw?.enabled !== false,
    count: clamp(finite(raw?.count, fallback.count), 0, 3),
    length: clamp(finite(raw?.length, fallback.length), 0.05, 3),
    radius: clamp(finite(raw?.radius, fallback.radius), 0.05, 3),
    angle: clamp(finite(raw?.angle, fallback.angle), -75, 75),
    bend: clamp(finite(raw?.bend, fallback.bend), 0, 3),
    gravity: clamp(finite(raw?.gravity, fallback.gravity), 0, 3),
    leaves: clamp(finite(raw?.leaves, fallback.leaves), 0, 3),
  };
}

function normalizeOverride(raw = {}) {
  return {
    radius_profile: raw.radius_profile ? normalizeProfile(raw.radius_profile) : null,
    sections: Array.isArray(raw.sections) ? normalizeSections(raw.sections) : null,
    junction: normalizeJunction(raw.junction),
    hidden: Boolean(raw.hidden),
    locked: Boolean(raw.locked),
    length: clamp(finite(raw.length, 1), 0.05, 4),
    radius: clamp(finite(raw.radius, 1), 0.05, 4),
    rotation: normalizeVector(raw.rotation),
    offset: normalizeVector(raw.offset),
    bend: clamp(finite(raw.bend, 1), 0, 4),
    wind_stiffness: clamp(finite(raw.wind_stiffness, 1), 0.1, 3),
    leaf_density: clamp(finite(raw.leaf_density, 1), 0, 4),
    pinned_points: [...new Set((raw.pinned_points || []).map((value) => Math.max(0, Math.round(finite(value, 0)))))],
    sculpt_mask: Array.isArray(raw.sculpt_mask) ? raw.sculpt_mask.map((value) => clamp(finite(value, 0), 0, 1)) : [],
    curve_parent_frame: raw.curve_parent_frame ? {
      parent: String(raw.curve_parent_frame.parent || ''),
      tangent: normalizeVector(raw.curve_parent_frame.tangent, [0, 0, 1]),
    } : null,
    // Cached samples retain the original silhouette until the editing knots change.
    curve_samples: Array.isArray(raw.curve_samples) && raw.curve_samples.length > 1
      && JSON.stringify(raw.curve_reference_knots) === JSON.stringify(raw.curve_knots)
      ? raw.curve_samples.map((point) => normalizeVector(point)) : null,
    curve_reference_knots: Array.isArray(raw.curve_reference_knots)
      ? raw.curve_reference_knots.map((point) => normalizeVector(point)) : null,
    frozen_points: Array.isArray(raw.frozen_points)
      ? raw.frozen_points.filter((point) => Array.isArray(point) && point.length >= 3).map((point) => normalizeVector(point))
      : null,
    curve_knots: Array.isArray(raw.curve_knots)
      ? raw.curve_knots.filter((point) => Array.isArray(point) && point.length >= 3).map((point) => normalizeVector(point))
      : null,
  };
}

function normalizeModifier(raw = {}, index = 0) {
  const supported = ['BEND', 'TWIST', 'GRAVITY', 'FLATTEN', 'SCALE', 'NOISE'];
  const start = clamp(finite(raw.start, 0), 0, 1);
  const end = clamp(finite(raw.end, 1), 0, 1);
  const orderMin = Math.round(clamp(finite(raw.order_min, 0), 0, 3));
  const orderMax = Math.round(clamp(finite(raw.order_max, 3), 0, 3));
  return {
    id: String(raw.id || `MOD_${index + 1}`),
    type: supported.includes(raw.type) ? raw.type : 'BEND',
    enabled: raw.enabled !== false,
    amount: clamp(finite(raw.amount, 0.2), -3, 3),
    order_min: Math.min(orderMin, orderMax),
    order_max: Math.max(orderMin, orderMax),
    start: Math.min(start, end),
    end: Math.max(start, end),
    axis: ['X', 'Y', 'Z'].includes(raw.axis) ? raw.axis : 'X',
  };
}

export function normalizeAuthoring(raw = {}, fallbackSeed = 12037) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const baseSeed = Math.trunc(clamp(finite(fallbackSeed, 12037), 1, 2147483646));
  const defaults = clone(DEFAULT_AUTHORING);
  const result = {
    ...defaults,
    ...source,
    vine: normalizeVine(source.vine),
    surface_growth: normalizeSurfaceGrowth(source.surface_growth),
    vegetation: normalizeVegetation(source.vegetation),
    leaf_material: normalizeLeafMaterial(source.leaf_material),
    plant_unit_assembly: normalizeUnitAssembly(source.plant_unit_assembly),
    flowering: normalizeFlowering(source.flowering),
    tree_organs: normalizeTreeOrgans(source.tree_organs),
    unit_editing: normalizeUnitEditing(source.unit_editing),
    foliage_unit: normalizeFoliageUnit(source.foliage_unit),
    plant_form: ['BALL','HEDGE'].includes(source.plant_form?.style) ? { ...normalizeShrubForm(source.plant_form), style: source.plant_form.style } : null,
    branch_shape: normalizeBranchShape(source.branch_shape),
    branch_library: normalizeBranchLibrary(source.branch_library),
    branch_instances: normalizeBranchInstances(source.branch_instances),
    branch_arrays: normalizeBranchArrays(source.branch_arrays),
    influence_regions: normalizeInfluenceRegions(source.influence_regions),
    symmetry_groups: normalizeSymmetryGroups(source.symmetry_groups),
    version: AUTHORING_VERSION,
    seeds: {
      topology: Math.trunc(clamp(finite(source.seeds?.topology, baseSeed), 1, 2147483646)),
      shape: Math.trunc(clamp(finite(source.seeds?.shape, baseSeed + 10003), 1, 2147483646)),
      foliage: Math.trunc(clamp(finite(source.seeds?.foliage, baseSeed + 20007), 1, 2147483646)),
      organs: Math.trunc(clamp(finite(source.seeds?.organs, finite(source.seeds?.foliage, baseSeed + 20007)), 1, 2147483646)),
      damage: Math.trunc(clamp(finite(source.seeds?.damage, baseSeed + 30009), 1, 2147483646)),
    },
    root_count: Math.round(clamp(finite(source.root_count, 1), 1, 8)),
    root_spread: clamp(finite(source.root_spread, 10), 0, 80),
    root_radial_offset: clamp(finite(source.root_radial_offset, 0), 0, 2),
    envelope: {
      center: [0, 1, 2].map((i) => clamp(finite(source.envelope?.center?.[i], 0), -20, 20)),
      type: ['NONE', 'SPHERE', 'CONE', 'FAN', 'FLAT'].includes(source.envelope?.type) ? source.envelope.type : 'NONE',
      radius: clamp(finite(source.envelope?.radius, 2.4), 0.1, 20),
      height: clamp(finite(source.envelope?.height, 3.2), 0.1, 20),
      strength: clamp(finite(source.envelope?.strength, 0.65), 0, 1),
      flatness: clamp(finite(source.envelope?.flatness, 1), 0.02, 1),
    },
    attractor: {
      enabled: Boolean(source.attractor?.enabled),
      x: finite(source.attractor?.x, 0), y: finite(source.attractor?.y, 0), z: finite(source.attractor?.z, 3),
      strength: clamp(finite(source.attractor?.strength, 0.35), 0, 2),
    },
    repeller: {
      enabled: Boolean(source.repeller?.enabled),
      x: finite(source.repeller?.x, 0), y: finite(source.repeller?.y, 0), z: finite(source.repeller?.z, 1.5),
      radius: clamp(finite(source.repeller?.radius, 1), 0.05, 20),
      strength: clamp(finite(source.repeller?.strength, 0.5), 0, 2),
    },
  };
  result.level_rules = DEFAULT_LEVEL_RULES.map((fallback, index) => normalizeRule(source.level_rules?.[index], fallback));
  result.generation_rules = [0, 1, 2, 3].map((order) => normalizeGenerator({ ...defaults.generation_rules[order], ...source.generation_rules?.[order], id: `LEVEL_${order}`, order: Math.max(1, order) }));
  const groupIds = new Set();
  result.generator_groups = (Array.isArray(source.generator_groups) ? source.generator_groups : []).slice(0, 24).filter((g) => g && typeof g === 'object').map(normalizeGenerator).filter((group) => {
    if (groupIds.has(group.id) || group.id.startsWith('LEVEL_')) return false;
    groupIds.add(group.id); return true;
  });
  result.sculpt_layers = normalizeLayers(source.sculpt_layers || []);
  result.active_sculpt_layer = result.sculpt_layers.some((layer) => layer.id === source.active_sculpt_layer) ? source.active_sculpt_layer : '';
  const rangeStart = clamp(finite(source.foliage_range?.start, 0), 0, 1); const rangeEnd = clamp(finite(source.foliage_range?.end, 1), 0, 1);
  result.foliage_range = { start: Math.min(rangeStart, rangeEnd), end: Math.max(rangeStart, rangeEnd) };
  const profile = (key, fallback) => normalizeProfile(source.profiles?.[key], fallback);
  result.profiles = {
    branch_density: profile('branch_density', defaults.profiles.branch_density),
    branch_length: profile('branch_length', defaults.profiles.branch_length),
    leaf_density: profile('leaf_density', defaults.profiles.leaf_density),
    radius_taper: profile('radius_taper', defaults.profiles.radius_taper),
    branch_angle: profile('branch_angle', defaults.profiles.branch_angle),
    leaf_scale: profile('leaf_scale', defaults.profiles.leaf_scale),
  };
  result.overrides = Object.fromEntries(Object.entries(source.overrides || {}).map(([id, value]) => [id, normalizeOverride(value)]));
  result.manual_branches = (source.manual_branches || []).map((item, index) => ({
    id: String(item.id || `M${index + 1}`),
    parent: String(item.parent || 'R1'),
    attach: clamp(finite(item.attach, 0.72), 0.02, 0.98),
    length: clamp(finite(item.length, 0.6), 0.03, 12),
    radius: clamp(finite(item.radius, 0.018), 0.001, 0.6),
    angle: clamp(finite(item.angle, 42), 1, 175),
    azimuth: finite(item.azimuth, 0),
    ...(normalizeLocalBranchRecord(item.local_bundle) ? { local_bundle: normalizeLocalBranchRecord(item.local_bundle) } : {}),
  }));
  result.local_branch_groups = normalizeLocalBranchGroups(source.local_branch_groups);
  result.leaf_edits = {
    removed: [...new Set((source.leaf_edits?.removed || []).map(String))],
    added: (source.leaf_edits?.added || []).map((item, index) => ({
      id: String(item.id || `ML${index + 1}`), parent: String(item.parent || 'R1'),
      t: clamp(finite(item.t, 0.8), 0, 1), azimuth: finite(item.azimuth, 0),
      scale: clamp(finite(item.scale, 1), 0.05, 4), source: Math.max(0, Math.round(finite(item.source, 0))),
    })),
  };
  result.modifiers = (source.modifiers || []).map(normalizeModifier);
  result.selection_sets = Object.fromEntries(Object.entries(source.selection_sets || {}).map(([name, ids]) => [
    String(name).slice(0, 48), [...new Set((Array.isArray(ids) ? ids : []).map(String))],
  ]).filter(([name]) => name));
  result.foliage_masks = (source.foliage_masks || []).map((item, index) => ({
    id: String(item.id || `MASK_${index + 1}`),
    mode: item.mode === 'INCLUDE' ? 'INCLUDE' : 'EXCLUDE',
    shape: ['SPHERE', 'BOX'].includes(item.shape) ? item.shape : 'SPHERE',
    center: normalizeVector(item.center),
    size: normalizeVector(item.size, [0.5, 0.5, 0.5]).map((value) => clamp(Math.abs(value), 0.01, 20)),
    radius: clamp(finite(item.radius, 0.5), 0.01, 20),
    strength: clamp(finite(item.strength, 1), 0, 1),
  }));
  result.phenotype = {
    apical_dominance: clamp(finite(source.phenotype?.apical_dominance, 0.55), 0, 1),
    competition: clamp(finite(source.phenotype?.competition, 0.2), 0, 1),
    tropism_bias: clamp(finite(source.phenotype?.tropism_bias, 0), -1, 1),
    individual_scale: clamp(finite(source.phenotype?.individual_scale, 1), 0.25, 3),
  };
  result.curve_editor = {
    coordinate_space: source.curve_editor?.coordinate_space === 'LOCAL' ? 'LOCAL' : 'WORLD',
    constraint: ['FREE', 'X', 'Y', 'Z', 'XY', 'XZ', 'YZ'].includes(source.curve_editor?.constraint) ? source.curve_editor.constraint : 'FREE',
    snap: clamp(finite(source.curve_editor?.snap, 0), 0, 1),
    tangent_mode: ['FREE', 'SMOOTH'].includes(source.curve_editor?.tangent_mode) ? source.curve_editor.tangent_mode : 'SMOOTH',
    tangent_length: clamp(finite(source.curve_editor?.tangent_length, 0.12), 0.01, 2),
    edit_mode: ['DIRECT', 'SOFT_MOVE', 'BEND', 'TIP_IK', 'SEGMENT', 'SMOOTH'].includes(source.curve_editor?.edit_mode) ? source.curve_editor.edit_mode : 'SOFT_MOVE',
    falloff_radius: clamp(finite(source.curve_editor?.falloff_radius, 0.35), 0.01, 10),
    falloff_profile: ['SMOOTH', 'GAUSSIAN', 'LINEAR', 'SHARP'].includes(source.curve_editor?.falloff_profile) ? source.curve_editor.falloff_profile : 'SMOOTH',
    preserve_length: clamp(finite(source.curve_editor?.preserve_length, 0.75), 0, 1),
    lock_root: source.curve_editor?.lock_root !== false,
    affect_children: source.curve_editor?.affect_children !== false,
    live_preview: source.curve_editor?.live_preview !== false,
    knot_count: Math.round(clamp(finite(source.curve_editor?.knot_count, 7), 4, 64)),
    smooth_strength: clamp(finite(source.curve_editor?.smooth_strength, 0.45), 0.05, 1),
    simplify_tolerance: clamp(finite(source.curve_editor?.simplify_tolerance, 0.02), 0.0005, 0.5),
    subdivision_levels: Math.round(clamp(finite(source.curve_editor?.subdivision_levels, 1), 1, 3)),
  };
  result.topology = {
    reparent: Object.fromEntries(Object.entries(source.topology?.reparent || {}).map(([id, parent]) => [String(id), String(parent)])),
    attach: Object.fromEntries(Object.entries(source.topology?.attach || {}).map(([id, value]) => [String(id), clamp(finite(value, 0.72), 0.02, 0.98)])),
    suppressed: [...new Set((source.topology?.suppressed || []).map(String))],
    operations: (source.topology?.operations || []).slice(-200).map((operation, index) => ({
      id: String(operation.id || `TOPO_${index + 1}`), type: String(operation.type || 'EDIT'), target: String(operation.target || ''),
      at: clamp(finite(operation.at, 0.5), 0, 1), created: String(operation.created || ''),
    })),
  };
  const attachmentTypes = ['LEAF', 'NEEDLE', 'FLOWER', 'FRUIT', 'THORN', 'DEAD_LEAF', 'CUSTOM'];
  const defaultLayers = defaults.attachment_layers;
  result.attachment_layers = (Array.isArray(source.attachment_layers) && source.attachment_layers.length ? source.attachment_layers : defaultLayers).map((layer, index) => ({
    id: String(layer.id || `ATTACH_${index + 1}`), name: String(layer.name || `附着层 ${index + 1}`).slice(0, 48),
    type: attachmentTypes.includes(layer.type) ? layer.type : 'LEAF', enabled: layer.enabled !== false,
    density: clamp(finite(layer.density, 1), 0, 5), scale: clamp(finite(layer.scale, 1), 0.02, 5),
    order_min: Math.round(clamp(finite(layer.order_min, 1), 0, 3)), order_max: Math.round(clamp(finite(layer.order_max, 3), 0, 3)),
    start: clamp(finite(layer.start, 0.3), 0, 1), end: clamp(finite(layer.end, 1), 0, 1),
    season: ['ANY', 'BUD', 'SPRING', 'SUMMER', 'AUTUMN', 'WINTER', 'DEAD'].includes(layer.season) ? layer.season : 'ANY',
    health_min: clamp(finite(layer.health_min, 0), 0, 1), light_min: clamp(finite(layer.light_min, 0), 0, 1),
    material_variant: Math.max(0, Math.round(finite(layer.material_variant, 0))), source: Math.round(finite(layer.source, -1)),
  })).map((layer) => ({ ...layer, order_min: Math.min(layer.order_min, layer.order_max), order_max: Math.max(layer.order_min, layer.order_max), start: Math.min(layer.start, layer.end), end: Math.max(layer.start, layer.end) }));
  const sourceTimeline = source.timeline || defaults.timeline;
  result.timeline = {
    enabled: Boolean(sourceTimeline.enabled), time: clamp(finite(sourceTimeline.time, 0.5), 0, 1), loop: Boolean(sourceTimeline.loop),
    keyframes: (sourceTimeline.keyframes || defaults.timeline.keyframes).map((frame, index) => ({
      id: String(frame.id || `KEY_${index + 1}`), time: clamp(finite(frame.time, index), 0, 1),
      age_progress: clamp(finite(frame.age_progress, index), 0, 1), season_progress: clamp(finite(frame.season_progress, index), 0, 1),
      health: clamp(finite(frame.health, 1), 0, 1), leaf_loss: clamp(finite(frame.leaf_loss, 0), 0, 1), wind_shape: clamp(finite(frame.wind_shape, 0), -1, 1),
    })).sort((a, b) => a.time - b.time),
    snapshots: (sourceTimeline.snapshots || []).map((snapshot, index) => ({ id: String(snapshot.id || `POSE_${index + 1}`), name: String(snapshot.name || `姿态 ${index + 1}`).slice(0, 48), time: clamp(finite(snapshot.time, 0.5), 0, 1) })),
  };
  result.wind_profile = {
    root_stiffness: clamp(finite(source.wind_profile?.root_stiffness, 1), 0, 2),
    branch_stiffness: clamp(finite(source.wind_profile?.branch_stiffness, 0.58), 0, 2),
    tip_stiffness: clamp(finite(source.wind_profile?.tip_stiffness, 0.18), 0, 2),
    leaf_flutter: clamp(finite(source.wind_profile?.leaf_flutter, 0.72), 0, 2),
    gust_frequency: clamp(finite(source.wind_profile?.gust_frequency, 0.45), 0, 4),
    turbulence: clamp(finite(source.wind_profile?.turbulence, 0.3), 0, 1),
  };
  result.recipe = {
    name: String(source.recipe?.name || '未命名配方').slice(0, 64),
    tags: [...new Set((source.recipe?.tags || []).map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 16),
    locked_parameters: [...new Set((source.recipe?.locked_parameters || []).map(String))],
  };
  result.quality = {
    max_attachment_overlap: clamp(finite(source.quality?.max_attachment_overlap, 0.08), 0, 1),
    require_tangents: source.quality?.require_tangents !== false,
    require_uvs: source.quality?.require_uvs !== false,
  };
  return result;
}

export function cloneAuthoring(authoring) {
  return clone(normalizeAuthoring(authoring));
}

export function stableSeed(baseSeed, key) {
  let hash = Math.trunc(finite(baseSeed, 1)) >>> 0;
  for (const character of String(key)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash || 1;
}

export function evaluateProfile(values, t, fallback = 1) {
  return profileValue(values, t, fallback);
}

export function migrateProjectDocument(document, fallbackSeed = 12037) {
  if (!document || document.format !== 'ProceduralBranchProject') throw new Error('不是受支持的 Orbigen 工程文件');
  if (![1, 2, 3, 4].includes(document.version)) throw new Error(`不支持的工程版本：${document.version}`);
  if (document.version === 4) return { ...document, authoring: normalizeAuthoring(document.authoring, document.settings?.seed || fallbackSeed) };
  if (document.version === 3) return { ...document, version: 4, migrated_from: 3, authoring: normalizeAuthoring(document.authoring, document.settings?.seed || fallbackSeed) };
  if (document.version === 2) return { ...document, version: 4, migrated_from: 2, authoring: normalizeAuthoring(document.authoring, document.settings?.seed || fallbackSeed) };
  return {
    ...document,
    version: 4,
    migrated_from: 1,
    authoring: normalizeAuthoring({}, document.settings?.seed || fallbackSeed),
    leaf_meshes: document.leaf_mesh ? [{ id: 'LEAF_1', name: document.leaf_mesh.sourceName || '导入叶片', weight: 1, geometry: document.leaf_mesh }] : [],
  };
}
