const clamp = (v, lo, hi, fallback) => Math.max(lo, Math.min(hi,
  v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : fallback));

export function normalizeShrubForm(raw = {}) {
  return {
    height: clamp(raw?.height, .3, 3, .8), width: clamp(raw?.width, .25, 3, .9),
    length: clamp(raw?.length, .5, 10, 3), spacing: clamp(raw?.spacing, .2, 1.5, .6),
    roughness: clamp(raw?.roughness, 0, .35, .1),
  };
}
