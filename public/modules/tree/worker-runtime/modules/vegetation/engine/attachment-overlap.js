// Same ordered overlap test as generation/export: count a placement once if an
// earlier, unrelated cluster is within the minimum spacing. Numeric cell maps
// avoid allocating 27 coordinate arrays and strings for each leaf.
export function attachmentOverlapRatio(placements, spacing) {
  if (placements.length < 2) return 0;
  const occupied = new Map(), size = Math.max(0.004, spacing), squared = size * size;
  let overlaps = 0;
  for (const placement of placements) {
    const cluster = String(placement.stableId || '').replace(/:C\d+$/, '');
    const unitNode = cluster.includes(':UNIT:') ? cluster.replace(/:\d+$/, '') : '';
    const p = placement.position, cx = Math.floor(p.x / size), cy = Math.floor(p.y / size), cz = Math.floor(p.z / size);
    let hit = false;
    for (let x = cx - 1; x <= cx + 1 && !hit; x++) {
      const column = occupied.get(x); if (!column) continue;
      for (let y = cy - 1; y <= cy + 1 && !hit; y++) {
        const row = column.get(y); if (!row) continue;
        for (let z = cz - 1; z <= cz + 1 && !hit; z++) {
          const candidates = row.get(z); if (!candidates) continue;
          for (const candidate of candidates) {
            if (candidate.cluster !== cluster
              && !(unitNode && candidate.unitNode === unitNode && candidate.direction.dot(placement.direction) < .94)
              && candidate.position.distanceToSquared(p) < squared) { hit = true; break; }
          }
        }
      }
    }
    if (hit) overlaps++;
    let column = occupied.get(cx); if (!column) occupied.set(cx, column = new Map());
    let row = column.get(cy); if (!row) column.set(cy, row = new Map());
    let bucket = row.get(cz); if (!bucket) row.set(cz, bucket = []);
    bucket.push({ position: p, direction: placement.direction, cluster, unitNode });
  }
  return overlaps / placements.length;
}
