// Keep a prefix of the actual current polyline. No straight-line scaling,
// topology deletion, radius change or dependence on an old template.
export function retractAlongPath(points, knotCount, fraction, minLength = .02) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]));
  const total = lengths.at(-1), end = Math.min(total, Math.max(minLength, total * Math.max(.1, Math.min(1, fraction))));
  if (total < 1e-10 || end >= total - 1e-10) return null;
  const at = distance => {
    let i = 1; while (i < lengths.length - 1 && lengths[i] < distance) i++;
    return points[i - 1].clone().lerp(points[i], (distance - lengths[i - 1]) / Math.max(1e-12, lengths[i] - lengths[i - 1]));
  };
  const dense = points.filter((_, i) => lengths[i] < end - 1e-10).map(p => p.clone());
  dense.push(at(end));
  const knots = Array.from({ length: knotCount }, (_, i) => at(end * i / (knotCount - 1)));
  return { points: dense, controlPoints: knots };
}
