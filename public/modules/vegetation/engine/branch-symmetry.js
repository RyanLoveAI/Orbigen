import * as THREE from 'three';
import { descendants } from './branch-selection.js';
import { sampleLine } from './tree-sculpt.js';

function random(seed) { let value = seed >>> 0; return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296 * 2 - 1; }; }
function hash(value) { let h = 2166136261; for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(36); }
export function symmetryPreview(updated, groups) {
  if (!groups?.length) return updated;
  const source = [...updated.values()].filter((b) => !b.symmetryGroup).map((b) => ({ ...b }));
  return new Map(applyBranchSymmetry(source, groups).map((b) => [b.id, b]));
}
export function applyBranchSymmetry(branches, groups) {
  branches.forEach((b) => { b.children = [...b.children]; });
  let nextId = Math.max(-1, ...branches.map((b) => b.id)) + 1;
  for (const group of groups || []) {
    if (!group.enabled) continue;
    const root = branches.find((b) => b.stableId === group.source && !b.symmetryGroup); if (!root) continue;
    const ids = descendants(branches.filter((b) => !b.symmetryGroup), new Set([root.stableId]));
    const source = branches.filter((b) => ids.has(b.stableId) && !b.symmetryGroup);
    const axis = new THREE.Vector3(...{ X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[group.axis]);
    const normal = axis.clone().applyAxisAngle(group.axis === 'Z' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1), group.angle * Math.PI / 180);
    const copies = group.type === 'MIRROR' ? 1 : group.count - 1;
    for (let n = 1; n <= copies; n++) {
      if (branches.length + source.length > 2200) break;
      const rng = random(group.seed + n * 7919), scale = 1 + rng() * group.lengthVariation, angle = rng() * group.angleVariation * Math.PI / 180;
      const bend = rng() * group.bendVariation, origin = root.points[0], length = Math.max(0.01, root.length), mapping = new Map();
      const transform = (point) => {
        const p = point.clone().sub(origin);
        if (group.type === 'MIRROR') p.addScaledVector(normal, -2 * p.dot(normal));
        else p.applyAxisAngle(axis, n / group.count * Math.PI * 2 + group.angle * Math.PI / 180);
        p.applyAxisAngle(axis, angle).multiplyScalar(scale);
        p.addScaledVector(normal, bend * p.lengthSq() / length); return p.add(origin);
      };
      for (const b of source) {
        const id = nextId++, parent = mapping.get(b.parentId), stableId = `${group.id}.${n}.${hash(b.stableId)}`;
        const copy = { ...b, id, stableId, parentId: parent?.id ?? b.parentId, children: [], points: b.points.map(transform), controlPoints: b.controlPoints.map(transform),
          startRadius: b.startRadius * scale, endRadius: b.endRadius * scale, length: b.length * scale, instanceId: '', symmetrySource: b.stableId, symmetryGroup: group.id, symmetryCopy: n };
        if (parent) {
          const originalParent = source.find((p) => p.id === b.parentId);
          const correction = sampleLine(parent.points, b.parentT).sub(transform(sampleLine(originalParent.points, b.parentT)));
          copy.points.forEach((p) => p.add(correction)); copy.controlPoints.forEach((p) => p.add(correction));
        }
        mapping.set(b.id, copy); branches.push(copy);
        branches.find((p) => p.id === copy.parentId)?.children.push(id);
      }
    }
  }
  return branches;
}
