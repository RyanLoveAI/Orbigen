import * as THREE from 'three';
import { nearestParameter } from './tree-sculpt.js';
import { branchMountAt } from './branch-mount-frame.js';

export function pointRotationPlan(branch, index, rotation, strength = 1) {
  const before = branch.points, knots = branch.controlPoints;
  const t = nearestParameter(before, knots[index]);
  // Keep the segment containing the anchor intact. A short transition on its
  // distal side avoids a sharp hinge without resampling or stretching the curve.
  const fixed = Math.min(before.length - 1, Math.ceil(t * (before.length - 1) - 1e-8));
  const points = before.map(p => p.clone()), frames = [];
  const q = new THREE.Quaternion(...rotation).normalize();
  const transition = Math.min(3, before.length - 1 - fixed);
  for (let i = 0; i < before.length - 1; i++) {
    if (i < fixed) { frames.push(new THREE.Matrix4()); continue; }
    const weight = i < fixed ? 0 : Math.min(1, (i - fixed + 1) / transition);
    const turn = new THREE.Quaternion().slerp(q, weight * strength);
    points[i + 1].copy(points[i]).add(before[i + 1].clone().sub(before[i]).applyQuaternion(turn));
    frames.push(new THREE.Matrix4().makeTranslation(...points[i].toArray())
      .multiply(new THREE.Matrix4().makeRotationFromQuaternion(turn))
      .multiply(new THREE.Matrix4().makeTranslation(...before[i].clone().negate().toArray())));
  }
  const at = t => frames[Math.min(frames.length - 1, Math.floor(Math.max(0, Math.min(1, t)) * frames.length))];
  const controlPoints = knots.map((p, i) => i <= index ? p.clone() : p.clone().applyMatrix4(at(nearestParameter(before, p))));
  return { points, controlPoints, frames, at, fixed };
}

export function evaluatePointRotation(branches, operation, strength = 1, overrides = {}) {
  if (strength <= 0 || Math.hypot(...operation.rotation.slice(0,3)) < 1e-12) return branches;
  const root = branches.find(b => b.stableId === operation.root), index = operation.point;
  if (!root || root.unitOwner || root.instanceId || root.symmetryGroup || index <= 0 || index >= root.controlPoints.length - 1) return branches;
  const plan = pointRotationPlan(root, index, operation.rotation, strength);
  if (plan.fixed >= root.points.length - 1) return branches;
  const matrices = new Map(), byId = new Map(branches.map(b => [b.id, b])), visiting = new Set();
  function matrixFor(b) {
    if (matrices.has(b.id)) return matrices.get(b.id);
    if (visiting.has(b.id)) return null;
    visiting.add(b.id);
    const p = byId.get(b.parentId);
    const matrix = p === root ? plan.at(b.parentT) : p ? matrixFor(p) : null;
    matrices.set(b.id, matrix); visiting.delete(b.id); return matrix;
  }
  branches.forEach(b => { if (b !== root) matrixFor(b); });
  const identity = new THREE.Matrix4();
  const changed = m => m && m.elements.some((v, i) => Math.abs(v - identity.elements[i]) > 1e-10);
  if ((overrides[root.stableId]?.pinned_points || []).some(i => i > index)
    || branches.some(b => b !== root && changed(matrices.get(b.id)) && overrides[b.stableId]?.pinned_points?.length)) return branches;
  return branches.map(b => {
    if (b === root) return { ...b, points: plan.points, controlPoints: plan.controlPoints,
      mountFrames: plan.frames.map((m, i) => m.clone().multiply(branchMountAt(b, (i + .5) / plan.frames.length) || identity)) };
    const m = matrices.get(b.id);
    if (!changed(m)) return b;
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    return { ...b, points: b.points.map(p => p.clone().applyMatrix4(m)), controlPoints: b.controlPoints.map(p => p.clone().applyMatrix4(m)),
      surfaceNormals: b.surfaceNormals?.map(n => n.clone().applyQuaternion(q)),
      mountMatrix: m.clone().multiply(b.mountMatrix || identity), mountFrames: b.mountFrames?.map(f => m.clone().multiply(f)) };
  });
}
