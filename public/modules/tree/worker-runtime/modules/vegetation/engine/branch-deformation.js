import * as THREE from '/vendor/three/three.module.js';
import { descendants, selectionRoots } from './branch-selection.js';
import { nearestParameter, sampleLine } from './tree-sculpt.js';

const clamp = THREE.MathUtils.clamp;
export function createBranchCage(snapshot, selected) {
  const branches = [...snapshot.values()], ids = descendants(branches, selected);
  const box = new THREE.Box3();
  branches.filter((b) => ids.has(b.stableId)).forEach((b) => b.points.forEach((p) => box.expandByPoint(p)));
  if (box.isEmpty()) return null;
  const size = box.getSize(new THREE.Vector3()), padding = Math.max(size.length() * 0.06, 0.025);
  box.expandByScalar(padding);
  const axis = size.x >= size.y && size.x >= size.z ? 0 : size.y >= size.z ? 1 : 2;
  const cross = [0, 1, 2].filter((a) => a !== axis);
  const nodes = [];
  for (let z = 0; z < 3; z++) for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    const p = box.min.clone(), dimensions = box.getSize(new THREE.Vector3());
    p.setComponent(axis, p.getComponent(axis) + dimensions.getComponent(axis) * z / 2);
    p.setComponent(cross[0], p.getComponent(cross[0]) + dimensions.getComponent(cross[0]) * x);
    p.setComponent(cross[1], p.getComponent(cross[1]) + dimensions.getComponent(cross[1]) * y);
    nodes.push(p);
  }
  return { box, axis, cross, nodes, rest: nodes.map((p) => p.clone()) };
}

export function cageDisplacement(cage, point) {
  const basis = new THREE.Matrix4().makeBasis(cage.rest[1].clone().sub(cage.rest[0]), cage.rest[2].clone().sub(cage.rest[0]), cage.rest[8].clone().sub(cage.rest[0]));
  const uv = point.clone().sub(cage.rest[0]).applyMatrix4(basis.invert());
  const u = clamp(uv.x, 0, 1), v = clamp(uv.y, 0, 1), t = clamp(uv.z, 0, 1);
  const quadratic = [(1 - t) ** 2, 2 * t * (1 - t), t * t];
  const delta = new THREE.Vector3();
  cage.nodes.forEach((p, i) => delta.addScaledVector(p.clone().sub(cage.rest[i]), (i % 2 ? u : 1 - u) * (Math.floor(i / 2) % 2 ? v : 1 - v) * quadratic[Math.floor(i / 4)]));
  return delta;
}

// Shared spatial mapping keeps a branch cluster coherent; pinned subtrees stay fixed.
export function deformBranchRegion(snapshot, selected, displacement, { keepRoots = true, falloff = 1, preserveLength = false } = {}) {
  const branches = [...snapshot.values()], owners = new Map(), spans = new Map(), result = new Map(snapshot);
  selectionRoots(branches, selected).forEach((root) => {
    const ids = descendants(branches, new Set([root.stableId]));
    if (branches.some((b) => ids.has(b.stableId) && b.pins.size)) return;
    branches.filter((b) => ids.has(b.stableId)).forEach((b) => owners.set(b.id, root));
    let span = 0.001;
    branches.filter((b) => ids.has(b.stableId)).forEach((b) => b.points.forEach((p) => { span = Math.max(span, p.distanceTo(root.points[0])); }));
    spans.set(root.id, span);
  });
  const visited = new Set();
  function visit(b) {
    if (!owners.has(b.id) || visited.has(b.id)) return result.get(b.id);
    visited.add(b.id);
    const owner = owners.get(b.id), parent = snapshot.get(b.parentId), afterParent = parent ? visit(parent) : null;
    const span = spans.get(owner.id);
    const knots = b.controlPoints.map((p, index) => {
      const w = (1 - b.mask[index]) * (keepRoots ? Math.pow(clamp(p.distanceTo(owner.points[0]) / span, 0, 1), falloff) : 1);
      return p.clone().addScaledVector(displacement(p, owner, b, index), w);
    });
    let anchor = null;
    if (parent && owners.has(parent.id)) {
      anchor = sampleLine(afterParent.points, b.parentT).add(b.points[0].clone().sub(sampleLine(parent.points, b.parentT)));
    } else if (keepRoots) anchor = b.controlPoints[0];
    if (anchor) { const shift = anchor.clone().sub(knots[0]); knots.forEach((p, i) => p.addScaledVector(shift, (1 - i / (knots.length - 1)) ** 2)); }
    if (preserveLength) for (let i = 1; i < knots.length; i++) {
      const direction = knots[i].clone().sub(knots[i - 1]);
      if (direction.lengthSq() < 1e-12) direction.copy(b.controlPoints[i]).sub(b.controlPoints[i - 1]);
      knots[i].copy(knots[i - 1]).add(direction.normalize().multiplyScalar(b.controlPoints[i].distanceTo(b.controlPoints[i - 1])));
    }
    const offsets = knots.map((p, i) => p.clone().sub(b.controlPoints[i]));
    const points = b.points.map((p, i) => p.clone().add(sampleLine(offsets, b.sampleBindings[i])));
    points[0].copy(knots[0]); points.at(-1).copy(knots.at(-1));
    result.set(b.id, { ...b, controlPoints: knots, points });
    return result.get(b.id);
  }
  branches.forEach(visit);
  return result;
}

export function guideDisplacement(guide, point, owner, strengths = [0, 0.65, 1], origin = guide[0]) {
  if (guide.length < 2) return new THREE.Vector3();
  const t = nearestParameter(owner.points, point), n = t < 0.5 ? 0 : 1, u = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  const strength = THREE.MathUtils.lerp(strengths[n], strengths[n + 1], u * u * (3 - 2 * u));
  // Translate the guide for each root so multiple branches retain their spacing.
  const target = sampleLine(guide, t).sub(origin).add(owner.points[0]);
  return target.sub(sampleLine(owner.points, t)).multiplyScalar(strength);
}
