import * as THREE from '/vendor/three/three.module.js';
import { pointRotationPlan } from './branch-point-rotation.js';
import { sampleLine, lineTangent } from './tree-sculpt.js';
import { branchMountAt } from './branch-mount-frame.js';

// Redistribute editable handles by arc length on the evaluated curve. Keep the
// number/indices stable so existing anchors and later point edits remain valid.
function resampleHandles(path, count) {
  const distances = [0];
  for (let i = 1; i < path.length; i++) distances.push(distances[i - 1] + path[i].distanceTo(path[i - 1]));
  let segment = 0;
  return Array.from({length:count}, (_, i) => {
    const distance = distances.at(-1) * i / Math.max(1, count - 1);
    while (segment < path.length - 2 && distances[segment + 1] < distance) segment++;
    const span = distances[segment + 1] - distances[segment];
    return path[segment].clone().lerp(path[segment + 1], span > 1e-12 ? (distance - distances[segment]) / span : 0);
  });
}

export function evaluatePointScale(branches, operation, strength = 1, overrides = {}) {
  const scale = new THREE.Vector3(...operation.scale).lerp(new THREE.Vector3(1,1,1),1-strength);
  if (scale.distanceToSquared(new THREE.Vector3(1,1,1)) < 1e-20) return branches;
  const root = branches.find(b=>b.stableId===operation.root), index = operation.point;
  if (!root || root.unitOwner || root.instanceId || root.symmetryGroup || index <= 0 || index >= root.controlPoints.length-1) return branches;
  const {fixed} = pointRotationPlan(root,index,[0,0,0,1]);
  if (fixed >= root.points.length-1) return branches;
  const byId = new Map(branches.map(b=>[b.id,b])), affected = new Map(), visiting = new Set();
  function includes(b) {
    if (b===root) return true;
    if (affected.has(b.id)) return affected.get(b.id);
    if (visiting.has(b.id)) return false;
    visiting.add(b.id);
    const p=byId.get(b.parentId), yes=p===root ? b.parentT*(root.points.length-1)>=fixed-1e-9 : p ? includes(p) : false;
    affected.set(b.id,yes);visiting.delete(b.id);return yes;
  }
  if ((overrides[root.stableId]?.pinned_points || []).some(i=>i>index)
    || branches.some(b=>b!==root && includes(b) && overrides[b.stableId]?.pinned_points?.length)) return branches;
  const origin=root.points[fixed], transform=p=>p.clone().sub(origin).multiply(scale).add(origin);
  const result=new Map(), rigid=new Map();
  function visit(b) {
    if (result.has(b.id)) return result.get(b.id);
    if (!includes(b)) return b;
    const p=byId.get(b.parentId), afterParent=p && b!==root ? visit(p) : null;
    let updated;
    if (b.unitOwner || b.instanceId) {
      if (!p || afterParent===p) return b;
      const from=sampleLine(p.points,b.parentT), to=sampleLine(afterParent.points,b.parentT);
      const q=new THREE.Quaternion().setFromUnitVectors(lineTangent(p.points,b.parentT),lineTangent(afterParent.points,b.parentT));
      const inherited=(b.unitOwner||b.instanceId)===(p.unitOwner||p.instanceId) ? rigid.get(p.id) : null;
      const matrix=inherited || new THREE.Matrix4().makeTranslation(...to.toArray()).multiply(new THREE.Matrix4().makeRotationFromQuaternion(q)).multiply(new THREE.Matrix4().makeTranslation(...from.clone().negate().toArray()));
      rigid.set(b.id,matrix);q.setFromRotationMatrix(matrix);
      updated={...b,points:b.points.map(p=>p.clone().applyMatrix4(matrix)),controlPoints:b.controlPoints.map(p=>p.clone().applyMatrix4(matrix)),
        mountMatrix:matrix.clone().multiply(b.mountMatrix||new THREE.Matrix4()),mountFrames:b.mountFrames?.map(f=>matrix.clone().multiply(f)),surfaceNormals:b.surfaceNormals?.map(n=>n.clone().applyQuaternion(q))};
    } else {
      const points=b.points.map((p,i)=>b===root && i<=fixed ? p.clone() : transform(p));
      const controlPoints=b===root ? [
        ...b.controlPoints.slice(0,index+1).map(p=>p.clone()),
        ...resampleHandles([b.controlPoints[index],...points.slice(fixed)],b.controlPoints.length-index).slice(1)
      ] : resampleHandles(points,b.controlPoints.length);
      // Store each carrier segment's rigid attachment motion, excluding scale.
      // Compiled samples and expanded geometry then use the same frame/roll.
      const mountFrames=points.slice(1).map((_,i)=>{
        const t=(i+.5)/(points.length-1), q=new THREE.Quaternion().setFromUnitVectors(lineTangent(b.points,t),lineTangent(points,t));
        return new THREE.Matrix4().makeTranslation(...sampleLine(points,t).toArray())
          .multiply(new THREE.Matrix4().makeRotationFromQuaternion(q))
          .multiply(new THREE.Matrix4().makeTranslation(...sampleLine(b.points,t).negate().toArray()))
          .multiply(branchMountAt(b,t)||new THREE.Matrix4());
      });
      updated={...b,points,controlPoints,mountFrames,length:points.slice(1).reduce((n,p,i)=>n+p.distanceTo(points[i]),0)};
    }
    result.set(b.id,updated);return updated;
  }
  return branches.map(visit);
}
