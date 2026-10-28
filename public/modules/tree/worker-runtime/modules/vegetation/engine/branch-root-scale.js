import * as THREE from '/vendor/three/three.module.js';
import { descendants, selectionRoots } from './branch-selection.js';
import { sampleLine, lineTangent } from './tree-sculpt.js';

// Scale support curves from each selected root. Installed units are rigid
// passengers of their attachment frames, never part of the scaling matrix.
export function evaluateRootScale(branches, operation, strength = 1, overrides = {}) {
  const byId = new Map(branches.map(b => [b.id, b])), owners = new Map();
  for (const root of selectionRoots(branches, new Set(operation.targets))) {
    if (root.unitOwner || root.instanceId || root.symmetryGroup) continue;
    const family = descendants(branches, new Set([root.stableId]));
    if (branches.some(b => family.has(b.stableId) && overrides[b.stableId]?.pinned_points?.length)) continue;
    for (const b of branches) if (family.has(b.stableId)) owners.set(b.id, root.points[0]);
  }
  const scale = new THREE.Vector3(...operation.scale).lerp(new THREE.Vector3(1, 1, 1), 1 - strength);
  const result = new Map(), visiting = new Set(), unitMatrices = new Map();
  function visit(b) {
    if (result.has(b.id)) return result.get(b.id);
    if (!owners.has(b.id) || visiting.has(b.id)) return b;
    visiting.add(b.id);
    const parent = byId.get(b.parentId), afterParent = parent ? visit(parent) : null;
    let updated;
    if (b.unitOwner || b.instanceId) {
      if (!parent || afterParent === parent) { result.set(b.id,b); visiting.delete(b.id); return b; }
      const from = sampleLine(parent.points, b.parentT), to = sampleLine(afterParent.points, b.parentT);
      const q = new THREE.Quaternion().setFromUnitVectors(lineTangent(parent.points,b.parentT), lineTangent(afterParent.points,b.parentT));
      const inherited = (b.unitOwner || b.instanceId) === (parent.unitOwner || parent.instanceId) ? unitMatrices.get(parent.id) : null;
      const matrix = inherited || new THREE.Matrix4().makeTranslation(...to.toArray())
        .multiply(new THREE.Matrix4().makeRotationFromQuaternion(q))
        .multiply(new THREE.Matrix4().makeTranslation(...from.clone().negate().toArray()));
      unitMatrices.set(b.id, matrix);
      q.setFromRotationMatrix(matrix);
      updated = { ...b, points: b.points.map(p => p.clone().applyMatrix4(matrix)),
        controlPoints: b.controlPoints.map(p => p.clone().applyMatrix4(matrix)),
        surfaceNormals: b.surfaceNormals?.map(n => n.clone().applyQuaternion(q)),
        mountMatrix: matrix.clone().multiply(b.mountMatrix || new THREE.Matrix4()) };
    } else {
      const origin = owners.get(b.id), transform = p => p.clone().sub(origin).multiply(scale).add(origin);
      updated = { ...b, points: b.points.map(transform), controlPoints: b.controlPoints.map(transform) };
      updated.length = updated.points.slice(1).reduce((sum,p,i) => sum+p.distanceTo(updated.points[i]),0);
    }
    result.set(b.id, updated); visiting.delete(b.id); return updated;
  }
  return branches.map(visit);
}
