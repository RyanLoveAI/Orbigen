import * as THREE from '/vendor/three/three.module.js';
import { descendants } from './branch-selection.js';
import { sampleLine, lineTangent } from './tree-sculpt.js';

// A rigid edit in the existing layer stack. No sample geometry or material is copied.
export function evaluateBranchMount(branches, op, strength = 1) {
  const root = branches.find(b => b.stableId === op.root);
  const parent = branches.find(b => b.id === root?.parentId);
  if (!root || !parent || parent.stableId !== op.parent || root.unitOwner || root.instanceId) return branches;
  const ids = descendants(branches, new Set([root.stableId]));
  const sourceT = root.parentT, targetT = op.root_rotation ? sourceT : THREE.MathUtils.lerp(sourceT, op.attach, strength);
  const tangent = lineTangent(parent.points, sourceT);
  const frame = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...op.parent_tangent).normalize(), tangent);
  const rotation = frame.clone().multiply(new THREE.Quaternion(...op.rotation)).multiply(frame.clone().invert()).normalize();
  rotation.slerp(new THREE.Quaternion(), 1 - strength);
  const source = op.root_rotation ? root.points[0].clone() : sampleLine(parent.points, sourceT);
  const target = op.root_rotation ? source.clone() : sampleLine(parent.points, targetT);
  const matrix = new THREE.Matrix4().makeTranslation(...target.toArray())
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(rotation))
    .multiply(new THREE.Matrix4().makeTranslation(...source.clone().negate().toArray()));
  return branches.map(b => !ids.has(b.stableId) ? b : ({ ...b,
    points: b.points.map(p => p.clone().applyMatrix4(matrix)),
    controlPoints: b.controlPoints.map(p => p.clone().applyMatrix4(matrix)),
    surfaceNormals: b.surfaceNormals?.map(p => p.clone().applyQuaternion(rotation)) || null,
    parentT: b === root ? targetT : b.parentT,
    mountMatrix: matrix.clone().multiply(b.mountMatrix || new THREE.Matrix4()),
    mountFrames: b.mountFrames?.map(f => matrix.clone().multiply(f)),
  }));
}

// Store a full quaternion so all three rotation axes survive save/reload.
// A separate rigid layer keeps later position/angle edits from discarding roll.
export function makeMountRotationOperation(branches, root, delta, previous, merge = null) {
  const parent = branches.find(b => b.id === root.parentId);
  const tangent = lineTangent(parent.points,root.parentT);
  const reference = merge?.parent_tangent || tangent.toArray();
  const frame = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...reference).normalize(),tangent);
  const rotation = frame.clone().invert().multiply(delta).multiply(frame);
  if (merge) rotation.multiply(new THREE.Quaternion(...merge.rotation));
  return {type:'MOUNT',root_rotation:true,root:root.stableId,parent:parent.stableId,targets:[root.stableId],
    attach:root.parentT,source_attach:root.parentT,azimuth:previous.azimuth,elevation:previous.elevation,
    rotation:rotation.normalize().toArray(),parent_tangent:reference};
}

export function makeMountOperation(branches, root, values, previous, merge) {
  const parent = branches.find(b => b.id === root.parentId);
  const source_attach = merge?.source_attach ?? root.parentT;
  const from = lineTangent(parent.points, source_attach), to = lineTangent(parent.points, values.attach);
  const parent_tangent = merge?.parent_tangent || from.toArray();
  const reference_direction = merge?.reference_direction || root.points.at(-1).clone().sub(root.points[0]).normalize().toArray();
  const base_azimuth = merge?.base_azimuth ?? previous.azimuth, base_elevation = merge?.base_elevation ?? previous.elevation;
  const frame = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...parent_tangent).normalize(),from);
  const transport = new THREE.Quaternion().setFromUnitVectors(from, to);
  const radial = new THREE.Vector3(...reference_direction).applyQuaternion(frame).applyQuaternion(transport);
  let hinge = new THREE.Vector3().crossVectors(to, radial).normalize();
  if (hinge.lengthSq() < 1e-8) hinge = new THREE.Vector3().crossVectors(to, Math.abs(to.x) < .9 ? new THREE.Vector3(1,0,0) : new THREE.Vector3(0,1,0)).normalize();
  const yaw = new THREE.Quaternion().setFromAxisAngle(to, THREE.MathUtils.degToRad(values.azimuth - base_azimuth));
  const bend = new THREE.Quaternion().setFromAxisAngle(hinge.applyQuaternion(yaw), THREE.MathUtils.degToRad(values.elevation - base_elevation));
  const world = bend.multiply(yaw).multiply(transport);
  const rotation = frame.clone().invert().multiply(world).multiply(frame);
  return { type: 'MOUNT', targets: [root.stableId], root: root.stableId, parent: parent.stableId,
    ...values, source_attach, reference_direction, base_azimuth, base_elevation,
    rotation: rotation.normalize().toArray(), parent_tangent };
}

// Remove only the preceding mount from a preview snapshot when replacing it.
export function mountPreviewBase(branches, root, previous) {
  if (!previous) return branches;
  const parent = branches.find(b => b.id === root.parentId);
  const tangent = lineTangent(parent.points,previous.source_attach);
  const frame = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...previous.parent_tangent).normalize(),tangent);
  const q = frame.clone().multiply(new THREE.Quaternion(...previous.rotation)).multiply(frame.invert());
  const a = sampleLine(parent.points,previous.source_attach), b = sampleLine(parent.points,previous.attach);
  const inverse = new THREE.Matrix4().makeTranslation(...a.toArray()).multiply(new THREE.Matrix4().makeRotationFromQuaternion(q.invert())).multiply(new THREE.Matrix4().makeTranslation(...b.negate().toArray()));
  const ids = descendants(branches,new Set([root.stableId]));
  return branches.map(item => !ids.has(item.stableId) ? item : {...item,
    parentT: item.stableId === root.stableId ? previous.source_attach : item.parentT,
    points:item.points.map(p=>p.clone().applyMatrix4(inverse)), controlPoints:item.controlPoints.map(p=>p.clone().applyMatrix4(inverse))});
}
