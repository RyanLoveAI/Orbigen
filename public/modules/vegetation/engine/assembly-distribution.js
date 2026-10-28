import { findAssemblyGaps } from './assembly-coverage.js';
import { placementSignature } from './assembly-placement-signature.js';
import { AUTOMATIC_PLACEMENTS } from './assembly-placement-baselines.js';

export function isAutomaticPlacement(authoring, instance) {
  const expected = authoring.workbench?.assembly_distribution?.placements?.[instance.id]
    || AUTOMATIC_PLACEMENTS[instance.asset_id + '/' + instance.id];
  return Boolean(expected && placementSignature(instance) === expected);
}

// Keep provenance only for placements actually made by the generator. Unknown
// old placements are protected, never guessed from an ID prefix or linked flag.
export function recordGeneratedPlacements(authoring, ids) {
  const previous = authoring.workbench?.assembly_distribution?.placements || {};
  const live = new Set(authoring.branch_instances.map(i => i.id)), selected = new Set(ids);
  const placements = Object.fromEntries(Object.entries(previous).filter(([id]) => live.has(id)));
  for (const i of authoring.branch_instances) if (selected.has(i.id)) placements[i.id] = placementSignature(i);
  authoring.workbench = { ...authoring.workbench, assembly_distribution: { version: 1, placements } };
}

export function protectedAssemblyInstances(authoring) {
  const instances = authoring.branch_instances;
  const protectedIds = new Set();
  for (const i of instances) if (i.assembly_locked || i.assembly_refined
    || authoring.workbench?.assembly_scale?.records?.[i.id] && Math.abs(i.scale-authoring.workbench.assembly_scale.records[i.id].scale)>1e-8) protectedIds.add(i.id);
  const instanceIds = new Set(instances.map(i => i.id));
  const reference = id => {
    if (typeof id !== 'string') return;
    // Stable child IDs use dot boundaries. Resolve all matching owners directly
    // instead of scanning every installed unit for every attachment/edit.
    for (let end = id.length; end >= 0; end = id.lastIndexOf('.', end - 1)) {
      const owner = id.slice(0, end);
      if (instanceIds.has(owner)) protectedIds.add(owner);
      if (end === 0) break;
    }
  };
  Object.keys(authoring.overrides || {}).forEach(reference);
  for (const layer of authoring.sculpt_layers || []) {
    Object.keys(layer.branches || {}).forEach(reference); (layer.operation?.targets || []).forEach(reference);
  }
  for (const i of instances) reference(i.parent);
  for (const b of authoring.manual_branches || []) reference(b.parent);
  for (const [child, parent] of Object.entries(authoring.topology?.reparent || {})) { reference(child); reference(parent); }
  (authoring.topology?.suppressed || []).forEach(reference);
  (authoring.leaf_edits?.added || []).forEach(l => reference(l.parent));
  (authoring.leaf_edits?.removed || []).forEach(reference);
  const units = authoring.unit_editing || {};
  Object.keys(units.overrides || {}).forEach(reference);
  (units.removed || []).forEach(reference);
  (units.added || []).forEach(unit => reference(unit.parent));
  (units.items || []).forEach(unit => {reference(unit.id);reference(unit.parent);});
  return protectedIds;
}

export function isPreservedAssemblyGap(authoring, parent, attach, role) {
  return (authoring?.workbench?.assembly_voids || []).some(r => r.parents?.includes(parent)
    && attach >= r.start && attach <= r.end && (r.role === 'ANY' || r.role === role));
}

export function redistributeAssembly(authoring, branches, slots) {
  const instances = authoring.branch_instances;
  const library = new Map(authoring.branch_library.map(a => [a.id, a]));
  const allowed = new Set(Object.values(slots).flat()), protectedIds = protectedAssemblyInstances(authoring);
  const symmetry = authoring.symmetry_groups?.some(g => g.enabled);
  const eligible = instances.filter(i => i.linked && !i.array_id && allowed.has(i.asset_id) && library.get(i.asset_id)?.sample
    && !protectedIds.has(i.id) && !symmetry
    && !authoring.workbench?.assembly_growth?.regions?.[i.parent]
    && isAutomaticPlacement(authoring, i));
  const counts = new Map(); for (const i of instances) counts.set(i.parent, (counts.get(i.parent) || 0) + 1);
  const gaps = findAssemblyGaps(branches, instances), moved = [], used = new Set();
  // Preserve exact class totals and 4:5:1 composition. Only move a surplus unit;
  // never empty another carrier or change scale, sample geometry, ID or count.
  const origin = branches[0]?.points[0] || { x: 0, y: 0, z: 0 };
  const exposed = gaps.slice().sort((a, b) => (Math.hypot(a.point[0] - (origin.x || 0), a.point[1] - (origin.y || 0)) + a.point[2] * .25)
    - (Math.hypot(b.point[0] - (origin.x || 0), b.point[1] - (origin.y || 0)) + b.point[2] * .25));
  const ranks = new Map(exposed.map((g, n) => [g.branch.stableId, (n + .5) / exposed.length]));
  for (const gap of gaps) {
    const rank = ranks.get(gap.branch.stableId), desired = rank < .4 ? 'MATURE' : rank < .9 ? 'MIXED' : 'YOUNG';
    const donors = eligible.filter(i => !used.has(i.id) && counts.get(i.parent) > 1);
    donors.sort((a, b) => Number(b.shootRole === desired) - Number(a.shootRole === desired)
      || counts.get(b.parent) - counts.get(a.parent) || a.id.localeCompare(b.id));
    const donor = donors.find(i => !isPreservedAssemblyGap(authoring, gap.branch.stableId, .82, i.shootRole)); if (!donor) continue;
    const index = instances.findIndex(i => i.id === donor.id);
    instances[index] = { ...donor, parent: gap.branch.stableId, attach: .82, frame: null };
    counts.set(donor.parent, counts.get(donor.parent) - 1); counts.set(gap.branch.stableId, 1); used.add(donor.id);
    moved.push({ id: donor.id, from: donor.parent, to: gap.branch.stableId });
  }
  if (moved.length) recordGeneratedPlacements(authoring, moved.map(i => i.id));
  return { moved, unfilled: gaps.length - moved.length, eligible: eligible.length };
}
