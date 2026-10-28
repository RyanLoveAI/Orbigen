import { evaluateBranchRadius } from './branch-radius.js';
import * as THREE from '/vendor/three/three.module.js';
import { evaluatePointSlide } from './branch-point-slide.js';
import { evaluatePointScale } from './branch-point-scale.js';
import { evaluatePointRotation } from './branch-point-rotation.js';
import { evaluateBranchMount } from './branch-mount.js';
import { evaluateRootScale } from './branch-root-scale.js';
import { createSculptSnapshot, sampleLine } from './tree-sculpt.js';
import { cageDisplacement, deformBranchRegion, guideDisplacement } from './branch-deformation.js';
import { evaluateBranchPose, evaluateBranchVolume } from './branch-form-geometry.js';
import { evaluateBranchQuickShape } from './branch-quick-shape.js';

export function operationCage(operation) {
  const rest = operation.rest.map((p) => new THREE.Vector3(...p));
  return { rest, nodes: operation.nodes.map((p) => new THREE.Vector3(...p)), box: new THREE.Box3().setFromPoints(rest), axis: operation.axis, cross: [0, 1, 2].filter((a) => a !== operation.axis) };
}

export function branchSegments(branches) {
  return branches.flatMap((b) => {
    const points = Array.from({ length: Math.min(25, b.points.length) }, (_, i) => sampleLine(b.points, i / (Math.min(25, b.points.length) - 1)));
    return points.slice(1).map((p, i) => ({ branch: b, line: new THREE.Line3(points[i], p), box: new THREE.Box3().setFromPoints([points[i], p]), t: i / (points.length - 1) }));
  });
}

export function evaluateShapeOperation(branches, operation, strength = 1, overrides = {}) {
  if (operation.type === 'RADIUS') return evaluateBranchRadius(branches, operation, strength);
  if (operation.type === 'POINT_SLIDE') return evaluatePointSlide(branches, operation, strength, overrides);
  if (operation.type === 'POINT_SCALE') return evaluatePointScale(branches, operation, strength, overrides);
  if (operation.type === 'POINT_ROTATE') return evaluatePointRotation(branches, operation, strength, overrides);
  if (operation.type === 'ROOT_SCALE') return evaluateRootScale(branches, operation, strength, overrides);
  if (operation.type === 'MOUNT') return evaluateBranchMount(branches, operation, strength);
  if (operation.type === 'QUICK') return evaluateBranchQuickShape(branches, operation, strength, overrides);
  if (operation.type === 'POSE') return evaluateBranchPose(branches, operation, strength, overrides);
  if (operation.type === 'VOLUME') return evaluateBranchVolume(branches, operation, strength, overrides);
  const snapshot = createSculptSnapshot(branches, overrides), selected = new Set(operation.targets);
  const cage = operation.type === 'CAGE' ? operationCage(operation) : null;
  const guide = operation.type === 'GUIDE' ? new THREE.CatmullRomCurve3(operation.guide.map((p) => new THREE.Vector3(...p))).getPoints(96) : null;
  const segments = operation.type === 'SPACE' && operation.spacingEnabled ? branchSegments(branches) : [];
  const center = new THREE.Vector3(...(operation.center || [0, 0, 0]));
  const displacement = (point, owner, branch) => {
    if (cage) return cageDisplacement(cage, point);
    if (guide) return guideDisplacement(guide, point, owner, operation.strengths, new THREE.Vector3(...operation.anchor));
    if (branch.order < operation.minOrder) return new THREE.Vector3();
    const delta = new THREE.Vector3();
    if (operation.voidEnabled) {
      const direction = point.clone().sub(center), d = direction.length(), limit = operation.radius + branch.startRadius;
      if (d < limit) delta.add((d > 1e-9 ? direction.divideScalar(d) : new THREE.Vector3(1, 0, 0)).multiplyScalar(limit - d));
    }
    if (operation.spacingEnabled) {
      const push = new THREE.Vector3(); let hits = 0;
      for (const segment of segments) {
        const other = segment.branch;
        if (other.id === branch.id || other.id === branch.parentId || other.parentId === branch.id) continue;
        const limit = operation.clearance + branch.startRadius + other.startRadius;
        if (segment.box.distanceToPoint(point) > limit) continue;
        const direction = point.clone().sub(segment.line.closestPointToPoint(point, true, new THREE.Vector3())), distance = direction.length();
        if (distance >= limit) continue;
        if (distance < 1e-8) direction.set(branch.id > other.id ? 1 : -1, 0, 0); else direction.divideScalar(distance);
        push.addScaledVector(direction, limit - distance); hits++;
      }
      if (hits) delta.add(push.divideScalar(hits));
    }
    return delta.multiplyScalar(operation.amount);
  };
  const updated = deformBranchRegion(snapshot, selected, displacement, operation);
  return branches.map((b) => {
    const after = updated.get(b.id);
    return { ...b, points: b.points.map((p, i) => p.clone().lerp(after.points[i], strength)), controlPoints: b.controlPoints.map((p, i) => p.clone().lerp(after.controlPoints[i], strength)) };
  });
}

export function inspectBranchSpacing(branches, clearance, project = null) {
  const result = [], sampled = branches.map((b) => {
    const world = Array.from({ length: 15 }, (_, i) => sampleLine(b.points, (i + 2) / 16)), points = project ? world.map(project) : world;
    return { b, world, points, box: (project ? new THREE.Box2() : new THREE.Box3()).setFromPoints(points) };
  });
  for (let i = 0; i < sampled.length; i++) for (let j = i + 1; j < sampled.length; j++) {
    const a = sampled[i], b = sampled[j];
    if (a.b.parentId === b.b.id || b.b.parentId === a.b.id) continue;
    const radii = project ? 0 : a.b.startRadius + b.b.startRadius;
    if (!a.box.clone().expandByScalar(clearance + radii).intersectsBox(b.box)) continue;
    let squared = Infinity, pair = [0, 0];
    for (let p = 0; p < a.points.length; p++) for (let q = 0; q < b.points.length; q++) {
      const d = a.points[p].distanceToSquared(b.points[q]);
      if (d < squared) { squared = d; pair = [p, q]; }
    }
    const distance = Math.sqrt(squared) - radii;
    if (distance < clearance) result.push({ a: a.b.stableId, b: b.b.stableId, distance, point: a.world[pair[0]].clone().lerp(b.world[pair[1]], 0.5).toArray() });
    if (result.length >= 100) return result;
  }
  return result.sort((a, b) => a.distance - b.distance);
}
