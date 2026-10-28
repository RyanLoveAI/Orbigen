import * as THREE from '/vendor/three/three.module.js';
import { branchMountAt } from './branch-mount-frame.js';

// Shared by viewport instances, local sample editing and the existing PVE exporter.
export function completeInstanceMatrix(instance, shape, parent, settings, frame) {
  const mount = branchMountAt(parent, instance.attach), inverse = mount?.clone().invert();
  const sourceParent = mount ? {...parent, points: parent.points.map(p => p.clone().applyMatrix4(inverse))} : parent;
  const f = frame(instance, sourceParent, settings);
  const direction = f.direction.clone().normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...shape.connector.direction).normalize(), direction);
  q.premultiply(new THREE.Quaternion().setFromAxisAngle(direction, instance.roll * Math.PI / 180));
  const result = new THREE.Matrix4().compose(f.position,q,new THREE.Vector3().setScalar(f.scale))
    .multiply(new THREE.Matrix4().makeTranslation(...shape.connector.position.map(v => -v)));
  return mount ? result.premultiply(mount) : result;
}
