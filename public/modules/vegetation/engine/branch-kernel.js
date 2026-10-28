import { radiusFactorAt } from './branch-radius.js';
import { hasSurfaceCanopy, createSurfaceCanopy } from './surface-canopy.js';
import { buildCanopyInstances, materializeCanopyRecords, leafArraysGeometry, allocateLeafArrays } from './canopy-instances.js';
import { authorUnits } from './unit-authoring.js';
import * as THREE from 'three';
import { buildFoliageUnitSources } from './foliage-unit.js';
import { sampleLeafMaterial, sampleLeafMaterialName } from './leaf-material-data.js';
import { transformBranchShape, sampleTangent, resolveInstanceShape, resolveInstanceAsset } from './branch-workbench-data.js';
import { sampleFoliagePlacements, localSampleBranches, mountSamplePlacement } from './sample-foliage.js';
import { sectionAt, branchRadiusAt, branchSampleTs } from './branch-shaping.js';
import { applySkeletonThickness } from './skeleton-thickness.js';
import { applyProceduralGrowth } from './procedural-growth.js';
import { DEFAULT_AUTHORING, evaluateProfile, normalizeAuthoring, stableSeed } from './authoring-state.js';
import { generationSlots, applySculptLayers } from './generator-geometry.js';
import { applyBranchSymmetry } from './branch-symmetry.js';
import { attachmentLayerMatches, evaluateTimeline, resamplePolyline } from './v4-tools.js';
import { createVineShape } from './vine-geometry.js';
import { vineSettings } from './vine-data.js';
import { createFloweringShape } from './flowering-shape.js';
import { flowerPlacements, defaultInflorescence } from './flowering-geometry.js';
import { plantNodes } from './flowering-data.js';
import { plantAttachmentBase } from './plant-attachment.js';
import { varyPlantPose } from './plant-pose.js';
import { createSurfaceGrowth, surfaceNormalAt } from './surface-growth-geometry.js';
import { buildVegetation } from './vegetation-geometry.js';
import { treeOrganPlacements } from './tree-organ-geometry.js';
import { canCompileSamples, compileSampleAssembly } from './complete-sample-assembly.js';
import { localBranchShape } from './local-branch-geometry.js';
import { attachmentOverlapRatio } from './attachment-overlap.js';

export const GENERATOR_VERSION = '4.0.0';
export const PROJECT_FORMAT = 'ProceduralBranchProject';

export const SPECIES_PRESETS = {
  BROADLEAF: {
    label: '阔叶树通用枝', architecture: 'SPREADING', length: 2.4, base_radius: 0.07,
    branch_levels: 3, child_count: 6, child_decay: 0.58, child_length_ratio: 0.48,
    branch_angle: 42, gravity: 0.16, bend: 0.2, leaf_arrangement: 'ALTERNATE',
    leaf_density: 22, leaf_scale: 0.16, leaf_aspect: 0.46, tip_cluster: 0.18,
  },
  WILLOW: {
    label: '垂柳长枝', architecture: 'DROOPING', length: 3.2, base_radius: 0.055,
    branch_levels: 3, child_count: 8, child_decay: 0.62, child_length_ratio: 0.56,
    branch_angle: 31, gravity: 0.58, bend: 0.28, leaf_arrangement: 'ALTERNATE',
    leaf_density: 30, leaf_scale: 0.14, leaf_aspect: 0.24, tip_cluster: 0.08,
  },
  CONIFER: {
    label: '针叶层状枝', architecture: 'LAYERED', length: 2.7, base_radius: 0.065,
    branch_levels: 3, child_count: 10, child_decay: 0.5, child_length_ratio: 0.38,
    branch_angle: 64, gravity: 0.12, bend: 0.11, leaf_arrangement: 'WHORLED',
    leaf_density: 48, leaf_scale: 0.1, leaf_aspect: 0.1, tip_cluster: 0.3,
  },
  SHRUB: {
    label: '灌木密集枝', architecture: 'FORKED', length: 1.45, base_radius: 0.045,
    branch_levels: 4, child_count: 7, child_decay: 0.54, child_length_ratio: 0.52,
    branch_angle: 48, gravity: 0.09, bend: 0.24, leaf_arrangement: 'OPPOSITE',
    leaf_density: 34, leaf_scale: 0.11, leaf_aspect: 0.52, tip_cluster: 0.26,
  },
  FRUIT: {
    label: '果树短枝', architecture: 'UPRIGHT', length: 1.8, base_radius: 0.075,
    branch_levels: 3, child_count: 5, child_decay: 0.55, child_length_ratio: 0.42,
    branch_angle: 48, gravity: 0.2, bend: 0.22, leaf_arrangement: 'CLUSTERED',
    leaf_density: 24, leaf_scale: 0.18, leaf_aspect: 0.55, tip_cluster: 0.42,
  },
};

export const DEFAULT_SETTINGS = {
  export_format: 'GLB',
  schema_version: 4,
  object_name: '程序化树枝单元',
  species_profile: 'BROADLEAF',
  architecture: 'SPREADING',
  seed: 12037,
  length: 2.4,
  base_radius: 0.07,
  tip_radius: 0.006,
  main_segments: 20,
  radial_segments: 9,
  root_elevation: 90,
  root_azimuth: 0,
  bend: 0.2,
  bend_frequency: 1.35,
  twist: 22,
  gravity: 0.16,
  phototropism: 0.14,
  surface_roughness: 0.06,
  junction_flare: 0.18,
  cross_section: 'CIRCLE',
  oval_ratio: 1,
  lobe_count: 5,
  lobe_strength: 0.08,
  bark_seam: 0,
  bark_tiling: 1,
  adaptive_tessellation: true,
  curvature_detail: 0.6,
  radius_bias: 0,
  section_roll: 0,
  groove_count: 7,
  groove_depth: 0,
  knot_strength: 0,
  junction_collar: true,
  branch_levels: 3,
  child_count: 6,
  child_decay: 0.58,
  child_length_ratio: 0.48,
  child_radius_ratio: 0.56,
  branch_angle: 42,
  angle_variation: 13,
  start_clearance: 0.22,
  end_clearance: 0.08,
  phyllotaxis_angle: 137.5,
  asymmetry: 0.18,
  season: 'SUMMER',
  age: 'MATURE',
  health: 1,
  leaf_loss: 0,
  growth_vigor: 1,
  dead_tip_ratio: 0,
  regrowth: 0,
  wind_shape: 0,
  environment_load: 'NONE',
  environment_load_amount: 0,
  damage_mode: 'INTACT',
  damage_amount: 0,
  age_progress: 0.55,
  season_progress: 0.5,
  cut_style: 'FLAT',
  leaf_arrangement: 'ALTERNATE',
  leaf_density: 22,
  leaf_scale: 0.16,
  leaf_scale_variation: 0.22,
  leaf_age_layering: 0,
  leaf_shoot_zoning: false,
  leaf_shoot_quota: false,
  leaf_shoot_mature_share: 0.4,
  leaf_shoot_mixed_share: 0.5,
  leaf_shoot_inner: 0.3,
  leaf_shoot_outer: 0.58,
  leaf_shoot_mid_mix: 0.32,
  leaf_shoot_outer_young: 0.4,
  leaf_aspect: 0.46,
  leaf_zone_start: 0.3,
  tip_cluster: 0.18,
  leaf_droop: 0.18,
  leaf_outward: 0.72,
  leaf_twist: 18,
  leaf_min_spacing: 0.025,
  foliage_mode: 'SINGLE',
  cluster_leaf_count: 5,
  cluster_spread: 42,
  petiole_length: 0.025,
  leaf_light_response: 0.2,
  branch_clearance: 0.012,
  collision_avoidance: true,
  source_axis: 'Y',
  leaf_double_sided: true,
  buds_enabled: false,
  fruit_enabled: false,
  fruit_density: 0.05,
  bark_color: '#60452f',
  leaf_color: '#3f7c45',
  autumn_color: '#b45d2b',
  bud_color: '#b7cf70',
  fruit_color: '#a94739',
  wind_mode: 'VERTEX_COLOR',
  wind_strength: 0.42,
  preview_lod: 0,
  export_lods: false,
  merge_by_material: true,
  collision_mode: 'NONE',
  export_profile: 'STANDARD',
  generation_budget_ms: 750,
  batch_count: 4,
  batch_seed_step: 101,
  export_sockets: true,
  export_pcg_metadata: true,
  export_ue_script: true,
  export_material_setup: true,
  export_state_variants: false,
  nanite_policy: 'AUTO',
  ue_destination: '/Game/Orbigen',
  test_map: '/Game/Maps/Orbigen_Validation',
  capture_duration_s: 10,
  max_triangles: 180000,
  max_leaves: 1800,
};

export const LOD_PROFILES = [
  { segment: 1, radial: 1, leaves: 1, maxLevelOffset: 0, label: 'LOD0 完整' },
  { segment: 0.76, radial: 0.78, leaves: 0.68, maxLevelOffset: 0, label: 'LOD1 标准' },
  { segment: 0.54, radial: 0.58, leaves: 0.4, maxLevelOffset: -1, label: 'LOD2 简化' },
  { segment: 0.34, radial: 0.45, leaves: 0.18, maxLevelOffset: -2, label: 'LOD3 远景' },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const radians = (degrees) => degrees * Math.PI / 180;

export function createRng(seedValue) {
  let state = (Math.trunc(number(seedValue, 1)) >>> 0) || 1;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeSettings(raw = {}) {
  const value = { ...DEFAULT_SETTINGS, ...raw };
  value.object_name = String(value.object_name || DEFAULT_SETTINGS.object_name).trim() || DEFAULT_SETTINGS.object_name;
  value.seed = Math.trunc(clamp(number(value.seed, 12037), 1, 2147483646));
  value.length = clamp(number(value.length, 2.4), 0.2, 12);
  value.base_radius = clamp(number(value.base_radius, 0.07), 0.004, 0.6);
  value.tip_radius = clamp(number(value.tip_radius, 0.006), 0.0005, value.base_radius * 0.8);
  value.main_segments = Math.round(clamp(number(value.main_segments, 20), 6, 80));
  value.radial_segments = Math.round(clamp(number(value.radial_segments, 9), 4, 20));
  value.root_elevation = clamp(number(value.root_elevation, 90), 0, 90);
  value.root_azimuth = clamp(number(value.root_azimuth, 0), -180, 180);
  value.bend = clamp(number(value.bend, 0.2), 0, 1);
  value.bend_frequency = clamp(number(value.bend_frequency, 1.35), 0.2, 5);
  value.twist = clamp(number(value.twist, 22), -180, 180);
  value.gravity = clamp(number(value.gravity, 0.16), 0, 1.5);
  value.phototropism = clamp(number(value.phototropism, 0.14), -1, 1);
  value.surface_roughness = clamp(number(value.surface_roughness, 0.06), 0, 0.35);
  value.junction_flare = clamp(number(value.junction_flare, 0.18), 0, 1);
  value.cross_section = ['CIRCLE', 'OVAL', 'LOBED'].includes(value.cross_section) ? value.cross_section : 'CIRCLE';
  value.oval_ratio = clamp(number(value.oval_ratio, 1), 0.25, 2.5);
  value.lobe_count = Math.round(clamp(number(value.lobe_count, 5), 2, 12));
  value.lobe_strength = clamp(number(value.lobe_strength, 0.08), 0, 0.45);
  value.bark_seam = clamp(number(value.bark_seam, 0), -180, 180);
  value.bark_tiling = clamp(number(value.bark_tiling, 1), 0.1, 10);
  value.adaptive_tessellation = value.adaptive_tessellation !== false;
  value.curvature_detail = clamp(number(value.curvature_detail, 0.6), 0, 2);
  value.radius_bias = clamp(number(value.radius_bias, 0), -0.8, 0.8);
  value.section_roll = clamp(number(value.section_roll, 0), -180, 180);
  value.groove_count = Math.round(clamp(number(value.groove_count, 7), 2, 20));
  value.groove_depth = clamp(number(value.groove_depth, 0), 0, 0.35);
  value.knot_strength = clamp(number(value.knot_strength, 0), 0, 0.5);
  value.junction_collar = value.junction_collar !== false;
  value.branch_levels = Math.round(clamp(number(value.branch_levels, 3), 1, 4));
  value.child_count = Math.round(clamp(number(value.child_count, 6), 0, 14));
  value.child_decay = clamp(number(value.child_decay, 0.58), 0.15, 0.95);
  value.child_length_ratio = clamp(number(value.child_length_ratio, 0.48), 0.12, 0.85);
  value.child_radius_ratio = clamp(number(value.child_radius_ratio, 0.56), 0.15, 0.85);
  value.branch_angle = clamp(number(value.branch_angle, 42), 5, 88);
  value.angle_variation = clamp(number(value.angle_variation, 13), 0, 45);
  value.start_clearance = clamp(number(value.start_clearance, 0.22), 0, 0.8);
  value.end_clearance = clamp(number(value.end_clearance, 0.08), 0, 0.6);
  value.phyllotaxis_angle = clamp(number(value.phyllotaxis_angle, 137.5), 1, 359);
  value.asymmetry = clamp(number(value.asymmetry, 0.18), 0, 1);
  value.health = clamp(number(value.health, 1), 0, 1);
  value.leaf_loss = clamp(number(value.leaf_loss, 0), 0, 1);
  value.growth_vigor = clamp(number(value.growth_vigor, 1), 0.1, 1.5);
  value.dead_tip_ratio = clamp(number(value.dead_tip_ratio, 0), 0, 1);
  value.regrowth = clamp(number(value.regrowth, 0), 0, 1);
  value.wind_shape = clamp(number(value.wind_shape, 0), -1, 1);
  value.environment_load = ['NONE', 'SNOW', 'PREVAILING_WIND', 'CLIMBING'].includes(value.environment_load) ? value.environment_load : 'NONE';
  value.environment_load_amount = clamp(number(value.environment_load_amount, 0), 0, 1);
  value.damage_amount = clamp(number(value.damage_amount, 0), 0, 1);
  value.age_progress = clamp(number(value.age_progress, 0.55), 0, 1);
  value.season_progress = clamp(number(value.season_progress, 0.5), 0, 1);
  value.cut_style = ['FLAT', 'SAW', 'TORN'].includes(value.cut_style) ? value.cut_style : 'FLAT';
  value.leaf_density = clamp(number(value.leaf_density, 22), 0, 120);
  value.leaf_scale = clamp(number(value.leaf_scale, 0.16), 0.01, 1.2);
  value.leaf_scale_variation = clamp(number(value.leaf_scale_variation, 0.22), 0, 0.8);
  value.leaf_age_layering = clamp(number(value.leaf_age_layering, 0), 0, 1);
  value.leaf_shoot_zoning = Boolean(value.leaf_shoot_zoning);
  value.leaf_shoot_quota = Boolean(value.leaf_shoot_quota);
  value.leaf_shoot_mature_share = clamp(number(value.leaf_shoot_mature_share, 0.4), 0, 1);
  value.leaf_shoot_mixed_share = clamp(number(value.leaf_shoot_mixed_share, 0.5), 0, 1 - value.leaf_shoot_mature_share);
  value.leaf_shoot_inner = clamp(number(value.leaf_shoot_inner, 0.3), 0.05, 0.8);
  value.leaf_shoot_outer = clamp(number(value.leaf_shoot_outer, 0.58), value.leaf_shoot_inner + 0.05, 0.95);
  value.leaf_shoot_mid_mix = clamp(number(value.leaf_shoot_mid_mix, 0.32), 0, 0.8);
  value.leaf_shoot_outer_young = clamp(number(value.leaf_shoot_outer_young, 0.4), 0, 0.8);
  value.leaf_aspect = clamp(number(value.leaf_aspect, 0.46), 0.04, 1.5);
  value.leaf_zone_start = clamp(number(value.leaf_zone_start, 0.3), 0, 0.9);
  value.tip_cluster = clamp(number(value.tip_cluster, 0.18), 0, 1);
  value.leaf_droop = clamp(number(value.leaf_droop, 0.18), 0, 1);
  value.leaf_outward = clamp(number(value.leaf_outward, 0.72), 0, 1.5);
  value.leaf_twist = clamp(number(value.leaf_twist, 18), 0, 180);
  value.leaf_min_spacing = clamp(number(value.leaf_min_spacing, 0.025), 0, 0.4);
  value.foliage_mode = ['SINGLE', 'COMPOUND', 'NEEDLE_BUNDLE', 'CLUSTER'].includes(value.foliage_mode) ? value.foliage_mode : 'SINGLE';
  value.cluster_leaf_count = Math.round(clamp(number(value.cluster_leaf_count, 5), 1, 24));
  value.cluster_spread = clamp(number(value.cluster_spread, 42), 0, 160);
  value.petiole_length = clamp(number(value.petiole_length, 0.025), 0, 0.4);
  value.leaf_light_response = clamp(number(value.leaf_light_response, 0.2), -1, 1);
  value.branch_clearance = clamp(number(value.branch_clearance, 0.012), 0, 0.3);
  value.fruit_density = clamp(number(value.fruit_density, 0.05), 0, 0.5);
  value.wind_strength = clamp(number(value.wind_strength, 0.42), 0, 1);
  value.preview_lod = Math.round(clamp(number(value.preview_lod, 0), 0, 3));
  value.high_detail_mesh_budget = value.high_detail_mesh_budget === true;
  value.max_triangles = Math.round(clamp(number(value.max_triangles, 180000), 1000,
    value.high_detail_mesh_budget ? 30000000 : 6000000));
  value.max_leaves = Math.round(clamp(number(value.max_leaves, 1800), 0, 160000));
  value.collision_mode = ['NONE', 'ROOT_CAPSULE', 'MAIN_BRANCHES', 'CONVEX_PROXY'].includes(value.collision_mode) ? value.collision_mode : 'NONE';
  value.export_profile = ['STANDARD', 'HERO', 'MOBILE', 'SHADOW'].includes(value.export_profile) ? value.export_profile : 'STANDARD';
  value.generation_budget_ms = Math.round(clamp(number(value.generation_budget_ms, 750), 50,
    value.high_detail_mesh_budget ? 45000 : 10000));
  value.export_material_setup = value.export_material_setup !== false;
  value.export_format = value.export_format === 'GLB' ? 'GLB' : 'FBX';
  value.export_state_variants = Boolean(value.export_state_variants);
  value.nanite_policy = ['AUTO', 'ENABLED', 'DISABLED'].includes(value.nanite_policy) ? value.nanite_policy : 'AUTO';
  value.ue_destination = String(value.ue_destination || '/Game/Orbigen').replace(/\\/g, '/');
  value.test_map = String(value.test_map || '/Game/Maps/Orbigen_Validation').replace(/\\/g, '/');
  value.capture_duration_s = clamp(number(value.capture_duration_s, 10), 1, 120);
  value.batch_count = Math.round(clamp(number(value.batch_count, 4), 1, 64));
  value.batch_seed_step = Math.round(clamp(number(value.batch_seed_step, 101), 1, 100000));
  value.export_sockets = value.export_sockets !== false;
  value.export_pcg_metadata = value.export_pcg_metadata !== false;
  value.export_ue_script = value.export_ue_script !== false;
  return value;
}

export function applySpeciesPreset(settings, presetId) {
  const preset = SPECIES_PRESETS[presetId] || SPECIES_PRESETS.BROADLEAF;
  return normalizeSettings({ ...settings, ...preset, species_profile: presetId });
}

function applyTimeline(settings, authoring) {
  if (!authoring.timeline?.enabled) return settings;
  const frame = evaluateTimeline(authoring.timeline?.keyframes, authoring.timeline?.time);
  if (!Object.keys(frame).length) return settings;
  return normalizeSettings({
    ...settings,
    age_progress: frame.age_progress ?? settings.age_progress,
    season_progress: frame.season_progress ?? settings.season_progress,
    health: frame.health ?? settings.health,
    leaf_loss: frame.leaf_loss ?? settings.leaf_loss,
    wind_shape: frame.wind_shape ?? settings.wind_shape,
  });
}

function stateFactors(settings) {
  const seasons = {
    BUD: { density: 0.18, scale: 0.42, color: settings.bud_color },
    SPRING: { density: 0.64, scale: 0.72, color: '#78a84f' },
    SUMMER: { density: 1, scale: 1, color: settings.leaf_color },
    AUTUMN: { density: 0.78, scale: 0.96, color: settings.autumn_color },
    WINTER: { density: 0, scale: 0.85, color: settings.leaf_color },
    DEAD: { density: 0.08, scale: 0.8, color: '#77664b' },
  };
  const sequence = ['BUD', 'SPRING', 'SUMMER', 'AUTUMN', 'WINTER', 'DEAD'];
  const seasonIndex = Math.max(0, sequence.indexOf(settings.season));
  const currentSeason = seasons[sequence[seasonIndex]];
  const nextSeason = seasons[sequence[Math.min(sequence.length - 1, seasonIndex + 1)]];
  const season = {
    density: THREE.MathUtils.lerp(currentSeason.density, nextSeason.density, settings.season_progress),
    scale: THREE.MathUtils.lerp(currentSeason.scale, nextSeason.scale, settings.season_progress),
    color: `#${new THREE.Color(currentSeason.color).lerp(new THREE.Color(nextSeason.color), settings.season_progress).getHexString()}`,
  };
  const agePreset = { YOUNG: 0.7, MATURE: 1, OLD: 0.82 }[settings.age] || 1;
  const age = THREE.MathUtils.lerp(0.72, 1.14, settings.age_progress) * agePreset;
  const damageLoss = settings.damage_mode === 'INTACT' ? 0 : settings.damage_amount * 0.42;
  return {
    leafDensity: season.density * settings.health * settings.growth_vigor * (1 - settings.leaf_loss) * (1 - damageLoss),
    leafScale: season.scale,
    branchScale: age * (0.78 + settings.growth_vigor * 0.22),
    leafColor: season.color,
    deadness: Math.max(1 - settings.health, settings.season === 'DEAD' ? 1 : 0),
  };
}

function colorMaterial(name, color, roughness, metalness = 0, side = THREE.FrontSide) {
  const material = new THREE.MeshStandardMaterial({ color, roughness, metalness, side, vertexColors: false });
  material.name = name;
  return material;
}

// Fine bark grain follows the existing surface controls. The texture is
// tileable in both directions, so it follows a swept branch without seams.
function createBarkGrainTexture() {
  const width = 128;
  const height = 256;
  const data = new Uint8Array(width * height * 4);
  const tau = Math.PI * 2;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const u = x / width;
    const v = y / height;
    const warp = 0.026 * Math.sin(tau * (3 * v + 2 * u))
      + 0.012 * Math.sin(tau * (7 * v - 3 * u));
    const groove = Math.sin(tau * 11 * (u + warp));
    const fine = Math.sin(tau * (23 * u + 5 * v + warp * 3));
    const cross = Math.sin(tau * (4 * u - 13 * v));
    const shade = THREE.MathUtils.clamp(0.88 - 0.13 * Math.pow(Math.max(0, groove), 10)
      + 0.035 * fine + 0.02 * cross, 0.7, 1);
    const value = Math.round(shade * 255);
    const index = (y * width + x) * 4;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  texture.userData.orbigen_export = true;
  return texture;
}

export function createBranchMaterials(settings) {
  const state = stateFactors(settings);
  const barkColor = new THREE.Color(settings.bark_color).lerp(new THREE.Color('#6d6255'), state.deadness * 0.65);
  const bark = colorMaterial('M_Bark', barkColor, 0.88);
  if (settings.groove_depth > 0 || settings.surface_roughness > 0) {
    const grain = createBarkGrainTexture();
    bark.map = grain;
    bark.bumpMap = grain;
    bark.bumpScale = Math.min(0.018, settings.groove_depth * 0.22 + settings.surface_roughness * 0.07);
    bark.needsUpdate = true;
  }
  return {
    bark,
    leaf: colorMaterial('M_Leaf', state.leafColor, 0.72, 0, settings.leaf_double_sided ? THREE.DoubleSide : THREE.FrontSide),
    flower: colorMaterial('M_Flower', '#d9328d', .68, 0, THREE.DoubleSide),
    flowerCore: colorMaterial('M_FlowerCore', '#fff1c4', .72, 0, THREE.DoubleSide),
    bud: colorMaterial('M_Bud', settings.bud_color, 0.62),
    fruit: colorMaterial('M_Fruit', settings.fruit_color, 0.56),
    scar: colorMaterial('M_CutScar', '#b99062', 0.92),
  };
}

export function disposeMaterials(materials) {
  Object.values(materials || {}).forEach((material) => {
    const textures = new Set(['map', 'normalMap', 'bumpMap'].map((key) => material?.[key]).filter((texture) => texture?.userData.orbigen_export));
    textures.forEach((texture) => texture.dispose());
    material?.dispose?.();
  });
}

function architectureDirection(settings) {
  const elevation = radians(settings.root_elevation);
  const azimuth = radians(settings.root_azimuth);
  const horizontal = Math.cos(elevation);
  return new THREE.Vector3(
    horizontal * Math.cos(azimuth),
    horizontal * Math.sin(azimuth),
    Math.sin(elevation),
  ).normalize();
}

function tangentFrame(tangent, phase = 0) {
  const helper = Math.abs(tangent.z) > 0.92 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const x = new THREE.Vector3().crossVectors(helper, tangent).normalize();
  const y = new THREE.Vector3().crossVectors(tangent, x).normalize();
  if (phase) {
    const q = new THREE.Quaternion().setFromAxisAngle(tangent, phase);
    x.applyQuaternion(q);
    y.applyQuaternion(q);
  }
  return { x, y };
}

function constrainPoint(point, t, authoring) {
  const { envelope, attractor, repeller } = authoring;
  if (attractor.enabled && attractor.strength > 0) {
    const target = new THREE.Vector3(attractor.x, attractor.y, attractor.z);
    const pull = target.sub(point);
    if (pull.lengthSq() > 1e-8) point.addScaledVector(pull.normalize(), attractor.strength * t * t * 0.12);
  }
  if (repeller.enabled && repeller.strength > 0) {
    const source = new THREE.Vector3(repeller.x, repeller.y, repeller.z);
    const away = point.clone().sub(source);
    const distance = away.length();
    if (distance < repeller.radius && distance > 1e-5) {
      point.addScaledVector(away.normalize(), (1 - distance / repeller.radius) * repeller.strength * 0.18);
    }
  }
  if (envelope.type === 'NONE') return point;
  const center = new THREE.Vector3(...envelope.center);
  point.sub(center);
  const heightT = clamp(point.z / Math.max(envelope.height, 0.01), 0, 1);
  let allowedRadius = envelope.radius;
  if (envelope.type === 'SPHERE') allowedRadius *= Math.max(0.12, Math.sin(Math.PI * heightT));
  if (envelope.type === 'CONE') allowedRadius *= Math.max(0.08, 1 - heightT);
  const radial = new THREE.Vector2(point.x, point.y);
  if (radial.length() > allowedRadius) {
    radial.setLength(THREE.MathUtils.lerp(radial.length(), allowedRadius, envelope.strength));
    point.x = radial.x;
    point.y = radial.y;
  }
  if (envelope.type === 'FLAT' || envelope.type === 'FAN') {
    point.y = THREE.MathUtils.lerp(point.y, point.y * envelope.flatness, envelope.strength);
  }
  return point.add(center);
}

function applyModifiers(points, branch, authoring) {
  const origin = points[0].clone();
  for (const modifier of authoring.modifiers) {
    if (!modifier.enabled || branch.order < modifier.order_min || branch.order > modifier.order_max) continue;
    points.forEach((point, index) => {
      const t = index / Math.max(1, points.length - 1);
      if (t < modifier.start || t > modifier.end) return;
      const localT = (t - modifier.start) / Math.max(0.0001, modifier.end - modifier.start);
      const envelope = Math.sin(localT * Math.PI);
      if (modifier.type === 'BEND') point[modifier.axis.toLowerCase()] += modifier.amount * branch.length * envelope * 0.2;
      if (modifier.type === 'GRAVITY') point.z -= modifier.amount * branch.length * localT * localT * 0.2;
      if (modifier.type === 'FLATTEN') point[modifier.axis.toLowerCase()] = THREE.MathUtils.lerp(point[modifier.axis.toLowerCase()], origin[modifier.axis.toLowerCase()], clamp(Math.abs(modifier.amount), 0, 1));
      if (modifier.type === 'SCALE') point.sub(origin).multiplyScalar(Math.max(0.05, 1 + modifier.amount * localT)).add(origin);
      if (modifier.type === 'TWIST') {
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), radians(modifier.amount * 45) * localT);
        point.sub(origin).applyQuaternion(q).add(origin);
      }
      if (modifier.type === 'NOISE') {
        const wave = Math.sin((t * 7.13 + branch.id * 0.37) * Math.PI * 2);
        point[modifier.axis.toLowerCase()] += wave * modifier.amount * branch.length * envelope * 0.035;
      }
    });
  }
  return points;
}

function curvePoints(start, direction, length, segments, settings, rng, order, phase, levelRule, authoring, branchMeta) {
  const points = [];
  const directionN = direction.clone().normalize();
  const frame = tangentFrame(directionN, phase);
  const architectureGravity = settings.architecture === 'DROOPING' ? 1.7 : settings.architecture === 'UPRIGHT' ? 0.5 : 1;
  const randomA = 0.72 + rng() * 0.56;
  const randomB = rng() * Math.PI * 2;
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const base = start.clone().addScaledVector(directionN, length * t);
    const envelope = Math.sin(Math.PI * t) * length;
    const wave = Math.sin((t * settings.bend_frequency * 2 + randomB) * Math.PI);
    base.addScaledVector(frame.x, envelope * settings.bend * levelRule.bend * 0.16 * wave * randomA / (order + 1));
    base.addScaledVector(frame.y, envelope * settings.bend * levelRule.bend * 0.09 * Math.sin(t * Math.PI * 3 + phase));
    base.z -= settings.gravity * levelRule.gravity * architectureGravity * length * t * t * (0.26 + order * 0.11);
    base.z += (settings.phototropism + authoring.phenotype.tropism_bias) * length * t * t * 0.14;
    base.x += settings.wind_shape * length * t * t * (0.14 + order * 0.025);
    if (settings.environment_load === 'SNOW') base.z -= settings.environment_load_amount * length * t * t * (0.12 + order * 0.04);
    if (settings.environment_load === 'PREVAILING_WIND') base.x += settings.environment_load_amount * length * t * t * (0.16 + order * 0.03);
    if (settings.environment_load === 'CLIMBING') base.z -= settings.environment_load_amount * length * t * t * (0.2 + order * 0.05);
    points.push(constrainPoint(base, t, authoring));
  }
  return applyModifiers(points, branchMeta, authoring);
}

function sampleEditableCurve(knots, segments) {
  const points = knots.map((point) => point.isVector3 ? point.clone() : new THREE.Vector3(...point));
  if (points.length < 3) return resamplePolyline(points.map((point) => point.toArray()), segments + 1).map((point) => new THREE.Vector3(...point));
  return new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5).getPoints(Math.max(5, segments));
}

function pointOnPolyline(points, t) {
  const scaled = clamp(t, 0, 1) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const fraction = scaled - index;
  return points[index].clone().lerp(points[index + 1], fraction);
}

function tangentOnPolyline(points, t) {
  const scaled = clamp(t, 0, 1) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  return points[index + 1].clone().sub(points[Math.max(0, index)]).normalize();
}

function createSweptBranchGeometry(branch, radialSegments, settings) {
  const sampleTs = branchSampleTs(branch);
  const points = branch.sections?.length || branch.skeletonRadius ? sampleTs.map((t) => pointOnPolyline(branch.points, t)) : branch.points;
  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  let previousX = null;
  const ringFrames = [];
  for (let ring = 0; ring < points.length; ring += 1) {
    const t = sampleTs[ring];
    const tangent = ring === 0
      ? points[1].clone().sub(points[0]).normalize()
      : ring === points.length - 1
        ? points[ring].clone().sub(points[ring - 1]).normalize()
        : points[ring + 1].clone().sub(points[ring - 1]).normalize();
    let x;
    if (!previousX) x = tangentFrame(tangent, branch.phase).x;
    else {
      x = previousX.clone().sub(tangent.clone().multiplyScalar(previousX.dot(tangent))).normalize();
      if (x.lengthSq() < 1e-8) x = tangentFrame(tangent).x;
    }
    const y = new THREE.Vector3().crossVectors(tangent, x).normalize();
    previousX = x;
    ringFrames.push({ tangent, x, y });
    const section = sectionAt(branch.sections, t);
    const baseRadius = branchRadiusAt(branch, settings, t);
    for (let side = 0; side < radialSegments; side += 1) {
      const angle = side / radialSegments * Math.PI * 2 + radians(settings.twist + settings.section_roll) * t;
      const rough = 1 + settings.surface_roughness * Math.sin(angle * 3 + branch.phase * 7 + ring * 1.71);
      const lobe = settings.cross_section === 'LOBED' ? 1 + settings.lobe_strength * Math.cos(angle * settings.lobe_count) : 1;
      const groove = 1 - settings.groove_depth * Math.pow(Math.max(0, Math.cos(angle * settings.groove_count + branch.phase)), 4);
      const knot = 1 + settings.knot_strength * Math.pow(Math.max(0, Math.sin(t * Math.PI * 3 + branch.phase * 2)), 12);
      const ovalX = (settings.cross_section === 'OVAL' ? settings.oval_ratio : 1) * section.oval;
      const ovalY = 1 / ovalX;
      const offset = x.clone().multiplyScalar(Math.cos(angle) * ovalX).addScaledVector(y, Math.sin(angle) * ovalY).multiplyScalar(baseRadius * rough * lobe * groove * knot);
      offset.applyAxisAngle(tangent, radians(section.roll));
      const point = points[ring].clone().add(offset);
      positions.push(point.x, point.y, point.z);
      uvs.push((side / radialSegments + settings.bark_seam / 360 + 1) % 1, t * branch.length * settings.bark_tiling / Math.max(branch.startRadius * 12, 0.2));
      const wind = settings.wind_profile || DEFAULT_AUTHORING.wind_profile;
      const stiffness = clamp(THREE.MathUtils.lerp(wind.root_stiffness, wind.tip_stiffness, t) * (branch.windStiffness || 1), 0, 2);
      colors.push(clamp(t * (1 - stiffness * 0.72), 0, 1), clamp(branch.order / 4, 0, 1), branch.windPhase, settings.health);
    }
  }
  for (let ring = 0; ring < points.length - 1; ring += 1) {
    for (let side = 0; side < radialSegments; side += 1) {
      const next = (side + 1) % radialSegments;
      const a = ring * radialSegments + side;
      const b = ring * radialSegments + next;
      const c = (ring + 1) * radialSegments + next;
      const d = (ring + 1) * radialSegments + side;
      indices.push(a, b, c, a, c, d);
    }
  }
  const appendCap = (ring, reverse) => {
    const centerIndex = positions.length / 3;
    const center = points[ring];
    positions.push(center.x, center.y, center.z);
    uvs.push(0.5, 0.5);
    const t = ring === 0 ? 0 : 1;
    colors.push(t, clamp(branch.order / 4, 0, 1), branch.windPhase, settings.health);
    const ringStart = ring * radialSegments;
    for (let side = 0; side < radialSegments; side += 1) {
      const next = (side + 1) % radialSegments;
      if (reverse) indices.push(centerIndex, ringStart + next, ringStart + side);
      else indices.push(centerIndex, ringStart + side, ringStart + next);
    }
  };
  appendCap(0, true);
  appendCap(points.length - 1, false);
  const geometry = new THREE.BufferGeometry();
  geometry.userData.radiusRings=points.map((p,i)=>({t:sampleTs[i],center:p.toArray(),offset:i*radialSegments,count:radialSegments}));
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function adaptiveCurvePoints(points, strength) {
  if (points.length < 3 || strength <= 0) return points.map((point) => point.clone());
  const result = [points[0].clone()];
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const before = points[Math.max(0, index - 1)];
    const after = points[Math.min(points.length - 1, index + 2)];
    const a = current.clone().sub(before).normalize();
    const b = after.clone().sub(next).normalize();
    const curvature = 1 - clamp(a.dot(b), -1, 1);
    const subdivisions = curvature * strength > 0.16 ? 3 : curvature * strength > 0.045 ? 2 : 1;
    for (let step = 1; step <= subdivisions; step += 1) result.push(current.clone().lerp(next, step / subdivisions));
  }
  return result;
}

function childDirection(parentTangent, angle, azimuth, settings, rng) {
  const frame = tangentFrame(parentTangent, azimuth);
  const radial = frame.x;
  const direction = parentTangent.clone().multiplyScalar(Math.cos(angle)).addScaledVector(radial, Math.sin(angle));
  direction.z += settings.phototropism * 0.26;
  if (settings.architecture === 'DROOPING') direction.z -= 0.18 + rng() * 0.16;
  if (settings.architecture === 'UPRIGHT') direction.z += 0.18;
  if (settings.architecture === 'LAYERED') direction.z *= 0.72;
  return direction.normalize();
}

function damageAllowsBranch(settings, rng, order, childIndex) {
  if (settings.damage_mode === 'INTACT' || settings.damage_amount <= 0) return true;
  const risk = settings.damage_amount * (settings.damage_mode === 'STORM' ? 0.48 : 0.28);
  if (settings.damage_mode === 'PRUNED' && order === 1) return childIndex % 3 !== 1 || rng() > risk;
  return rng() > risk * (0.55 + order * 0.2);
}

export function branchInstanceFrame(instance, parent, settings) {
  const tangent = parent ? tangentOnPolyline(parent.points, instance.attach) : new THREE.Vector3(0, 0, 1);
  const position = parent ? pointOnPolyline(parent.points, instance.attach) : new THREE.Vector3(...(instance.frame?.position || [0, 0, 0]));
  let direction = childDirection(tangent, radians(instance.angle), radians(instance.azimuth), settings, createRng(instance.seed));
  if (instance.frame) {
    direction = new THREE.Vector3(...instance.frame.direction);
    if (parent) {
      const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...instance.frame.parent_tangent).normalize(), tangent);
      direction.applyQuaternion(rotation);
      if (instance.frame.parent_position) position.add(new THREE.Vector3(...instance.frame.position).sub(new THREE.Vector3(...instance.frame.parent_position)).applyQuaternion(rotation));
    }
  }
  return { position, direction, scale: instance.scale * (1 + (createRng(instance.seed)() * 2 - 1) * instance.variation) };
}

function buildBranchGraph(settings, state, rawAuthoring, hadInstances = false) {
  const authoring = normalizeAuthoring(rawAuthoring, settings.seed);
  const branches = [];
  const maxLevel = Math.max(1, settings.branch_levels);
  const maximumBranches = authoring.recipe.tags.includes('DENSE_AUTHORED_SAMPLE_ASSEMBLY') ? 11000
    : authoring.recipe.tags.includes('DENSE_AUTHORED_CROWN') ? 3200
    : authoring.vine || authoring.branch_shape || authoring.branch_instances.length || hadInstances ? 2200
      : Math.max(24, Math.min(520, authoring.root_count * (42 + settings.child_count * 24)));
  let nextId = 0;
  const addBranch = ({ stableId, parentId = -1, parentT = 0, order = 0, start, direction, length, radius, phase = 0, manual = false, spawnChildren = true, generator = null, sourceRecord = null, instanceId = '', junction = null }) => {
    if (branches.length >= maximumBranches) return null;
    if (authoring.topology.suppressed.includes(stableId)) return null;
    const override = authoring.overrides[stableId];
    if (override?.hidden) return null;
    const levelRule = authoring.level_rules[order] || authoring.level_rules.at(-1);
    if (!levelRule.enabled && !sourceRecord) return null;
    const id = nextId++;
    const segmentBase = Math.max(5, Math.round(settings.main_segments * Math.pow(0.82, order)));
    const dominanceScale = order === 0 ? 1 + authoring.phenotype.apical_dominance * 0.18 : 1 - authoring.phenotype.apical_dominance * order * 0.08;
    const effectiveLength = Math.max(0.035, length * (override?.length || 1) * (sourceRecord ? 1 : levelRule.length * authoring.phenotype.individual_scale * dominanceScale));
    // Sample radii are already calibrated. A per-segment 1.2 mm floor after
    // instance scaling can make small child shoots wider than their parent.
    const minimumRadius = sourceRecord && (sourceRecord.localBundle || authoring.recipe.tags.includes('SAMPLE_FOLIAGE_FROM_LIBRARY')) ? 0.00001 : 0.0012;
    const effectiveRadius = Math.max(minimumRadius, radius * (sourceRecord ? 1 : levelRule.radius) * (override?.radius || 1));
    const endRadius = sourceRecord ? sourceRecord.end_radius * (override?.radius || 1) : Math.max(settings.tip_radius * Math.pow(0.76, order), effectiveRadius * (0.18 + order * 0.04));
    const branchStart = start.clone().add(new THREE.Vector3(...(override?.offset || [0, 0, 0])));
    const branchDirection = direction.clone();
    if (override?.rotation) branchDirection.applyEuler(new THREE.Euler(...override.rotation.map(radians), 'XYZ')).normalize();
    const shapeRng = createRng(stableSeed(authoring.seeds.shape, stableId));
    const branchMeta = { id, stableId, order, length: effectiveLength };
    let controlPoints = null;
    let points = null;
    if (override?.curve_knots?.length > 1) {
      controlPoints = override.curve_knots.map((point) => new THREE.Vector3(...point));
      points = override.curve_samples?.map((point) => new THREE.Vector3(...point)) || sampleEditableCurve(controlPoints, segmentBase);
      if (parentId >= 0 && authoring.curve_editor.affect_children) {
        const parent = branches.find((item) => item.id === parentId);
        const frame = override.curve_parent_frame;
        const origin = controlPoints[0].clone();
        const rotation = frame?.parent === parent?.stableId
          ? new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...frame.tangent).normalize(), tangentOnPolyline(parent.points, parentT))
          : new THREE.Quaternion();
        if (!frame || frame.parent === parent?.stableId) {
          [...controlPoints, ...points].forEach((point) => point.sub(origin).applyQuaternion(rotation).add(branchStart));
        }
      }
    } else if (override?.locked && override.frozen_points?.length > 1) {
      points = override.frozen_points.map((point) => new THREE.Vector3(...point));
      controlPoints = points.map((point) => point.clone());
    } else if (sourceRecord) {
      const origin = new THREE.Vector3(...sourceRecord.points[0]);
      const rotation = sourceRecord.parentRotation || new THREE.Quaternion();
      const localRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(override?.rotation || [0, 0, 0]).map(radians)));
      const transform = (point) => new THREE.Vector3(...point).sub(origin).multiplyScalar(override?.length || 1).applyQuaternion(rotation).applyQuaternion(localRotation).add(branchStart);
      points = sourceRecord.points.map(transform);
      controlPoints = sourceRecord.knots.map(transform);
    } else {
      points = curvePoints(branchStart, branchDirection, effectiveLength, segmentBase, settings, shapeRng, order, phase, { ...levelRule, bend: levelRule.bend * (override?.bend || 1) }, authoring, branchMeta);
      controlPoints = resamplePolyline(points.map((point) => point.toArray()), authoring.curve_editor.knot_count).map((point) => new THREE.Vector3(...point));
    }
    const profileSet = generator?.profiles || (authoring.generation_rules[order]?.use_profiles ? authoring.generation_rules[order].profiles : authoring.profiles);
    const connection = override?.junction || junction;
    const parent = branches.find((b) => b.id === parentId);
    if (connection?.enabled && parent && !sourceRecord?.surfaceNormals) {
      const count = Math.max(points.length, Math.min(256, Math.ceil(effectiveLength / connection.length * 6) + 1));
      const original = points; points = Array.from({ length: count }, (_, i) => pointOnPolyline(original, i / (count - 1)));
      const tangent = tangentOnPolyline(parent.points, parentT);
      const origin = points[0].clone();
      const blend = (p) => { const delta = p.clone().sub(origin); const distance = delta.length(); const w = Math.pow(Math.max(0, 1 - distance / connection.length), 2) * connection.align; p.lerp(origin.clone().addScaledVector(tangent, distance), w); };
      if (!override?.curve_knots?.length) [...points, ...controlPoints].forEach(blend);
    }
    const branch = {
      id, stableId, parentId, parentT, order, points, controlPoints, length: effectiveLength, startRadius: effectiveRadius,
      endRadius, radiusProfile: override?.radius_profile || sourceRecord?.radius_profile || profileSet.radius_taper, profileSet, generatorId: generator?.id || `LEVEL_${order}`, generator, phase, windPhase: createRng(stableSeed(authoring.seeds.shape, `${stableId}:wind`))(), windStiffness: override?.wind_stiffness || 1, children: [], elementIndex: -1, instanceId,
      manual, localBundle: sourceRecord?.localBundle === true, vineRole: sourceRecord?.role || '', surfaceNormals: sourceRecord?.surfaceNormals || null, override: override || null, sections: override?.sections || sourceRecord?.sections || [], junction: connection,
      parentRadius: parent ? branchRadiusAt(parent, settings, parentT) : 0,
      // Runtime ownership survives derived geometry and symmetry copies. It is
      // separate from instanceId, which editing tools can intentionally clear.
      unitOwner: instanceId || parent?.unitOwner || '',
    };
    branches.push(branch);
    if (parentId >= 0) branches.find((item) => item.id === parentId)?.children.push(id);
    if (!spawnChildren || order + 1 >= maxLevel) return branch;
    const childRule = authoring.level_rules[order + 1];
    if (!childRule?.enabled) return branch;
    const generation = authoring.generation_rules[order + 1];
    if (!generation.enabled) return branch;
    if (generation.mode !== 'LEGACY') { spawnGroup(branch, generation, true); return branch; }
    const childProfiles = generation.use_profiles ? generation.profiles : authoring.profiles;
    const competitionScale = 1 - authoring.phenotype.competition * (0.18 + order * 0.09);
    const decayCount = Math.max(0, Math.round(settings.child_count * Math.pow(settings.child_decay, order) * childRule.count * (1 + settings.regrowth * 0.35) * competitionScale));
    const topologyRng = createRng(stableSeed(authoring.seeds.topology, stableId));
    const damageRng = createRng(stableSeed(authoring.seeds.damage, stableId));
    for (let childIndex = 0; childIndex < decayCount && branches.length < maximumBranches; childIndex += 1) {
      if (!damageAllowsBranch(settings, damageRng, order + 1, childIndex)) continue;
      if (damageRng() < settings.dead_tip_ratio * (0.12 + order * 0.13)) continue;
      const span = Math.max(0.04, 1 - settings.start_clearance - settings.end_clearance);
      let t = settings.start_clearance + span * ((childIndex + 1) / (decayCount + 1));
      t += (topologyRng() - 0.5) * span * settings.asymmetry * 0.28;
      t = clamp(t, 0.08, 0.96);
      if (topologyRng() > Math.min(1, evaluateProfile(childProfiles.branch_density, t, 1))) continue;
      const attach = pointOnPolyline(points, t);
      const tangent = tangentOnPolyline(points, t);
      const angle = radians((settings.branch_angle + childRule.angle) * evaluateProfile(childProfiles.branch_angle, t, 1) + (topologyRng() - 0.5) * settings.angle_variation * 2);
      const phaseId = stableId.includes('.G_') ? stableSeed(authoring.seeds.topology, `${stableId}:phase`) % 997 : id;
      let azimuth = radians(settings.phyllotaxis_angle * (childIndex + phaseId * 0.37)) + phase;
      if (settings.architecture === 'FORKED' && order === 0) azimuth = childIndex % 2 ? Math.PI * 0.48 : -Math.PI * 0.48;
      const childDir = childDirection(tangent, angle, azimuth, settings, topologyRng);
      let childLength = effectiveLength * settings.child_length_ratio * evaluateProfile(childProfiles.branch_length, t, 1) * (0.72 + topologyRng() * 0.52) * (1 - t * 0.22);
      if (settings.damage_mode === 'PRUNED') childLength *= 1 - settings.damage_amount * (0.18 + damageRng() * 0.46);
      const childRadius = effectiveRadius * settings.child_radius_ratio * (0.82 + topologyRng() * 0.22) * (1 - t * 0.3);
      addBranch({ stableId: `${stableId}.${childIndex + 1}`, parentId: id, parentT: t, order: order + 1, start: attach, direction: childDir, length: childLength, radius: childRadius, phase: azimuth });
    }
    return branch;
  };
  function spawnGroup(parent, group, base = false) {
    if (!group.enabled || parent.order + 1 >= maxLevel) return;
    const childRule = authoring.level_rules[parent.order + 1];
    const rng = createRng(stableSeed(authoring.seeds.topology, `${parent.stableId}:${group.id}`));
    const damageRng = createRng(stableSeed(authoring.seeds.damage, `${parent.stableId}:${group.id}`));
    generationSlots(parent.points, group).forEach(({ t, azimuth }, index) => {
      if (!damageAllowsBranch(settings, damageRng, parent.order + 1, index)) return;
      const profiles = base && !group.use_profiles ? authoring.profiles : group.profiles;
      if (rng() > Math.min(1, evaluateProfile(profiles.branch_density, t))) return;
      const tangent = tangentOnPolyline(parent.points, t);
      const angle = (settings.branch_angle + childRule.angle + group.angle) * evaluateProfile(profiles.branch_angle, t) + (rng() * 2 - 1) * group.angle_variation;
      const direction = childDirection(tangent, radians(clamp(angle, 1, 175)), azimuth + parent.phase, settings, rng);
      const length = parent.length * settings.child_length_ratio * group.length * evaluateProfile(profiles.branch_length, t) * (1 + (rng() * 2 - 1) * group.length_variation);
      const radius = parent.startRadius * settings.child_radius_ratio * group.radius * (1 + (rng() * 2 - 1) * group.radius_variation);
      addBranch({ stableId: base ? `${parent.stableId}.${index + 1}` : `${parent.stableId}.G_${group.id}.${index + 1}`,
        parentId: parent.id, parentT: t, order: parent.order + 1, start: pointOnPolyline(parent.points, t), direction,
        length, radius, phase: azimuth + parent.phase, generator: base ? null : group });
    });
  }
  const rootDirection = architectureDirection(settings);
  const rootFrame = tangentFrame(rootDirection);
  for (let rootIndex = 0; rootIndex < (authoring.branch_shape || authoring.vine ? 0 : authoring.root_count); rootIndex += 1) {
    const azimuth = rootIndex / authoring.root_count * Math.PI * 2;
    const spread = radians(authoring.root_spread) * (authoring.root_count === 1 ? 0 : 0.55 + rootIndex / Math.max(1, authoring.root_count - 1) * 0.45);
    const radial = rootFrame.x.clone().applyAxisAngle(rootDirection, azimuth);
    const direction = rootDirection.clone().multiplyScalar(Math.cos(spread)).addScaledVector(radial, Math.sin(spread)).normalize();
    const start = radial.clone().multiplyScalar(authoring.root_radial_offset);
    addBranch({ stableId: `R${rootIndex + 1}`, start, direction, length: settings.length, radius: settings.base_radius * state.branchScale, phase: azimuth });
  }
  function appendShape(records, prefix = '', installedParent = null, attach = 0, junction = null) {
    const created = new Map();
    for (const record of records) {
      const parent = record.parent ? created.get(record.parent) : installedParent;
      if (record.parent && !parent) continue;
      const parentT = record.parent ? record.attach : attach;
      const sourceParent = records.find((b) => b.id === record.parent);
      const parentRotation = sourceParent && authoring.curve_editor.affect_children ? new THREE.Quaternion().setFromUnitVectors(sampleTangent(sourceParent.points.map((p) => new THREE.Vector3(...p)), parentT), tangentOnPolyline(parent.points, parentT)) : new THREE.Quaternion();
      const start = new THREE.Vector3(...record.points[0]);
      if (sourceParent && authoring.curve_editor.affect_children) start.sub(pointOnPolyline(sourceParent.points.map((p) => new THREE.Vector3(...p)), parentT)).applyQuaternion(parentRotation).add(pointOnPolyline(parent.points, parentT));
      const branch = addBranch({ stableId: prefix ? `${prefix}.${record.id}` : record.id, parentId: parent?.id ?? -1, parentT,
        order: parent ? Math.min(3, parent.order + 1) : 0, start, direction: sampleTangent(record.points.map((p) => new THREE.Vector3(...p)), 0),
        length: record.length, radius: record.start_radius, sourceRecord: { ...record, parentRotation }, instanceId: prefix, spawnChildren: false, junction: record.parent ? null : junction });
      if (branch) created.set(record.id, branch);
    }
  }
  if (authoring.vine && authoring.vegetation.enabled && authoring.vegetation.mode === 'SINGLE') { /* Dedicated plant composition owns this preview. */ }
  else if (authoring.vine && authoring.surface_growth?.enabled) {
    const s=authoring.surface_growth,mixed=authoring.vegetation.enabled&&authoring.vegetation.mode==='REGION';
    appendShape(createSurfaceGrowth(mixed?{...s,region:{...s.region,coverage:s.region.coverage*authoring.vegetation.weights.IVY},regions:(s.regions||[]).map(r=>({...r,coverage:r.coverage*authoring.vegetation.weights.IVY}))}:s,authoring.vine,authoring.seeds.shape).branches);
  }
  else if (authoring.branch_shape) appendShape(authoring.branch_shape.branches);
  else if (authoring.vine) appendShape((authoring.flowering.enabled ? createFloweringShape(authoring.vine, authoring.seeds.shape, authoring.flowering.style) : createVineShape(authoring.vine, authoring.seeds.shape)).branches);
  const addManual = (manual) => {
    if (branches.some((b) => b.stableId === manual.id)) return;
    const parent = branches.find((branch) => branch.stableId === manual.parent);
    if (!parent) return;
    const start = pointOnPolyline(parent.points, manual.attach);
    const tangent = tangentOnPolyline(parent.points, manual.attach);
    const direction = childDirection(tangent, radians(manual.angle), radians(manual.azimuth), settings, createRng(stableSeed(authoring.seeds.shape, manual.id)));
    if (manual.local_bundle) {
      if (parent.unitOwner || parent.instanceId) return;
      const sourceRecord = localBranchShape(parent, manual, settings);
      addBranch({ stableId: manual.id, parentId: parent.id, parentT: manual.attach, order: Math.min(3, parent.order + 1), start, direction,
        length: sourceRecord.length, radius: sourceRecord.start_radius, sourceRecord, manual: true, spawnChildren: false });
      return;
    }
    addBranch({ stableId: manual.id, parentId: parent.id, parentT: manual.attach, order: Math.min(3, parent.order + 1), start, direction, length: manual.length, radius: manual.radius, phase: radians(manual.azimuth), manual: true, spawnChildren: false });
  };
  authoring.manual_branches.forEach(addManual);
  [...authoring.generator_groups].sort((a, b) => a.order - b.order).forEach((group) => {
    branches.filter((branch) => !branch.localBundle && branch.order === group.order - 1 && (group.parent_group === 'ANY' || branch.generatorId === group.parent_group)).forEach((parent) => spawnGroup(parent, group));
  });
  for (const instance of authoring.branch_instances) {
    const shape = resolveInstanceShape(instance, authoring.branch_library);
    const parent = branches.find((b) => b.stableId === instance.parent);
    if (!shape || (instance.parent && !parent)) continue;
    const { position, direction, scale } = branchInstanceFrame(instance, parent, settings);
    const records = transformBranchShape(shape, position, direction, scale, instance.roll);
    records.forEach((r) => { r.start_radius *= instance.radius_scale; r.end_radius *= instance.radius_scale; });
    const startIndex = branches.length;
    appendShape(records, instance.id, parent, instance.attach, instance.junction);
    for (const branch of branches.slice(startIndex)) branch.shootRole = instance.shootRole;
  }
  authoring.manual_branches.forEach(addManual);
  const translateSubtree = (rootId, delta) => {
    const queue = [rootId];
    while (queue.length) {
      const currentId = queue.shift();
      const current = branches.find((branch) => branch.id === currentId);
      if (!current) continue;
      current.points.forEach((point) => point.add(delta));
      current.controlPoints?.forEach((point) => point.add(delta));
      queue.push(...current.children);
    }
  };
  Object.entries(authoring.topology.reparent).forEach(([childStableId, parentStableId]) => {
    const child = branches.find((branch) => branch.stableId === childStableId);
    const parent = branches.find((branch) => branch.stableId === parentStableId);
    if (!child || !parent || child.id === parent.id || parent.stableId.startsWith(`${child.stableId}.`)) return;
    const previousParent = branches.find((branch) => branch.id === child.parentId);
    if (previousParent) previousParent.children = previousParent.children.filter((id) => id !== child.id);
    const attach = authoring.topology.attach[childStableId] ?? 0.72;
    const target = pointOnPolyline(parent.points, attach).add(new THREE.Vector3(...(child.override?.offset || [0, 0, 0])));
    const savedFrame = child.override?.curve_parent_frame;
    if (savedFrame?.parent === parent.stableId && authoring.curve_editor.affect_children) {
      const origin = child.points[0].clone();
      const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...savedFrame.tangent).normalize(), tangentOnPolyline(parent.points, attach));
      const rotateSubtree = (branch) => {
        [...branch.points, ...branch.controlPoints].forEach((point) => point.sub(origin).applyQuaternion(rotation).add(origin));
        branch.children.forEach((id) => { const item = branches.find((candidate) => candidate.id === id); if (item) rotateSubtree(item); });
      };
      rotateSubtree(child);
    }
    const delta = target.clone().sub(child.points[0]);
    translateSubtree(child.id, delta);
    child.parentId = parent.id;
    child.parentT = attach;
    parent.children.push(child.id);
    const updateOrders = (branch, order) => {
      branch.order = Math.min(3, order);
      branch.children.forEach((id) => {
        const descendant = branches.find((candidate) => candidate.id === id);
        if (descendant) updateOrders(descendant, branch.order + 1);
      });
    };
    updateOrders(child, parent.order + 1);
  });
  applySculptLayers(branches, authoring.sculpt_layers, authoring.overrides);
  applyProceduralGrowth(branches, authoring);
  applyBranchSymmetry(branches, authoring.symmetry_groups);
  applySkeletonThickness(branches, authoring.workbench, settings);
  for(const b of branches)if(b.radiusEdits?.length)b.radiusSettings=settings;
  return branches;
}

export function createDefaultLeafGeometry(aspect = 0.46) {
  const half = clamp(aspect, 0.04, 1.5) * 0.5;
  const positions = [
    0, 0, 0, -half * 0.62, 0.24, 0.015, -half, 0.52, 0.025,
    -half * 0.56, 0.8, 0.012, 0, 1, 0,
    half * 0.56, 0.8, 0.012, half, 0.52, 0.025, half * 0.62, 0.24, 0.015,
    0, 0.48, 0.07,
  ];
  const uvs = [0.5, 0, 0.2, 0.24, 0, 0.52, 0.22, 0.8, 0.5, 1, 0.78, 0.8, 1, 0.52, 0.8, 0.24, 0.5, 0.48];
  const indices = [0, 1, 8, 1, 2, 8, 2, 3, 8, 3, 4, 8, 4, 5, 8, 5, 6, 8, 6, 7, 8, 7, 0, 8];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.userData.sourceName = '内置阔叶';
  return geometry;
}

function objIndex(value, count) {
  const parsed = Number(value);
  return parsed < 0 ? count + parsed : parsed - 1;
}

export function parseObjLeaf(text, sourceName = 'ImportedLeaf.obj', sourceAxis = 'Y') {
  const vertices = [];
  const normals = [];
  const texcoords = [];
  const outputPositions = [];
  const outputNormals = [];
  const outputUvs = [];
  const indices = [];
  const vertexMap = new Map();
  const lines = String(text || '').split(/\r?\n/);
  const mapPosition = (position) => {
    const [x, y, z] = position;
    if (sourceAxis === 'X') return [-y, x, z];
    if (sourceAxis === 'Z') return [x, z, -y];
    return [x, y, z];
  };
  const getOutputIndex = (token) => {
    if (vertexMap.has(token)) return vertexMap.get(token);
    const parts = token.split('/');
    const vi = objIndex(parts[0], vertices.length);
    if (!vertices[vi]) throw new Error(`OBJ 顶点索引无效：${token}`);
    const mapped = mapPosition(vertices[vi]);
    outputPositions.push(...mapped);
    if (parts[1]) {
      const uv = texcoords[objIndex(parts[1], texcoords.length)] || [0, 0];
      outputUvs.push(uv[0], uv[1]);
    } else outputUvs.push(0, 0);
    if (parts[2]) {
      const normal = normals[objIndex(parts[2], normals.length)] || [0, 0, 1];
      outputNormals.push(...mapPosition(normal));
    }
    const index = outputPositions.length / 3 - 1;
    vertexMap.set(token, index);
    return index;
  };
  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;
    const parts = line.split(/\s+/);
    if (parts[0] === 'v' && parts.length >= 4) vertices.push(parts.slice(1, 4).map(Number));
    else if (parts[0] === 'vn' && parts.length >= 4) normals.push(parts.slice(1, 4).map(Number));
    else if (parts[0] === 'vt' && parts.length >= 3) texcoords.push(parts.slice(1, 3).map(Number));
    else if (parts[0] === 'f' && parts.length >= 4) {
      const face = parts.slice(1).map(getOutputIndex);
      for (let index = 1; index < face.length - 1; index += 1) indices.push(face[0], face[index], face[index + 1]);
    }
  });
  if (outputPositions.length < 9 || indices.length < 3) throw new Error('OBJ 中没有可用的三角网格');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(outputPositions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(outputUvs, 2));
  if (outputNormals.length === outputPositions.length) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(outputNormals, 3));
  geometry.setIndex(indices);
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const size = box.getSize(new THREE.Vector3());
  const length = Math.max(size.y, 1e-6);
  const centerX = (box.min.x + box.max.x) * 0.5;
  const centerZ = (box.min.z + box.max.z) * 0.5;
  const position = geometry.getAttribute('position');
  for (let index = 0; index < position.count; index += 1) {
    position.setXYZ(index, (position.getX(index) - centerX) / length, (position.getY(index) - box.min.y) / length, (position.getZ(index) - centerZ) / length);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.userData.sourceName = sourceName;
  geometry.userData.originalSize = { x: size.x, y: size.y, z: size.z };
  return geometry;
}

export function serializeGeometry(geometry) {
  const read = (name) => geometry.getAttribute(name) ? Array.from(geometry.getAttribute(name).array) : null;
  return {
    source_name: geometry.userData.sourceName || 'LeafMesh',
    position: read('position'), normal: read('normal'), uv: read('uv'),
    index: geometry.index ? Array.from(geometry.index.array) : null,
  };
}

export function deserializeGeometry(data) {
  if (!data?.position?.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.position, 3));
  if (data.normal?.length === data.position.length) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normal, 3));
  if (data.uv?.length === data.position.length / 3 * 2) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
  if (data.index?.length) geometry.setIndex(data.index);
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.userData.sourceName = data.source_name || 'ProjectLeafMesh';
  return geometry;
}

// Use the same calibration/attachment code as evaluated leaves, in a fixed
// local frame. Exporters must not infer a prototype from an arbitrary instance.
export function calibratedLeafGeometry(source, settings, calibration = {}) {
  const arrays = { positions: [], normals: [], uvs: [], colors: [], elementIndices: [], indices: [] };
  transformLeafGeometry(source, { position: new THREE.Vector3(), direction: new THREE.Vector3(0, 1, 0),
    normal: new THREE.Vector3(0, 0, 1), twist: 0, scale: 1, phase: 0, random: 0 },
    { ...settings, petiole_length: 0 }, 0, arrays, calibration);
  return leafArraysGeometry(arrays);
}

function transformLeafGeometry(source, placement, settings, elementIndex, arrays, calibration = {}) {
  const sourcePosition = source.getAttribute('position');
  const sourceNormal = source.getAttribute('normal');
  const sourceUv = source.getAttribute('uv');
  const sourceIndex = source.index;
  const sourceBase = !source.userData.isDefault && source.userData.sourceName ? plantAttachmentBase(source) : new THREE.Vector3();
  const leafDirection = placement.direction.clone().normalize();
  const helper = Math.abs(leafDirection.z) > 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const localX = new THREE.Vector3().crossVectors(leafDirection, placement.normal || helper).normalize();
  if (localX.lengthSq() < 1e-10) localX.crossVectors(leafDirection, helper).normalize();
  const localZ = new THREE.Vector3().crossVectors(localX, leafDirection).normalize();
  const twistQ = new THREE.Quaternion().setFromAxisAngle(leafDirection, placement.twist);
  localX.applyQuaternion(twistQ);
  localZ.applyQuaternion(twistQ);
  const matrix = new THREE.Matrix4().makeBasis(localX, leafDirection, localZ);
  const normalMatrix = new THREE.Matrix3().setFromMatrix4(matrix);
  const leafOrigin = placement.position.clone().addScaledVector(leafDirection, settings.petiole_length);
  if (settings.petiole_length > 0.0001 || placement.canopyRoot) {
    const stemOffset = arrays.positions.length / 3;
    const stemRadius = placement.canopyRoot ? .00065 : Math.max(0.00035, placement.scale * 0.012);
    const stemEnd=leafOrigin, stemStart=placement.canopyRoot||placement.position, stemAxis=stemEnd.clone().sub(stemStart).normalize();
    const stemX=placement.canopyRoot?new THREE.Vector3().crossVectors(stemAxis,Math.abs(stemAxis.z)>.9?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1)).normalize():localX;
    const stemZ=placement.canopyRoot?new THREE.Vector3().crossVectors(stemX,stemAxis).normalize():localZ;
    // An imported atlas can contain both green leaves and pink flowers.
    // Sample the leaf's attachment color instead of stretching the atlas
    // across the small generated connector.
    let attachmentUv = null;
    if (sourceUv && !source.userData.isDefault) {
      let base = 0;
      for (let i = 1; i < sourcePosition.count; i++) if (sourcePosition.getY(i) < sourcePosition.getY(base)) base = i;
      attachmentUv = [sourceUv.getX(base), sourceUv.getY(base)];
    }
    for (let ring = 0; ring < 2; ring += 1) {
      const center = stemStart.clone().lerp(stemEnd,ring);
      for (let side = 0; side < 4; side += 1) {
        const angle = side / 4 * Math.PI * 2;
        const radial = stemX.clone().multiplyScalar(Math.cos(angle)).addScaledVector(stemZ, Math.sin(angle));
        const vertex = center.clone().addScaledVector(radial, stemRadius);
        arrays.positions.push(vertex.x, vertex.y, vertex.z);
        arrays.normals.push(radial.x, radial.y, radial.z);
        arrays.uvs.push(attachmentUv ? attachmentUv[0] : side / 4, attachmentUv ? attachmentUv[1] : ring);
        arrays.colors.push(ring, placement.phase, 0.35, placement.random);
        arrays.elementIndices.push(elementIndex);
      }
    }
    for (let side = 0; side < 4; side += 1) {
      const next = (side + 1) % 4;
      arrays.indices.push(stemOffset + side, stemOffset + next, stemOffset + 4 + next, stemOffset + side, stemOffset + 4 + next, stemOffset + 4 + side);
    }
  }
  const vertexOffset = arrays.positions.length / 3;
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const calibrationScale = clamp(number(calibration.scale, 1), 0.01, 20);
  const calibrationRotation = radians(number(calibration.rotation, 0));
  const calibrationQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), calibrationRotation);
  const calibrationFlip = calibration.flip ? -1 : 1;
  for (let index = 0; index < sourcePosition.count; index += 1) {
    point.set(sourcePosition.getX(index), sourcePosition.getY(index), sourcePosition.getZ(index)).sub(sourceBase);
    point.x *= calibrationFlip;
    point.applyQuaternion(calibrationQuaternion).multiplyScalar(calibrationScale);
    point.x *= placement.scale * settings.leaf_aspect / Math.max(0.04, source.userData.isDefault ? settings.leaf_aspect : 1);
    point.y *= placement.scale;
    point.z *= placement.scale;
    point.applyMatrix4(matrix).add(leafOrigin);
    arrays.positions.push(point.x, point.y, point.z);
    if (sourceNormal) normal.set(sourceNormal.getX(index) * calibrationFlip, sourceNormal.getY(index), sourceNormal.getZ(index)).applyQuaternion(calibrationQuaternion).applyMatrix3(normalMatrix).normalize();
    else normal.copy(localZ);
    arrays.normals.push(normal.x, normal.y, normal.z);
    arrays.uvs.push(sourceUv ? sourceUv.getX(index) : 0, sourceUv ? sourceUv.getY(index) : 0);
    const flexibility = clamp(sourcePosition.getY(index), 0, 1);
    arrays.colors.push(flexibility, placement.phase, clamp(settings.wind_profile?.leaf_flutter ?? 1, 0, 1), placement.random);
    arrays.elementIndices.push(elementIndex);
  }
  const indexCount = sourceIndex ? sourceIndex.count : sourcePosition.count;
  for (let index = 0; index < indexCount; index += 1) arrays.indices.push(vertexOffset + (sourceIndex ? sourceIndex.getX(index) : index));
}

function spatialCell(position, size) {
  return [Math.floor(position.x / size), Math.floor(position.y / size), Math.floor(position.z / size)];
}

function spatialKey(cell) {
  return cell.join(',');
}

function isLeafPositionAvailable(occupied, position, spacing) {
  const cell = spatialCell(position, spacing);
  for (let x = -1; x <= 1; x += 1) {
    for (let y = -1; y <= 1; y += 1) {
      for (let z = -1; z <= 1; z += 1) {
        const nearby = occupied.get(spatialKey([cell[0] + x, cell[1] + y, cell[2] + z]));
        if (nearby?.some((candidate) => candidate.distanceToSquared(position) < spacing * spacing)) return false;
      }
    }
  }
  const key = spatialKey(cell);
  if (!occupied.has(key)) occupied.set(key, []);
  occupied.get(key).push(position.clone());
  return true;
}

function pointInsideFoliageMask(position, mask) {
  const center = new THREE.Vector3(...mask.center);
  if (mask.shape === 'BOX') {
    return Math.abs(position.x - center.x) <= mask.size[0] * 0.5
      && Math.abs(position.y - center.y) <= mask.size[1] * 0.5
      && Math.abs(position.z - center.z) <= mask.size[2] * 0.5;
  }
  return position.distanceToSquared(center) <= mask.radius * mask.radius;
}

function foliageMasksAllow(position, stableId, authoring, seed = authoring.seeds.foliage) {
  if (authoring.__sampleWorldFilter && !authoring.__sampleWorldFilter(position,stableId)) return false;
  const includes = authoring.foliage_masks.filter((mask) => mask.mode === 'INCLUDE');
  if (includes.length && !includes.some((mask) => pointInsideFoliageMask(position, mask))) return false;
  return !authoring.foliage_masks.some((mask) => {
    if (mask.mode !== 'EXCLUDE' || !pointInsideFoliageMask(position, mask)) return false;
    return createRng(stableSeed(seed, `${stableId}:${mask.id}`))() <= mask.strength;
  });
}

function leafPlacements(branches, settings, state, rng, authoring) {
  if (state.leafDensity <= 0 || settings.max_leaves <= 0) return [];
  const placements = [];
  const occupied = new Map();
  const removed = new Set(authoring.leaf_edits.removed);
  const spacing = Math.max(0.006, settings.leaf_min_spacing);
  const terminalOrder = Math.max(0, Math.max(...branches.map((branch) => branch.order)) - 1);
  const instanceFoliageOnly = authoring.recipe.tags.includes('FOLIAGE_ON_INSTANCES_ONLY');
  const irregularShootFoliage = authoring.recipe.tags.includes('IRREGULAR_SHOOT_FOLIAGE');
  const instanceLeafAsset = new Map(authoring.branch_instances.map((instance) => [instance.id, resolveInstanceAsset(instance, authoring.branch_library)]));
  const leafAssetFor = (branch) => branch.instanceId ? instanceLeafAsset.get(branch.instanceId) : null;
  const addPlacement = (branch, t, azimuth, scaleBias = 1, stableId = '', source = -1, layer = null) => {
    if (layer && (authoring.foliage_range.start > 0 || authoring.foliage_range.end < 1)) {
      const first = Math.max(layer.start, settings.leaf_zone_start, authoring.foliage_range.start), last = Math.min(layer.end, authoring.foliage_range.end);
      if (last <= first) return;
      t = clamp(t, first, last);
    }
    if (placements.length >= settings.max_leaves) return;
    if (removed.has(stableId)) return;
    if (rng() < settings.damage_amount * 0.22 && settings.damage_mode !== 'INTACT') return;
    const tangent = tangentOnPolyline(branch.points, t);
    const frame = tangentFrame(tangent, azimuth);
    const radial = frame.x;
    const position = pointOnPolyline(branch.points, t);
    // Vine and built-in tree units already contain a stalk. The petiole begins
    // inside the parent branch, rather than at a floating clearance offset.
    if (!authoring.vine && authoring.foliage_unit.mode === 'SINGLE' && !authoring.recipe.tags.includes('REAL_TREE_LEAVES')) position.addScaledVector(radial, branch.endRadius + settings.branch_clearance + settings.leaf_scale * 0.035);
    if (!foliageMasksAllow(position, stableId, authoring)) return;
    if (settings.collision_avoidance && !isLeafPositionAvailable(occupied, position, spacing)) return;
    const outward = radial.multiplyScalar(settings.leaf_outward);
    const direction = tangent.clone().multiplyScalar(0.44).add(outward);
    const layerLight = layer?.light_min || 0;
    direction.z += 0.16 + Math.max(settings.leaf_light_response, layerLight) * 0.28 - settings.leaf_droop * (0.36 + rng() * 0.3);
    if (layer?.type === 'DEAD_LEAF') direction.z -= 0.42;
    direction.normalize();
    if (authoring.vine) direction.set(Math.sin(azimuth) * .85, -.12, -.5 - Math.abs(Math.cos(azimuth)) * .3).normalize();
    const surfaceNormal = surfaceNormalAt(branch, t);
    if (surfaceNormal) {
      const along = tangent.clone().addScaledVector(surfaceNormal, -tangent.dot(surfaceNormal)).normalize();
      const across = new THREE.Vector3().crossVectors(surfaceNormal, along).normalize();
      direction.copy(along).multiplyScalar(.35).addScaledVector(across, Math.sin(azimuth) * .85).addScaledVector(surfaceNormal, .45).normalize();
    }
    const baseScale = settings.leaf_scale * (leafAssetFor(branch)?.leaf_scale_multiplier || 1) * state.leafScale * scaleBias * (branch.generator?.leaf_scale || 1) * evaluateProfile(branch.profileSet.leaf_scale, t);
    const scale = baseScale * (1 + (rng() * 2 - 1) * (branch.generator?.leaf_scale_variation ?? settings.leaf_scale_variation));
    placements.push({
      stableId, branchId: branch.id, branchStableId: branch.stableId, branchT: t, position, direction,
      scale: Math.max(0.006, scale * (layer?.scale || 1)), source: layer?.source >= 0 ? layer.source : source,
      attachmentType: layer?.type || 'LEAF', layerId: layer?.id || 'ATTACH_MANUAL', materialVariant: layer?.material_variant || 0,
      normal: surfaceNormal || (authoring.vine ? new THREE.Vector3(0, -1, 0) : null),
      twist: radians((rng() * 2 - 1) * settings.leaf_twist), phase: rng(), random: rng(), priority: rng(),
    });
    if (authoring.vine) {
      const v = authoring.vine;
      varyPlantPose(placements.at(-1), baseScale * (layer?.scale || 1), v.leaf_size_variation, v.leaf_direction_variation, v.leaf_twist, v.leaf_pose_seed);
      if (surfaceNormal) { const d = placements.at(-1).direction, facing = d.dot(surfaceNormal); if (facing < .2) d.addScaledVector(surfaceNormal, .2 - facing).normalize(); }
    }
  };
  const foliageLayers = authoring.attachment_layers.filter((layer) => ['LEAF', 'NEEDLE', 'DEAD_LEAF', 'CUSTOM'].includes(layer.type));
  // Share limited foliage over a painted region or a clipped ball crown.
  // Sequential filling otherwise exhausts the budget before the upper cap.
  const regionQuotas = new Map();
  const foliageBranchBias = b => hasSurfaceCanopy(authoring) && b.stableId.startsWith('Z_ruler_') && b.vineRole!=='SURFACE_HANG' ? 0 : b.vineRole === 'SURFACE_AREA' ? 1.4 : .68 + b.order * .18;
  // A hand-authored whole tree can exceed the leaf budget. Share the budget
  // across all foliage branches so later crown tiers do not become bare.
  if (authoring.recipe.tags.includes('ORBIGEN_BALANCED_FOLIAGE') || authoring.plant_form?.style === 'BALL' || authoring.branch_shape || (branches.some(b => b.vineRole === 'SURFACE_AREA') && !authoring.flowering.enabled)) {
    const requests = []; let total = 0;
    for (const b of branches) for (const layer of foliageLayers) {
      if (instanceFoliageOnly && !b.instanceId) continue;
      if (!authoring.vine && b.order < terminalOrder) continue;
      if (b.vineRole === 'RUNNER' || !attachmentLayerMatches(layer, b, (layer.start + layer.end) * .5, { season: settings.season, health: settings.health })) continue;
      const mode = layer.type === 'NEEDLE' ? 'NEEDLE_BUNDLE' : settings.foliage_mode;
      const divisor = ['COMPOUND', 'NEEDLE_BUNDLE'].includes(mode) ? Math.max(1, settings.cluster_leaf_count) : 1;
      const levelLeaves = authoring.vine ? 1 : (authoring.level_rules[b.order] || authoring.level_rules.at(-1)).leaves;
      const desired = Math.max(0, Math.round(settings.leaf_density * (leafAssetFor(b)?.leaf_density_multiplier || 1) * layer.density * b.length * state.leafDensity * levelLeaves * (b.override?.leaf_density ?? 1) * foliageBranchBias(b) / divisor));
      requests.push({ key: `${b.id}:${layer.id}`, desired }); total += desired;
    }
    if (total > settings.max_leaves) {
      let sum = 0, assigned = 0;
      for (const item of requests) { sum += item.desired * settings.max_leaves / total; const end = Math.floor(sum + 1e-8); regionQuotas.set(item.key, end - assigned); assigned = end; }
    }
  }
  for (const branch of branches) {
    if (instanceFoliageOnly && !branch.instanceId) continue;
    if (!authoring.vine && branch.order < terminalOrder) continue;
    if (authoring.vine && branch.vineRole === 'RUNNER') continue;
    const levelRule = authoring.level_rules[branch.order] || authoring.level_rules.at(-1);
    const localDensity = branch.override?.leaf_density ?? 1;
    const branchBias = foliageBranchBias(branch);
    for (const layer of foliageLayers) {
      const layerMidpoint = (layer.start + layer.end) * 0.5;
      if (!attachmentLayerMatches(layer, branch, layerMidpoint, { season: settings.season, health: settings.health })) continue;
      const layerMode = layer.type === 'NEEDLE' ? 'NEEDLE_BUNDLE' : settings.foliage_mode;
      const clusterDivisor = ['COMPOUND', 'NEEDLE_BUNDLE'].includes(layerMode) ? Math.max(1, settings.cluster_leaf_count) : 1;
      if (authoring.vine && authoring.flowering.enabled) {
        // A shared, stable node lattice ties leaves and flower axils together. Flower settings
        // other than node spacing never participate in the foliage random stream.
        for (const node of plantNodes(branch, authoring.flowering.node_spacing)) {
          if (node.t < Math.max(layer.start, authoring.foliage_range.start) || node.t > Math.min(layer.end, authoring.foliage_range.end)) continue;
          const nodeRng = createRng(stableSeed(authoring.seeds.foliage, node.id + layer.id));
          if (nodeRng() > Math.min(1, settings.leaf_density / 48 * layer.density * localDensity * state.leafDensity)) continue;
          addPlacement(branch, node.t, node.index * 2.39996, 1 - .25 * node.t, `${node.id}:${layer.id}:L`, -1, layer);
        }
        continue;
      }
      const desired = Math.max(0, Math.round(settings.leaf_density * (leafAssetFor(branch)?.leaf_density_multiplier || 1) * layer.density * branch.length * state.leafDensity * (authoring.vine ? 1 : levelRule.leaves) * localDensity * branchBias / clusterDivisor));
      const count = Math.min(desired, regionQuotas.get(`${branch.id}:${layer.id}`) ?? desired, settings.max_leaves - placements.length);
      const pairedNodes = new Map();
      const zoneStart = Math.max(settings.leaf_zone_start, layer.start, authoring.foliage_range.start);
      const zoneEnd = Math.min(layer.end, authoring.foliage_range.end);
      const clusterRng = irregularShootFoliage && branch.instanceId
        ? createRng(stableSeed(authoring.seeds.foliage, `${branch.stableId}:${layer.id}:clusters`)) : null;
      const clusterCount = clusterRng ? Math.max(2, Math.min(6, Math.ceil(branch.length / 0.22))) : 0;
      const clusters = clusterRng ? Array.from({ length: clusterCount }, (_, i) => ({
        center: zoneStart + (zoneEnd - zoneStart) * (i + 0.32 + clusterRng() * 0.36) / clusterCount,
        weight: 0.35 + clusterRng() * 1.5,
      })) : [];
      const clusterWeight = clusters.reduce((sum, cluster) => sum + cluster.weight, 0);
      for (let index = 0; index < count; index += 1) {
        const groupSize = settings.leaf_arrangement === 'OPPOSITE' ? 2 : settings.leaf_arrangement === 'WHORLED' ? 3 : 1;
        const groupIndex = Math.floor(index / groupSize);
        const groupCount = Math.ceil(count / groupSize);
        if (zoneEnd <= zoneStart) continue;
        let t = zoneStart + (zoneEnd - zoneStart) * ((groupIndex + 0.5) / Math.max(1, groupCount));
        if (settings.leaf_arrangement === 'CLUSTERED') t = layer.end - Math.pow(layer.end - t, 2.6);
        if (clusterRng && rng() > 0.12) {
          let draw = rng() * clusterWeight;
          let cluster = clusters.at(-1);
          for (const candidate of clusters) {
            draw -= candidate.weight;
            if (draw <= 0) { cluster = candidate; break; }
          }
          const local = (rng() + rng() + rng() - 1.5) * (zoneEnd - zoneStart) / clusterCount * 0.55;
          t = clamp(cluster.center + local, zoneStart, zoneEnd);
        }
        if (rng() < settings.tip_cluster) t = Math.max(layer.start, layer.end - rng() * Math.min(0.24, layer.end - layer.start));
        t = clamp(t + (rng() - 0.5) * 0.035, layer.start, layer.end);
        if (authoring.foliage_range.start > 0 || authoring.foliage_range.end < 1) t = clamp(t, zoneStart, zoneEnd);
        // Tree-library opposite leaves share one node; keep legacy projects unchanged.
        if (settings.leaf_arrangement === 'OPPOSITE' && authoring.recipe.tags.includes('CN_TREE_STARTER')) {
          if (pairedNodes.has(groupIndex)) t = pairedNodes.get(groupIndex);
          else pairedNodes.set(groupIndex, t);
        }
        if (!attachmentLayerMatches(layer, branch, t, { season: settings.season, health: settings.health })) continue;
        let sequence = index;
        if (settings.leaf_arrangement === 'OPPOSITE') sequence = Math.floor(index / 2) + (index % 2) * (180 / settings.phyllotaxis_angle);
        if (settings.leaf_arrangement === 'WHORLED') sequence = Math.floor(index / 3) + (index % 3) * (120 / settings.phyllotaxis_angle);
        const azimuth = radians(settings.phyllotaxis_angle * sequence) + branch.phase;
        if (rng() <= Math.min(1, evaluateProfile(branch.profileSet.leaf_density, t, 1) * (authoring.vine ? 1 - .65 * t * t : 1))) {
          addPlacement(branch, t, azimuth, authoring.vine ? 1 - .35 * t : 0.88 + 0.18 * t, `${branch.stableId}:${layer.id}:${index + 1}`, -1, layer);
        }
      }
    }
  }
  authoring.leaf_edits.added.forEach((manual) => {
    const branch = branches.find((item) => item.stableId === manual.parent);
    if (branch) { const before=placements.length; addPlacement(branch, manual.t, radians(manual.azimuth), manual.scale, manual.id, manual.source); if(placements.length>before)placements.at(-1).manualPlacement=true; }
  });
  return placements;
}

function expandFoliagePlacements(placements, branches, settings) {
  const expanded = [];
  placements.forEach((placement) => {
    const mode = placement.attachmentType === 'NEEDLE' ? 'NEEDLE_BUNDLE' : settings.foliage_mode;
    if (mode === 'SINGLE' || mode === 'CLUSTER') { expanded.push(placement); return; }
    const count = mode === 'NEEDLE_BUNDLE' ? Math.max(3, settings.cluster_leaf_count) : Math.max(3, settings.cluster_leaf_count | 1);
    const spread = radians(settings.cluster_spread);
    const axis = placement.direction.clone().normalize();
    const frame = tangentFrame(axis, placement.twist);
    for (let index = 0; index < count; index += 1) {
      const azimuth = index / count * Math.PI * 2 + placement.phase * Math.PI * 2;
      const radial = frame.x.clone().applyAxisAngle(axis, azimuth);
      const paired = mode === 'COMPOUND' ? (index - (count - 1) * 0.5) / Math.max(1, count - 1) : 0;
      const direction = axis.clone().multiplyScalar(Math.cos(spread * 0.55)).addScaledVector(radial, Math.sin(spread * 0.55)).normalize();
      const branch = branches.find((item) => item.id === placement.branchId);
      const along = mode === 'COMPOUND' ? Math.abs(paired) * settings.leaf_scale * 0.65 : 0;
      expanded.push({
        ...placement,
        stableId: `${placement.stableId}:C${index + 1}`,
        position: placement.position.clone().addScaledVector(axis, along),
        direction,
        scale: placement.scale * (mode === 'NEEDLE_BUNDLE' ? 0.55 : 0.72 + (1 - Math.abs(paired)) * 0.18),
        priority: placement.priority + index * 1e-7,
        branchStableId: branch?.stableId || placement.branchStableId,
      });
    }
  });
  return expanded.slice(0, settings.max_leaves);
}

function assignLookupUvs(records, elementCount) {
  const width = Math.min(256, Math.max(1, 2 ** Math.ceil(Math.log2(Math.ceil(Math.sqrt(Math.max(1, elementCount)))))));
  const height = Math.max(1, Math.ceil(elementCount / width));
  for (const record of records) {
    const uvs = new Float32Array(record.elementIndices.length*2);
    record.elementIndices.forEach((elementIndex,i) => {
      uvs[i*2]=((elementIndex%width)+.5)/width;uvs[i*2+1]=(Math.floor(elementIndex/width)+.5)/height;
    });
    record.geometry.setAttribute('uv1', record.mesh?.isInstancedMesh ? new THREE.InstancedBufferAttribute(uvs,2) : new THREE.BufferAttribute(uvs, 2));
    const materialUv = record.geometry.getAttribute('uv');
    record.geometry.setAttribute('uv2', materialUv
      ? materialUv.clone()
      : new THREE.Float32BufferAttribute(new Array(record.geometry.attributes.position.count * 2).fill(0), 2));
  }
  return { width, height };
}

function buildLeafMesh(branches, placements, settings, sourceGeometry, material, elements, sourceIndex = 0, sourceName = '', calibration = {}, instanced = false) {
  if (!placements.length) return null;
  let arrays;
  const source = sourceGeometry || createDefaultLeafGeometry(settings.leaf_aspect);
  if (!sourceGeometry) source.userData.isDefault = true;
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  if(instanced && placements.every(p=>p.canopyRoot)) return buildCanopyInstances(source,placements,settings,material,elements,branchById,sourceIndex,sourceName,calibration,transformLeafGeometry);
  const stems=settings.petiole_length>.0001?placements.length:placements.filter(p=>p.canopyRoot).length;
  arrays=allocateLeafArrays(source.attributes.position.count*placements.length+stems*8,(source.index?.count||source.attributes.position.count)*placements.length+stems*24);
  placements.forEach((placement, index) => {
    const parentBranch = branchById.get(placement.branchId);
    const elementIndex = elements.length;
    elements.push({
      index: elementIndex, type: placement.attachmentType || 'LEAF', id: placement.stableId || `L${String(index + 1).padStart(4, '0')}`,
      parentIndex: parentBranch.elementIndex, pivot: placement.position.toArray(), axis: placement.direction.toArray(),
      extent: placement.scale, order: parentBranch.order + 1, phase: placement.phase,
    });
    transformLeafGeometry(source, placement, settings, elementIndex, arrays, calibration);
  });
  const geometry = leafArraysGeometry(arrays);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `M_Leaf_叶片集合_${sourceIndex + 1}`;
  mesh.castShadow = true;
  mesh.userData = { category: 'leaf', source: sourceName || source.userData.sourceName || '内置叶片', source_index: sourceIndex, element_count: placements.length };
  return { mesh, geometry, elementIndices: arrays.elementIndices.data };
}

function normalizeLeafSources(sourceInput, settings) {
  const supplied = Array.isArray(sourceInput)
    ? sourceInput.filter((item) => item?.geometry?.isBufferGeometry)
    : sourceInput?.isBufferGeometry ? [{ geometry: sourceInput, weight: 1, name: sourceInput.userData.sourceName }] : [];
  if (supplied.length) return supplied.map((item, index) => ({
    ...(item.manual_only ? { manual_only: true } : {}),
    id: String(item.id || ''), geometry: item.geometry, weight: Math.max(0.001, number(item.weight, 1)), name: item.name || item.geometry.userData.sourceName || `叶片 ${index + 1}`,
    orderMin: Math.round(clamp(number(item.orderMin, 0), 0, 3)), orderMax: Math.round(clamp(number(item.orderMax, 3), 0, 3)),
    season: ['ANY', 'BUD', 'SPRING', 'SUMMER', 'AUTUMN', 'WINTER', 'DEAD'].includes(item.season) ? item.season : 'ANY',
    ageStage: ['MATURE', 'TRANSITION', 'YOUNG'].includes(item.ageStage) ? item.ageStage : 'ANY',
    shootRole: ['MATURE', 'MIXED', 'YOUNG'].includes(item.shootRole) ? item.shootRole : 'ANY',
    colorTint: /^#[0-9a-f]{6}$/i.test(item.colorTint || '') ? item.colorTint : '',
    sampleLeafMaterial: item.sampleLeafMaterial,
    sampleLeafMaterialName: item.sampleLeafMaterialName,
    calibration: { scale: clamp(number(item.calibration?.scale, 1), 0.01, 20), rotation: number(item.calibration?.rotation, 0), flip: Boolean(item.calibration?.flip) },
  }));
  const geometry = createDefaultLeafGeometry(settings.leaf_aspect);
  geometry.userData.isDefault = true;
  return [{ geometry, weight: 1, name: '内置阔叶', orderMin: 0, orderMax: 3, season: 'ANY', ageStage: 'ANY', shootRole: 'ANY', calibration: { scale: 1, rotation: 0, flip: false }, owned: true }];
}

function leafYouthTarget(placement, crown, branchBias) {
  const x = (placement.position.x - crown.centerX) / crown.radius;
  const y = (placement.position.y - crown.centerY) / crown.radius;
  const exposure = clamp(Math.hypot(x, y), 0, 1);
  const height = clamp((placement.position.z - crown.minZ) / crown.height, 0, 1);
  // Young flushes belong to the outer, distal shoots. A branch-level bias
  // gives nearby leaves a shared character instead of pixel-like noise.
  return clamp(0.04 + 0.56 * placement.branchT + 0.22 * exposure + 0.08 * height + 0.46 * branchBias, 0, 1);
}

function smoothstep(low, high, value) {
  const t = clamp((value - low) / (high - low), 0, 1);
  return t * t * (3 - 2 * t);
}

function leafAgeWeight(source, youth, strength) {
  if (source.ageStage === 'ANY' || strength <= 0) return source.weight;
  const affinity = source.ageStage === 'YOUNG' ? smoothstep(0.48, 0.83, youth)
    : source.ageStage === 'TRANSITION' ? 0.26
      : 1 - smoothstep(0.4, 0.8, youth);
  return source.weight * ((1 - strength) + strength * affinity);
}

function shootExposure(branch, center, crown) {
  const tip = branch.points.at(-1);
  const radial = clamp(Math.hypot(tip.x - center.x, tip.y - center.y) / crown.radius, 0, 1);
  const height = clamp((tip.z - crown.minZ) / crown.height, 0, 1);
  return Math.max(radial, height * 0.72);
}

function shootZoneRole(branch, branchById, center, crown, settings) {
  const exposure = shootExposure(branch, center, crown);
  let family = branch;
  while (family.order > 2 && branchById.has(family.parentId)) family = branchById.get(family.parentId);
  const randomFor = (suffix) => createRng(stableSeed(settings.seed, `leaf-shoot:${family.stableId}:${suffix}`))();
  // A whole secondary-branch family shares its flush, so color forms
  // readable patches of leafy shoots rather than independent speckles.
  if (exposure < settings.leaf_shoot_inner) return 'MATURE';
  if (exposure < settings.leaf_shoot_outer) {
    return randomFor('middle') < settings.leaf_shoot_mid_mix ? 'MIXED' : 'MATURE';
  }
  const draw = randomFor('outer');
  return draw < settings.leaf_shoot_outer_young ? 'YOUNG'
    : draw < settings.leaf_shoot_outer_young + 0.22 ? 'MIXED' : 'MATURE';
}

function buildLeafMeshes(branches, placements, settings, sourceInput, material, elements, authoring, selectionContext = null, instanced = false) {
  const sources = normalizeLeafSources(sourceInput, settings);
  const buckets = sources.map(() => []);
  const sourcePlacements = selectionContext?.placements || placements;
  const sourceBranches = selectionContext?.branches || branches;
  const visible = new Set(placements);
  const branchById = new Map(sourceBranches.map((branch) => [branch.id, branch]));
  const instanceLeafSources = new Map((authoring?.branch_instances || []).map((instance) =>
    [instance.id, new Set(resolveInstanceAsset(instance, authoring.branch_library)?.leaf_source_ids || [])]));
  const branchAgeBias = new Map();
  const shootRoles = new Map();
  const zonedShoots = settings.leaf_shoot_zoning && sourcePlacements.length > 0 && sources.some((source) => source.shootRole !== 'ANY');
  const root = sourceBranches.find((branch) => branch.parentId < 0)?.points[0] || new THREE.Vector3();
  const shootCrown = zonedShoots ? sourcePlacements.reduce((box, placement) => {
    box.radius = Math.max(box.radius, Math.hypot(placement.position.x - root.x, placement.position.y - root.y));
    box.minZ = Math.min(box.minZ, placement.position.z);
    box.maxZ = Math.max(box.maxZ, placement.position.z);
    return box;
  }, { radius: 0.001, minZ: Infinity, maxZ: -Infinity }) : null;
  if (shootCrown) shootCrown.height = Math.max(0.001, shootCrown.maxZ - shootCrown.minZ);
  if (zonedShoots && settings.leaf_shoot_quota) {
    const counts = new Map();
    for (const placement of sourcePlacements) {
      if (placement.source >= 0 || !branchById.has(placement.branchId)) continue;
      counts.set(placement.branchId, (counts.get(placement.branchId) || 0) + 1);
    }
    const ranked = [...counts].map(([id, count]) => ({ branch: branchById.get(id), count }));
    ranked.sort((a, b) => shootExposure(a.branch, root, shootCrown) - shootExposure(b.branch, root, shootCrown)
      || String(a.branch.stableId).localeCompare(String(b.branch.stableId)));
    const total = ranked.reduce((sum, item) => sum + item.count, 0);
    let assigned = 0;
    for (const item of ranked) {
      const midpoint = (assigned + item.count * 0.5) / Math.max(1, total);
      shootRoles.set(item.branch.id, midpoint < settings.leaf_shoot_mature_share ? 'MATURE'
        : midpoint < settings.leaf_shoot_mature_share + settings.leaf_shoot_mixed_share ? 'MIXED' : 'YOUNG');
      assigned += item.count;
    }
  }
  const ageLayering = settings.leaf_age_layering;
  const agedSources = ageLayering > 0 && sourcePlacements.length > 0 && sources.some((source) => source.ageStage !== 'ANY');
  const bounds = agedSources ? sourcePlacements.reduce((box, placement) => {
    const p = placement.position;
    box.minX = Math.min(box.minX, p.x); box.maxX = Math.max(box.maxX, p.x);
    box.minY = Math.min(box.minY, p.y); box.maxY = Math.max(box.maxY, p.y);
    box.minZ = Math.min(box.minZ, p.z); box.maxZ = Math.max(box.maxZ, p.z);
    return box;
  }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity }) : null;
  const crown = agedSources ? { centerX: (bounds.minX + bounds.maxX) * 0.5, centerY: (bounds.minY + bounds.maxY) * 0.5,
    radius: Math.max(0.001, Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.5),
    minZ: bounds.minZ, height: Math.max(0.001, bounds.maxZ - bounds.minZ) } : null;
  sourcePlacements.forEach((placement) => {
    if (placement.source >= 0 && placement.source < sources.length) {
      if (visible.has(placement)) buckets[placement.source].push(placement);
      return;
    }
    const branch = branchById.get(placement.branchId);
    const eligible = sources.map((source, index) => ({ source, index })).filter(({ source }) => {
      if (source.manual_only) return false;
      const minimum = Math.min(source.orderMin ?? 0, source.orderMax ?? 3);
      const maximum = Math.max(source.orderMin ?? 0, source.orderMax ?? 3);
      return (!branch || (branch.order >= minimum && branch.order <= maximum)) && (source.season === 'ANY' || source.season === settings.season);
    });
    let pool = eligible.length ? eligible : sources.map((source, index) => ({ source, index })).filter(({ source }) => !source.manual_only);
    if (!pool.length) return;
    const leafSourceIds = branch?.instanceId ? instanceLeafSources.get(branch.instanceId) : null;
    if (leafSourceIds?.size) {
      const assetPool = pool.filter(({ source }) => leafSourceIds.has(source.id));
      if (assetPool.length) pool = assetPool;
    }
    if (zonedShoots && branch) {
      if (!shootRoles.has(branch.id)) shootRoles.set(branch.id,
        branch.shootRole && branch.shootRole !== 'ANY' ? branch.shootRole : shootZoneRole(branch, branchById, root, shootCrown, settings));
      const rolePool = pool.filter(({ source }) => source.shootRole === shootRoles.get(branch.id));
      if (rolePool.length) pool = rolePool;
    }
    let youth = 0;
    if (agedSources) {
      const id = branch?.stableId || placement.branchStableId;
      if (!branchAgeBias.has(id)) branchAgeBias.set(id, createRng(stableSeed(settings.seed, `leaf-age:${id}`))() - 0.5);
      youth = leafYouthTarget(placement, crown, branchAgeBias.get(id));
    }
    const totalWeight = pool.reduce((sum, item) => sum + leafAgeWeight(item.source, youth, ageLayering), 0);
    let cursor = placement.random * totalWeight;
    let selected = pool.at(-1).index;
    for (const item of pool) {
      cursor -= leafAgeWeight(item.source, youth, ageLayering);
      if (cursor <= 0) { selected = item.index; break; }
    }
    if (selectionContext) placement.source = selected;
    if (visible.has(placement)) buckets[selected].push(placement);
  });
  const records = buckets.flatMap((bucket, index) => {
    const sourceMaterial = sources[index].colorTint || sources[index].sampleLeafMaterial ? material.clone() : material;
    if (sources[index].sampleLeafMaterial) {
      sourceMaterial.sampleLeafMaterial = sources[index].sampleLeafMaterial;
      sourceMaterial.name = sources[index].sampleLeafMaterialName || 'M_Leaf_' + String(sources[index].id || index).replace(/[^a-zA-Z0-9_-]/g, '_');
    }
    if (sources[index].colorTint) {
      sourceMaterial.vegetationTint = sources[index].colorTint;
      sourceMaterial.color.set(sources[index].colorTint);
    }
    const subsets=instanced?[bucket.filter(p=>!p.canopyRoot),bucket.filter(p=>p.canopyRoot)]:[bucket];
    const records=subsets.map(part=>buildLeafMesh(branches,part,settings,sources[index].geometry,sourceMaterial,elements,index,sources[index].name,sources[index].calibration,instanced)).filter(Boolean);
    if(!records.length&&sourceMaterial!==material)sourceMaterial.dispose();
    records.forEach(r=>r.mesh.userData.shoot_role=sources[index].shootRole);
    return records.flatMap(r=>[r,...(r.extraRecords||[])]);
  }).filter(Boolean);
  sources.filter((source) => source.owned).forEach((source) => source.geometry.dispose());
  return records;
}

function addMarkers(group, branches, settings, materials, state, rng, authoring) {
  const records = [];
  if (settings.buds_enabled || settings.season === 'BUD' || settings.season === 'SPRING' || settings.regrowth > 0) {
    const geometry = new THREE.ConeGeometry(settings.leaf_scale * 0.11, settings.leaf_scale * 0.28, 6);
    geometry.rotateX(Math.PI * 0.5);
    geometry.setAttribute('uv1', new THREE.Float32BufferAttribute(Array.from(geometry.getAttribute('uv').array), 2));
    geometry.setAttribute('uv2', new THREE.Float32BufferAttribute(Array.from(geometry.getAttribute('uv').array), 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(geometry.getAttribute('position').count * 4).fill(0.5), 4));
    branches.filter((branch) => branch.children.length === 0).slice(0, 80).forEach((branch, index) => {
      if (rng() > Math.max(0.28, settings.regrowth) && !settings.buds_enabled) return;
      const mesh = new THREE.Mesh(geometry, materials.bud);
      mesh.name = `芽点_${String(index + 1).padStart(3, '0')}`;
      mesh.userData.branch_id = branch.stableId;
      mesh.position.copy(branch.points.at(-1));
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangentOnPolyline(branch.points, 1));
      mesh.castShadow = true;
      group.add(mesh);
      records.push(mesh);
    });
  }
  if (settings.fruit_enabled && state.leafDensity > 0) {
    const geometry = new THREE.IcosahedronGeometry(settings.leaf_scale * 0.34, 1);
    const markerUv = geometry.getAttribute('uv') || new THREE.Float32BufferAttribute(new Array(geometry.getAttribute('position').count * 2).fill(0), 2);
    if (!geometry.getAttribute('uv')) geometry.setAttribute('uv', markerUv);
    geometry.setAttribute('uv1', new THREE.Float32BufferAttribute(Array.from(markerUv.array), 2));
    geometry.setAttribute('uv2', new THREE.Float32BufferAttribute(Array.from(markerUv.array), 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(geometry.getAttribute('position').count * 4).fill(0.5), 4));
    branches.filter((branch) => branch.order >= 1).forEach((branch, index) => {
      if (rng() > settings.fruit_density) return;
      const mesh = new THREE.Mesh(geometry, materials.fruit);
      mesh.name = `果实_${String(index + 1).padStart(3, '0')}`;
      mesh.userData.branch_id = branch.stableId;
      mesh.position.copy(pointOnPolyline(branch.points, 0.72));
      mesh.position.z -= settings.leaf_scale * 0.28;
      mesh.castShadow = true;
      group.add(mesh);
      records.push(mesh);
    });
  }
  const markerLayers = authoring.attachment_layers.filter((layer) => ['FLOWER', 'FRUIT', 'THORN'].includes(layer.type) && layer.enabled);
  markerLayers.forEach((layer) => {
    const geometry = layer.type === 'FRUIT'
      ? new THREE.IcosahedronGeometry(settings.leaf_scale * 0.3 * layer.scale, 1)
      : new THREE.ConeGeometry(settings.leaf_scale * (layer.type === 'THORN' ? 0.07 : 0.18) * layer.scale, settings.leaf_scale * (layer.type === 'THORN' ? 0.62 : 0.28) * layer.scale, layer.type === 'THORN' ? 5 : 7);
    const markerUv = geometry.getAttribute('uv') || new THREE.Float32BufferAttribute(new Array(geometry.getAttribute('position').count * 2).fill(0), 2);
    if (!geometry.getAttribute('uv')) geometry.setAttribute('uv', markerUv);
    geometry.setAttribute('uv1', new THREE.Float32BufferAttribute(Array.from(markerUv.array), 2));
    geometry.setAttribute('uv2', new THREE.Float32BufferAttribute(Array.from(markerUv.array), 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(geometry.getAttribute('position').count * 4).fill(0.5), 4));
    branches.forEach((branch, index) => {
      const t = layer.start + (layer.end - layer.start) * ((index * 0.61803398875) % 1);
      if (!attachmentLayerMatches(layer, branch, t, { season: settings.season, health: settings.health })) return;
      const layerRng = createRng(stableSeed(authoring.seeds.foliage, `${layer.id}:${branch.stableId}`));
      if (layerRng() > Math.min(1, layer.density * 0.24)) return;
      const tangent = tangentOnPolyline(branch.points, t);
      const frame = tangentFrame(tangent, branch.phase + index);
      const mesh = new THREE.Mesh(geometry, layer.type === 'FRUIT' ? materials.fruit : layer.type === 'FLOWER' ? materials.bud : materials.scar);
      mesh.name = `${layer.name}_${branch.stableId}`;
      mesh.position.copy(pointOnPolyline(branch.points, t)).addScaledVector(frame.x, branch.endRadius + settings.branch_clearance);
      if (layer.type === 'FRUIT') mesh.position.z -= settings.leaf_scale * 0.22;
      else mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), layer.type === 'THORN' ? frame.x : tangent);
      mesh.userData = { category: 'attachment', attachment_type: layer.type, layer_id: layer.id, branch_id: branch.stableId };
      mesh.castShadow = true;
      group.add(mesh);
      records.push(mesh);
    });
  });
  return records;
}

function addDamageScars(group, branches, settings, materials) {
  if (settings.damage_mode === 'INTACT' || settings.damage_amount <= 0) return [];
  const scars = [];
  const terminals = branches.filter((branch) => branch.children.length === 0 && branch.order > 0);
  const stride = Math.max(1, Math.round(1 / Math.max(0.08, settings.damage_amount)));
  terminals.forEach((branch, index) => {
    if (index % stride !== 0) return;
    const geometry = new THREE.CircleGeometry(Math.max(0.002, branch.endRadius * 1.08), 10);
    if (settings.cut_style !== 'FLAT') {
      const position = geometry.getAttribute('position');
      for (let vertex = 1; vertex < position.count; vertex += 1) {
        const wave = Math.sin(vertex * 4.17 + branch.id) * (settings.cut_style === 'TORN' ? 0.28 : 0.08);
        position.setXYZ(vertex, position.getX(vertex) * (1 + wave), position.getY(vertex) * (1 + wave), wave * branch.endRadius);
      }
      position.needsUpdate = true;
      geometry.computeVertexNormals();
    }
    const radiusFactor=radiusFactorAt(branch,1);geometry.scale(radiusFactor,radiusFactor,radiusFactor);
    geometry.userData.radiusRings=[{t:1,center:[0,0,0],offset:0,count:geometry.getAttribute('position').count}];
    const materialUv = geometry.getAttribute('uv');
    geometry.setAttribute('uv1', new THREE.Float32BufferAttribute(Array.from(materialUv.array), 2));
    geometry.setAttribute('uv2', new THREE.Float32BufferAttribute(Array.from(materialUv.array), 2));
    const color = [];
    for (let vertex = 0; vertex < geometry.getAttribute('position').count; vertex += 1) color.push(1, branch.order / 4, branch.windPhase, settings.health);
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 4));
    const mesh = new THREE.Mesh(geometry, materials.scar);
    mesh.name = `${settings.damage_mode === 'PRUNED' ? '修剪截面' : '断裂截面'}_${String(index + 1).padStart(3, '0')}`;
    const tangent = tangentOnPolyline(branch.points, 1);
    mesh.position.copy(branch.points.at(-1)).addScaledVector(tangent, 0.0005);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
    mesh.userData.category = 'marker';
    mesh.userData.branch_id = branch.stableId;
    group.add(mesh);
    scars.push(mesh);
  });
  return scars;
}

function addJunctionCollars(group, branches, settings, material) {
  if (!settings.junction_collar) return [];
  const records = [];
  branches.filter((branch) => branch.parentId >= 0 && !branch.skeletonRadius).forEach((branch) => {
    const parent = branches.find((candidate) => candidate.id === branch.parentId);
    if (!parent) return;
    const geometry = new THREE.SphereGeometry(branch.startRadius * (1.28 + settings.junction_flare * 0.5), Math.max(6, settings.radial_segments), 5);
    const radiusFactor=radiusFactorAt(branch,0);geometry.scale(radiusFactor,radiusFactor,radiusFactor);
    geometry.userData.radiusRings=[{t:0,center:[0,0,0],offset:0,count:geometry.getAttribute('position').count}];
    const uv = geometry.getAttribute('uv') || new THREE.Float32BufferAttribute(new Array(geometry.getAttribute('position').count * 2).fill(0), 2);
    if (!geometry.getAttribute('uv')) geometry.setAttribute('uv', uv);
    geometry.setAttribute('uv1', new THREE.Float32BufferAttribute(Array.from(uv.array), 2));
    geometry.setAttribute('uv2', new THREE.Float32BufferAttribute(Array.from(uv.array), 2));
    const color = [];
    for (let index = 0; index < geometry.getAttribute('position').count; index += 1) color.push(0.08, branch.order / 4, branch.windPhase, settings.health);
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 4));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `枝杈封闭套环_${branch.stableId}`;
    mesh.position.copy(branch.points[0]);
    mesh.scale.set(1.4, 1.1, 0.72);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangentOnPolyline(parent.points, 0.7));
    mesh.userData = { category: 'junction', stable_id: branch.stableId, parent_id: parent.stableId };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    records.push(mesh);
  });
  return records;
}

export function analyzeGroup(group, settings = DEFAULT_SETTINGS, geometryCache = null) {
  let objects = 0;
  let vertices = 0;
  let triangles = 0;
  let invalidVertices = 0;
  let degenerateFaces = 0;
  let missingUv = 0;
  let missingColors = 0;
  let missingNormals = 0;
  let missingTangents = 0;
  const materials = new Set();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  group.updateMatrixWorld(true);
  group.traverse((object) => {
    if (!object.isMesh || !object.geometry) return;
    objects += 1;
    const geometry = object.geometry;
    const position = geometry.getAttribute('position');
    const index = geometry.index;
    if (!geometry.getAttribute('uv')) missingUv += 1;
    if (!geometry.getAttribute('normal')) missingNormals += 1;
    if (!geometry.getAttribute('tangent')) missingTangents += 1;
    if (!geometry.getAttribute('color') && object.userData.category !== 'marker') missingColors += 1;
    (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => materials.add(material?.name || 'Material'));
    const copies = object.isInstancedMesh ? object.count : 1;
    vertices += position.count * copies;
    const triangleCount = index ? index.count / 3 : position.count / 3;
    triangles += triangleCount * copies;
    // Completed samples retain their geometry during carrier edits. Recheck
    // replaced/versioned buffers, while still counting every object/instance
    // and checking its current material and attributes on every report.
    const stamp = [position, position.array, position.version ?? position.data?.version, position.count, position.itemSize, position.normalized,
      index, index?.array, index?.version ?? index?.data?.version, index?.count, index?.normalized];
    let quality = geometryCache?.get(geometry);
    if (!quality || !stamp.every((value, n) => value === quality.stamp[n])) {
      quality = { stamp, invalid: 0, degenerate: 0 };
      for (let vertex = 0; vertex < position.count; vertex += 1) {
        if (!Number.isFinite(position.getX(vertex)) || !Number.isFinite(position.getY(vertex)) || !Number.isFinite(position.getZ(vertex))) quality.invalid += 1;
      }
      const read = (value) => index ? index.getX(value) : value;
      for (let face = 0; face < triangleCount; face += 1) {
        a.fromBufferAttribute(position, read(face * 3));
        b.fromBufferAttribute(position, read(face * 3 + 1));
        c.fromBufferAttribute(position, read(face * 3 + 2));
        b.sub(a); c.sub(a);
        // Relative area keeps valid, uniformly small flowers valid.
        const edgeProduct = b.lengthSq() * c.lengthSq();
        if (b.cross(c).lengthSq() <= Math.max(1e-24, edgeProduct * 1e-12)) quality.degenerate += 1;
      }
      geometryCache?.set(geometry, quality);
    }
    invalidVertices += quality.invalid;
    degenerateFaces += quality.degenerate;
  });
  const warnings = [];
  if (triangles > settings.max_triangles) warnings.push(`三角面 ${triangles.toLocaleString()} 超过预算 ${settings.max_triangles.toLocaleString()}`);
  if (missingUv) warnings.push(`${missingUv} 个网格缺少 UV0`);
  if (missingColors) warnings.push(`${missingColors} 个网格缺少风动画顶点色`);
  if (missingNormals) warnings.push(`${missingNormals} 个网格缺少法线`);
  if (missingTangents) warnings.push(`${missingTangents} 个网格缺少切线`);
  if (degenerateFaces) warnings.push(`${degenerateFaces} 个退化三角面`);
  if (invalidVertices) warnings.push(`${invalidVertices} 个无效顶点`);
  const ok = invalidVertices === 0 && degenerateFaces === 0 && missingNormals === 0 && missingTangents === 0;
  return { ok, objects, vertices, triangles, invalid_vertices: invalidVertices, degenerate_faces: degenerateFaces, missing_uv: missingUv, missing_colors: missingColors, missing_normals: missingNormals, missing_tangents: missingTangents, material_slots: materials.size, materials: [...materials], warnings };
}

function ensureGeometryTangents(geometry) {
  if (!geometry.getAttribute('normal') && geometry.getAttribute('position')) geometry.computeVertexNormals();
  if (geometry.getAttribute('tangent') || !geometry.getAttribute('normal')) return;
  const normal = geometry.getAttribute('normal');
  const tangent = new Float32Array(normal.count * 4);
  const n = new THREE.Vector3();
  const reference = new THREE.Vector3();
  const t = new THREE.Vector3();
  for (let index = 0; index < normal.count; index += 1) {
    n.fromBufferAttribute(normal, index).normalize();
    reference.set(Math.abs(n.z) < 0.9 ? 0 : 1, 0, Math.abs(n.z) < 0.9 ? 1 : 0);
    t.crossVectors(reference, n).normalize();
    tangent[index * 4] = t.x;
    tangent[index * 4 + 1] = t.y;
    tangent[index * 4 + 2] = t.z;
    tangent[index * 4 + 3] = 1;
  }
  geometry.setAttribute('tangent', new THREE.BufferAttribute(tangent, 4));
}

function resamplePoints(points, count) {
  if (count >= points.length) return points.map((point) => point.clone());
  return Array.from({ length: count }, (_, index) => pointOnPolyline(points, index / Math.max(1, count - 1)));
}

function deriveLodBranches(masterBranches, settings, lod) {
  const maximumOrder = Math.max(0, settings.branch_levels + lod.maxLevelOffset - 1);
  const activeIds = new Set(masterBranches.filter((branch) => branch.order <= maximumOrder).map((branch) => branch.id));
  return masterBranches.filter((branch) => activeIds.has(branch.id)).map((branch) => {
    const segmentCount = Math.max(5, Math.round((branch.points.length - 1) * lod.segment));
    return { ...branch, points: branch.surfaceNormals ? branch.points.map(p => p.clone()) : resamplePoints(branch.points, segmentCount + 1), children: branch.children.filter((id) => activeIds.has(id)) };
  });
}

function deriveLodPlacements(masterPlacements, branches, lod) {
  const activeBranches = new Set(branches.map((branch) => branch.id));
  const candidates = masterPlacements.filter((placement) => activeBranches.has(placement.branchId));
  if (lod.leaves >= 0.999) return candidates;
  const target = candidates.length ? Math.max(1, Math.round(candidates.length * lod.leaves)) : 0;
  return [...candidates].sort((a, b) => a.priority - b.priority || a.stableId.localeCompare(b.stableId)).slice(0, target);
}

function vegetationBranchReserve(branches, settings) {
  let cost = branches.reduce((sum, b) => {
    const count = settings.adaptive_tessellation && !b.surfaceNormals ? adaptiveCurvePoints(b.points, settings.curvature_detail).length : b.points.length;
    return sum + 2 * Math.max(4, settings.radial_segments) * (count + (b.sections?.length || 0) + 5);
  }, 0);
  if (settings.junction_collar) cost += branches.filter(b => b.parentId >= 0).length * Math.max(6, settings.radial_segments) * 8;
  if (branches.length && (settings.regrowth > 0 || ['SPRING', 'BUD'].includes(settings.season) || settings.damage > 0)) cost += 10000;
  return cost;
}

function vegetationLeafCost(source, settings) {
  const sources = normalizeLeafSources(source, settings);
  const cost = Math.max(0, ...sources.map(s => (s.geometry.index?.count || s.geometry.attributes.position.count) / 3 + (settings.petiole_length > .0001 ? 8 : 0)));
  sources.filter(s => s.owned).forEach(s => s.geometry.dispose());
  return cost;
}

export function buildBranchAsset(rawSettings = {}, materials = null, leafSourceGeometry = null, lodIndex = 0, rawAuthoring = null, options = {}) {
  let settings = normalizeSettings({ ...rawSettings, preview_lod: lodIndex });
  const lod = LOD_PROFILES[clamp(lodIndex, 0, 3)];
  // Preview-only projection: never remove installed units from the editable document.
  // Exclude samples before normalization so their meshes/atlases are not processed.
  const skeletonOnly = options.skeletonOnly === true;
  const authoring = normalizeAuthoring(skeletonOnly ? { ...rawAuthoring, branch_instances: [], branch_library: [],
    tree_organs: { ...rawAuthoring?.tree_organs, units: [] } } : rawAuthoring || {}, settings.seed);
  // Resolve atlas ownership at build time, including old projects whose global
  // palette was overwritten by the last installed sample. No saved IDs change.
  if (!skeletonOnly && Array.isArray(leafSourceGeometry) && authoring.branch_instances.length) {
    const textures = new Map();
    for (const instance of authoring.branch_instances) {
      const item = resolveInstanceAsset(instance.linked ? instance : { ...instance, linked: true }, authoring.branch_library);
      if (!item?.sample) continue;
      const texture = sampleLeafMaterial(item.sample, authoring.branch_library, authoring.leaf_material);
      for (const source of item.sample.leaf_meshes) textures.set(source.id, texture);
    }
    leafSourceGeometry = leafSourceGeometry.map(source => ({ ...source,
      sampleLeafMaterial: source.sampleLeafMaterial || textures.get(source.id),
      sampleLeafMaterialName: source.sampleLeafMaterialName || sampleLeafMaterialName(source.id,textures.get(source.id),authoring.leaf_material) }));
  }
  if (!options.legacy && canCompileSamples(authoring)) return compileSampleAssembly(settings, authoring, leafSourceGeometry, lodIndex, materials, {
    build: (s,m,l,lod,a) => buildBranchAsset(s,m,l,lod,a,{legacy:true,resolveSources:true}), frame: branchInstanceFrame,
    lookup: assignLookupUvs, analyze: analyzeGroup, dispose: disposeBranchAsset, deserialize: deserializeGeometry,
    graph: (s,a) => buildBranchGraph(s,stateFactors(s),a),
    overlap: attachmentOverlapRatio, allows: foliageMasksAllow,
  }, options.instanced === true);
  settings = vineSettings(settings, authoring.vine);
  settings = applyTimeline(settings, authoring);
  settings = { ...settings, wind_profile: authoring.wind_profile };
  const foliageUnits = skeletonOnly ? { sources: [], dispose() {} } : buildFoliageUnitSources(leafSourceGeometry, settings, authoring.foliage_unit);
  leafSourceGeometry = foliageUnits.sources;
  if (authoring.foliage_unit.mode !== 'SINGLE') settings = { ...settings, foliage_mode: 'SINGLE', leaf_aspect: 1, petiole_length: 0 };
  const ownedMaterials = !materials;
  const resolvedMaterials = materials || createBranchMaterials(settings);
  resolvedMaterials.flower?.color.set(authoring.flowering.material.color ? '#ffffff' : authoring.flowering.color);
  const state = stateFactors(settings);
  const group = new THREE.Group();
  group.name = `${settings.object_name}_LOD${lodIndex}`;
  const branchGroup = new THREE.Group();
  branchGroup.name = '01_枝干';
  const foliageGroup = new THREE.Group();
  foliageGroup.name = '02_叶片';
  const markerGroup = new THREE.Group();
  markerGroup.name = '03_芽与果实';
  group.add(branchGroup, foliageGroup, markerGroup);
  const masterBranches = buildBranchGraph(settings, state, authoring, skeletonOnly && rawAuthoring?.branch_instances?.length > 0);
  // Ginkgo foliage lives on short spurs; dropping that entire tier makes LOD3 bare.
  const spurLod = authoring.recipe.tags.includes('CN_TREE_STARTER') && authoring.recipe.tags.includes('GINKGO')
    ? { ...lod, maxLevelOffset: Math.max(-1, lod.maxLevelOffset) } : lod;
  // Natural presets carry their foliage on second-order shoots. Keep that
  // support at LOD3; decimate curve samples and leaves instead of going bare.
  const foliageLod = authoring.recipe.tags.includes('NATURAL_BRANCH_V2')
    ? { ...spurLod, maxLevelOffset: Math.max(-1, spurLod.maxLevelOffset) } : spurLod;
  const branches = deriveLodBranches(masterBranches, settings, foliageLod);
  const elements = [];
  const lookupRecords = [];
  const radialSegments = Math.max(4, Math.round(settings.radial_segments * lod.radial));
  branches.forEach((branch) => {
    branch.elementIndex = elements.length;
    const parent = branch.parentId < 0 ? null : branches.find((candidate) => candidate.id === branch.parentId);
    const axis = tangentOnPolyline(branch.points, 0.5);
    elements.push({
      index: branch.elementIndex, type: 'BRANCH', id: branch.stableId,
      parentIndex: parent ? parent.elementIndex : -1, pivot: branch.points[0].toArray(), axis: axis.toArray(),
      extent: branch.length, order: branch.order, phase: branch.windPhase,
    });
    const renderBranch = settings.adaptive_tessellation && lodIndex < 2 && !branch.surfaceNormals
      ? { ...branch, points: adaptiveCurvePoints(branch.points, settings.curvature_detail * lod.segment) }
      : branch;
    const geometry = createSweptBranchGeometry(renderBranch, radialSegments, settings);
    const mesh = new THREE.Mesh(geometry, resolvedMaterials.bark);
    mesh.name = `枝段_B${String(branch.id + 1).padStart(3, '0')}_L${branch.order}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { category: 'branch', branch_id: branch.id, stable_id: branch.stableId, parent_id: branch.parentId, order: branch.order, element_index: branch.elementIndex };
    branchGroup.add(mesh);
    lookupRecords.push({ geometry, elementIndices: new Array(geometry.getAttribute('position').count).fill(branch.elementIndex) });
  });
  addJunctionCollars(branchGroup, branches, settings, resolvedMaterials.bark);
  // Reserve room for both strata when real ivy units share a mixed patch.
  // The same master calculation applies at every LOD.
  if (authoring.vine && authoring.vegetation.enabled && authoring.vegetation.mode === 'REGION' && Object.entries(authoring.vegetation.weights).some(([k,v]) => k !== 'IVY' && v > 0)) {
    const available = Math.max(0, settings.max_triangles * .55 - vegetationBranchReserve(masterBranches, settings));
    settings.max_leaves = Math.min(settings.max_leaves, Math.floor(available / Math.max(1, vegetationLeafCost(leafSourceGeometry, settings))));
  }
  const libraryFoliage = authoring.recipe.tags.includes('SAMPLE_FOLIAGE_FROM_LIBRARY');
  let masterPlacements = skeletonOnly ? [] : libraryFoliage
    ? sampleFoliagePlacements(masterBranches,settings,authoring,leafSourceGeometry,{normalizeAuthoring,normalizeSettings,stateFactors,leafPlacements,expandFoliagePlacements,createRng,stableSeed,resolveInstanceAsset,leafYouthTarget,leafAgeWeight,masksAllow:foliageMasksAllow})
    : expandFoliagePlacements(leafPlacements(masterBranches, settings, state, createRng(authoring.seeds.foliage), authoring), masterBranches, settings);
  const canopy = skeletonOnly || libraryFoliage ? [] : createSurfaceCanopy(masterBranches,settings,authoring,leafSourceGeometry,state,(p,id)=>foliageMasksAllow(p,id,authoring));
  if(canopy.length)masterPlacements=masterPlacements.concat(canopy);
  if (!skeletonOnly && !libraryFoliage) {
    const editingLeaves=authoring.unit_editing.rules.some(r=>r.enabled&&r.kind==='LEAF')||authoring.unit_editing.items.some(v=>v.kind==='LEAF');
    const unitLimit=editingLeaves ? Math.min(settings.max_leaves,Math.max(0,Math.floor((settings.max_triangles-vegetationBranchReserve(masterBranches,settings))/Math.max(1,vegetationLeafCost(leafSourceGeometry,settings))))) : settings.max_leaves;
    masterPlacements = authorUnits(masterPlacements, masterBranches, authoring.unit_editing, 'LEAF', Array.isArray(leafSourceGeometry) && leafSourceGeometry.length ? leafSourceGeometry : [{id:'DEFAULT',weight:1}], settings.leaf_scale, authoring.seeds.foliage, hasSurfaceCanopy(authoring)?Math.max(unitLimit,masterPlacements.length):unitLimit);
  }
  const placements = deriveLodPlacements(masterPlacements, branches, lod);
  let leafRecords = skeletonOnly ? [] : buildLeafMeshes(branches, placements, settings, leafSourceGeometry, resolvedMaterials.leaf, elements, authoring,
    options.resolveSources ? { branches: masterBranches, placements: masterPlacements } : null,options.instanced===true && hasSurfaceCanopy(authoring));
  leafRecords.forEach((leafRecord) => {
    foliageGroup.add(leafRecord.mesh);
    lookupRecords.push(leafRecord);
  });
  const markers = skeletonOnly ? [] : addMarkers(markerGroup, branches, settings, resolvedMaterials, state, createRng(stableSeed(authoring.seeds.foliage, `markers:${lodIndex}`)), authoring);
  markers.push(...addDamageScars(markerGroup, branches, settings, resolvedMaterials));
  markers.forEach((mesh) => { mesh.userData.category = 'marker'; });
  let blooms = [], masterBlooms = [], flowerBudgetLimited = false;
  if (!skeletonOnly && authoring.flowering.enabled && authoring.vine) {
    const f = authoring.flowering;
    masterBlooms = flowerPlacements(masterBranches, f, pointOnPolyline, (p, id) => foliageMasksAllow(p, id, authoring));
    const builtin = f.source ? null : defaultInflorescence();
    const source = f.source ? deserializeGeometry(f.source.geometry) : builtin.bracts;
    // Reserve the same conservative master geometry cost at every LOD, before
    // filtering whole inflorescences. A detailed imported flower cannot appear
    // in a distant LOD after having been removed from LOD0 by the budget.
    const masterRenderBranches = deriveLodBranches(masterBranches, settings, LOD_PROFILES[0]);
    const branchCost = masterRenderBranches.reduce((sum, b) => sum + 2 * Math.max(4, settings.radial_segments) * ((settings.adaptive_tessellation ? Math.max(b.points.length, adaptiveCurvePoints(b.points, settings.curvature_detail).length) : b.points.length) + (b.sections?.length || 0)), 0);
    const leafSources = normalizeLeafSources(leafSourceGeometry, settings);
    const leafCost = Math.max(0, ...leafSources.map((s) => (s.geometry.index?.count || s.geometry.attributes.position.count) / 3 + (settings.petiole_length > .0001 ? 8 : 0))) * masterPlacements.length;
    leafSources.filter((s) => s.owned).forEach((s) => s.geometry.dispose());
    const markerReserve = settings.regrowth > 0 || ['SPRING', 'BUD'].includes(settings.season) || settings.damage > 0 ? 10000 : 0;
    const perFlower = source.index.count / 3 + (builtin && f.core ? builtin.core.index.count / 3 : 0);
    const budgetCount = Math.max(0, Math.floor((settings.max_triangles - branchCost - leafCost - markerReserve) / Math.max(1, perFlower)));
    const active = new Set(branches.map((b) => b.id));
    flowerBudgetLimited = masterBlooms.length > budgetCount;
    masterBlooms = masterBlooms.slice(0, budgetCount);
    blooms = masterBlooms.filter((p) => active.has(p.branchId) && (lodIndex === 0 || p.priority < [1, .72, .45, .25][lodIndex]));
    const flowerGroup = new THREE.Group(); flowerGroup.name = '04_三角梅花序'; group.add(flowerGroup);
    const addFlowers = (geometry, material, type, name) => {
      const first = elements.length;
      const record = buildLeafMesh(branches, blooms, { ...settings, petiole_length: 0, leaf_aspect: 1 }, geometry, material, elements, 0, name);
      if (!record) return;
      elements.slice(first).forEach((e) => { e.type = type; });
      record.mesh.name = name; record.mesh.userData.category = 'flower';
      flowerGroup.add(record.mesh); lookupRecords.push(record);
    };
    addFlowers(source, f.shared_atlas && f.source ? resolvedMaterials.leaf : resolvedMaterials.flower, 'FLOWER', '三角梅_苞片花序');
    if (builtin && f.core && lodIndex < 2) addFlowers(builtin.core, resolvedMaterials.flowerCore, 'FLOWER_CORE', '三角梅_小花');
    source.dispose(); builtin?.core.dispose();
  }
  // Every LOD reserves the same master cost. Otherwise distant LODs can gain
  // plants which were absent from LOD0 because its ivy used more triangles.
  let vegetationReserve = 0;
  if (authoring.vine && authoring.vegetation.enabled) {
    vegetationReserve = vegetationBranchReserve(masterBranches, settings) + vegetationLeafCost(leafSourceGeometry, settings) * masterPlacements.length;
    if (masterBlooms.length) vegetationReserve += masterBlooms.length * (authoring.flowering.source?.geometry.index.length / 3 || 1000);
  }
  const vegetation = buildVegetation(!skeletonOnly && authoring.vine?authoring.vegetation:{...authoring.vegetation,enabled:false},authoring.surface_growth,lodIndex,elements,Math.max(0,settings.max_triangles-vegetationReserve));
  group.add(vegetation.group);lookupRecords.push(...vegetation.lookupRecords);
  let treeOrgans = [], treeOrganBudgetLimited = false;
  if (!authoring.vine && authoring.tree_organs.units.length) {
    const o = authoring.tree_organs;
    if (o.color) resolvedMaterials.flower.color.set(o.color);
    const organAssets = authoring.branch_instances.length > 0
      && authoring.branch_library.some((asset) => asset.organ_mode && asset.organ_source_ids.length);
    let candidates = organAssets ? authoring.branch_instances.flatMap((instance) => {
      const asset = resolveInstanceAsset(instance, authoring.branch_library);
      if (!asset) return [];
      const selected = o.units.map((unit, index) => ({ unit, index }))
        .filter(({ unit }) => asset.organ_source_ids.includes(unit.id));
      if (!selected.length) return [];
      let family = masterBranches.filter((branch) => branch.instanceId === instance.id);
      const mount = libraryFoliage && asset.sample ? family[0]?.mountMatrix : null;
      if(libraryFoliage && asset.sample) family=localSampleBranches(family,instance,asset).map(b=>({...b,stableId:instance.id+'.'+b.stableId}));
      const local = { ...o, mode: asset.organ_mode, amount: asset.organ_amount,
        max_count: asset.organ_max_count, scale: o.scale * (asset.organ_scale || 1), terminal_branches_only: asset.organ_terminal_only,
        order_min: 1, units: selected.map(({ unit }) => unit) };
      if(libraryFoliage && asset.sample?.authoring?.tree_organs) {
        const sampleOrgans=asset.sample.authoring.tree_organs;
        Object.assign(local,{habit:sampleOrgans.habit,order_min:sampleOrgans.order_min,scale:sampleOrgans.scale,
          terminal_branches_only:sampleOrgans.terminal_branches_only});
      }
      let organPlacements = treeOrganPlacements(family, local, stableSeed(authoring.seeds.organs, instance.id), pointOnPolyline,
        (p,id)=>foliageMasksAllow(mount ? p.clone().applyMatrix4(mount) : p,id,authoring,authoring.seeds.organs));
      if(libraryFoliage && asset.sample?.authoring?.unit_editing){
        const prefix=instance.id+'.',a=asset.sample.authoring.unit_editing;
        const edits={...a,rules:a.rules.map(r=>({...r,targets:r.targets.map(id=>prefix+id)})),items:a.items.map(v=>({...v,id:prefix+v.id,parent:prefix+v.parent})),removed:a.removed.map(id=>prefix+id)};
        organPlacements=authorUnits(organPlacements,family,edits,'ORGAN',local.units,.06);
      }
      return organPlacements.map((placement) => ({ ...mountSamplePlacement(placement,mount), source: selected[placement.source].index,
          sourceAssetId: asset.id, sourceInstanceId: instance.id }));
    }) : treeOrganPlacements(masterBranches, o, authoring.seeds.organs, pointOnPolyline,
      (p,id)=>foliageMasksAllow(p,id,authoring,authoring.seeds.organs));
    if (!organAssets) candidates = authorUnits(candidates, masterBranches, authoring.unit_editing, 'ORGAN', o.units, .06, authoring.seeds.organs, o.max_count);
    // Use the full-resolution cost before filtering preview LODs, so distant
    // previews never acquire organs missing from the exported full model.
    const baseBranches = deriveLodBranches(masterBranches, settings, LOD_PROFILES[0]);
    const branchCost = baseBranches.reduce((sum,b)=>sum+2*Math.max(4,settings.radial_segments)*((settings.adaptive_tessellation?Math.max(b.points.length,adaptiveCurvePoints(b.points,settings.curvature_detail).length):b.points.length)+(b.sections?.length||0)),0);
    const leafSources = normalizeLeafSources(leafSourceGeometry,settings);
    const leafCost = Math.max(0,...leafSources.map(s=>(s.geometry.index?.count||s.geometry.attributes.position.count)/3+(settings.petiole_length>.0001?8:0)))*masterPlacements.length;
    leafSources.filter(s=>s.owned).forEach(s=>s.geometry.dispose());
    let remaining = Math.max(0,settings.max_triangles-branchCost-leafCost-10000);
    const master = [];
    if(candidates.some(p=>p.unitEdited))candidates.sort((a,b)=>Number(!!b.unitEdited)-Number(!!a.unitEdited));
    for(const p of candidates){const cost=o.units[p.source].geometry.index.length/3;if(cost>remaining){treeOrganBudgetLimited=true;continue;}remaining-=cost;master.push(p);}
    const active = new Set(branches.map(b=>b.id));
    treeOrgans = master.filter(p=>active.has(p.branchId)&&(lodIndex===0||p.priority<[1,.72,.45,.25][lodIndex]));
    const organGroup = new THREE.Group(); organGroup.name='05_树种花果'; group.add(organGroup);
    const organOwners=new Map(authoring.branch_instances.map(instance=>[instance.id,resolveInstanceAsset(instance,authoring.branch_library)]));
    o.units.forEach((unit,i)=>{
      const bucket=treeOrgans.filter(p=>p.source===i);if(!bucket.length)return;
      const geometry=deserializeGeometry(unit.geometry);
      try{
        // A flower/fruit mesh can share its sample's leaf atlas, but never the
        // unrelated host tree's atlas. Keep ownership in both assembly paths.
        const owners=new Map();
        for(const p of bucket){
          const owner=organOwners.get(p.sourceInstanceId),key=owner?owner.id+':'+owner.revision:'';
          if(!owners.has(key))owners.set(key,{owner,placements:[]});owners.get(key).placements.push(p);
        }
        const organMaterials=new Map();
        for(const {owner,placements} of owners.values()){
          const texture=rawAuthoring?.__sampleOrganMaterial || (owner?.sample?sampleLeafMaterial(owner.sample,authoring.branch_library,authoring.leaf_material):null);
          const color=owner?.sample?.authoring?.tree_organs?.color ?? o.color;
          const solid=!!color&&['FLOWER','BUD'].includes(unit.role);
          let material=solid?resolvedMaterials.flower:resolvedMaterials.leaf;
          if(texture&&!solid){
            const key=owner?.id||'sample';
            if(!organMaterials.has(key)){
              const own=material.clone();own.sampleLeafMaterial=texture;
              own.name=sampleLeafMaterialName(unit.id,texture,rawAuthoring?.__sampleBaseMaterial||authoring.leaf_material);
              organMaterials.set(key,own);
            }
            material=organMaterials.get(key);
          }
          const record=buildLeafMesh(branches,placements,{...settings,petiole_length:0,leaf_aspect:1},geometry,material,elements,i,unit.name);
          record.mesh.name=unit.name;record.mesh.userData.category='tree_organ';record.mesh.userData.organ_role=unit.role;
          organGroup.add(record.mesh);lookupRecords.push(record);
        }
      }finally{geometry.dispose();}
    });
  }
  const lookupTexture = assignLookupUvs(lookupRecords, elements.length);
  group.traverse((object) => { if (object.isMesh && object.geometry) ensureGeometryTangents(object.geometry); });
  const report = analyzeGroup(group, settings);
  if(canopy.coverageReport)report.surface_canopy=canopy.coverageReport;
  if(masterPlacements.unitBudgetLimited)report.warnings.push('叶片生成达到当前单元数量上限，请缩小范围或增大节间距；手工单元优先保留');
  report.flower_count = blooms.length; report.flower_budget_limited = flowerBudgetLimited;
  report.tree_organ_count=treeOrgans.length;report.tree_organ_budget_limited=treeOrganBudgetLimited;
  if(treeOrganBudgetLimited)report.warnings.push('树种花果已按面数预算减少；可提高面数上限或降低花果密度');
  report.vegetation_count=vegetation.placements.length;report.vegetation_budget_limited=vegetation.limited;
  if(vegetation.limited)report.warnings.push('场景植物已按三角面预算截减；可提高预算、降低密度或使用低面数单元');
  if (flowerBudgetLimited) report.warnings.push('花序已按三角面预算减少；可提高面数上限或降低花序网格复杂度');
  report.attachment_overlap_ratio = attachmentOverlapRatio(placements, settings.leaf_min_spacing);
  report.attachment_overlap_limit = authoring.quality.max_attachment_overlap;
  if (report.attachment_overlap_ratio > report.attachment_overlap_limit) {
    report.ok = false;
    report.warnings.push(`附着物重叠率 ${(report.attachment_overlap_ratio * 100).toFixed(1)}%，超过 ${(report.attachment_overlap_limit * 100).toFixed(1)}%`);
  }
  group.userData = {
    generator: `Procedural Branch Generator ${GENERATOR_VERSION}`,
    format: PROJECT_FORMAT, lod: lodIndex, seed: settings.seed, settings, authoring_version: authoring.version,
    branch_count: branches.length, leaf_count: placements.length,
    hierarchy_elements: elements.length, lookup_texture: lookupTexture,
    wind_mode: settings.wind_mode,
  };
  foliageUnits.dispose();
  return {
    skeletonOnly,
    materialize: leafRecords.some(r=>r.mesh.isInstancedMesh) ? ()=>{const expanded=materializeCanopyRecords(leafRecords);assignLookupUvs(expanded,elements.length);leafRecords=expanded;} : undefined,
    group, branches, masterBranches, masterPlacements, elements, placements, blooms, masterBlooms, treeOrgans, settings, authoring: skeletonOnly ? rawAuthoring || authoring : authoring, state, report, lookupTexture,
    materials: resolvedMaterials, ownsMaterials: ownedMaterials, vegetation,
  };
}

export function disposeBranchAsset(asset) {
  asset?.activeEditPreview?.restore();
  asset?.disposeCompiledSamples?.();
  const baseMaterials = new Set(Object.values(asset?.materials || {}));
  const meshMaterials = new Set();
  const vegetationMaterials = new Set(asset?.vegetation?.materials || []);
  asset?.group?.traverse((object) => {
    if (!object.isMesh) return;
    if(object.userData.canopy_instances)object.dispose();
    object.geometry?.dispose?.();
    for (const m of Array.isArray(object.material) ? object.material : [object.material]) if (m) meshMaterials.add(m);
  });
  // Tint variants are owned by this asset but are absent from its base palette.
  for (const m of meshMaterials) if (!baseMaterials.has(m) && !vegetationMaterials.has(m) && (asset?.ownsMaterials || m.sampleLeafMaterial)) {
    if(m.sampleLeafMaterial)for(const key of ['map','normalMap'])if(m[key]?.userData?.orbigen_export)m[key].dispose();
    m.dispose();
  }
  asset?.vegetation?.materials.forEach(m=>{for(const key of ['map','normalMap'])if(m[key]?.userData?.orbigen_export)m[key].dispose();m.dispose();});
  if (asset?.ownsMaterials) disposeMaterials(asset.materials);
}

export function hierarchyTexturePayload(asset) {
  const { elements, lookupTexture } = asset;
  const bounds = new THREE.Box3().setFromObject(asset.group);
  const size = bounds.getSize(new THREE.Vector3());
  const maximumExtent = elements.reduce((maximum,element)=>Math.max(maximum,element.extent),.001);
  const count = lookupTexture.width * lookupTexture.height * 4;
  const pivotParent = new Uint16Array(count);
  const axisExtent = new Uint16Array(count);
  const encode01 = (value) => Math.round(clamp(value, 0, 1) * 65535);
  elements.forEach((element, index) => {
    const offset = index * 4;
    pivotParent[offset] = encode01((element.pivot[0] - bounds.min.x) / Math.max(size.x, 1e-6));
    pivotParent[offset + 1] = encode01((element.pivot[1] - bounds.min.y) / Math.max(size.y, 1e-6));
    pivotParent[offset + 2] = encode01((element.pivot[2] - bounds.min.z) / Math.max(size.z, 1e-6));
    pivotParent[offset + 3] = encode01((element.parentIndex + 1) / Math.max(1, elements.length));
    axisExtent[offset] = encode01(element.axis[0] * 0.5 + 0.5);
    axisExtent[offset + 1] = encode01(element.axis[1] * 0.5 + 0.5);
    axisExtent[offset + 2] = encode01(element.axis[2] * 0.5 + 0.5);
    axisExtent[offset + 3] = encode01(element.extent / maximumExtent);
  });
  return {
    width: lookupTexture.width, height: lookupTexture.height, pivotParent, axisExtent,
    metadata: {
      format: 'BranchHierarchyTexture16', version: 1, element_count: elements.length,
      bounds_min_m: bounds.min.toArray(), bounds_size_m: size.toArray(), maximum_extent_m: maximumExtent,
      uv_channel: 1, pivot_parent_channels: 'RGB=normalized pivot, A=(parent+1)/elementCount',
      axis_extent_channels: 'RGB=axis*0.5+0.5, A=extent/maxExtent',
    },
  };
}

export function createProjectDocument(asset, leafGeometry = null, rawAuthoring = null) {
  const leafMeshes = Array.isArray(leafGeometry)
    ? leafGeometry.filter((item) => item?.geometry).map((item, index) => ({
      ...(item.manual_only ? { manual_only: true } : {}),
      id: item.id || `LEAF_${index + 1}`, name: item.name || `叶片 ${index + 1}`,
      weight: number(item.weight, 1), orderMin: number(item.orderMin, 0), orderMax: number(item.orderMax, 3), season: item.season || 'ANY',
      ageStage: item.ageStage || 'ANY',
      shootRole: item.shootRole || 'ANY',
      ...(item.colorTint ? { colorTint: item.colorTint } : {}),
      calibration: item.calibration || { scale: 1, rotation: 0, flip: false }, geometry: serializeGeometry(item.geometry),
    }))
    : leafGeometry ? [{ id: 'LEAF_1', name: leafGeometry.userData.sourceName || '导入叶片', weight: 1, geometry: serializeGeometry(leafGeometry) }] : [];
  return {
    format: PROJECT_FORMAT,
    version: 4,
    generator_version: GENERATOR_VERSION,
    saved_at: new Date().toISOString(),
    settings: asset.settings,
    authoring: normalizeAuthoring(rawAuthoring || asset.authoring || DEFAULT_AUTHORING, asset.settings.seed),
    leaf_meshes: leafMeshes,
    leaf_mesh: null,
    summary: {
      branches: asset.branches.length, leaves: asset.placements.length,
      elements: asset.elements.length, report: asset.report,
    },
  };
}

export function createManifest(asset, lodReports = []) {
  return {
    format: 'UEBranchAssetManifest', version: 4, generator: `Procedural Branch Generator ${GENERATOR_VERSION}`,
    object_name: asset.settings.object_name, seed: asset.settings.seed,
    plant_type: asset.authoring.vine && asset.authoring.vegetation.enabled ? (asset.authoring.vegetation.mode === 'REGION' ? 'MIXED_VEGETATION' : asset.authoring.vegetation.kind) : asset.authoring.vine ? (asset.authoring.flowering.enabled ? 'BOUGAINVILLEA' : asset.authoring.vine.species === 'IVY' ? 'IVY' : 'VINE') : 'BRANCH', vine_recipe: asset.authoring.vine || null,
    flowering: asset.authoring.vine && asset.authoring.flowering.enabled ? { ...asset.authoring.flowering, source: asset.authoring.flowering.source?.name || 'builtin', material: undefined, flower_count: asset.blooms.length } : null,
    vegetation: asset.authoring.vegetation.enabled ? { mode: asset.authoring.vegetation.mode, kind: asset.authoring.vegetation.kind, seed: asset.authoring.vegetation.seed, count: asset.vegetation.placements.length, material_slots: [...asset.vegetation.materials.values()].map(m => m.name) } : null,
    coordinate_system: { up: 'Z', forward: '-Y', unit: 'centimeter', source_unit: 'meter' },
    pivot: 'branch_root_at_world_origin',
    materials: { bark: 'M_Bark', leaf: 'M_Leaf', bud: 'M_Bud', fruit: 'M_Fruit', cut_scar: 'M_CutScar', ...(asset.authoring.vine && asset.authoring.flowering.enabled ? { flower: asset.authoring.flowering.source && asset.authoring.flowering.shared_atlas ? 'M_Leaf' : 'M_Flower', flower_core: 'M_FlowerCore' } : {}) },
    material_instance_parameters: {
      BarkTint: asset.settings.bark_color, LeafTint: asset.authoring.leaf_material?.color ? '#ffffff' : asset.state.leafColor,
      WindStrength: asset.settings.wind_strength, Health: asset.settings.health,
      SeasonProgress: asset.settings.season_progress, TwoSidedLeaf: asset.settings.leaf_double_sided,
    },
    uv_contract: { uv0: 'material_uv', uv1: 'hierarchy_lookup', uv2: 'reserved_lightmap' },
    vertex_color_contract: { r: 'bend_weight_root_to_tip', g: 'hierarchy_order_or_phase', b: 'leaf_flutter_weight', a: 'health_or_random_mask' },
    wind_mode: asset.settings.wind_mode,
    export_profile: asset.settings.export_profile,
    geometry_profile: {
      cross_section: asset.settings.cross_section, oval_ratio: asset.settings.oval_ratio,
      junction_flare: asset.settings.junction_flare, bark_seam_degrees: asset.settings.bark_seam,
      bark_tiling: asset.settings.bark_tiling, adaptive_tessellation: asset.settings.adaptive_tessellation,
      curvature_detail: asset.settings.curvature_detail, radius_bias: asset.settings.radius_bias,
      groove_count: asset.settings.groove_count, groove_depth: asset.settings.groove_depth,
      knot_strength: asset.settings.knot_strength, junction_collar: asset.settings.junction_collar,
    },
    foliage_profile: {
      mode: asset.settings.foliage_mode, cluster_leaf_count: asset.settings.cluster_leaf_count,
      petiole_length_m: asset.settings.petiole_length, mask_count: asset.authoring.foliage_masks.length,
      attachment_layers: asset.authoring.attachment_layers.map((layer) => ({ id: layer.id, name: layer.name, type: layer.type, enabled: layer.enabled, density: layer.density })),
    },
    deterministic_seeds: asset.authoring.seeds,
    authoring: {
      version: asset.authoring.version, root_count: asset.authoring.root_count,
      modifier_count: asset.authoring.modifiers.length, local_override_count: Object.keys(asset.authoring.overrides).length,
      manual_branch_count: asset.authoring.manual_branches.length, manual_leaf_count: asset.authoring.leaf_edits.added.length,
      selection_set_count: Object.keys(asset.authoring.selection_sets).length,
      foliage_mask_count: asset.authoring.foliage_masks.length,
      topology_operation_count: asset.authoring.topology.operations.length,
      reparent_count: Object.keys(asset.authoring.topology.reparent).length,
      edited_curve_count: Object.values(asset.authoring.overrides).filter((override) => override.curve_knots?.length > 1 || override.frozen_points?.length > 1).length,
      curve_editor: asset.authoring.curve_editor,
      phenotype: asset.authoring.phenotype,
      timeline: { time: asset.authoring.timeline.time, keyframe_count: asset.authoring.timeline.keyframes.length, snapshots: asset.authoring.timeline.snapshots },
      wind_profile: asset.authoring.wind_profile,
      recipe: asset.authoring.recipe,
    },
    hierarchy_texture: asset.settings.wind_mode === 'HIERARCHY_TEXTURE' ? hierarchyTexturePayload(asset).metadata : null,
    sockets: asset.settings.export_sockets ? [{ name: 'Socket_Root', position_cm: [0, 0, 0], rotation: [0, 0, 0] }] : [],
    pcg: asset.settings.export_pcg_metadata ? {
      asset_type: 'BranchUnit', species: asset.settings.species_profile, architecture: asset.settings.architecture,
      season: asset.settings.season, health: asset.settings.health, bounds_unit: 'centimeter',
    } : null,
    lods: lodReports,
    validation: asset.report,
    readiness: {
      target_platform: 'Windows / Unreal Engine 5.6-5.7',
      build_configuration: 'Static Mesh asset import',
      test_scenario: 'Deterministic Orbigen asset build, cold generation per LOD',
      generation_budget_ms: asset.settings.generation_budget_ms,
      geometry_go: lodReports.every((lod) => lod.valid),
      performance_go: lodReports.every((lod) => lod.performance_ok),
      triangle_budget_go: lodReports.every((lod) => lod.triangle_budget_ok),
      attachment_overlap_go: asset.report.attachment_overlap_ratio <= asset.authoring.quality.max_attachment_overlap,
      blockers: [
        ...lodReports.flatMap((lod) => [
          ...(lod.valid ? [] : [`LOD${lod.lod}: geometry or master derivation failed`]),
          ...(lod.performance_ok ? [] : [`LOD${lod.lod}: generation exceeded ${asset.settings.generation_budget_ms} ms`]),
          ...(lod.triangle_budget_ok ? [] : [`LOD${lod.lod}: triangle budget exceeded`]),
        ]),
        ...(asset.report.attachment_overlap_ratio <= asset.authoring.quality.max_attachment_overlap ? [] : ['Attachment overlap ratio exceeded quality limit']),
      ],
    },
    ue_import: {
      combine_meshes: true, import_vertex_colors: 'Replace', import_normals_and_tangents: true,
      leaf_material_two_sided: asset.settings.leaf_double_sided,
      collision_mode: asset.settings.collision_mode,
      destination_path: asset.settings.ue_destination,
      nanite_policy: asset.settings.nanite_policy,
      material_setup: asset.settings.export_material_setup,
      lod_screen_sizes: asset.settings.export_profile === 'MOBILE' ? [1, 0.55, 0.25, 0.08] : [1, 0.65, 0.35, 0.12],
      collision_note: asset.settings.collision_mode === 'NONE' ? 'No custom collision geometry included' : 'UCX collision geometry included on LOD0 bark mesh',
    },
    performance_contract: {
      target_platform: 'Windows / UE 5.6-5.7', build_configuration: 'Development and Shipping Static Mesh content',
      test_map: asset.settings.test_map, capture_duration_s: asset.settings.capture_duration_s,
      scenario: 'Fixed camera, warm cache, one branch unit and dense PCG population pass',
      required_metrics: ['stat unit median ms', 'stat gpu median ms', 'stat scenerendering draw calls', 'memreport -full resident mesh memory'],
    },
  };
}
