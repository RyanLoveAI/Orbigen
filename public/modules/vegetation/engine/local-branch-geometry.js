import * as THREE from 'three';
import { sampleLine, lineTangent } from './tree-sculpt.js';
import { branchRadiusAt } from './branch-shaping.js';

export function localBranchShape(parent, manual, settings) {
  const spec = manual.local_bundle, start = sampleLine(parent.points, manual.attach), tangent = lineTangent(parent.points, manual.attach);
  const basis = Math.abs(tangent.z) < .9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const radial = basis.addScaledVector(tangent, -basis.dot(tangent)).normalize().applyAxisAngle(tangent, THREE.MathUtils.degToRad(manual.azimuth));
  const angle = THREE.MathUtils.degToRad(manual.angle), direction = tangent.clone().multiplyScalar(Math.cos(angle)).addScaledVector(radial, Math.sin(angle));
  const parentLength = parent.points.slice(1).reduce((sum, p, i) => sum + p.distanceTo(parent.points[i]), 0);
  const length = Math.max(.03, parentLength * spec.length), radius = Math.max(.00001, branchRadiusAt(parent, settings, manual.attach) * spec.radius);
  const points = Array.from({ length: 17 }, (_, i) => { const t = i / 16;
    // Leave the parent along a shallow tangent, then turn into the chosen angle.
    return start.clone().addScaledVector(direction, length * t)
      .addScaledVector(tangent.clone().sub(direction), length * t * Math.exp(-t * 9) * .55)
      .addScaledVector(tangent, length * spec.bend * t * t).toArray(); });
  return { points, knots: points.filter((_, i) => i % 4 === 0), length, start_radius: radius, end_radius: radius * spec.taper,
    radius_profile: [1, 1], localBundle: true };
}
