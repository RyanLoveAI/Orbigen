// Projected polyline picking with perspective-correct segment interpolation.
// The caller offsets the pointer by its initial distance from the attachment,
// so grabbing the edge of the root handle does not make the branch jump.
export function projectedMountParameter(points, x, y, previous = 0) {
  let best = Infinity, result = previous;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i+1];
    if (a.w <= 0 || b.w <= 0 || (a.z < -1 && b.z < -1) || (a.z > 1 && b.z > 1)) continue;
    const dx = b.x-a.x, dy = b.y-a.y, length = dx*dx+dy*dy;
    if (length < 1e-6) continue;
    const s = Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/length));
    const t = s*a.w / ((1-s)*b.w+s*a.w);
    const parameter = (i+t)/(points.length-1);
    const distance = (x-a.x-s*dx)**2+(y-a.y-s*dy)**2;
    if (distance < best-1e-6 || (Math.abs(distance-best)<1e-6 && Math.abs(parameter-previous)<Math.abs(result-previous))) {
      best = distance; result = parameter;
    }
  }
  return result;
}

// Mount parameters use segment indices, while typed G distances are metres.
export function mountDistanceAt(points, t) {
  const cursor = Math.max(0, Math.min(1, t)) * (points.length - 1);
  let distance = 0;
  for (let i = 0; i < points.length - 1; i++) {
    distance += points[i].distanceTo(points[i + 1]) * Math.max(0, Math.min(1, cursor - i));
  }
  return distance;
}

export function slideMountParameter(points, initial, distance) {
  const total = mountDistanceAt(points, 1);
  let remaining = Math.max(0, Math.min(total, mountDistanceAt(points, initial) + distance));
  if (total < 1e-12) return initial;
  for (let i = 0; i < points.length - 1; i++) {
    const length = points[i].distanceTo(points[i + 1]);
    if (length > 1e-12 && remaining <= length) return (i + remaining / length) / (points.length - 1);
    remaining -= length;
  }
  return 1;
}
