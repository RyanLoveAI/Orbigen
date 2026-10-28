const bounded = (v, min, max, fallback) => Math.max(min, Math.min(max, Number.isFinite(+v) ? +v : fallback));
export function normalizeInfluenceRegions(raw) {
  const seen = new Set();
  return (Array.isArray(raw) ? raw : []).slice(0, 24).filter((r) => r && typeof r.id === 'string').map((r) => ({
    id: r.id.slice(0, 64), name: String(r.name || '影响区域').slice(0, 64), targets: [...new Set((Array.isArray(r.targets) ? r.targets : []).filter((id) => typeof id === 'string'))].slice(0, 2200),
    start: bounded(r.start, 0, 0.99, 0.2), end: bounded(r.end, 0.01, 1, 0.85), feather: bounded(r.feather, 0, 0.5, 0.12), root: bounded(r.root, 0, 0.5, 0.1), invert: r.invert === true, children: r.children === true,
  })).filter((r) => { if (seen.has(r.id)) return false; seen.add(r.id); r.end = Math.max(r.start + 0.01, r.end); return true; });
}
export function influenceAt(region, t) {
  const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  let value = t < region.start || t > region.end ? 0 : region.feather ? Math.min(smooth((t - region.start) / region.feather), smooth((region.end - t) / region.feather)) : 1;
  if (region.invert) value = 1 - value;
  if (region.root > 0) value *= smooth(t / region.root);
  return value;
}
export function influenceTargets(branches, region) {
  const ids = new Set(region.targets);
  if (region.children) { let changed = true; while (changed) { changed = false; for (const b of branches) if (!b.symmetryGroup && !ids.has(b.stableId) && ids.has(branches.find((p) => p.id === b.parentId)?.stableId)) { ids.add(b.stableId); changed = true; } } }
  return branches.filter((b) => ids.has(b.stableId) && !b.symmetryGroup);
}
export function writeInfluence(authoring, branches, region, clear = false) {
  for (const b of influenceTargets(branches, region)) {
    authoring.overrides[b.stableId] ||= {};
    authoring.overrides[b.stableId].sculpt_mask = clear ? [] : b.controlPoints.map((_, i) => 1 - influenceAt(region, i / (b.controlPoints.length - 1)));
  }
}
