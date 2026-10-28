import * as THREE from 'three';
import { createSculptSnapshot, nearestParameter, sampleLine, lineTangent } from './tree-sculpt.js';
import { selectionRoots, descendants } from './branch-selection.js';
import { sectionAt } from './branch-shaping.js';

const clamp = THREE.MathUtils.clamp;
const sectionSamples = (b) => Array.from({ length: 24 }, (_, i) => { const t = Math.round(i / 23 * 1000) / 1000; return { ...sectionAt(b.sections, t), t }; });
export function evaluateBranchPose(branches, op, strength, overrides) {
  const snapshot = createSculptSnapshot(branches, overrides), result = new Map(snapshot), roots = selectionRoots(branches, new Set(op.targets));
  for (const root of roots) {
    const ids = descendants(branches, new Set([root.stableId])), cluster = branches.filter((b) => ids.has(b.stableId));
    if (cluster.some((b) => snapshot.get(b.id).pins.size)) continue;
    const original = snapshot.get(root.id), knots = original.controlPoints, pivot = op.lockMiddle ? Math.min(knots.length - 2, Math.round(op.pivot * (knots.length - 1))) : 0;
    const anchor = knots[pivot], axis = knots.at(-1).clone().sub(anchor).normalize(), target = knots.at(-1).clone().add(new THREE.Vector3(...op.offset)).sub(anchor);
    if (axis.lengthSq() < 1e-10) continue;
    const rotation = target.lengthSq() > 1e-10 ? new THREE.Quaternion().setFromUnitVectors(axis, target.normalize()) : new THREE.Quaternion();
    const twistWeight = (t) => Math.pow(Math.max(0, (t - pivot / (knots.length - 1)) / (1 - pivot / (knots.length - 1))), op.falloff) * strength * (1 - original.mask[Math.round(t * (knots.length - 1))]);
    const next = knots.map((p) => p.clone());
    for (let i = pivot + 1; i < knots.length; i++) {
      const t = (i - pivot) / (knots.length - 1 - pivot), weight = strength * (1 - original.mask[i]);
      const q = op.mode === 'TWIST' ? new THREE.Quaternion().setFromAxisAngle(axis, op.twist * Math.PI / 180 * Math.pow(t, op.falloff) * weight)
        : new THREE.Quaternion().slerp(rotation, weight * (op.mode === 'HINGE' ? 1 : Math.pow(t, op.falloff)));
      if (op.mode === 'TWIST' || !op.preserveLength) next[i].sub(anchor).applyQuaternion(q).add(anchor);
      else next[i].copy(knots[i]).sub(knots[i - 1]).applyQuaternion(q).add(next[i - 1]);
      if (op.preserveLength && op.mode === 'TWIST') next[i].sub(next[i - 1]).normalize().multiplyScalar(knots[i].distanceTo(knots[i - 1])).add(next[i - 1]);
      if (original.mask[i] >= 1) next[i].copy(knots[i]);
    }
    const offsets = next.map((p, i) => p.clone().sub(knots[i]));
    const points = original.points.map((p) => p.clone().add(sampleLine(offsets, nearestParameter(knots, p))));
    result.set(root.id, { ...original, points, controlPoints: next, sections: op.mode === 'TWIST' ? sectionSamples(root).map((s) => ({ ...s, roll: s.roll + op.twist * twistWeight(s.t) })) : root.sections });
    const visited = new Set([root.id]);
    function follow(b) {
      if (visited.has(b.id)) return; visited.add(b.id);
      const parent = snapshot.get(b.parentId); if (!parent || !ids.has(parent.stableId)) return;
      follow(parent); const after = result.get(parent.id), oldAttach = sampleLine(parent.points, b.parentT), attach = sampleLine(after.points, b.parentT);
      const q = new THREE.Quaternion().setFromUnitVectors(lineTangent(parent.points, b.parentT), lineTangent(after.points, b.parentT));
      if (op.mode === 'TWIST' && parent.id === root.id) q.premultiply(new THREE.Quaternion().setFromAxisAngle(lineTangent(after.points, b.parentT), op.twist * Math.PI / 180 * twistWeight(b.parentT)));
      const transform = (p) => p.clone().sub(oldAttach).applyQuaternion(q).add(attach);
      result.set(b.id, { ...b, points: b.points.map(transform), controlPoints: b.controlPoints.map(transform) });
    }
    cluster.forEach(follow);
  }
  return branches.map((b) => result.get(b.id));
}

export function evaluateBranchVolume(branches, op, strength, overrides) {
  const targets = descendants(branches, new Set(op.targets));
  return branches.map((branch) => {
    const stamps = op.stamps.filter((s) => s.branch === branch.stableId); if (!targets.has(branch.stableId) || !stamps.length) return branch;
    const before = sectionSamples(branch); let sections = before.map((s) => ({ ...s }));
    const mask = overrides[branch.stableId]?.sculpt_mask || [], pins = overrides[branch.stableId]?.pinned_points || [];
    for (const stamp of stamps) {
      const previous = sections;
      sections = previous.map((s, i) => {
        const distance = Math.abs(s.t - stamp.t) / stamp.width, knot = Math.round(s.t * (branch.controlPoints.length - 1));
        if (distance >= 1 || pins.includes(knot) || (op.keepRoots && i === 0)) return s;
        const w = (1 - distance * distance) ** 2 * stamp.amount * (1 - (mask[knot] || 0));
        let radius = s.radius, oval = s.oval;
        if (stamp.mode === 'INFLATE') radius *= Math.exp(w * 0.6);
        if (stamp.mode === 'DEFLATE') radius *= Math.exp(-w * 0.6);
        if (stamp.mode === 'FLATTEN') oval *= Math.exp(w * 0.8);
        if (stamp.mode === 'SMOOTH') { radius = THREE.MathUtils.lerp(radius, (previous[Math.max(0, i - 1)].radius + previous[Math.min(23, i + 1)].radius) / 2, w); oval = THREE.MathUtils.lerp(oval, (previous[Math.max(0, i - 1)].oval + previous[Math.min(23, i + 1)].oval) / 2, w); }
        return { ...s, radius: clamp(radius, 0.05, 4), oval: clamp(oval, 0.25, 4) };
      });
    }
    return { ...branch, sections: sections.map((s, i) => ({ ...s, radius: THREE.MathUtils.lerp(before[i].radius, s.radius, strength), oval: THREE.MathUtils.lerp(before[i].oval, s.oval, strength) })) };
  });
}
