import * as THREE from 'three';

// Integrate rotated tangents using the evaluated curve's rest lengths. Constraining
// only the sparse control polygon does not constrain the rendered branch length.
export function combCurve(points, weights, delta, { strength = 0.65, worldRadius = 1, fixedThrough = 0 } = {}) {
  const result = points.map(p => p.clone());
  if (delta.lengthSq() < 1e-16 || strength <= 0) return result;
  const direction = delta.clone().normalize();
  const turn = Math.min(0.25, delta.length() / Math.max(0.01, worldRadius) * strength * 2);
  const rotation = new THREE.Quaternion();
  const identity = new THREE.Quaternion();
  const targetRotation = new THREE.Quaternion();
  for (let i = Math.max(1, fixedThrough + 1); i < points.length; i++) {
    const tangent = points[i].clone().sub(points[i - 1]);
    const length = tangent.length();
    if (length < 1e-12) { result[i].copy(result[i - 1]); continue; }
    tangent.divideScalar(length);
    targetRotation.setFromUnitVectors(tangent, direction);
    rotation.copy(identity).slerp(targetRotation, turn * THREE.MathUtils.clamp(weights[i] || 0, 0, 1));
    result[i].copy(result[i - 1]).addScaledVector(tangent.applyQuaternion(rotation), length);
  }
  return result;
}
