import * as THREE from 'three';

const bases = new WeakMap();
// Imported units are often centered on their silhouette, not on their stalk.
// Recover the stalk foot without editing vertices, UVs or saved source data.
export function plantAttachmentBase(geometry) {
  const position = geometry.getAttribute('position');
  const cached = bases.get(geometry);
  if (cached?.position === position && cached.version === position.version) return cached.base;
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < position.count; i++) { min = Math.min(min, position.getY(i)); max = Math.max(max, position.getY(i)); }
  const threshold = min + Math.max(1e-7, (max - min) * .015);
  const base = new THREE.Vector3(), unique = new Set();
  for (let i = 0; i < position.count; i++) {
    if (position.getY(i) > threshold) continue;
    const key = [position.getX(i), position.getY(i), position.getZ(i)].map(v => Math.round(v * 1e7)).join(',');
    if (unique.has(key)) continue;
    unique.add(key); base.x += position.getX(i); base.z += position.getZ(i);
  }
  base.x /= Math.max(1, unique.size); base.z /= Math.max(1, unique.size); base.y = min;
  bases.set(geometry, { position, version: position.version, base });
  return base;
}
