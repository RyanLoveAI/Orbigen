import * as THREE from '/vendor/three/three.module.js';
import { normalizeProfile } from './generator-data.js';
import { normalizeSections, normalizeJunction, captureSkeletonRadius } from './branch-shaping.js';
import { INSTANCE_SCALE_MIN, INSTANCE_SCALE_MAX } from './assembly-scale.js';

const finite = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const clamp = (v, min, max, fallback = min) => Math.max(min, Math.min(max, finite(v, fallback)));
const vec = (v, fallback = [0, 0, 0]) => fallback.map((f, i) => clamp(v?.[i], -1000, 1000, f));
const id = (v) => String(v || '').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 128);
// Copy editable containers without serializing multi-megabyte atlas strings.
// Strings are immutable and may safely be shared between independent snapshots.
export function copy(v) {
  if (v == null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'object') return undefined;
  if (typeof v.toJSON === 'function') return copy(v.toJSON());
  if (Array.isArray(v)) return v.map(item => copy(item) ?? null);
  const result = {};
  for (const key of Object.keys(v)) { const item = copy(v[key]); if (item !== undefined) Object.defineProperty(result, key, { value:item, enumerable:true, writable:true, configurable:true }); }
  return result;
}

// Compare document data directly; serializing history would duplicate its atlases.
export function equalData(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equalData(a[key], b[key]));
}

export function normalizeBranchShape(raw) {
  if (!Array.isArray(raw?.branches)) return null;
  const seen = new Set();
  const branches = [];
  for (const item of raw.branches.slice(0, 2200)) {
    if (!item || !Array.isArray(item.points) || item.points.length < 2) continue;
    const key = id(item.id); const parent = id(item.parent);
    if (!key || seen.has(key) || (parent && !seen.has(parent)) || (!parent && branches.length)) continue;
    seen.add(key);
    const points = item.points.slice(0, 512).map((p) => vec(p));
    branches.push({ id: key, parent, attach: clamp(item.attach, 0, 1), order: parent ? Math.min(3, branches.find((b) => b.id === parent).order + 1) : 0,
      points, knots: (item.knots?.length > 1 ? item.knots : points).slice(0, 64).map((p) => vec(p)),
      length: clamp(item.length, 0.001, 100, 1), start_radius: clamp(item.start_radius, 0.001, 5, 0.035),
      end_radius: clamp(item.end_radius, 0.0001, 5, 0.003), radius_profile: normalizeProfile(item.radius_profile),
      sections: normalizeSections(item.sections),
    });
  }
  if (!branches.length) return null;
  const direction = new THREE.Vector3(...vec(raw.connector?.direction, [1, 0, 0]));
  if (direction.lengthSq() < 1e-8) direction.set(1, 0, 0);
  return { branches, connector: { position: vec(raw.connector?.position, branches[0].points[0]), direction: direction.normalize().toArray(), locked: raw.connector?.locked !== false } };
}

export function normalizeBranchLibrary(raw) {
  const seen = new Set();
  return (Array.isArray(raw) ? raw : []).slice(0, 100).flatMap((item) => {
    const shape = normalizeBranchShape(item?.shape); const key = id(item?.id);
    if (!key || !shape || seen.has(key)) return [];
    seen.add(key);
    const versions = [], revisions = new Set();
    for (const v of (Array.isArray(item.versions) ? item.versions : []).slice(-20)) {
      const saved = normalizeBranchShape(v?.shape), revision = Math.round(clamp(v?.revision, 1, 100000, 1));
      if (!saved || revisions.has(revision)) continue; revisions.add(revision);
      versions.push({ revision, shape: saved, name: String(v.name || item.name || '枝条素材').slice(0, 80), thumbnail: /^data:image\/(png|jpeg|webp);base64,/.test(v.thumbnail || '') && v.thumbnail.length < 400000 ? v.thumbnail : '',
        sample: v.sample && typeof v.sample === 'object' ? copy(v.sample) : null,
        leaf_source_ids: Array.isArray(v.leaf_source_ids) ? v.leaf_source_ids.map(id) : undefined,
        leaf_density_multiplier: v.leaf_density_multiplier, leaf_scale_multiplier: v.leaf_scale_multiplier,
        organ_mode: v.organ_mode, organ_source_ids: v.organ_source_ids, organ_amount: v.organ_amount,
        organ_max_count: v.organ_max_count, organ_scale: v.organ_scale, organ_terminal_only: v.organ_terminal_only });
    }
    return [{ id: key, name: String(item.name || '枝条素材').slice(0, 80), revision: Math.round(clamp(item.revision, 1, 100000, 1)), shape, versions,
      leaf_source_ids: [...new Set((Array.isArray(item.leaf_source_ids) ? item.leaf_source_ids : []).map(id).filter(Boolean))].slice(0, 64),
      leaf_density_multiplier: clamp(item.leaf_density_multiplier, 0.05, 4, 1),
      leaf_scale_multiplier: clamp(item.leaf_scale_multiplier, 0.1, 4, 1),
      organ_mode: ['FLOWER', 'FRUIT', 'MIXED'].includes(item.organ_mode) ? item.organ_mode : '',
      organ_source_ids: [...new Set((Array.isArray(item.organ_source_ids) ? item.organ_source_ids : []).map(id).filter(Boolean))].slice(0, 24),
      organ_amount: clamp(item.organ_amount, 0, 1, 0.65),
      organ_max_count: Math.round(clamp(item.organ_max_count, 0, 20, 0)),
      organ_scale: clamp(item.organ_scale, 0.1, 4, 1),
      organ_terminal_only: item.organ_terminal_only === true,
      sample: item.sample && typeof item.sample === 'object' ? copy(item.sample) : null,
      thumbnail_render_version: String(item.thumbnail_render_version || '').slice(0, 40),
      thumbnail_revision: Math.round(clamp(item.thumbnail_revision, 0, 100000, 0)),
      thumbnail: /^data:image\/(png|jpeg|webp);base64,/.test(item.thumbnail || '') && item.thumbnail.length < 400000 ? item.thumbnail : '' }];
  });
}

export function normalizeBranchInstances(raw) {
  const seen = new Set();
  return (Array.isArray(raw) ? raw : []).slice(0, 1600).flatMap((item) => {
    if (!item || !id(item.id) || seen.has(id(item.id))) return [];
    seen.add(id(item.id));
    return [{ id: id(item.id), asset_id: id(item.asset_id), linked: item.linked === true, pinned_revision: Math.round(clamp(item.pinned_revision, 0, 100000, 0)), shape: normalizeBranchShape(item.shape), parent: id(item.parent),
      array_id: id(item.array_id), array_index: Math.round(clamp(item.array_index, 0, 255, 0)), radius_scale: clamp(item.radius_scale, 0.05, 5, 1),
      ...(item.assembly_locked === true ? {assembly_locked:true} : {}),
      ...(item.assembly_refined === true ? {assembly_refined:true} : {}),
      shootRole: ['MATURE', 'MIXED', 'YOUNG'].includes(item.shootRole) ? item.shootRole : 'ANY',
      attach: clamp(item.attach, 0, 1, 0.65), angle: clamp(item.angle, 0, 180, 45), azimuth: clamp(item.azimuth, -180, 180, 0), roll: clamp(item.roll, -180, 180, 0),
      scale: clamp(item.scale, INSTANCE_SCALE_MIN, INSTANCE_SCALE_MAX, 1), variation: clamp(item.variation, 0, 0.8), seed: Math.round(clamp(item.seed, 1, 2147483646, 1)),
      junction: normalizeJunction(item.junction),
      frame: item.frame ? { position: vec(item.frame.position), direction: vec(item.frame.direction, [1, 0, 0]), parent_tangent: vec(item.frame.parent_tangent, [0, 0, 1]), parent_position: item.frame.parent_position ? vec(item.frame.parent_position) : null } : null }];
  });
}

export function resolveInstanceShape(instance, library) {
  if (!instance?.linked) return instance?.shape || null;
  const item = library.find((a) => a.id === instance.asset_id);
  if (!item) return instance.shape;
  if (!instance.pinned_revision || instance.pinned_revision === item.revision) return item.shape;
  return item.versions?.find((v) => v.revision === instance.pinned_revision)?.shape || instance.shape;
}

export function resolveInstanceAsset(instance, library) {
  if (!instance?.linked) return null;
  const item = library.find((asset) => asset.id === instance.asset_id);
  if (!item) return null;
  if (!instance.pinned_revision || instance.pinned_revision === item.revision) return item;
  const version = item.versions?.find((entry) => entry.revision === instance.pinned_revision);
  return version ? { ...item, ...Object.fromEntries(Object.entries(version).filter(([, value]) => value !== undefined && value !== null)) } : item;
}

export function nextAssetVersion(previous, shape, thumbnail, name = previous.name, changes = {}) {
  const fields = ['sample', 'leaf_source_ids', 'leaf_density_multiplier', 'leaf_scale_multiplier', 'organ_mode', 'organ_source_ids', 'organ_amount', 'organ_max_count', 'organ_scale', 'organ_terminal_only'];
  const snapshot = Object.fromEntries(fields.map((key) => [key, copy(previous[key] ?? null)]));
  const versions = [...(previous.versions || []), { revision: previous.revision, shape: copy(previous.shape), thumbnail: previous.thumbnail, name: previous.name, ...snapshot }];
  return { ...previous, ...changes, shape, thumbnail, name, revision: previous.revision + 1, versions: versions.slice(-20) };
}

export function captureBranchShape(branches, rootId, preserveIds = false) {
  const root = branches.find((b) => b.stableId === rootId);
  if (!root) throw new Error('请先选择一根枝条');
  const origin = root.points[0].clone();
  const tangent = root.points[1].clone().sub(origin).normalize();
  const rotation = new THREE.Quaternion().setFromUnitVectors(tangent, new THREE.Vector3(1, 0, 0));
  const transform = (p) => p.clone().sub(origin).applyQuaternion(rotation).toArray();
  const queue = [root]; const records = []; const mapping = {};
  while (queue.length) {
    const branch = queue.shift();
    if (mapping[branch.stableId]) continue;
    const key = preserveIds ? branch.stableId : branch === root ? 'R1' : `B${records.length}`;
    mapping[branch.stableId] = key;
    const parent = branches.find((b) => b.id === branch.parentId);
    records.push({ id: key, parent: branch === root ? '' : mapping[parent?.stableId], attach: branch.parentT, points: branch.points.map(transform),
      knots: branch.controlPoints.map(transform), length: branch.length, start_radius: branch.startRadius, end_radius: branch.endRadius, radius_profile: branch.radiusProfile, sections: branch.sections,
      ...captureSkeletonRadius(branch, branch===root) });
    branches.filter((b) => b.parentId === branch.id).forEach((b) => queue.push(b));
  }
  const parent = branches.find((b) => b.id === root.parentId);
  if(preserveIds){
    const order=new Map(branches.map((b,i)=>[b.stableId,i]));
    records.sort((a,b)=>order.get(a.id)-order.get(b.id));
  }
  return { shape: normalizeBranchShape({ branches: records }), source: { root: rootId, ids: Object.keys(mapping), parent: parent?.stableId || '', attach: root.parentT,
    frame: { position: origin.toArray(), direction: tangent.toArray(), parent_position: parent ? samplePoint(parent.points, root.parentT).toArray() : null, parent_tangent: parent ? sampleTangent(parent.points, root.parentT).toArray() : [0, 0, 1] } } };
}

export function samplePoint(points, t) {
  const at = Math.max(0, Math.min(1, t)) * (points.length - 1); const i = Math.min(points.length - 2, Math.floor(at));
  return points[i].clone().lerp(points[i + 1], at - i);
}
export function sampleTangent(points, t) {
  const i = Math.min(points.length - 2, Math.floor(Math.max(0, Math.min(1, t)) * (points.length - 1)));
  const direction = points[i + 1].clone().sub(points[i]);
  return direction.lengthSq() > 1e-12 ? direction.normalize() : new THREE.Vector3(1, 0, 0);
}

export function transformBranchShape(shape, position, direction, scale = 1, roll = 0) {
  const from = new THREE.Vector3(...shape.connector.direction);
  const rotation = new THREE.Quaternion().setFromUnitVectors(from, direction.clone().normalize());
  rotation.premultiply(new THREE.Quaternion().setFromAxisAngle(direction.clone().normalize(), roll * Math.PI / 180));
  const origin = new THREE.Vector3(...shape.connector.position);
  const transform = (p) => new THREE.Vector3(...p).sub(origin).multiplyScalar(scale).applyQuaternion(rotation).add(position).toArray();
  return shape.branches.map((b) => ({ ...copy(b), points: b.points.map(transform), knots: b.knots.map(transform), length: b.length * scale, start_radius: b.start_radius * scale, end_radius: b.end_radius * scale }));
}

export function blankBranchShape() {
  return normalizeBranchShape({ branches: [{ id: 'R1', parent: '', points: [[0, 0, 0.7], [0.35, 0, 0.72], [0.7, 0, 0.8], [1.05, 0, 0.94], [1.4, 0, 1.02]], length: 1.45, start_radius: 0.035, end_radius: 0.004 }] });
}
