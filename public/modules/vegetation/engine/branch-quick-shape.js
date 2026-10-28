import * as THREE from 'three';
import { descendants, selectionRoots } from './branch-selection.js';
import { sampleLine, nearestParameter, lineTangent } from './tree-sculpt.js';
import { sectionAt } from './branch-shaping.js';

const clamp = THREE.MathUtils.clamp;
const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

// A retained operation applies to the already edited shape, never regenerates
// its seed or replaces imported curves. Each selected subtree shares a frame.
export function evaluateBranchQuickShape(branches, operation, strength = 1, overrides = {}) {
  const op = {length:1, width:1, radius:1, tipRadius:1, droop:0, bend:0, flatness:1, ...operation};
  const weight = clamp(Number.isFinite(strength) ? strength : 1, 0, 1);
  if (!weight || (op.length === 1 && op.width === 1 && op.radius === 1 && op.tipRadius === 1 && !op.droop && !op.bend && op.flatness === 1)) return branches;
  const result = new Map(branches.map(b => [b.id, b]));
  const byId = new Map(branches.map(b => [b.id, b]));
  for (const root of selectionRoots(branches, new Set(op.targets || []))) {
    const selected = descendants(branches, new Set([root.stableId]));
    const cluster = branches.filter(b => selected.has(b.stableId));
    // A pinned descendant anchors its complete selected subtree, matching the
    // other retained pose tools rather than silently pulling a protected point.
    if (cluster.some(b => overrides[b.stableId]?.pinned_points?.some(i => i >= 0 && i < b.controlPoints.length))) continue;
    const anchor = root.points[0], axis = root.points.at(-1).clone().sub(anchor);
    if (axis.lengthSq() < 1e-12) axis.copy(lineTangent(root.points, 0));
    axis.normalize();
    const side = new THREE.Vector3(0, 0, 1).cross(axis);
    if (side.lengthSq() < 1e-10) side.set(1, 0, 0); else side.normalize();
    const thickness = axis.clone().cross(side).normalize();
    let span = .001;
    for (const b of cluster) for (const p of b.points) span = Math.max(span, Math.abs(p.clone().sub(anchor).dot(axis)));
    const atMask = (b, t) => {
      const mask = overrides[b.stableId]?.sculpt_mask || [];
      const x = clamp(t, 0, 1) * (b.controlPoints.length - 1), i = Math.floor(x);
      return clamp(THREE.MathUtils.lerp(mask[i] || 0, mask[Math.min(i + 1, b.controlPoints.length - 1)] || 0, x - i), 0, 1);
    };
    function transform(p, b, t) {
      const delta = p.clone().sub(anchor), along = delta.dot(axis), across = delta.dot(side), depth = delta.dot(thickness);
      const curve = along * along / span * .5;
      const displacement = axis.clone().multiplyScalar(along * (op.length - 1))
        .addScaledVector(side, across * (op.width - 1) + op.bend * curve)
        .addScaledVector(thickness, depth * (op.width * op.flatness - 1));
      displacement.z -= op.droop * curve;
      return p.clone().addScaledVector(displacement, weight * (1 - atMask(b, t)));
    }
    const visited = new Set();
    function visit(b) {
      if (visited.has(b.id) || !selected.has(b.stableId)) return result.get(b.id);
      visited.add(b.id);
      const parent = byId.get(b.parentId);
      if (parent && selected.has(parent.stableId)) visit(parent);
      const points = b.points.map(p => transform(p, b, nearestParameter(b.controlPoints, p)));
      const controlPoints = b.controlPoints.map((p, i) => transform(p, b, i / (b.controlPoints.length - 1)));
      // Mapping an interpolated parent point through a curved deformation is
      // not identical to interpolating its transformed samples. Correct that
      // discrepancy explicitly, so every retained attach parameter stays exact.
      const origin = b.id === root.id ? b.points[0] : sampleLine(result.get(parent.id).points, b.parentT);
      const correction = origin.clone().sub(points[0]);
      points.forEach((p, i) => p.addScaledVector(correction, (1 - i / (points.length - 1)) ** 2));
      const knotCorrection = origin.clone().sub(controlPoints[0]);
      controlPoints.forEach((p, i) => p.addScaledVector(knotCorrection, (1 - i / (controlPoints.length - 1)) ** 2));
      points[0].copy(origin); controlPoints[0].copy(origin);
      let sections = b.sections;
      if (op.radius !== 1 || op.tipRadius !== 1) {
        // applySculptLayers persists section deformation. A common spatial
        // radius field preserves the relative sizes across attached forks and
        // keeps a selected side branch's collar at its unselected parent.
        // A standalone root has no parent collar to protect: its position is
        // anchored above, but its radius must scale along with the whole twig.
        const ts = new Set([0, 1, ...(op.tipRadius !== 1 ? [.45] : []), ...(b.sections || []).map(s => s.t), ...Array.from({length:24}, (_, i) => i / 23)]);
        sections = [...ts].sort((a,c) => a-c).map(t => {
          const old = sectionAt(b.sections, t), p = sampleLine(b.points, t);
          const distance = p.distanceTo(anchor);
          const collar = byId.has(root.parentId) ? smooth(distance / (span * .18)) : 1;
          const amount = weight * (1 - atMask(b, t)) * collar;
          const tipAmount = weight * (1 - atMask(b, t)) * smooth((t - .45) / .55);
          return {...old, t, radius:old.radius * (1 + (op.radius - 1) * amount) * (1 + (op.tipRadius - 1) * tipAmount)};
        });
      }
      const length = points.slice(1).reduce((sum, p, i) => sum + p.distanceTo(points[i]), 0);
      result.set(b.id, {...b, points, controlPoints, sections, length});
      return result.get(b.id);
    }
    cluster.forEach(visit);
  }
  return branches.map(b => result.get(b.id));
}
