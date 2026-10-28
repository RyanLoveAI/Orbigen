import * as THREE from '/vendor/three/three.module.js';
import { retractAlongPath } from './branch-retraction.js';
import { combCurve } from './branch-combing.js';
import { createGpuMeshPreview } from './gpu-edit-preview.js';

export const SCULPT_TOOLS = new Set(['GRAB', 'COMB', 'BEND_BRUSH', 'PUSH_PULL', 'SMOOTH_BRUSH', 'SPREAD', 'TWIST_BRUSH', 'GUIDE', 'PROTECT', 'RETRACT']);
const clamp = THREE.MathUtils.clamp;
const copy = (points) => points.map((point) => point.clone());

export function sampleLine(points, t) {
  const cursor = clamp(t, 0, 1) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(cursor));
  return points[index].clone().lerp(points[index + 1], cursor - index);
}

export function lineTangent(points, t) {
  const index = Math.min(points.length - 2, Math.floor(clamp(t, 0, 1) * (points.length - 1)));
  const tangent = points[index + 1].clone().sub(points[index]);
  return tangent.lengthSq() > 1e-12 ? tangent.normalize() : new THREE.Vector3(0, 0, 1);
}

export function nearestParameter(points, position) {
  let distance = Infinity;
  let parameter = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a=points[i],b=points[i+1],x=b.x-a.x,y=b.y-a.y,z=b.z-a.z;
    const alpha=clamp(((position.x-a.x)*x+(position.y-a.y)*y+(position.z-a.z)*z)/Math.max(1e-12,x*x+y*y+z*z),0,1);
    const dx=a.x+x*alpha-position.x,dy=a.y+y*alpha-position.y,dz=a.z+z*alpha-position.z;
    const d=dx*dx+dy*dy+dz*dz;
    if (d < distance) { distance = d; parameter = (i + alpha) / (points.length - 1); }
  }
  return parameter;
}

export function brushFalloff(distance, radius, hardness = 0.2) {
  const normalized = distance / Math.max(1e-6, radius);
  if (normalized >= 1) return 0;
  if (normalized <= hardness) return 1;
  const t = (normalized - hardness) / Math.max(1e-6, 1 - hardness);
  return 1 - t * t * (3 - 2 * t);
}

export function createSculptSnapshot(branches, overrides = {}) {
  return new Map(branches.map((branch) => [branch.id, {
    ...branch, points: copy(branch.points), controlPoints: copy(branch.controlPoints),
    pins: new Set((overrides[branch.stableId]?.pinned_points || []).filter((index) => index >= 0 && index < branch.controlPoints.length)),
    mask: branch.controlPoints.map((_, i) => overrides[branch.stableId]?.sculpt_mask?.[i] || 0),
    sampleBindings: branch.points.map((point) => nearestParameter(branch.controlPoints, point)),
  }]));
}

export function regionWeights(snapshot, project, center, options) {
  const weights = new Map();
  for (const branch of snapshot.values()) {
    const eligible = !branch.symmetryGroup && (!options.isVisible || options.isVisible(branch.stableId)) && (!options.protectTrunk || branch.parentId >= 0)
      && (!options.selectedOnly || options.selectedIds.has(branch.stableId));
    weights.set(branch.id, branch.controlPoints.map((point, index) => {
      if (!eligible || branch.pins.has(index) || index === 0) return 0;
      const p = project(point);
      if (p.clip < -1 || p.clip > 1) return 0;
      const radial = options.scope === 'SPHERE'
        ? point.distanceTo(options.center3d) / Math.max(1e-6, options.worldRadius) * options.radius
        : Math.hypot(p.x - center[0], p.y - center[1]);
      const depthWeight = options.scope === 'SURFACE'
        ? brushFalloff(Math.abs(p.depth - options.depth), options.depthRange / 2, 0.75) : 1;
      return brushFalloff(radial, options.radius, options.hardness) * depthWeight * (options.ignoreMask ? 1 : 1 - branch.mask[index]);
    }));
  }
  return weights;
}

function preserveLengths(source, points, fixed, strength) {
  if (strength <= 0) return;
  const rest = source.slice(1).map((point, i) => point.distanceTo(source[i]));
  for (let iteration = 0; iteration < 12; iteration += 1) {
    for (let i = 0; i < rest.length; i += 1) {
      const vector = points[i + 1].clone().sub(points[i]);
      const length = vector.length();
      if (length < 1e-9 || (fixed.has(i) && fixed.has(i + 1))) continue;
      vector.multiplyScalar((length - rest[i]) / length * strength);
      if (fixed.has(i)) points[i + 1].sub(vector);
      else if (fixed.has(i + 1)) points[i].add(vector);
      else { points[i].addScaledVector(vector, 0.5); points[i + 1].addScaledVector(vector, -0.5); }
    }
    fixed.forEach((index) => points[index].copy(source[index]));
  }
}

function transformPoint(point, before, after, t) {
  const rotation = new THREE.Quaternion().setFromUnitVectors(lineTangent(before, t), lineTangent(after, t));
  return point.clone().sub(sampleLine(before, t)).applyQuaternion(rotation).add(sampleLine(after, t));
}

export function deformTree(snapshot, weights, delta, tool, options = {}) {
  const result = new Map();
  const visiting = new Set();
  const protectedParents = new Set();
  for (const branch of snapshot.values()) {
    if (!branch.pins.size) continue;
    let parent = snapshot.get(branch.parentId);
    const seen = new Set();
    while (parent && !seen.has(parent.id)) { seen.add(parent.id); protectedParents.add(parent.id); parent = snapshot.get(parent.parentId); }
  }
  const strength = options.strength ?? 0.65;
  const rigidRoots = new Map(), rigidMoves = new Map(), hitUnits = new Set();
  if (options.rigidUnitFollowers?.size) for (const b of snapshot.values()) {
    if (!options.rigidUnitFollowers.has(b.instanceId)) continue;
    if (b.pins.size || weights.get(b.id)?.some(w => w > 0)) hitUnits.add(b.instanceId);
    if (snapshot.get(b.parentId)?.instanceId !== b.instanceId) rigidRoots.set(b.instanceId, b);
  }
  const visit = (branch) => {
    if (result.has(branch.id)) return result.get(branch.id);
    if (visiting.has(branch.id)) return branch;
    visiting.add(branch.id);
    const original = branch.controlPoints;
    const parent = snapshot.get(branch.parentId);
    const updatedParent = parent ? visit(parent) : null;
    const branchWeights = weights.get(branch.id) || original.map(() => 0);
    if ((!updatedParent || updatedParent === parent) && !branchWeights.some(w=>w>0)) {
      result.set(branch.id,branch);visiting.delete(branch.id);return branch;
    }
    const t = branch.parentT ?? (parent ? nearestParameter(parent.points, original[0]) : 0);
    const parentMoved = updatedParent && updatedParent !== parent;
    const parentFrom = parentMoved ? sampleLine(parent.points,t) : null;
    const parentTo = parentMoved ? sampleLine(updatedParent.points,t) : null;
    const parentRotation = parentMoved ? new THREE.Quaternion().setFromUnitVectors(lineTangent(parent.points,t),lineTangent(updatedParent.points,t)) : null;
    const follow = point => parentMoved ? point.clone().sub(parentFrom).applyQuaternion(parentRotation).add(parentTo) : point.clone();
    if (rigidRoots.has(branch.instanceId) && !hitUnits.has(branch.instanceId)) {
      const root = rigidRoots.get(branch.instanceId);
      if (root !== branch) visit(root);
      else if (parentMoved) rigidMoves.set(branch.instanceId,
        new THREE.Matrix4().makeTranslation(...parentTo.toArray())
          .multiply(new THREE.Matrix4().makeRotationFromQuaternion(parentRotation))
          .multiply(new THREE.Matrix4().makeTranslation(...parentFrom.clone().negate().toArray())));
      const matrix = rigidMoves.get(branch.instanceId);
      if (matrix) {
        const updated = {...branch, points: branch.points.map(p => p.clone().applyMatrix4(matrix)),
          controlPoints: original.map(p => p.clone().applyMatrix4(matrix)),
          sculptFollowMatrix: matrix.clone().multiply(branch.sculptFollowMatrix || new THREE.Matrix4())};
        result.set(branch.id, updated); visiting.delete(branch.id); return updated;
      }
    }
    const inherited = original.map(follow);
    if (tool === 'COMB') {
      const rest = branch.points.map(follow);
      // A pinned point also anchors the whole prefix: combing the free tail must
      // never pull a protected connection away or stretch a locked span.
      const anchors = [...branch.pins, ...branch.mask.flatMap((v, i) => v >= 1 ? [i] : [])];
      const fixedThrough = anchors.reduce((last, i) => Math.max(last,
        Math.ceil(nearestParameter(branch.points, original[i]) * (rest.length - 1))), 0);
      const denseWeights = branch.sampleBindings.map(t => {
        const cursor = t * (original.length - 1), i = Math.min(original.length - 2, Math.floor(cursor));
        return THREE.MathUtils.lerp(branchWeights[i] || 0, branchWeights[i + 1] || 0, cursor - i);
      });
      const stiffness = 1 / (1 + branch.startRadius * 12 * (1 - (options.flexibility ?? 0.7)));
      const dense = combCurve(rest, denseWeights, delta, { strength: protectedParents.has(branch.id) ? 0 : strength * stiffness,
        worldRadius: options.worldRadius || branch.length || 1, fixedThrough });
      const points = original.map((point, i) => {
        const binding = nearestParameter(branch.points, point);
        return inherited[i].clone().add(sampleLine(dense, binding).sub(sampleLine(rest, binding)));
      });
      const changed = dense.some((p, i) => p.distanceToSquared(branch.points[i]) > 1e-16);
      const updated = changed ? { ...branch, controlPoints: points, points: dense } : branch;
      result.set(branch.id, updated); visiting.delete(branch.id); return updated;
    }
    if (tool === 'RETRACT') {
      const protectedBranch = protectedParents.has(branch.id) || branch.pins.size || branch.mask.some(v => v > 0);
      const ratio = protectedBranch ? 0 : clamp((options.retractAmount || 0) * strength * Math.max(0, ...branchWeights), 0, .9);
      const shortened = ratio > 0 ? retractAlongPath(branch.points, original.length, 1 - ratio) : null;
      const points = shortened ? shortened.controlPoints.map(follow) : inherited;
      const dense = (shortened?.points || branch.points).map(follow);
      const changed = points.some((p, i) => p.distanceToSquared(original[i]) > 1e-16);
      const updated = changed ? { ...branch, controlPoints: points, points: dense } : branch;
      result.set(branch.id, updated); visiting.delete(branch.id); return updated;
    }
    const flexibility = (options.flexibility ?? 0.7);
    const stiffness = 1 / (1 + branch.startRadius * 12 * (1 - flexibility));
    const amount = strength * stiffness;
    const targetTip = original.at(-1).clone().sub(original[0]).addScaledVector(delta, amount);
    const bendRotation = new THREE.Quaternion().setFromUnitVectors(
      original.at(-1).clone().sub(original[0]).normalize(), targetTip.lengthSq() > 1e-12 ? targetTip.normalize() : lineTangent(original, 1),
    );
    const points = inherited.map((point, i) => {
      if (i === 0) return point;
      const w = protectedParents.has(branch.id) ? 0 : branchWeights[i];
      if (!w) return point;
      let target = original[i].clone();
      if (tool === 'SMOOTH_BRUSH') {
        if (i === original.length - 1) return point;
        target.lerp(original[i - 1].clone().lerp(original[i + 1], 0.5), amount * 0.16);
      } else if (tool === 'BEND_BRUSH') {
        const rotation = new THREE.Quaternion().slerp(bendRotation, i / (original.length - 1));
        target.sub(original[0]).applyQuaternion(rotation).add(original[0]);
      } else if (tool === 'SPREAD') {
        target.addScaledVector(original[i].clone().sub(options.center3d), (options.signedDistance || 0) * amount);
      } else if (tool === 'TWIST_BRUSH') {
        target.sub(options.center3d).applyAxisAngle(options.axis, (options.signedDistance || 0) * amount).add(options.center3d);
      } else if (tool === 'GUIDE') {
        const guide = options.guide;
        if (!guide || guide.length < 2) return point;
        target.lerp(sampleLine(guide, nearestParameter(guide, original[i])), amount);
      } else target.addScaledVector(delta, amount);
      // Blend absolute targets with inherited movement so parent and child hits do not add twice.
      return point.lerp(target, w);
    });
    const fixed = new Set([0, ...branch.pins, ...branch.mask.flatMap((value,i) => value >= 1 ? [i] : [])]);
    if (tool === 'SMOOTH_BRUSH') fixed.add(original.length - 1);
    branch.pins.forEach((i) => { if (points[i]) points[i].copy(original[i]); });
    const changed = points.some((point, i) => point.distanceToSquared(original[i]) > 1e-16);
    if (!changed) { result.set(branch.id, branch); visiting.delete(branch.id); return branch; }
    // Use inherited rest lengths; rigid parent rotations must not alter segment lengths.
    const constrainedRest = copy(inherited);
    branch.pins.forEach((i) => { if (constrainedRest[i]) constrainedRest[i].copy(original[i]); });
    preserveLengths(constrainedRest, points, fixed, options.preserveLength ?? 0.85);
    const dense = branch.points.map((point, i) => transformPoint(point, original, points, branch.sampleBindings[i]));
    dense[0].copy(points[0]);
    dense[dense.length - 1].copy(points.at(-1));
    const updated = { ...branch, controlPoints: points, points: dense };
    result.set(branch.id, updated);
    visiting.delete(branch.id);
    return updated;
  };
  snapshot.forEach(visit);
  return result;
}

export function sculptOverrides(snapshot, updated, previous = {}) {
  const output = {};
  for (const branch of updated.values()) {
    const before = snapshot.get(branch.id);
    if (!branch.controlPoints.some((point, i) => point.distanceToSquared(before.controlPoints[i]) > 1e-14)) continue;
    const parent = updated.get(branch.parentId);
    const knots = branch.controlPoints.map((point) => point.toArray());
    output[branch.stableId] = {
      ...(previous[branch.stableId] || {}), locked: true, curve_knots: knots, frozen_points: null,
      curve_samples: branch.points.map((point) => point.toArray()), curve_reference_knots: knots,
      curve_parent_frame: parent ? { parent: parent.stableId, tangent: lineTangent(parent.points, branch.parentT).toArray() } : null,
    };
  }
  return output;
}

// Bind existing render geometry once per stroke, then update positions and normals without rebuilding foliage.
export function createMeshPreview(asset, snapshot, options = {}) {
  if (options.gpu ?? asset.gpuEditPreview) {
    const preview=createGpuMeshPreview(asset,snapshot,{...options,sampleLine,lineTangent});
    if(preview)return preview;
  }
  return createCpuMeshPreview(asset,snapshot);
}

// Deformation returns unchanged branches by reference. Keep their prepared
// bindings rather than cloning the entire tree at every six-pixel brush sample.
export function advanceSculptSnapshot(previous,updated) {
  const next=new Map();
  for(const [id,branch] of updated){
    if(branch===previous.get(id)){next.set(id,branch);continue;}
    // A whole completed unit only moved rigidly. Its normalized bindings,
    // masks and pins are unchanged; recalculating nearest points is redundant.
    if (branch.sculptFollowMatrix && branch.sculptFollowMatrix !== previous.get(id)?.sculptFollowMatrix) {
      next.set(id,branch); continue;
    }
    const overrides={[branch.stableId]:{pinned_points:[...branch.pins],sculpt_mask:branch.mask}};
    next.set(id,createSculptSnapshot([branch],overrides).get(id));
  }
  return next;
}

export function createCpuMeshPreview(asset, snapshot) {
  asset.materialize?.();
  const records = [];
  const byStableId = new Map([...snapshot.values()].map((branch) => [branch.stableId, branch]));
  const elementBindings = asset.elements.map((element) => {
    if (element.type === 'BRANCH') return { branch: byStableId.get(element.id), t: null };
    const parentElement = asset.elements[element.parentIndex];
    const branch = byStableId.get(parentElement?.id);
    return branch ? { branch, t: nearestParameter(branch.points, new THREE.Vector3(...element.pivot)) } : null;
  });
  asset.group.updateMatrixWorld(true);
  asset.group.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const originalGeometry = mesh.geometry;
    if (mesh.userData.category === 'marker') mesh.geometry = originalGeometry.clone();
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const uv = geometry.getAttribute('uv1');
    const local = mesh.matrix.clone();
    const inverse = local.clone().invert();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(local);
    const inverseNormalMatrix = new THREE.Matrix3().getNormalMatrix(inverse);
    const source = [];
    const normals = [];
    const bindings = [];
    const branchHint = byStableId.get(mesh.userData.stable_id || mesh.userData.branch_id);
    let markerBinding = null;
    if (!uv && !branchHint) {
      const center = new THREE.Vector3().setFromMatrixPosition(local);
      let best = Infinity;
      for (const branch of snapshot.values()) {
        const t = nearestParameter(branch.points, center);
        const d = sampleLine(branch.points, t).distanceToSquared(center);
        if (d < best) { best = d; markerBinding = { branch, t }; }
      }
    }
    for (let i = 0; i < position.count; i += 1) {
      const point = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(local);
      source.push(point);
      normals.push(normal ? new THREE.Vector3().fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize() : null);
      const elementIndex = uv ? Math.floor(uv.getY(i) * asset.lookupTexture.height) * asset.lookupTexture.width + Math.floor(uv.getX(i) * asset.lookupTexture.width) : -1;
      const binding = branchHint ? { branch: branchHint, t: null } : elementBindings[elementIndex] || markerBinding;
      bindings.push(binding?.branch ? { id: binding.branch.id, t: binding.t ?? nearestParameter(binding.branch.points, point) } : null);
    }
    records.push({ mesh, originalGeometry, position, normal, source, normals, bindings, inverse, inverseNormalMatrix,
      originalPosition: position.array.slice(), originalNormal: normal?.array.slice(), frustumCulled: mesh.frustumCulled });
    mesh.frustumCulled = false;
  });
  return {
    updateRigid(matrix, branchIds) {
      const point=new THREE.Vector3(), normal=new THREE.Vector3();
      const rotation=new THREE.Matrix3().getNormalMatrix(matrix);
      for(const record of records) {
        let changed=false;
        for(let i=0;i<record.source.length;i++) {
          if(!branchIds.has(record.bindings[i]?.id))continue;
          point.copy(record.source[i]).applyMatrix4(matrix).applyMatrix4(record.inverse);
          record.position.setXYZ(i,point.x,point.y,point.z);
          if(record.normal && record.normals[i]) {
            normal.copy(record.normals[i]).applyMatrix3(rotation).applyMatrix3(record.inverseNormalMatrix).normalize();
            record.normal.setXYZ(i,normal.x,normal.y,normal.z);
          }
          changed=true;
        }
        if(changed) {record.position.needsUpdate=true;if(record.normal)record.normal.needsUpdate=true;}
      }
    },
    update(updated, rigidTransforms = null) {
      const frames = new Map();
      const followed = new Map();
      const point = new THREE.Vector3();
      const normal = new THREE.Vector3();
      for (const record of records) {
        for (let i = 0; i < record.source.length; i += 1) {
          const binding = record.bindings[i];
          if (!binding) continue;
          const matrix = updated.get(binding.id)?.sculptFollowMatrix;
          if (matrix && !followed.has(binding.id)) followed.set(binding.id, {matrix, normal:new THREE.Matrix3().getNormalMatrix(matrix)});
          const transform = rigidTransforms?.get(binding.id) || followed.get(binding.id);
          const rigid = transform?.at ? transform.at(binding.t) : transform;
          if (rigid) {
            point.copy(record.source[i]).applyMatrix4(rigid.matrix).applyMatrix4(record.inverse);
            record.position.setXYZ(i, point.x, point.y, point.z);
            if (record.normal && record.normals[i]) {
              normal.copy(record.normals[i]).applyMatrix3(rigid.normal).applyMatrix3(record.inverseNormalMatrix).normalize();
              record.normal.setXYZ(i, normal.x, normal.y, normal.z);
            }
            continue;
          }
          const before = snapshot.get(binding.id);
          const after = updated.get(binding.id);
          const key = `${binding.id}:${binding.t}`;
          let frame = frames.get(key);
          if (!frame) {
            frame = { from: sampleLine(before.points, binding.t), to: sampleLine(after.points, binding.t),
              rotation: new THREE.Quaternion().setFromUnitVectors(lineTangent(before.points, binding.t), lineTangent(after.points, binding.t)) };
            frames.set(key, frame);
          }
          point.copy(record.source[i]).sub(frame.from).applyQuaternion(frame.rotation).add(frame.to).applyMatrix4(record.inverse);
          record.position.setXYZ(i, point.x, point.y, point.z);
          if (record.normal && record.normals[i]) {
            normal.copy(record.normals[i]).applyQuaternion(frame.rotation).applyMatrix3(record.inverseNormalMatrix).normalize();
            record.normal.setXYZ(i, normal.x, normal.y, normal.z);
          }
        }
        record.position.needsUpdate = true;
        if (record.normal) record.normal.needsUpdate = true;
      }
    },
    restore() {
      records.forEach((record) => {
        record.position.array.set(record.originalPosition); record.position.needsUpdate = true;
        if (record.normal) { record.normal.array.set(record.originalNormal); record.normal.needsUpdate = true; }
        record.mesh.frustumCulled = record.frustumCulled;
        if (record.mesh.geometry !== record.originalGeometry) {
          record.mesh.geometry.dispose(); record.mesh.geometry = record.originalGeometry;
        }
      });
    },
  };
}
