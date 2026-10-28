import * as THREE from 'three';

const V = p => new THREE.Vector3(...p), UP = new THREE.Vector3(0, 0, 1);
const edgeCaches = new WeakMap(), collisionCaches = new WeakMap();

// A roof rim is an open edge or a convex transition from an upward face to a steeper one.
// Coplanar triangulation diagonals and concave wall/roof junctions are not rims.
export function edgeDeparture(nav, faceId, edge, flip = false) {
  const face = nav.faces[faceId], normal = face.normal.clone().multiplyScalar(flip ? -1 : 1);
  const neighbor = face.neighbors[edge], a = nav.vertices[face.ids[edge]], b = nav.vertices[face.ids[(edge + 1) % 3]];
  if (a.distanceToSquared(b) < 1e-14) return null;
  const mid = a.clone().lerp(b, .5);
  if (neighbor >= 0) {
    const other = nav.faces[neighbor], n = other.normal.clone().multiplyScalar(flip ? -1 : 1);
    if (normal.z < .35 || n.z >= normal.z - .35 || normal.dot(n) > .8 || other.center.clone().sub(mid).dot(normal) >= -1e-7) return null;
  }
  const tangent = b.clone().sub(a).normalize();
  const outward = mid.clone().sub(face.center).addScaledVector(tangent, -mid.clone().sub(face.center).dot(tangent));
  // At a vertical open wall edge, depart into the visible side of the wall.
  outward.z = 0;
  if (normal.z < .35 || outward.lengthSq() < 1e-10) outward.copy(normal).setZ(0);
  if (outward.lengthSq() < 1e-10) return null;
  return { face: faceId, edge, a: face.ids[edge], b: face.ids[(edge + 1) % 3], outward: outward.normalize(), normal, neighbor };
}

function rimGraph(nav, flip) {
  let pair = edgeCaches.get(nav); if (!pair) { pair = new Map(); edgeCaches.set(nav, pair); }
  if (pair.has(flip)) return pair.get(flip);
  const edges = [], vertices = new Map();
  nav.faces.forEach((face, f) => face.neighbors.forEach((_, i) => {
    const e = edgeDeparture(nav, f, i, flip); if (!e) return;
    e.id = edges.length; edges.push(e);
    for (const id of [e.a, e.b]) { if (!vertices.has(id)) vertices.set(id, []); vertices.get(id).push(e); }
  }));
  const graph = { edges, vertices }; pair.set(flip, graph); return graph;
}
const allowed = (edge, blocked) => !blocked.has(edge.face) && !blocked.has(edge.neighbor);
const sample = (edge, point) => ({ face: edge.face, point: point.toArray(), outward: edge.outward.toArray() });

export function snapEave(nav, anchor, blocked = new Set(), flip = false, radius = .25) {
  const point = V(anchor.point), graph = rimGraph(nav, flip); let best = radius * radius, result = null;
  const local = new Set(), seen = new Set(), pending = [anchor.face];
  while (pending.length && seen.size < 5000) {
    const id = pending.pop(); if (id < 0 || seen.has(id) || blocked.has(id)) continue; seen.add(id);
    const f = nav.faces[id]; if (f.triangle.closestPointToPoint(point, new THREE.Vector3()).distanceToSquared(point) > radius * radius) continue;
    local.add(id); for (const next of f.neighbors) if (next >= 0 && !seen.has(next)) pending.push(next);
  }
  for (const edge of graph.edges) {
    // Traverse connected faces inside the brush radius; separate geometry cannot steal a stroke.
    if ((!local.has(edge.face) && !local.has(edge.neighbor)) || !allowed(edge, blocked)) continue;
    const p = new THREE.Line3(nav.vertices[edge.a], nav.vertices[edge.b]).closestPointToPoint(point, true, new THREE.Vector3()), d = p.distanceToSquared(point);
    if (d <= best) { best = d; result = { ...sample(edge, p), edge }; }
  }
  return result;
}

class Queue {
  items = [];
  push(item) { let i = this.items.length; this.items.push(item); while (i) { const p = (i - 1) >> 1; if (this.items[p].cost <= item.cost) break; this.items[i] = this.items[p]; i = p; } this.items[i] = item; }
  pop() { const first = this.items[0], last = this.items.pop(); if (this.items.length) { let i = 0; while (i * 2 + 1 < this.items.length) { let c = i * 2 + 1; if (c + 1 < this.items.length && this.items[c + 1].cost < this.items[c].cost) c++; if (this.items[c].cost >= last.cost) break; this.items[i] = this.items[c]; i = c; } this.items[i] = last; } return first; }
}

export function eaveRoute(nav, first, last, blocked = new Set(), flip = false) {
  const a = snapEave(nav, first, blocked, flip), b = snapEave(nav, last, blocked, flip);
  if (!a || !b) return [];
  if (a.edge.id === b.edge.id) return [sample(a.edge, V(a.point)), sample(b.edge, V(b.point))];
  const graph = rimGraph(nav, flip), queue = new Queue(), costs = new Map(), parents = new Map();
  for (const id of [a.edge.a, a.edge.b]) { const cost = nav.vertices[id].distanceTo(V(a.point)); costs.set(id, cost); queue.push({ id, cost }); }
  let finish = null, best = Infinity;
  while (queue.items.length) {
    const current = queue.pop(); if (current.cost !== costs.get(current.id)) continue;
    if (current.cost >= best) break;
    if (current.id === b.edge.a || current.id === b.edge.b) { const cost = current.cost + nav.vertices[current.id].distanceTo(V(b.point)); if (cost < best) { best = cost; finish = current.id; } }
    for (const edge of graph.vertices.get(current.id) || []) {
      if (!allowed(edge, blocked)) continue;
      const id = edge.a === current.id ? edge.b : edge.a, cost = current.cost + nav.vertices[id].distanceTo(nav.vertices[current.id]);
      if (cost >= (costs.get(id) ?? Infinity)) continue;
      costs.set(id, cost); parents.set(id, { id: current.id, edge }); queue.push({ id, cost });
    }
  }
  if (finish === null) return [];
  const chain = []; let id = finish;
  while (parents.has(id)) { const p = parents.get(id); chain.unshift({ from: p.id, to: id, edge: p.edge }); id = p.id; }
  const result = [sample(a.edge, V(a.point)), sample(a.edge, nav.vertices[id])];
  for (const step of chain) { result.push(sample(step.edge, nav.vertices[step.from]), sample(step.edge, nav.vertices[step.to])); }
  result.push(sample(b.edge, nav.vertices[finish]), sample(b.edge, V(b.point)));
  return result;
}

// A cached triangle BVH keeps collision checks bounded for large reference meshes.
function collisionTree(nav) {
  if (collisionCaches.has(nav)) return collisionCaches.get(nav);
  const items = nav.faces.filter(f => f.normal.lengthSq() > .5).map(f => ({ triangle: f.triangle, box: new THREE.Box3().setFromPoints([f.triangle.a, f.triangle.b, f.triangle.c]), center: f.center }));
  function build(list) {
    const box = new THREE.Box3(); for (const i of list) box.union(i.box);
    if (list.length <= 12) return { box, items: list };
    const size = box.getSize(new THREE.Vector3()), axis = size.x > size.y ? (size.x > size.z ? 'x' : 'z') : (size.y > size.z ? 'y' : 'z');
    list.sort((a, b) => a.center[axis] - b.center[axis]); const half = list.length >> 1;
    return { box, left: build(list.slice(0, half)), right: build(list.slice(half)) };
  }
  const tree = build(items); collisionCaches.set(nav, tree); return tree;
}
function blockedSegment(tree, from, to, radius) {
  const direction = to.clone().sub(from), length = direction.length(); if (length < 1e-8) return false; direction.normalize();
  const side = new THREE.Vector3().crossVectors(direction, UP); if (side.lengthSq() < 1e-8) side.set(1, 0, 0); side.normalize();
  const other = new THREE.Vector3().crossVectors(direction, side).normalize();
  const ray = new THREE.Ray(), hit = new THREE.Vector3();
  function intersects(node) {
    if (!ray.intersectBox(node.box, hit) || hit.distanceTo(ray.origin) > length + radius && !node.box.containsPoint(ray.origin)) return false;
    if (!node.items) return intersects(node.left) || intersects(node.right);
    return node.items.some(({ triangle: t }) => ray.intersectTriangle(t.a, t.b, t.c, false, hit) && hit.distanceTo(ray.origin) <= length + radius);
  }
  // A zero-radius connector needs one ray, not five identical rays.
  const shifts=radius>0 ? [new THREE.Vector3(), side.clone().multiplyScalar(radius), side.clone().multiplyScalar(-radius), other.clone().multiplyScalar(radius), other.clone().multiplyScalar(-radius)] : [new THREE.Vector3()];
  for (const shift of shifts) {
    ray.set(from.clone().add(shift), direction); if (intersects(tree)) return true;
  }
  return false;
}
export const surfaceSegmentBlocked = (nav, from, to, radius) => blockedSegment(collisionTree(nav), from, to, radius);

export function hangingPoints(nav, origin, outward, options, rng, radius) {
  const direction = outward.clone().setZ(0).normalize(); if (direction.lengthSq() < .5) return [];
  const length = options.hang_length * (1 - options.hang_variation * rng()), reach = Math.max(radius * 4, options.hang_reach * (.85 + .3 * rng()));
  const side = new THREE.Vector3().crossVectors(UP, direction), sway = (rng() - .5) * Math.min(.15, length * .12) * options.hang_variation;
  const curve = new THREE.CubicBezierCurve3(origin, origin.clone().addScaledVector(direction, reach * .8), origin.clone().addScaledVector(direction, reach).addScaledVector(UP, -length * .35), origin.clone().addScaledVector(direction, reach * 1.1).addScaledVector(UP, -length));
  const points = [origin.clone()], tree = collisionTree(nav), count = Math.max(20, Math.ceil((length + reach) / .025));
  for (let i = 1; i <= count; i++) {
    const t = i / count, p = curve.getPoint(t).addScaledVector(side, sway * Math.sin(t * Math.PI) * t);
    if (blockedSegment(tree, points.at(-1), p, radius * 1.25)) break;
    points.push(p);
  }
  return points;
}
