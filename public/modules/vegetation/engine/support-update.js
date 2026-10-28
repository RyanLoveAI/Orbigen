import { equalData } from './branch-workbench-data.js';

// Only carrier edits can reuse completed samples. A unit edit, atlas change or
// topology change must still go through the complete compiler.
export function canUpdateSupports(previous, next, supportIds, managedIds = new Set()) {
  const strip = a => {
    const { overrides, sculpt_layers, active_sculpt_layer, curve_editor, branch_shape, workbench, branch_instances, ...rest } = a;
    const { skeleton_thickness, ...otherWorkbench } = workbench || {};
    return { ...rest, workbench: otherWorkbench };
  };
  if (!equalData(strip(previous), strip(next))) return false;
  if (previous.branch_instances.length !== next.branch_instances.length) return false;
  for (let n = 0; n < previous.branch_instances.length; n++) {
    const old = previous.branch_instances[n], current = next.branch_instances[n];
    const stripFrame = ({frame, roll, ...rest}) => rest;
    if (!equalData(old, current) && (!managedIds.has(old.id) || !equalData(stripFrame(old), stripFrame(current)))) return false;
  }
  for (const a of [previous, next]) {
    if (a.foliage_masks.length || Object.keys(a.overrides).some(id => !supportIds.has(id))) return false;
    for (const layer of a.sculpt_layers) {
      if (Object.keys(layer.branches).some(id => !supportIds.has(id))) return false;
      const op = layer.operation;
      if (op && (!['MOUNT','ROOT_SCALE','POINT_ROTATE','POINT_SCALE','POINT_SLIDE','RADIUS'].includes(op.type)
        || op.targets.some(id => !supportIds.has(id)))) return false;
    }
  }
  return true;
}

export function equalGeometry(a, b) {
  const same = (x, y) => x === y || Boolean(x && y && x.length === y.length && x.every((v, i) => v === y[i]));
  if (!same(a.index?.array, b.index?.array)) return false;
  const keys = Object.keys(a.attributes);
  return keys.length === Object.keys(b.attributes).length && keys.every(key => {
    const x = a.attributes[key], y = b.attributes[key];
    return y && x.itemSize === y.itemSize && x.normalized === y.normalized && same(x.array, y.array);
  }) && equalData(a.groups, b.groups) && equalData(a.drawRange, b.drawRange);
}
