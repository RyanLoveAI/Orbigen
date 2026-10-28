// Compact provenance for legacy automatic placements. Shape/size are excluded:
// redistribution preserves them; only a changed placement must become protected.
export function placementSignature(instance) {
  const rounded = v => Array.isArray(v) ? v.map(rounded) : typeof v === 'number' ? Number(v.toFixed(8)) : v;
  const frame = instance.frame;
  const value = [instance.asset_id, instance.parent || '', instance.attach ?? .65, instance.angle ?? 45,
    instance.azimuth ?? 0, instance.roll ?? 0, instance.seed ?? 1, instance.variation ?? 0,
    frame ? [frame.position, frame.direction, frame.parent_tangent, frame.parent_position || null].map(rounded) : null];
  const text = JSON.stringify(rounded(value)); let a = 2166136261, b = 2246822519;
  for (let n = 0; n < text.length; n++) { const c = text.charCodeAt(n); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 3266489917); }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
