import { normalizeLeafMaterial } from './leaf-material-data.js';

export const FLOWERING_DEFAULTS = { enabled: false, style: 'CASCADE', amount: .68, size: .06, grouping: .65, start: .22, end: .94, outer: .55, node_spacing: .075, seed: 52050, color: '#d9328d', core: true, max_count: 900, source: null, shared_atlas: false, material: null, asset_preset: '', regions: {}, removed: [], size_variation: .18, direction_variation: 20, twist_variation: 34, pose_seed: 71053 };
export const FLOWERING_STYLES = { CASCADE: '墙边花瀑', ARCH: '拱垂花枝', BUSH: '灌丛花团' };
export const BLOOM_STATES = { LEAFY: { label: '叶多花少', amount: .2, grouping: .55 }, MIXED: { label: '花叶交错', amount: .62, grouping: .65 }, FULL: { label: '繁花覆盖', amount: .95, grouping: .8 } };
const n = (v, fallback, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(v)) ? Number(v) : fallback));
function geometry(raw) {
  if (!raw || !Array.isArray(raw.position) || raw.position.length < 9 || raw.position.length > 150000 || raw.position.length % 3 || !raw.position.every(Number.isFinite)) return null;
  const count = raw.position.length / 3;
  if (!Array.isArray(raw.index) || raw.index.length < 3 || raw.index.length > 180000 || raw.index.length % 3 || !raw.index.every((i) => Number.isInteger(i) && i >= 0 && i < count)) return null;
  const attribute = (key, length) => Array.isArray(raw[key]) && raw[key].length === length && raw[key].every(Number.isFinite) ? raw[key] : null;
  return { position: raw.position, index: raw.index, normal: attribute('normal', count * 3), uv: attribute('uv', count * 2), source_name: String(raw.source_name || '花序').slice(0, 120) };
}
export function normalizeFlowering(raw = {}) {
  raw ||= {};
  const v = { ...FLOWERING_DEFAULTS, ...raw };
  v.enabled = raw.enabled === true; v.style = FLOWERING_STYLES[v.style] ? v.style : 'CASCADE';
  for (const [key, min, max] of [['amount', 0, 1], ['size', .03, .5], ['grouping', 0, 1], ['start', 0, 1], ['end', 0, 1], ['outer', 0, 1], ['node_spacing', .035, .3], ['seed', 1, 2147483646], ['max_count', 0, 2000]]) v[key] = n(v[key], FLOWERING_DEFAULTS[key], min, max);
  if (v.start > v.end) [v.start, v.end] = [v.end, v.start];
  for (const [key, max] of [['size_variation', .8], ['direction_variation', 60], ['twist_variation', 90], ['pose_seed', 2147483646]]) v[key] = n(v[key], FLOWERING_DEFAULTS[key], key === 'pose_seed' ? 1 : 0, max);
  v.pose_seed = Math.trunc(v.pose_seed);
  v.seed = Math.round(v.seed); v.max_count = Math.round(v.max_count); v.core = v.core !== false;
  v.color = /^#[a-fA-F0-9]{6}$/.test(v.color) ? v.color : FLOWERING_DEFAULTS.color;
  const mesh = geometry(raw.source?.geometry);
  v.source = mesh ? { name: String(raw.source.name || '花序 OBJ').slice(0, 120), geometry: mesh } : null;
  v.shared_atlas = raw.shared_atlas === true; v.material = normalizeLeafMaterial(raw.material);
  v.asset_preset = ['BOUGAINVILLEA_V1', 'PROCEDURAL', 'CUSTOM'].includes(raw.asset_preset) ? raw.asset_preset : '';
  v.regions = Object.fromEntries(Object.entries(raw.regions || {}).slice(0, 520).map(([id, r]) => [id.slice(0, 160), { amount: n(r?.amount, 1, 0, 2), start: n(r?.start, 0, 0, 1), end: n(r?.end, 1, 0, 1), seed: r?.seed == null ? null : Math.round(n(r.seed, v.seed, 1, 2147483646)) }]));
  v.removed = [...new Set((Array.isArray(raw.removed) ? raw.removed : []).filter((s) => typeof s === 'string').map((s) => s.slice(0, 180)))].slice(0, 10000);
  return Object.fromEntries(Object.keys(FLOWERING_DEFAULTS).map((key) => [key, v[key]]));
}
export function plantRandom(seed, key) {
  let h = seed >>> 0; for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h += 0x6D2B79F5; let x = Math.imul(h ^ h >>> 15, h | 1); x ^= x + Math.imul(x ^ x >>> 7, x | 61); return ((x ^ x >>> 14) >>> 0) / 4294967296; };
}
export function plantNodes(branch, spacing) {
  const count = Math.max(2, Math.min(180, Math.floor(branch.length / spacing)));
  return Array.from({ length: count }, (_, i) => ({ id: `${branch.stableId}.N${i + 1}`, t: (i + .5) / count, index: i }));
}
