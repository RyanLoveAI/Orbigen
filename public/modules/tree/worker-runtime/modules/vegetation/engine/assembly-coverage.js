import { skeletonBranches } from './skeleton-thickness.js';

const xyz = p => Array.isArray(p) ? p : [p.x, p.y, p.z];
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const at = (branch, t) => {
  const points = branch.points, f = Math.max(0, Math.min(1, t ?? .5)) * (points.length - 1), i = Math.min(points.length - 2, Math.floor(f));
  const a = xyz(points[i]), b = xyz(points[i + 1]); return a.map((v, k) => v + (b[k] - v) * (f - i));
};

// Empty terminal carriers, ordered from the top down. Existing attachments are
// obstacles, including user-owned and detached units; unit internals are excluded.
export function findAssemblyGaps(branches, instances, { minLength = .2, spacing = .2 } = {}) {
  const bones = skeletonBranches(branches), parentIds = new Set(bones.map(b => b.parentId));
  const byId = new Map(bones.map(b => [b.stableId, b])), occupiedHosts = new Set(instances.map(i => i.parent));
  const occupied = instances.filter(i => byId.has(i.parent)).map(i => at(byId.get(i.parent), i.attach));
  const candidates = bones.filter(b => b.order > 0 && !parentIds.has(b.id) && b.length >= minLength && !occupiedHosts.has(b.stableId))
    .map(branch => ({ branch, point: at(branch, .82) }))
    .sort((a, b) => b.point[2] - a.point[2] || a.branch.stableId.localeCompare(b.branch.stableId));
  const result = [];
  for (const gap of candidates) if (occupied.every(p => distance(p, gap.point) >= spacing)) {
    result.push(gap); occupied.push(gap.point);
  }
  return result;
}
