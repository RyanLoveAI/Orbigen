import * as THREE from '/vendor/three/three.module.js';
import { plantRandom } from './flowering-data.js';
import { edgeDeparture, eaveRoute, hangingPoints } from './surface-growth-eaves.js';
import { createRulerGrowth } from './surface-growth-ruler.js';
import { zoneGrowth } from './surface-zone-growth.js';
import { trimSurfaceSamples, surfaceBlocked } from './surface-paint.js';
import { createRegionGrowth } from './surface-growth-region.js';

const cache = new WeakMap(), recentMeshes = new Map(), V = a => new THREE.Vector3(...a);
export function surfaceNavigation(mesh) {
  const same=(a,b)=>a===b||a.length===b.length&&a.every((v,i)=>v===b[i]);
  const cached=cache.get(mesh.position);if(cached&&same(cached.index,mesh.index))return cached.nav;
  const previous=recentMeshes.get(mesh.id);if(previous&&same(previous.position,mesh.position)&&same(previous.index,mesh.index)){cache.set(mesh.position,{index:mesh.index,nav:previous.nav});return previous.nav;}
  const vertices = [], weld = new Map(), remap = [];
  for (let i = 0; i < mesh.position.length; i += 3) {
    const p = V(mesh.position.slice(i, i + 3)), key = p.toArray().map(v => Math.round(v * 1e6)).join(',');
    if (!weld.has(key)) { weld.set(key, vertices.length); vertices.push(p); } remap.push(weld.get(key));
  }
  const faces = [], edges = new Map();
  for (let f = 0; f < mesh.index.length / 3; f++) {
    const ids = mesh.index.slice(f * 3, f * 3 + 3).map(i => remap[i]);
    const triangle = new THREE.Triangle(...ids.map(i => vertices[i]));
    faces.push({ triangle, ids, normal: triangle.getNormal(new THREE.Vector3()), center: triangle.getMidpoint(new THREE.Vector3()), neighbors: [-1, -1, -1] });
    for (let e = 0; e < 3; e++) { const a = ids[e], b = ids[(e + 1) % 3], k = a < b ? `${a}:${b}` : `${b}:${a}`; if (!edges.has(k)) edges.set(k, []); edges.get(k).push([f, e]); }
  }
  for (const pairs of edges.values()) if (pairs.length === 2) { const [[a, x], [b, y]] = pairs; faces[a].neighbors[x] = b; faces[b].neighbors[y] = a; }
  const nav = { faces, vertices };
  cache.set(mesh.position, {index:mesh.index,nav});
  recentMeshes.set(mesh.id,{position:mesh.position,index:mesh.index,nav});if(recentMeshes.size>4)recentMeshes.delete(recentMeshes.keys().next().value); return nav;
}
const project = (nav, a) => ({ face: a.face, point: nav.faces[a.face].triangle.closestPointToPoint(V(a.point), new THREE.Vector3()).toArray() });
class Heap {
  data = [];
  push(item) { let i = this.data.length; this.data.push(item); while (i > 0) { const p = (i - 1) >> 1; if (this.data[p].score <= item.score) break; this.data[i] = this.data[p]; i = p; } this.data[i] = item; }
  pop() { const top = this.data[0], end = this.data.pop(); if (this.data.length) { let i = 0; while (i * 2 + 1 < this.data.length) { let c = i * 2 + 1; if (c + 1 < this.data.length && this.data[c + 1].score < this.data[c].score) c++; if (this.data[c].score >= end.score) break; this.data[i] = this.data[c]; i = c; } this.data[i] = end; } return top; }
}

// Connected-face A*: never use a nearest-surface projection across a wall or gap.
export function surfaceRoute(nav, first, last, blocked = new Set()) {
  const start = project(nav, first), end = project(nav, last);
  if (blocked.has(start.face) || blocked.has(end.face)) return [];
  if (start.face === end.face) return [start, end];
  const heap = new Heap(), cost = new Map([[start.face, 0]]), parent = new Map();
  heap.push({ face: start.face, score: 0, cost: 0 }); let visits = 0, found = false;
  while (heap.data.length && visits++ < 100000) {
    const current = heap.pop(); if (current.cost !== cost.get(current.face)) continue;
    if (current.face === end.face) { found = true; break; }
    const f = nav.faces[current.face];
    for (const neighbor of f.neighbors) {
      if (neighbor < 0 || blocked.has(neighbor) || nav.faces[neighbor].normal.lengthSq() < .5) continue;
      const g = current.cost + f.center.distanceTo(nav.faces[neighbor].center);
      if (g >= (cost.get(neighbor) ?? Infinity)) continue;
      cost.set(neighbor, g); parent.set(neighbor, current.face);
      heap.push({ face: neighbor, cost: g, score: g + nav.faces[neighbor].center.distanceTo(nav.faces[end.face].center) });
    }
  }
  if (!found) return [];
  const path = [end.face]; while (path[0] !== start.face) path.unshift(parent.get(path[0]));
  const result = [start];
  for (let i = 1; i < path.length; i++) {
    const face = nav.faces[path[i - 1]], edge = face.neighbors.indexOf(path[i]);
    const point = nav.vertices[face.ids[edge]].clone().lerp(nav.vertices[face.ids[(edge + 1) % 3]], .5).toArray();
    result.push({ face: path[i - 1], point, nextFace: path[i] });
  }
  result.push(end); return result;
}

// Walk in the triangle tangent plane and unfold across its shared edge.
export function walkSurface(nav, anchor, initialDirection, length, blocked = new Set(), hanging = null) {
  let a = project(nav, anchor), direction = initialDirection.clone(), remaining = length;
  const samples = [a]; if (blocked.has(a.face) || blocked.atPoint?.(a.face,V(a.point))) return [];
  for (let step = 0; step < 2048 && remaining > .0001; step++) {
    const face = nav.faces[a.face], normal = face.normal, from = V(a.point);
    direction.addScaledVector(normal, -direction.dot(normal));
    if (direction.lengthSq() < 1e-10) break; direction.normalize();
    const distance = Math.min(.04, remaining), to = from.clone().addScaledVector(direction, distance);
    if(blocked.atPoint?.(a.face,to))break;
    const b0 = face.triangle.getBarycoord(from, new THREE.Vector3()), b1 = face.triangle.getBarycoord(to, new THREE.Vector3());
    if (!b0 || !b1) break;
    if (Math.min(b1.x, b1.y, b1.z) >= -1e-8) { a = { face: a.face, point: to.toArray() }; samples.push(a); remaining -= distance; continue; }
    const old = b0.toArray(), next = b1.toArray(); let ratio = 1, component = -1;
    for (let j = 0; j < 3; j++) if (next[j] < -1e-8) { const t = Math.max(0, old[j]) / Math.max(1e-12, old[j] - next[j]); if (t <= ratio) { ratio = t; component = j; } }
    if (component < 0) break;
    const edge = (component + 1) % 3, neighbor = face.neighbors[edge], at = from.clone().lerp(to, ratio);
    const exit = hanging && !(hanging.exitBlocked || blocked).has(neighbor) && edgeDeparture(nav, a.face, edge, hanging.flip);
    if (exit) {
      samples.push({ face: a.face, point: at.toArray(), outward: exit.outward.toArray() });
      samples.departure = exit.outward; break;
    }
    if (neighbor < 0 || blocked.has(neighbor)) { if (from.distanceTo(at) > .0001) samples.push({ face: a.face, point: at.toArray() }); break; }
    samples.push({ face: a.face, point: at.toArray(), nextFace: neighbor }); remaining -= distance * ratio;
    direction.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(normal, nav.faces[neighbor].normal));
    // Move infinitesimally into the next triangle to avoid crossing the same edge twice.
    const inside = at.clone().lerp(nav.faces[neighbor].center, 1e-6);
    a = { face: neighbor, point: inside.toArray() };
  }
  return samples;
}

export function createSurfaceGrowth(surface, vine, seed) {
  const nav = surfaceNavigation(surface.mesh), blocked = surfaceBlocked(surface), branches = [];

  function add(id, parent, attach, samples, radius, settings = surface, stem = vine.stem) {
    const offset = Math.max(settings.offset, stem * 2.5), sign = settings.flip ? -1 : 1;
    const points = [], normals = [];
    for (const sample of samples) {
      if(blocked.atPoint?.(sample.face,V(sample.point)))break;
      const faceNormal = nav.faces[sample.face].normal.clone().multiplyScalar(sign), normal = faceNormal.clone();
      if (sample.nextFace !== undefined) normal.addScaledVector(nav.faces[sample.nextFace].normal, sign).normalize();
      if (sample.outward) normal.add(V(sample.outward)).normalize();
      const clearance = offset / Math.max(.25, normal.dot(faceNormal));
      const p = V(sample.point).addScaledVector(normal, clearance);
      if (points.length && p.distanceTo(V(points.at(-1))) < .00001) continue;
      points.push(p.toArray()); normals.push(normal.toArray());
    }
    if (points.length < 2) return null;
    let length = 0; for (let i = 1; i < points.length; i++) length += V(points[i]).distanceTo(V(points[i - 1]));
    if (length < .02) return null;
    const b = { id, parent, attach, points, knots: points, length, start_radius: radius, end_radius: Math.max(.00035, radius * .18), role: 'SURFACE', surfaceNormals: normals };
    branches.push(b); return b;
  }
  function hang(branch, outward, rng, settings = surface) {
    const points = hangingPoints(nav, V(branch.points.at(-1)), outward, settings, rng, branch.start_radius);
    for (const p of points.slice(1)) {
      branch.length += p.distanceTo(V(branch.points.at(-1)));
      branch.points.push(p.toArray()); branch.surfaceNormals.push(outward.toArray());
    }
    return points.length > 1;
  }
  function edgeCurtain(guide, settings = surface, radius = vine.stem) {
    const samples = [];
    for (let i = 1; i < guide.anchors.length; i++) {
      const part = eaveRoute(nav, guide.anchors[i - 1], guide.anchors[i], blocked, settings.flip);
      if (!part.length) break;
      samples.push(...part);
    }
    const main = add(`S_${guide.id}`, '', 0, trimSurfaceSamples(samples,guide.trim??1), radius, settings, radius); if (!main) return;
    // Interpolate along the actual offset runner, ensuring every hanging stem is connected.
    const spacing = 1 / settings.hang_density; let distance = 0, next = Math.min(spacing * .25, main.length * .5), number = 0;
    for (let i = 1; i < main.points.length && branches.length < 480; i++) {
      const a = V(main.points[i - 1]), b = V(main.points[i]), length = a.distanceTo(b);
      while (next <= distance + length + 1e-8 && branches.length < 480) {
        const t = Math.max(0, Math.min(1, (next - distance) / Math.max(1e-10, length))), origin = a.clone().lerp(b, t);
        const outward = V(main.surfaceNormals[i - 1]).lerp(V(main.surfaceNormals[i]), t).setZ(0).normalize();
        const id = `${main.id}.H${++number}`, rng = plantRandom(settings.seed??seed, id);
        const points = hangingPoints(nav, origin, outward, settings, rng, radius * .58);
        if (points.length > 2) {
          const arrays = points.map(p => p.toArray()); let arc = 0; for (let k = 1; k < points.length; k++) arc += points[k].distanceTo(points[k - 1]);
          if (arc > .035) branches.push({ id, parent: main.id, attach: next / main.length, points: arrays, knots: arrays, length: arc, start_radius: radius * .58, end_radius: Math.max(.00035, radius * .12), role: 'SURFACE_HANG', surfaceNormals: arrays.map(() => outward.toArray()) });
        }
        next += spacing * (1 + (plantRandom(settings.seed??seed, `${id}:spacing`)() - .5) * settings.hang_variation * .8);
      }
      distance += length;
    }
  }
  for (const guide of surface.guides) {
    const config={...surface,...guide.config}, stem=guide.config?.radius||vine.stem, guideSeed=config.seed??seed;
    if (branches.length >= 400) break;
    if (guide.type === 'EAVE') { edgeCurtain(guide,config,stem); continue; }
    let samples = [];
    if (guide.anchors.length === 1) {
      const normal = nav.faces[guide.anchors[0].face].normal;
      const up = new THREE.Vector3(0, 0, 1).addScaledVector(normal, -normal.z);
      if (up.lengthSq() < 1e-8) up.set(1, 0, 0);
      samples = walkSurface(nav, guide.anchors[0], up, config.length, blocked, config.auto_hang ? config : null);
    } else {
      for (let i = 1; i < guide.anchors.length; i++) {
        const part = surfaceRoute(nav, guide.anchors[i - 1], guide.anchors[i], blocked);
        if (!part.length) break;
        samples.push(...(samples.length ? part.slice(1) : part));
      }
    }
    // For a hand-drawn path, only a final point actually on a rim may detach.
    let departure = samples.departure;
    if (!departure && config.auto_hang && guide.anchors.length > 1 && samples.length > 1) {
      const last = samples.at(-1), face = nav.faces[last.face], toward = V(last.point).sub(V(samples.at(-2).point));
      for (let e = 0; e < 3; e++) {
        const candidate = edgeDeparture(nav, last.face, e, config.flip); if (!candidate || blocked.has(candidate.neighbor)) continue;
        const line = new THREE.Line3(nav.vertices[candidate.a], nav.vertices[candidate.b]);
        if (line.closestPointToPoint(V(last.point), true, new THREE.Vector3()).distanceTo(V(last.point)) < .015 && (face.normal.z < .35 || toward.dot(candidate.outward) > 0)) {
          departure = candidate.outward; last.outward = departure.toArray(); break;
        }
      }
    }
    const dense = [];
    for (let i = 0; i < samples.length; i++) {
      if (i) { const a = samples[i - 1], b = samples[i], start = V(a.point), end = V(b.point), steps = Math.ceil(start.distanceTo(end) / .04); for (let j = 1; j < steps; j++) dense.push({ face: a.nextFace ?? a.face, point: start.clone().lerp(end, j / steps).toArray() }); }
      dense.push(samples[i]);
    }
    samples = dense;
    samples = trimSurfaceSamples(samples,guide.trim??1);
    if ((guide.trim??1)<1) departure=null;
    const main = add(`S_${guide.id}`, '', 0, samples, stem, config, stem); if (!main) continue;
    if (departure) hang(main, departure, plantRandom(guideSeed, `${guide.id}:hang`),config);
    // Fork only from sampled points, so lateral roots meet the main vine exactly.
    let walked = 0, lastFork = 0, number = 0;
    for (let i = 1; i < samples.length - 1 && branches.length < 480; i++) {
      walked += V(samples[i].point).distanceTo(V(samples[i - 1].point));
      if (samples[i].nextFace !== undefined) continue;
      if (config.density <= 0 || config.spread <= 0 || walked - lastFork < 1 / config.density) continue;
      lastFork = walked; number++;
      const rng = plantRandom(guideSeed, `${guide.id}:side:${number}`), normal = nav.faces[samples[i].face].normal;
      const tangent = V(samples[i + 1].point).sub(V(samples[i - 1].point)).normalize();
      const side = new THREE.Vector3().crossVectors(normal, tangent).normalize().multiplyScalar(number % 2 ? 1 : -1);
      side.addScaledVector(tangent, .35 + rng() * .4).normalize();
      const anchor = { ...samples[i], face: samples[i].nextFace ?? samples[i].face };
      const lateral = walkSurface(nav, anchor, side, config.spread * (.6 + rng() * .4), blocked, config.auto_hang ? config : null);
      const child = add(`${main.id}.B${number}`, main.id, 0, lateral, stem * .58, config, stem);
      if (!child) continue;
      if (lateral.departure) hang(child, lateral.departure, plantRandom(guideSeed, `${child.id}:hang`),config);
      // Match the existing core's normalized arc-length attachment convention.
      let best = Infinity, distance = 0, attach = 0;
      const p = V(child.points[0]);
      for (let k = 1; k < main.points.length; k++) {
        const a = V(main.points[k - 1]), b = V(main.points[k]), line = new THREE.Line3(a, b), t = line.closestPointToPointParameter(p, true), q = line.at(t, new THREE.Vector3());
        if (q.distanceToSquared(p) < best) { best = q.distanceToSquared(p); attach = (distance + a.distanceTo(b) * t) / main.length; }
        distance += a.distanceTo(b);
      }
      child.attach = attach;
    }
  }
  if (surface.region?.enabled) {
    if(surface.region.faces.length){
      branches.push(...createRegionGrowth(nav,surface,vine,walkSurface,Math.max(0,480-branches.length)));
      const oldFaces=new Set(surface.region.faces),strokes=(surface.region.strokes||[]).map(s=>({...s,samples:s.samples.map(p=>({...p,faces:p.faces.filter(f=>!oldFaces.has(f))})).filter(p=>p.faces.length)}));
      if(strokes.some(s=>s.samples.length))branches.push(...zoneGrowth(nav,surface,{...surface.region,id:'legacy_extra',faces:[],strokes},vine,walkSurface).branches);
    }else if(surface.region.strokes?.length)branches.push(...zoneGrowth(nav,surface,surface.region,vine,walkSurface).branches);
  }
  for(const zone of surface.regions||[]) if(zone.enabled) branches.push(...zoneGrowth(nav,surface,zone,vine,walkSurface).branches);
  if(surface.growth_ruler?.enabled)branches.push(...createRulerGrowth(nav,surface,vine,walkSurface).branches);
  return { branches };
}

export function surfaceNormalAt(branch, t) {
  if (!branch.surfaceNormals?.length) return null;
  const points = branch.points, lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths.at(-1) + points[i].distanceTo(points[i - 1]));
  const target = lengths.at(-1) * t; let i = 1; while (i < lengths.length - 1 && lengths[i] < target) i++;
  return V(branch.surfaceNormals[i - 1]).lerp(V(branch.surfaceNormals[i]), (target - lengths[i - 1]) / Math.max(1e-10, lengths[i] - lengths[i - 1])).normalize();
}
