import * as THREE from 'three';
import { lineTangent, sampleLine, sculptOverrides } from './tree-sculpt.js';

export const SELECTION_TOOLS = new Set(['BOX_SELECT', 'LASSO_SELECT']);
export const TRANSFORM_TOOLS = new Set(['BUNDLE_MOVE', 'BUNDLE_ROTATE', 'BUNDLE_SCALE']);

export function descendants(branches, selected) {
  const result = new Set(selected);
  let expanded = true;
  const byId = new Map(branches.map((branch) => [branch.id, branch]));
  while (expanded) {
    expanded = false;
    for (const branch of branches) {
      if (!result.has(branch.stableId) && result.has(byId.get(branch.parentId)?.stableId)) {
        result.add(branch.stableId); expanded = true;
      }
    }
  }
  return result;
}

export function selectionRoots(branches, selected) {
  const byId = new Map(branches.map((branch) => [branch.id, branch]));
  return branches.filter((branch) => {
    if (!selected.has(branch.stableId)) return false;
    let parent = byId.get(branch.parentId);
    const seen = new Set([branch.id]);
    while (parent && !seen.has(parent.id)) {
      if (selected.has(parent.stableId)) return false;
      seen.add(parent.id); parent = byId.get(parent.parentId);
    }
    return true;
  });
}

const cross2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function onSegment(a, b, p) {
  return Math.abs(cross2(a, b, p)) < 1e-6 && p[0] >= Math.min(a[0], b[0]) - 1e-6 && p[0] <= Math.max(a[0], b[0]) + 1e-6
    && p[1] >= Math.min(a[1], b[1]) - 1e-6 && p[1] <= Math.max(a[1], b[1]) + 1e-6;
}
export function insidePolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j]; const b = polygon[i];
    if (onSegment(a, b, point)) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function polylineInRegion(points, polygon) {
  if (polygon.length < 3 || points.length < 2) return false;
  if (points.some((point) => point[2] >= -1 && point[2] <= 1 && insidePolygon(point, polygon))) return true;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]; const b = points[i];
    if (a[2] < -1 || a[2] > 1 || b[2] < -1 || b[2] > 1) continue;
    for (let j = 0; j < polygon.length; j += 1) {
      const c = polygon[j]; const d = polygon[(j + 1) % polygon.length];
      const abC = cross2(a, b, c); const abD = cross2(a, b, d);
      const cdA = cross2(c, d, a); const cdB = cross2(c, d, b);
      if ((abC * abD < 0 && cdA * cdB < 0) || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b)) return true;
    }
  }
  return false;
}

export function combineSelection(current, hits, operation) {
  if (operation === 'REPLACE') return new Set(hits);
  const result = new Set(current);
  hits.forEach((id) => { if (operation === 'SUBTRACT') result.delete(id); else result.add(id); });
  return result;
}

// Each selected subtree receives one matrix, even when its parent and children are all selected.
export function transformBundles(snapshot, selected, { pivot, translation, rotation, scale, individual = false, keepRoots = true }) {
  const branches = [...snapshot.values()];
  const roots = selectionRoots(branches, selected);
  const owners = new Map();
  const matrices = new Map();
  roots.forEach((root) => {
    const ids = descendants(branches, new Set([root.stableId]));
    if (branches.some((branch) => ids.has(branch.stableId) && branch.pins.size)) return;
    const center = individual ? root.points[0] : pivot;
    const matrix = new THREE.Matrix4().compose(center.clone().add(translation), rotation, scale)
      .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
    matrices.set(root.id, matrix);
    branches.forEach((branch) => { if (ids.has(branch.stableId)) owners.set(branch.id, root.id); });
  });
  const output = new Map(snapshot);
  const done = new Set();
  const visit = (branch) => {
    if (done.has(branch.id) || !owners.has(branch.id)) return output.get(branch.id);
    done.add(branch.id);
    const owner = owners.get(branch.id);
    const matrix = matrices.get(owner);
    const parent = snapshot.get(branch.parentId);
    const updatedParent = parent ? visit(parent) : null;
    const knots = branch.controlPoints.map((point) => point.clone().applyMatrix4(matrix));
    const points = branch.points.map((point) => point.clone().applyMatrix4(matrix));
    if (parent && owners.get(parent.id) === owner) {
      const from = sampleLine(parent.points, branch.parentT).applyMatrix4(matrix);
      const idealParent = parent.points.map((point) => point.clone().applyMatrix4(matrix));
      const to = sampleLine(updatedParent.points, branch.parentT);
      const correction = new THREE.Quaternion().setFromUnitVectors(lineTangent(idealParent, branch.parentT), lineTangent(updatedParent.points, branch.parentT));
      [...knots, ...points].forEach((point) => point.sub(from).applyQuaternion(correction).add(to));
    }
    const corrections = knots.map(() => new THREE.Vector3());
    if (branch.id === owner && keepRoots) {
      const delta = branch.controlPoints[0].clone().sub(knots[0]);
      corrections.forEach((value, i) => value.addScaledVector(delta, Math.pow(1 - i / (knots.length - 1), 3)));
    }
    knots.forEach((point, i) => point.add(corrections[i]));
    points.forEach((point, i) => point.add(sampleLine(corrections, branch.sampleBindings[i])));
    points[0].copy(knots[0]); points.at(-1).copy(knots.at(-1));
    const updated = { ...branch, controlPoints: knots, points };
    output.set(branch.id, updated);
    return updated;
  };
  branches.forEach(visit);
  return output;
}

export function bundleOverrides(snapshot, updated, previous) {
  const overrides = sculptOverrides(snapshot, updated, previous);
  updated.forEach((branch) => {
    if (!overrides[branch.stableId]) return;
    const parent = updated.get(branch.parentId);
    if (parent) overrides[branch.stableId].offset = branch.points[0].clone().sub(sampleLine(parent.points, branch.parentT)).toArray();
  });
  return overrides;
}

// Isolation changes only viewport draw indices; the full mesh and export graph remain available.
export function createIsolationView(asset) {
  if (asset.isInstancedAssembly) {
    let expanded;
    return { apply(ids) { if (!ids && asset.isInstancedAssembly) return; asset.materialize(); expanded ||= createIsolationView(asset); expanded.apply(ids); } };
  }
  if(asset.group.getObjectsByProperty('isInstancedMesh',true).some(o=>o.userData.canopy_instances)){
    let expanded;return {apply(ids){if(!ids&&!expanded)return;asset.materialize();expanded ||= createIsolationView(asset);expanded.apply(ids);}};
  }
  const records = [];
  asset.group.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const record = { mesh, index: mesh.geometry.index, visible: mesh.visible, leafOwners: null };
    if (['leaf', 'flower'].includes(mesh.userData.category)) {
      const uv = mesh.geometry.getAttribute('uv1');
      record.leafOwners = Array.from({ length: uv.count }, (_, i) => {
        const element = asset.elements[Math.floor(uv.getY(i) * asset.lookupTexture.height) * asset.lookupTexture.width + Math.floor(uv.getX(i) * asset.lookupTexture.width)];
        return asset.elements[element?.parentIndex]?.id;
      });
    }
    records.push(record);
  });
  return {
    apply(visibleIds) {
      records.forEach(({ mesh, index, visible, leafOwners }) => {
        if (!visibleIds) { mesh.visible = visible; if (leafOwners) mesh.geometry.setIndex(index); return; }
        if (leafOwners) {
          const indices = [];
          const count = index?.count || leafOwners.length;
          for (let i = 0; i < count; i += 3) {
            const a = index ? index.getX(i) : i;
            if (visibleIds.has(leafOwners[a])) indices.push(a, index ? index.getX(i + 1) : i + 1, index ? index.getX(i + 2) : i + 2);
          }
          mesh.geometry.setIndex(indices); mesh.visible = visible && indices.length > 0;
        } else {
          const id = mesh.userData.stable_id || mesh.userData.branch_id;
          const stableId = typeof id === 'number' ? asset.branches.find((branch) => branch.id === id)?.stableId : id;
          mesh.visible = visible && (!stableId || visibleIds.has(stableId));
        }
      });
    },
  };
}
