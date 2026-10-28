import { nearestParameter, sampleLine } from './tree-sculpt.js';
import { mountDistanceAt, slideMountParameter } from './branch-mount-drag.js';

// Slide editing handles over the evaluated polyline, never resample the branch.
// Keep handle order so pins and subsequent R/S point indices remain stable.
export function pointSlideRange(branch, index) {
  const knots = branch.controlPoints, points = branch.points;
  if (!Number.isInteger(index) || index <= 0 || index >= knots.length - 1 || points.length < 2) return null;
  const start = nearestParameter(points, knots[index]);
  const left = nearestParameter(points, knots[index - 1]), right = nearestParameter(points, knots[index + 1]);
  const length = mountDistanceAt(points, right) - mountDistanceAt(points, left);
  if (length <= 1e-8 || start < left - 1e-8 || start > right + 1e-8) return null;
  const gap = Math.min(.001, length * .01);
  return { start, min: slideMountParameter(points, left, gap), max: slideMountParameter(points, right, -gap) };
}

export function evaluatePointSlide(branches, operation, strength = 1, overrides = {}) {
  if (strength <= 0) return branches;
  const root = branches.find(b => b.stableId === operation.root), index = operation.point;
  if (!root || root.unitOwner || root.instanceId || root.symmetryGroup || overrides[root.stableId]?.pinned_points?.includes(index)) return branches;
  const range = pointSlideRange(root, index);
  if (!range) return branches;
  const target = Math.max(range.min, Math.min(range.max, operation.attach));
  const t = range.start + (target - range.start) * strength;
  const point = sampleLine(root.points, t);
  if (point.distanceToSquared(root.controlPoints[index]) < 1e-20) return branches;
  return branches.map(b => b !== root ? b : {...b, controlPoints: b.controlPoints.map((p,i) => i === index ? point : p.clone())});
}
