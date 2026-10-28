import * as THREE from 'three';
import { sampleLine, lineTangent } from './tree-sculpt.js';
import { evaluateShapeOperation } from './shape-operation-geometry.js';
import { sectionAt } from './branch-shaping.js';

export function generationSlots(points, rule) {
  const distances = [0]; points.slice(1).forEach((point, i) => distances.push(distances.at(-1) + point.distanceTo(points[i])));
  const distanceAt = (t) => { const cursor = t * (points.length - 1), i = Math.min(points.length - 2, Math.floor(cursor)); return distances[i] + (distances[i + 1] - distances[i]) * (cursor - i); };
  const parameterAt = (d) => { let i = distances.findIndex((value) => value >= d); if (i <= 0) return i < 0 ? 1 : 0; return (i - 1 + (d - distances[i - 1]) / Math.max(1e-12, distances[i] - distances[i - 1])) / (points.length - 1); };
  const span = Math.max(0, rule.end - rule.start);
  if (!span || !rule.enabled) return [];
  if (rule.mode === 'BEND') {
    const slots = []; let previous = -Infinity;
    for (let i = 1; i < points.length - 1; i++) {
      const t = i / (points.length - 1);
      if (t < rule.start || t > rule.end || distances[i] - previous < rule.spacing) continue;
      const a = points[i].clone().sub(points[i - 1]); const b = points[i + 1].clone().sub(points[i]);
      if (a.lengthSq() < 1e-12 || b.lengthSq() < 1e-12) continue;
      if (THREE.MathUtils.radToDeg(a.angleTo(b)) < rule.threshold) continue;
      slots.push({ t, azimuth: slots.length * 2.399963 + THREE.MathUtils.degToRad(rule.rotation) }); previous = distances[i];
      if (slots.length >= 40) break;
    }
    return slots;
  }
  if (rule.mode === 'INTERVAL') {
    const start = distanceAt(rule.start), end = distanceAt(rule.end);
    return Array.from({ length: Math.min(80, Math.floor((end - start) / rule.spacing + 1e-9) + 1) }, (_, i) => ({ t: parameterAt(start + i * rule.spacing), azimuth: i * 2.399963 + THREE.MathUtils.degToRad(rule.rotation) }));
  }
  const count = rule.mode === 'WHORLED' ? Math.min(120, rule.layers * rule.per_layer)
    : rule.count;
  return Array.from({ length: count }, (_, index) => {
    const level = rule.mode === 'WHORLED' ? Math.floor(index / rule.per_layer) : index;
    const levels = rule.mode === 'WHORLED' ? rule.layers : count;
    return { t: rule.start + span * (levels === 1 ? 0.5 : level / (levels - 1)),
      azimuth: THREE.MathUtils.degToRad(rule.rotation) + (rule.mode === 'WHORLED' ? (index % rule.per_layer) / rule.per_layer * Math.PI * 2 + level * 0.5 : index * 2.399963) };
  });
}
const vectors = (values) => values.map((p) => new THREE.Vector3(...p));
export function applySculptLayers(branches, layers, overrides = {}) {
  for (const layer of layers) {
    if (!layer.enabled || !layer.strength) continue;
    if (layer.operation) {
      const updated = evaluateShapeOperation(branches, layer.operation, layer.strength, overrides);
      branches.forEach((b, i) => { b.points = updated[i].points; b.controlPoints = updated[i].controlPoints; b.sections = updated[i].sections; if (layer.operation.type === 'QUICK') b.length = updated[i].length; });
      branches.forEach((b,i) => { b.mountFrames = updated[i].mountFrames; b.radiusEdits = updated[i].radiusEdits; });
      if (['ROOT_SCALE','POINT_ROTATE','POINT_SCALE'].includes(layer.operation.type)) branches.forEach((b,i) => {
        b.length = updated[i].length; b.mountMatrix = updated[i].mountMatrix; b.surfaceNormals = updated[i].surfaceNormals;
      });
      if (layer.operation.type === 'MOUNT') branches.forEach((b,i) => {
        b.parentT = updated[i].parentT; b.mountMatrix = updated[i].mountMatrix; b.surfaceNormals = updated[i].surfaceNormals;
      });
      continue;
    }
    const before = new Map(branches.map((branch) => [branch.id, branch.points.map((p) => p.clone())]));
    const done = new Set(); const byId = new Map(branches.map((b) => [b.id, b]));
    function visit(branch) {
      if (done.has(branch.id)) return; done.add(branch.id);
      const parent = byId.get(branch.parentId); if (parent) visit(parent);
      const entry = layer.branches[branch.stableId];
      const valid = entry && entry.parent === (parent?.stableId || '');
      if (valid) {
        const delta = vectors(entry.deltas); const knots = vectors(entry.knot_deltas?.length >= 2 ? entry.knot_deltas : entry.deltas);
        const oldPoints = branch.points; const oldKnots = branch.controlPoints;
        branch.points = delta.map((_, i) => sampleLine(oldPoints, i / (delta.length - 1)));
        branch.controlPoints = knots.map((_, i) => sampleLine(oldKnots, i / (knots.length - 1)));
        branch.points.forEach((p, i) => p.addScaledVector(sampleLine(delta, i / (branch.points.length - 1)), layer.strength));
        branch.controlPoints.forEach((p, i) => p.addScaledVector(sampleLine(knots, i / (branch.controlPoints.length - 1)), layer.strength));
        branch.layerIds = [...(branch.layerIds || []), layer.id];
        if (entry.sections?.length) { const previous = branch.sections; branch.sections = entry.sections.map((s) => { const before = sectionAt(previous, s.t); return { t: s.t, ...Object.fromEntries(['radius', 'oval', 'roll'].map((key) => [key, THREE.MathUtils.lerp(before[key], s[key], layer.strength)])) }; }); }
      }
      if (!parent) return;
      if (!valid && parent.points.length === before.get(parent.id).length && parent.points.every((p, i) => p.equals(before.get(parent.id)[i]))) return;
      const oldParent = before.get(parent.id); const origin = before.get(branch.id)[0];
      const oldAttach = sampleLine(oldParent, branch.parentT); const newAttach = sampleLine(parent.points, branch.parentT);
      const rotation = new THREE.Quaternion().setFromUnitVectors(lineTangent(oldParent, branch.parentT), lineTangent(parent.points, branch.parentT));
      const offset = origin.clone().sub(oldAttach).applyQuaternion(rotation);
      const target = newAttach.add(offset);
      if (valid) {
        target.addScaledVector(new THREE.Vector3(...(entry.root_offset || [0, 0, 0])), layer.strength);
        const correction = target.sub(branch.points[0]);
        [...branch.points, ...branch.controlPoints].forEach((p) => p.add(correction));
      } else {
        [...branch.points, ...branch.controlPoints].forEach((p) => p.sub(origin).applyQuaternion(rotation).add(target));
      }
    }
    branches.forEach(visit);
  }
}

export function captureSculptLayer(layer, branches, overrides) {
  const byStable = new Map(branches.map((b) => [b.stableId, b]));
  const byId = new Map(branches.map((b) => [b.id, b]));
  const samplesFor = (override, branch) => {
    if (!override?.curve_knots?.length) return branch.points.map((p) => p.toArray());
    const knots = vectors(override.curve_knots);
    if (override.curve_samples && JSON.stringify(override.curve_reference_knots) === JSON.stringify(override.curve_knots)) return override.curve_samples;
    return knots.length >= 3 ? new THREE.CatmullRomCurve3(knots, false, 'centripetal', 0.5).getPoints(branch.points.length - 1).map((p) => p.toArray())
      : branch.points.map((_, i) => sampleLine(knots, i / (branch.points.length - 1)).toArray());
  };
  for (const [id, override] of Object.entries(overrides)) {
    const before = byStable.get(id);
    if (!before || !override.curve_knots || override.curve_knots.length < 2) continue;
    const samples = samplesFor(override, before);
    const changed = samples.some((p, i) => new THREE.Vector3(...p).distanceTo(sampleLine(before.points, i / (samples.length - 1))) > 1e-7);
    if (!changed) continue;
    const old = layer.branches[id];
    const delta = (target, source, previous) => target.map((p, i) => {
      const t = i / (target.length - 1);
      return new THREE.Vector3(...p).sub(sampleLine(source, t)).add(previous?.length >= 2 ? sampleLine(vectors(previous), t) : new THREE.Vector3()).toArray();
    });
    const parent = byId.get(before.parentId), rootOffset = new THREE.Vector3(...(old?.root_offset || [0, 0, 0]));
    if (parent) {
      const parentTarget = vectors(samplesFor(overrides[parent.stableId], parent));
      const rotation = new THREE.Quaternion().setFromUnitVectors(lineTangent(parent.points, before.parentT), lineTangent(parentTarget, before.parentT));
      const previousOffset = before.points[0].clone().sub(sampleLine(parent.points, before.parentT)).applyQuaternion(rotation);
      const nextOffset = new THREE.Vector3(...samples[0]).sub(sampleLine(parentTarget, before.parentT));
      rootOffset.applyQuaternion(rotation).add(nextOffset.sub(previousOffset));
    }
    layer.branches[id] = { parent: parent?.stableId || '', root_offset: rootOffset.toArray(),
      deltas: delta(samples, before.points, old?.deltas), knot_deltas: delta(override.curve_knots, before.controlPoints, old?.knot_deltas) };
  }
}
