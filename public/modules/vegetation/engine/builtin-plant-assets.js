import { normalizeLeafMaterial } from './leaf-material-data.js';
import { normalizeFlowering, FLOWERING_DEFAULTS } from './flowering-data.js';
import { VINE_DEFAULTS } from './vine-data.js';

const pending = new Map();
// Ship a self-contained local asset pack. Saved projects embed the same data,
// so exporting/reopening never depends on a machine-specific asset path.
export async function loadPlantAssets(id, filename, count, label) {
  if (!pending.has(id)) pending.set(id, (async () => {
    const response = await fetch(new URL('./assets/plants/' + filename, import.meta.url));
    if (!response.ok) throw new Error(`内置${label}素材读取失败，请检查软件 assets 文件夹`);
    const pack = await response.json();
    const flower = normalizeFlowering({ source: pack.flower }).source;
    const material = normalizeLeafMaterial(pack.leaf_material);
    if (pack.id !== id || pack.leaf_meshes?.length !== count || (id === 'BOUGAINVILLEA_V1' && !flower) || !material.color
      || !pack.leaf_meshes.every((leaf) => normalizeFlowering({ source: { name: leaf.name, geometry: leaf.geometry } }).source?.geometry.uv)) {
      throw new Error(`内置${label}素材不完整，请恢复软件素材文件`);
    }
    return pack;
  })().catch((error) => { pending.delete(id); throw error; }));
  return structuredClone(await pending.get(id));
}
export const loadBougainvilleaAssets = () => loadPlantAssets('BOUGAINVILLEA_V1', 'bougainvillea-v1.json', 5, '三角梅');
export const loadIvyAssets = () => loadPlantAssets('IVY_V1', 'ivy-v1.json', 6, '常春藤');

export function needsBougainvilleaAssets(flowering) {
  return !flowering.asset_preset && !flowering.source && !flowering.material?.color && !flowering.material?.normal;
}

export function withBougainvilleaAssets(document, pack, recommendedSize = false) {
  const next = structuredClone(document);
  next.leaf_meshes = structuredClone(pack.leaf_meshes);
  next.authoring.leaf_material = normalizeLeafMaterial(pack.leaf_material);
  next.authoring.flowering = normalizeFlowering({ ...next.authoring.flowering, enabled: true,
    source: pack.flower, shared_atlas: true, asset_preset: pack.id,
    ...(recommendedSize ? { size: FLOWERING_DEFAULTS.size } : {}) });
  if (next.authoring.vine) {
    next.authoring.vine.type = 'EDGE';
    next.authoring.vine.species = 'GENERIC';
    next.authoring.vine.leaf_preset = pack.id;
    if (recommendedSize) next.authoring.vine.leaf_size = VINE_DEFAULTS.leaf_size;
  }
  return next;
}

export function withIvyAssets(document, pack, recommendedSize = false) {
  const next = structuredClone(document);
  next.leaf_meshes = structuredClone(pack.leaf_meshes);
  next.settings.leaf_double_sided = true;
  next.authoring.leaf_material = normalizeLeafMaterial(pack.leaf_material);
  next.authoring.flowering = normalizeFlowering({ ...next.authoring.flowering, enabled: false });
  next.authoring.vine.species = 'IVY';
  next.authoring.vine.leaf_preset = pack.id;
  if (recommendedSize) next.authoring.vine.leaf_size = VINE_DEFAULTS.leaf_size;
  return next;
}
