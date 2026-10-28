import { paintField } from './surface-paint.js';
import * as THREE from '/vendor/three/three.module.js';
import { plantRandom } from './flowering-data.js';
import { hangingPoints, surfaceSegmentBlocked } from './surface-growth-eaves.js';

const V = a => new THREE.Vector3(...a), smooth = t => t * t * (3 - 2 * t);
export function surfaceBrushFaces(nav, anchor, radius) {
  const point = V(anchor.point), queue = [anchor.face], seen = new Set(), result = [];
  while (queue.length && seen.size < 5000) {
    const id = queue.pop(); if (id < 0 || seen.has(id)) continue; seen.add(id);
    const face = nav.faces[id];
    if (face.triangle.closestPointToPoint(point, new THREE.Vector3()).distanceTo(point) > radius || face.normal.dot(nav.faces[anchor.face].normal) < .1) continue;
    result.push(id); for (const n of face.neighbors) if (n >= 0 && !seen.has(n)) queue.push(n);
  }
  return result;
}

function noise(seed) {
  const cache = new Map();
  const value = (x, y, z) => { const key = `${x},${y},${z}`; if (!cache.has(key)) cache.set(key, plantRandom(seed, key)()); return cache.get(key); };
  return point => {
    const base = point.clone().floor(), f = point.clone().sub(base).toArray().map(smooth); let sum = 0;
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) sum += value(base.x + x, base.y + y, base.z + z) * (x ? f[0] : 1 - f[0]) * (y ? f[1] : 1 - f[1]) * (z ? f[2] : 1 - f[2]);
    return sum;
  };
}

// Distance to the painted boundary in world metres, including on coarse triangles.
// A segment tree avoids a per-sample scan of every boundary edge.
function boundaryDistance(nav, allowed) {
  const edges = [];
  for (const id of allowed) {
    const face = nav.faces[id];
    face.neighbors.forEach((n, e) => { if (!allowed.has(n)) {
      const a = nav.vertices[face.ids[e]], b = nav.vertices[face.ids[(e + 1) % 3]], line = new THREE.Line3(a, b);
      edges.push({ line, box: new THREE.Box3().setFromPoints([a, b]), center: a.clone().lerp(b, .5) });
    } });
  }
  function build(items) {
    const box = new THREE.Box3(); for (const i of items) box.union(i.box);
    if (items.length < 12) return { box, items };
    const size = box.getSize(new THREE.Vector3()), axis = size.x > size.y ? (size.x > size.z ? 'x' : 'z') : (size.y > size.z ? 'y' : 'z');
    items.sort((a, b) => a.center[axis] - b.center[axis]); const half = items.length >> 1;
    return { box, left: build(items.slice(0, half)), right: build(items.slice(half)) };
  }
  const tree = build(edges);
  return (point, limit) => {
    let best = limit;
    function visit(node) {
      if (node.box.distanceToPoint(point) >= best) return;
      if (node.items) for (const i of node.items) best = Math.min(best, i.line.closestPointToPoint(point, true, new THREE.Vector3()).distanceTo(point));
      else { visit(node.left); visit(node.right); }
    }
    visit(tree); return best;
  };
}

export function createRegionGrowth(nav, surface, vine, walk, budget = 480) {
  const r = surface.region;
  if (!r?.enabled || !r.faces.length || r.coverage <= 0 || budget <= 0) return [];
  const precise = paintField(r,surface.blocked,surface.block_strokes);
  const forbidden = new Set(surface.block_strokes?.length?[]:surface.blocked), allowed = new Set(r.faces.filter(f => !forbidden.has(f) && nav.faces[f]?.triangle.getArea() > 1e-10));
  if (!allowed.size) return [];
  const closed = new Set(nav.faces.map((_, i) => i).filter(i => !allowed.has(i)));
  let totalArea = 0; for (const face of allowed) totalArea += nav.faces[face].triangle.getArea();
  const distance = boundaryDistance(nav, allowed), field = noise(r.seed), minSpacing = Math.max(.035, vine.leaf_size * .9), occupied = new Map();
  const normalSign = surface.flip ? -1 : 1, offset = Math.max(surface.offset, vine.stem * 2.5), radius = Math.max(.0012, vine.stem * .6);
  const density = Math.min(12000 / totalArea, 60 * (.08 / Math.max(.03, vine.leaf_size)) ** 2), candidates = [];
  // Seed each triangle independently, then spread the finite branch budget across
  // the whole region. Painting a nearby patch does not reseed every existing vine.
  for (const face of allowed) {
    const expected = nav.faces[face].triangle.getArea() * density, count = Math.floor(expected) + (plantRandom(r.seed, `face:${face}`)() < expected % 1 ? 1 : 0);
    for (let slot = 0; slot < count; slot++) { const id = `A_${face}_${slot}`; candidates.push({ id, face, priority: plantRandom(r.seed, `${id}:priority`)() }); }
  }
  candidates.sort((a, b) => a.priority - b.priority || a.face - b.face || a.id.localeCompare(b.id));
  const fadeAt = p => r.fade > 0 ? smooth(Math.min(1, distance(p, r.fade) / r.fade)) : 1;
  function reserve(p) {
    const cell = p.clone().divideScalar(minSpacing).floor();
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      const bucket = occupied.get(`${cell.x + x},${cell.y + y},${cell.z + z}`);
      if (bucket?.some(q => q.distanceToSquared(p) < minSpacing ** 2)) return false;
    }
    const key = cell.toArray().join(','); if (!occupied.has(key)) occupied.set(key, []); occupied.get(key).push(p); return true;
  }
  const branches = [];
  for (const candidate of candidates.slice(0, 12000)) {
    if (branches.length >= budget) break;
    const { id, face: faceId } = candidate, rng = plantRandom(r.seed, id), face = nav.faces[faceId], root = face.triangle.a.clone(), u = Math.sqrt(rng()), v = rng();
    root.multiplyScalar(1 - u).addScaledVector(face.triangle.b, u * (1 - v)).addScaledVector(face.triangle.c, u * v);
    const clump = field(root.clone().divideScalar(r.clump)), fade = fadeAt(root);
    if (rng() > r.coverage * (.2 + .8 * clump) * fade * precise.weight(faceId,root) || !reserve(root)) continue;
    const tangent = face.triangle.b.clone().sub(face.triangle.a).normalize().applyAxisAngle(face.normal, rng() * Math.PI * 2);
    const length = Math.max(.18, Math.min(1.2, r.clump * (.6 + rng() * .7)));
    const canHang = rng() < r.hang;
    const samples = walk(nav, { face: faceId, point: root.toArray() }, tangent, length, closed, canHang ? { flip: surface.flip, exitBlocked: forbidden } : null);
    const points = [], normals = [], faces = []; let traveled = 0, finished = true;
    for (let j = 0; j < samples.length; j++) {
      const s = samples[j], raw = V(s.point);if(precise.weight(s.face,raw)<.04){finished=false;break;}const faceNormal = nav.faces[s.face].normal.clone().multiplyScalar(normalSign), normal = faceNormal.clone();
      if (j) traveled += raw.distanceTo(V(samples[j - 1].point));
      if (s.nextFace !== undefined) normal.addScaledVector(nav.faces[s.nextFace].normal, normalSign).normalize();
      if (s.outward) normal.add(V(s.outward)).normalize();
      const cluster = field(raw.clone().divideScalar(r.clump));
      const mound = smooth(Math.max(0, Math.min(1, (cluster - .2) / .6)));
      const height = r.height * (r.style === 'MOUND' ? mound : .2 + .3 * cluster) * Math.min(1, traveled / .12) * fadeAt(raw);
      const base = raw.clone().addScaledVector(normal, offset / Math.max(.25, normal.dot(faceNormal)));
      const p = base.clone().addScaledVector(normal, height);
      if (surfaceSegmentBlocked(nav, base, p, radius) || points.length && surfaceSegmentBlocked(nav, points.at(-1), p, radius)) { finished = false; break; }
      if (points.length && points.at(-1).distanceToSquared(p) < 1e-10) continue;
      points.push(p); normals.push(normal.toArray()); faces.push(s.face);
    }
    if (points.length < 2) continue;
    if (samples.departure && finished) {
      const tail = hangingPoints(nav, points.at(-1), samples.departure, surface, plantRandom(r.seed, `${id}:hang`), radius);
      for (const p of tail.slice(1)) { points.push(p); normals.push(samples.departure.toArray()); faces.push(-1); }
    }
    let arc = 0; for (let j = 1; j < points.length; j++) arc += points[j].distanceTo(points[j - 1]);
    if (arc < .035) continue;
    const arrays = points.map(p => p.toArray());
    branches.push({ id, parent: '', attach: 0, points: arrays, knots: arrays, length: arc, start_radius: radius, end_radius: Math.max(.00035, radius * .18), role: 'SURFACE_AREA', surfaceNormals: normals, surfaceFaces: faces });
  }
  return branches;
}
