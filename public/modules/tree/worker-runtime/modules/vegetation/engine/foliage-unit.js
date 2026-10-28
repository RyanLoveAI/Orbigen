import * as THREE from '/vendor/three/three.module.js';
import { plantAttachmentBase } from './plant-attachment.js';
import { normalizeFoliageUnit } from './foliage-unit-data.js';
export { normalizeFoliageUnit } from './foliage-unit-data.js';

const Y = new THREE.Vector3(0, 1, 0);
const noop = () => {};
const point = (p, i) => new THREE.Vector3().fromBufferAttribute(p, i);

function validGeometry(geometry) {
  const p = geometry?.isBufferGeometry && geometry.getAttribute('position');
  if (!p || p.count < 3) return false;
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < p.count; i++) {
    if (![p.getX(i), p.getY(i), p.getZ(i)].every(Number.isFinite)) return false;
    min = Math.min(min, p.getY(i)); max = Math.max(max, p.getY(i));
  }
  return max - min > 1e-8;
}

function defaultLeaf(aspect = .38) {
  const a = Number.isFinite(Number(aspect)) ? Math.min(.7, Math.max(.08, Number(aspect))) : .38;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -a / 2, .4, 0, 0, 1, 0, a / 2, .4, 0, 0, .45, .028], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([.5, 0, 0, .4, .5, 1, 1, .4, .5, .45], 2));
  geometry.setIndex([0, 4, 1, 1, 4, 2, 2, 4, 3, 3, 4, 0]);
  geometry.computeVertexNormals();
  return geometry;
}

// Each derived unit uses a deterministic local variation, never Math.random.
function variation(seed, n) {
  const x = Math.sin((seed + 1) * 17.13 + (n + 1) * 73.71) * 43758.5453;
  return x - Math.floor(x);
}

function sourceInfo(source) {
  const geometry = source.geometry, p = geometry.getAttribute('position');
  const base = plantAttachmentBase(geometry).clone();
  let height = 0, rootIndex = 0;
  for (let i = 0; i < p.count; i++) {
    height = Math.max(height, p.getY(i) - base.y);
    if (p.getY(i) < p.getY(rootIndex)) rootIndex = i;
  }
  const uv = geometry.getAttribute('uv');
  // Keep this texel constant along the rachis: interpolating atlas UVs can
  // otherwise cross transparent gutters and erase the connecting stalk.
  const rootUV = uv ? [uv.getX(rootIndex), uv.getY(rootIndex)] : [.5, .05];
  let normal = geometry.getAttribute('normal');
  if (!normal) {
    const copy = geometry.clone(); copy.computeVertexNormals();
    normal = copy.getAttribute('normal').clone(); copy.dispose();
  }
  return { ...source, base, height, normal, rootUV };
}

function appendLeaf(arrays, source, origin, direction, length, roll, sourceIndex) {
  const geometry = source.geometry, p = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
  const rotation = new THREE.Quaternion().setFromUnitVectors(Y, direction.clone().normalize());
  rotation.multiply(new THREE.Quaternion().setFromAxisAngle(Y, roll));
  // Very broad imported blades at a near-horizontal spread can otherwise
  // extend below the unit's actual stalk foot. Keep the collar unobstructed.
  let lowest = 0;
  for (let i = 0; i < p.count; i++) lowest = Math.min(lowest, point(p, i).sub(source.base).divideScalar(source.height).applyQuaternion(rotation).y);
  if (lowest < 0 && origin.y + lowest * length < .035) length = Math.min(length, Math.max(.001, (origin.y - .035) / -lowest));
  const start = arrays.position.length / 3;
  for (let i = 0; i < p.count; i++) {
    const vertex = point(p, i).sub(source.base).multiplyScalar(length / source.height).applyQuaternion(rotation).add(origin);
    arrays.position.push(...vertex.toArray());
    const normal = point(source.normal, i).applyQuaternion(rotation).normalize();
    if (!Number.isFinite(normal.lengthSq()) || normal.lengthSq() < 1e-10) normal.set(0, 0, 1).applyQuaternion(rotation);
    arrays.normal.push(...normal.toArray());
    arrays.uv.push(uv ? uv.getX(i) : .5, uv ? uv.getY(i) : .5);
  }
  const index = geometry.index;
  for (let i = 0; i < (index?.count ?? p.count); i++) arrays.index.push(start + (index ? index.getX(i) : i));
  arrays.leaflets.push({ sourceIndex, vertexStart: start, vertexCount: p.count, origin: origin.toArray(), length });
}

function axisPoint(y, bend) {
  // A straight root collar gives a stable plantAttachmentBase at (0,0,0).
  const curved = Math.max(0, y - .035);
  return new THREE.Vector3(bend * curved * curved, y, bend * .25 * curved * curved);
}

function appendRachis(arrays, nodes, radius, uv) {
  const start = arrays.position.length / 3, sides = 6;
  for (let j = 0; j < nodes.length; j++) {
    const node = nodes[j], r = radius * (1 - .72 * j / (nodes.length - 1));
    for (let k = 0; k < sides; k++) {
      const angle = k / sides * Math.PI * 2, x = Math.cos(angle), z = Math.sin(angle);
      arrays.position.push(node.x + r * x, node.y, node.z + r * z);
      arrays.normal.push(x, 0, z); arrays.uv.push(...uv);
    }
    if (!j) continue;
    for (let k = 0; k < sides; k++) {
      const a = start + (j - 1) * sides + k, b = start + (j - 1) * sides + (k + 1) % sides;
      arrays.index.push(a, a + sides, b, b, a + sides, b + sides);
    }
  }
  // End caps share the existing ring, keeping a continuous closed rachis.
  for (let k = 1; k < sides - 1; k++) {
    arrays.index.push(start, start + k + 1, start + k);
    const top = start + (nodes.length - 1) * sides;
    arrays.index.push(top, top + k, top + k + 1);
  }
}

function finish(arrays, mode, procedural, sourceName, nodes) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(arrays.position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(arrays.normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(arrays.uv, 2));
  geometry.setIndex(arrays.index);
  geometry.computeBoundingBox();
  const height = geometry.boundingBox.max.y;
  geometry.scale(1 / height, 1 / height, 1 / height);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData.sourceName = sourceName;
  geometry.userData.foliageUnit = {
    mode, procedural, leafletCount: arrays.leaflets.length,
    leaflets: arrays.leaflets.map(leaf => ({ ...leaf, origin: leaf.origin.map(v => v / height), length: leaf.length / height })),
    rachisNodes: nodes.map(node => node.clone().divideScalar(height).toArray()),
  };
  return geometry;
}

function pinnate(infos, target, settings, unit, procedural) {
  const arrays = { position: [], normal: [], uv: [], index: [], leaflets: [] };
  const seed = (Number(settings?.seed) || 0) + target * 101;
  const bend = unit.bend + (variation(seed, 0) - .5) * .025;
  const pairYs = Array.from({ length: unit.pairs }, (_, pair) => .2 + pair / Math.max(1, unit.pairs - 1) * .6);
  const nodes = [...new Set([0, .03, ...Array.from({ length: 17 }, (_, i) => i / 20), ...pairYs, .9])].sort((a, b) => a - b).map(y => axisPoint(y, bend));
  appendRachis(arrays, nodes, .008, infos[target].rootUV);
  for (let pair = 0; pair < unit.pairs; pair++) {
    for (const side of [-1, 1]) {
      const n = pair * 2 + (side + 1) / 2;
      const sourceIndex = (target + pair + (side > 0 ? 1 : 0)) % infos.length;
      const angle = THREE.MathUtils.degToRad(unit.spread + (variation(seed, n + 1) - .5) * 5);
      const direction = new THREE.Vector3(side * Math.sin(angle), Math.cos(angle), (variation(seed, n + 20) - .5) * .11);
      const length = unit.leaflet_ratio * (1 - .23 * pair / (unit.pairs - 1)) * (.95 + .1 * variation(seed, n + 40));
      appendLeaf(arrays, infos[sourceIndex], axisPoint(pairYs[pair], bend), direction, length, (variation(seed, n + 60) - .5) * .14, sourceIndex);
    }
  }
  if (unit.terminal) appendLeaf(arrays, infos[target], axisPoint(.9, bend), new THREE.Vector3(bend * 1.7, 1, bend * .4), unit.leaflet_ratio * .83, 0, target);
  return finish(arrays, 'PINNATE', procedural, infos[target].name || '羽状复叶单元', nodes);
}

function proceduralConifer(mode, unit) {
  const leaf = defaultLeaf(mode === 'SPRIG' ? .095 : .025), source = sourceInfo({ geometry: leaf });
  const arrays = { position: [], normal: [], uv: [], index: [], leaflets: [] };
  const attachmentYs = mode === 'SPRIG' ? Array.from({ length: 12 }, (_, i) => .14 + i * .068) : Array.from({ length: 5 }, (_, i) => .05 + i * .025);
  const axisEnd = mode === 'SPRIG' ? 1 : .18;
  const nodes = [...new Set([0, .03, ...attachmentYs, ...Array.from({ length: 25 }, (_, i) => axisEnd * i / 24)])].sort((a, b) => a - b).map(y => axisPoint(y, unit.bend));
  appendRachis(arrays, nodes, mode === 'SPRIG' ? .006 : .009, [.5, .05]);
  if (mode === 'SPRIG') {
    for (let i = 0; i < 12; i++) for (const side of [-1, 1]) {
      const y = .14 + i * .068;
      appendLeaf(arrays, source, axisPoint(y, unit.bend), new THREE.Vector3(side, .3, 0), .29 * (1 - i / 18), 0, 0);
    }
    appendLeaf(arrays, source, nodes.at(-1), Y, .14, 0, 0);
  } else {
    for (let i = 0; i < 30; i++) {
      const angle = i * Math.PI * (3 - Math.sqrt(5));
      const y = .05 + (i % 5) * .025;
      appendLeaf(arrays, source, axisPoint(y, unit.bend), new THREE.Vector3(Math.cos(angle) * .72, .65 + variation(11, i) * .35, Math.sin(angle) * .72), .65 + .3 * variation(7, i), angle, 0);
    }
  }
  leaf.dispose();
  return finish(arrays, mode, true, mode === 'SPRIG' ? '程序水杉短枝示意' : '程序雪松针簇示意', nodes);
}

/** Derive render-only complete foliage units; never mutate or dispose imports. */
export function buildFoliageUnitSources(sourceInput, settings = {}, raw = {}) {
  const unit = normalizeFoliageUnit(raw);
  const original = Array.isArray(sourceInput) ? sourceInput : sourceInput?.isBufferGeometry ? [{ geometry: sourceInput, weight: 1, name: sourceInput.userData.sourceName }] : [];
  if (unit.mode === 'SINGLE') return { sources: original, dispose: noop };
  const supplied = original.filter(source => validGeometry(source?.geometry));
  if (unit.mode !== 'PINNATE' && supplied.length) return { sources: supplied.length === original.length ? original : supplied, dispose: noop };
  let fallback = null, sources;
  if (unit.mode === 'PINNATE') {
    if (!supplied.length) {
      fallback = defaultLeaf(settings?.leaf_aspect);
      supplied.push({ geometry: fallback, weight: 1, name: '程序羽状复叶示意' });
    }
    const automatic = supplied.filter(s => !s.manual_only), infos = automatic.map(sourceInfo);
    sources = supplied.map(source => source.manual_only ? source : ({ ...source, geometry: pinnate(infos, automatic.indexOf(source), settings, unit, Boolean(fallback)) }));
  } else sources = [{ geometry: proceduralConifer(unit.mode, unit), weight: 1, name: unit.mode === 'SPRIG' ? '程序水杉短枝示意' : '程序雪松针簇示意' }];
  fallback?.dispose();
  let disposed = false;
  return { sources, dispose() { if (!disposed) { disposed = true; sources.filter(source => !source.manual_only).forEach(source => source.geometry.dispose()); } } };
}
