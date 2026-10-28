import * as THREE from 'three';
import { plantNodes, plantRandom } from './flowering-data.js';
import { varyPlantPose } from './plant-pose.js';

export function flowerPlacements(branches, f, samplePoint, masksAllow = () => true) {
  const candidates = [], removed = new Set(f.removed);
  const box = new THREE.Box3(); branches.forEach((b) => b.points.forEach((p) => box.expandByPoint(p))); const center = box.getCenter(new THREE.Vector3()), radius = Math.max(.1, box.getSize(new THREE.Vector3()).length() * .5);
  for (const branch of branches) {
    if (branch.vineRole === 'RUNNER' || branch.order === 0) continue;
    const region = f.regions[branch.stableId], seed = region?.seed ?? f.seed;
    const branchBias = plantRandom(seed, branch.stableId + ':flowering')();
    const start = Math.max(f.start, region?.start ?? 0), end = Math.min(f.end, region?.end ?? 1);
    if (end <= start) continue;
    for (const node of plantNodes(branch, f.node_spacing)) {
      if (node.t < start || node.t > end || removed.has(node.id + ':F')) continue;
      const rng = plantRandom(seed, node.id), position = samplePoint(branch.points, node.t);
      if (!masksAllow(position, node.id)) continue;
      const band = Math.floor(node.index / (2 + Math.round(f.grouping * 8))), bandRoll = plantRandom(seed, `${branch.stableId}:band:${band}`)();
      const exposure = Math.min(1, position.distanceTo(center) / radius);
      const probability = Math.min(1, f.amount * (region?.amount ?? 1) * (1 - f.outer * .5 + f.outer * exposure));
      const threshold = branchBias * .25 * f.grouping + bandRoll * .6 * f.grouping + rng() * (1 - .85 * f.grouping);
      if (threshold > probability || probability <= 0) continue;
      const azimuth = node.index * 2.39996;
      const normal = f.style === 'BUSH' ? new THREE.Vector3(position.x, position.y, .15).normalize() : new THREE.Vector3(Math.sin(azimuth) * .25, -1, .15).normalize();
      // The supplied flower has its own stalk; attach its foot at the branch
      // centerline. The old extra 2cm offset left the entire stalk detached.
      const direction = normal.clone().add(new THREE.Vector3(Math.sin(azimuth) * .3, Math.cos(azimuth) * .18, .15 + Math.cos(azimuth * .7) * .3)).normalize();
      candidates.push({ stableId: node.id + ':F', nodeId: node.id, branchId: branch.id, branchStableId: branch.stableId, branchT: node.t, position, direction, normal: new THREE.Vector3(0, 0, 1),
        scale: f.size * (.82 + rng() * .35), twist: (rng() - .5) * 1.2, phase: rng(), random: rng(), priority: plantRandom(seed, node.id + ':priority')(), source: 0 });
      varyPlantPose(candidates.at(-1), f.size, f.size_variation, f.direction_variation, f.twist_variation, f.pose_seed);
    }
  }
  return candidates.sort((a, b) => a.priority - b.priority || a.stableId.localeCompare(b.stableId)).slice(0, f.max_count);
}

function merge(parts) {
  const positions = [], normals = [], uv = [], indices = []; let offset = 0;
  for (const g of parts) { positions.push(...g.attributes.position.array); normals.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array); for (const i of g.index.array) indices.push(i + offset); offset += g.attributes.position.count; g.dispose(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(indices); return g;
}
export function defaultInflorescence() {
  const bracts = [], flowers = [];
  for (let i = 0; i < 3; i++) {
    const angle = i * Math.PI * 2 / 3;
    const outline = [[0, 0], [-.22, .25], [-.32, .53], [-.23, .78], [0, 1], [.23, .78], [.32, .53], [.22, .25], [0, .48]];
    const positions = [], uv = [], indices = [];
    for (const [x, z] of outline) { positions.push(x, .08 + z * .28 + Math.sin(z * Math.PI) * .1, z * .72); uv.push(x + .5, z); }
    for (let j = 0; j < 8; j++) indices.push(j, (j + 1) % 8, 8);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(indices); g.computeVertexNormals(); g.rotateY(angle); bracts.push(g);
    const tube = new THREE.CylinderGeometry(.028, .013, .24, 5, 1); tube.translate(0, .22, .17); tube.rotateY(angle); flowers.push(tube);
    const mouth = new THREE.ConeGeometry(.045, .035, 5); mouth.rotateZ(Math.PI); mouth.translate(0, .35, .17); mouth.rotateY(angle); flowers.push(mouth);
  }
  return { bracts: merge(bracts), core: merge(flowers) };
}
