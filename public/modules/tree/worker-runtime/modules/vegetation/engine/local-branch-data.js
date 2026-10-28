// Local generation is saved as ordinary manual branches plus an editable recipe.
// The recipe never regenerates unrelated branches or installed sample assets.
const number = (v, lo, hi, fallback) => Math.max(lo, Math.min(hi, Number.isFinite(+v) ? +v : fallback));
export function normalizeLocalBranchOptions(raw = {}) {
  const start = number(raw.start, .02, .98, .25), end = number(raw.end, .02, .98, .9);
  return { count: Math.round(number(raw.count, 0, 12, 4)), levels: Math.round(number(raw.levels, 1, 2, 1)),
    start: Math.min(start, end), end: Math.max(start, end), length: number(raw.length, .1, .9, .45),
    radius: number(raw.radius, .1, .8, .5), taper: number(raw.taper, .02, 1, .15),
    angle: number(raw.angle, 10, 100, 45), variation: number(raw.variation, 0, .7, .2),
    seed: Math.round(number(raw.seed, 1, 2147483646, 1)) };
}
export function normalizeLocalBranchGroups(raw = []) {
  const roots = new Set(), ids = new Set();
  return (Array.isArray(raw) ? raw : []).filter(g => g && typeof g.root === 'string' && g.root).map((g, i) => ({
    id: String(g.id || `LOCAL_${i}`).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48), root: g.root,
    ...normalizeLocalBranchOptions(g),
  })).filter(g => { if (roots.has(g.root) || ids.has(g.id)) return false; roots.add(g.root); ids.add(g.id); return true; });
}
export function normalizeLocalBranchRecord(raw) {
  if (!raw || typeof raw.group !== 'string' || !raw.group) return null;
  return { group: raw.group, length: number(raw.length, .05, 1.5, .45), radius: number(raw.radius, .05, .9, .5),
    taper: number(raw.taper, .02, 1, .15), bend: number(raw.bend, -.4, .4, .08) };
}
const random = (seed, key) => { let n = seed | 0; for (const c of key) n = Math.imul(n ^ c.charCodeAt(0), 16777619); n ^= n >>> 16; n = Math.imul(n, 0x45d9f3b); n ^= n >>> 16; return (n >>> 0) / 4294967296; };
const slot = index => { let n = index + 1, t = 0, bit = .5; while (n) { t += (n & 1) * bit; bit *= .5; n >>= 1; } return t; };

export function planLocalBranches(authoring, branches, rootId, raw, groupId) {
  const root = branches.find(b => b.stableId === rootId);
  if (!root || root.instanceId || root.unitOwner || root.symmetryGroup) throw new Error('请选择承重骨架；成品次枝内部请进入样本编辑');
  const groups = normalizeLocalBranchGroups(authoring.local_branch_groups), previous = groups.find(g => g.root === rootId);
  const config = { id: previous?.id || groupId, root: rootId, ...normalizeLocalBranchOptions(raw) };
  if (!config.id) throw new Error('缺少局部分枝编号');
  if (config.count && config.end - config.start < .02) throw new Error('生长范围至少相差 2%');
  const old = authoring.manual_branches.filter(b => b.local_bundle?.group === config.id), owned = new Map(old.map(b => [b.id, b]));
  const protectedIds = new Set();
  const protect = id => { if (owned.has(id)) protectedIds.add(id); };
  Object.keys(authoring.overrides).forEach(protect);
  for (const layer of authoring.sculpt_layers) {
    Object.keys(layer.branches).forEach(protect);
    layer.operation?.targets?.forEach(protect);
    if (layer.operation?.root) protect(layer.operation.root);
  }
  authoring.topology.suppressed.forEach(protect);
  Object.entries(authoring.topology.reparent).forEach(([child, parent]) => { protect(child); protect(parent); });
  Object.keys(authoring.topology.attach).forEach(protect);
  authoring.symmetry_groups.forEach(g => protect(g.source));
  authoring.branch_instances.forEach(i => protect(i.parent));
  authoring.leaf_edits.added.forEach(i => protect(i.parent));
  groups.filter(g => g.id !== config.id).forEach(g => protect(g.root));
  const byId = new Map(branches.map(b => [b.id, b]));
  branches.filter(b => !owned.has(b.stableId)).forEach(b => protect(byId.get(b.parentId)?.stableId));
  authoring.manual_branches.filter(b => !owned.has(b.id)).forEach(b => protect(b.parent));
  // Keep the entire dependent subtree and its connecting ancestors. Changing an
  // ancestor's recipe would otherwise move a protected sculpted child indirectly.
  let changed = true;
  while (changed) { const n = protectedIds.size; for (const b of old) { if (protectedIds.has(b.id)) protect(b.parent); if (protectedIds.has(b.parent)) protect(b.id); } changed = n !== protectedIds.size; }
  const generated = [];
  function children(parent, depth, path) {
    if (depth > config.levels) return;
    const count = depth === 1 ? config.count : Math.ceil(config.count / 2);
    for (let i = 0; i < count; i++) {
      const key = path ? `${path}_${i + 1}` : `${i + 1}`, id = `${config.id}_${key}`;
      const variation = (suffix) => (random(config.seed, key + suffix) * 2 - 1) * config.variation;
      const t = Math.max(config.start, Math.min(config.end, config.start + (config.end - config.start) * (slot(i) + variation('t') * .06)));
      const b = { id, parent, attach: t, length: .6, radius: .018,
        angle: Math.max(10, Math.min(100, config.angle + variation('a') * 30)), azimuth: (i * 137.507764 + random(config.seed, path + 'phase') * 360 + variation('r') * 45) % 360,
        local_bundle: { group: config.id, length: config.length * (1 + variation('l')) * (1 - t * .15),
          radius: config.radius * (1 + variation('w') * .35), taper: config.taper, bend: .06 + variation('b') * .22 } };
      generated.push(protectedIds.has(id) ? owned.get(id) : b); children(id, depth + 1, key);
    }
  }
  children(rootId, 1, '');
  for (const b of old) if (protectedIds.has(b.id) && !generated.some(g => g.id === b.id)) generated.push(b);
  // Parent-first order also covers retained protected children outside the new count.
  const sorted = [], pending = [...generated];
  while (pending.length) { const i = pending.findIndex(b => !pending.some(p => p.id === b.parent)); if (i < 0) throw new Error('局部分枝出现循环连接'); sorted.push(pending.splice(i, 1)[0]); }
  const replacements = new Map(sorted.map(b => [b.id, b]));
  const manual = authoring.manual_branches.flatMap(b => !owned.has(b.id) ? [b] : replacements.has(b.id) ? [replacements.get(b.id)] : []);
  // Retained external children must be inserted after their local parents.
  const all = [...manual, ...sorted.filter(b => !owned.has(b.id))], ordered = [];
  while (all.length) { const i = all.findIndex(b => !all.some(p => p.id === b.parent)); if (i < 0) throw new Error('手工枝条出现循环连接'); ordered.push(all.splice(i, 1)[0]); }
  const added = sorted.filter(b => !owned.has(b.id)).length, removed = old.filter(b => !sorted.some(g => g.id === b.id)).length;
  if (branches.filter(b => !b.instanceId && !b.unitOwner).length + added - removed > 2200) throw new Error('超过局部编辑的 2200 骨架枝段预算，请减少数量或层数');
  return { authoring: { ...authoring, manual_branches: ordered, local_branch_groups: previous ? groups.map(g => g.id === config.id ? config : g) : [...groups, config] }, config,
    created: sorted.filter(b => !owned.has(b.id)).map(b => b.id), targetId: rootId,
    stats: { added, removed, protected: protectedIds.size, total: sorted.length } };
}
