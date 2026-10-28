// Editor-only controls; resolved sizes remain in the existing instance.scale field.
export const INSTANCE_SCALE_MIN = 0.0005;
export const INSTANCE_SCALE_MAX = 500;
const multiplier = value => {
  const n = Number(value ?? 1);
  if (!Number.isFinite(n) || n < 0.1 || n > 10) throw Error('次枝倍率须在 0.1–10 之间');
  return n;
};

export function assemblyScaleState(workbench) {
  const raw = workbench?.assembly_scale || {};
  return { overall: multiplier(raw.overall), cards: Object.fromEntries(Object.entries(raw.cards || {}).map(([id, value]) => [id, multiplier(value)])), records: raw.records || {} };
}

// Old projects may carry a radial-only adjustment on completed samples. Keep it
// on load; restoration is an explicit, undoable edit, separate from size factors.
export function sampleThicknessAdjustments(authoring, assetId = null) {
  const samples = new Set(authoring.branch_library.filter(item => item.sample).map(item => item.id));
  return authoring.branch_instances.filter(instance => samples.has(instance.asset_id)
    && (assetId === null || instance.linked && instance.asset_id === assetId)
    && Math.abs((instance.radius_scale ?? 1) - 1) > 1e-8);
}

export function restoreSampleThickness(authoring, assetId = null) {
  const adjusted = sampleThicknessAdjustments(authoring, assetId);
  for (const instance of adjusted) instance.radius_scale = 1;
  return adjusted.length;
}

// Preserve different installed sizes and local size edits. Never multiply an
// already-scaled value again, or copy meshes / atlas payloads to track a baseline.
export function applyAssemblyScale(authoring, patch = {}, onChange = () => {}) {
  const old = assemblyScaleState(authoring.workbench);
  const next = { overall: multiplier(patch.overall ?? old.overall), cards: { ...old.cards, ...patch.cards }, records: {} };
  for (const key of Object.keys(next.cards)) next.cards[key] = multiplier(next.cards[key]);
  const changes = authoring.branch_instances.map(instance => {
    const previous = old.records[instance.id];
    if(instance.assembly_locked){if(previous)next.records[instance.id]=previous;return {before:instance,after:instance};}
    const base = previous && Number.isFinite(previous.base) && previous.factor > 0
      ? (instance.scale === previous.scale ? previous.base : instance.scale / previous.factor)
      : instance.scale;
    const factor = next.overall * (instance.linked ? next.cards[instance.asset_id] ?? 1 : 1);
    const scale = base * factor;
    if (!Number.isFinite(scale) || scale < INSTANCE_SCALE_MIN || scale > INSTANCE_SCALE_MAX)
      throw Error('叠加后的次枝尺寸超出支持范围，请减小倍率或调整单枝尺寸');
    next.records[instance.id] = { base, factor, scale };
    return { before: instance, after: { ...instance, scale } };
  });
  for (const { before, after } of changes) if (before.scale !== after.scale) onChange(before, after);
  authoring.branch_instances = changes.map(({ after }) => after);
  authoring.workbench = { ...authoring.workbench, assembly_scale: next };
}
