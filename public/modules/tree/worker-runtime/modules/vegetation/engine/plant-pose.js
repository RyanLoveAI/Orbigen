import * as THREE from '/vendor/three/three.module.js';
import { plantRandom } from './flowering-data.js';

// A separate, stable stream changes appearance without moving attachment points,
// consuming layout randomness, or changing which units survive a lower LOD.
export function varyPlantPose(placement, baseScale, sizeVariation, directionDegrees, twistDegrees, seed) {
  const rng = plantRandom(seed, placement.stableId + ':pose');
  placement.scale = Math.max(.006, baseScale * (1 + (rng() * 2 - 1) * sizeVariation));
  const direction = placement.direction.clone().normalize();
  const helper = Math.abs(direction.z) > .9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const x = new THREE.Vector3().crossVectors(direction, helper).normalize();
  const z = new THREE.Vector3().crossVectors(x, direction).normalize();
  const angle = THREE.MathUtils.degToRad(directionDegrees) * Math.sqrt(rng());
  const azimuth = rng() * Math.PI * 2;
  placement.direction.copy(direction).multiplyScalar(Math.cos(angle))
    .addScaledVector(x, Math.sin(angle) * Math.cos(azimuth))
    .addScaledVector(z, Math.sin(angle) * Math.sin(azimuth)).normalize();
  placement.twist = THREE.MathUtils.degToRad((rng() * 2 - 1) * twistDegrees);
  return placement;
}
