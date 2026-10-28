import * as T from 'three';
import { buildBranchAsset, deserializeGeometry, DEFAULT_SETTINGS } from './engine/branch-kernel.js';
import { createTreeSpeciesDocument, TREE_SPECIES } from './engine/tree-species-library.js';
import { loadTreeSpeciesAssets, withTreeSpeciesAssets } from './engine/tree-species-assets.js';
import { normalizeVegetation } from './engine/vegetation-data.js';
import { buildVegetation } from './engine/vegetation-geometry.js';
import { SPECIES, validateRecipe } from './schema.js';

const textures = new Map();
async function bindTextures(material, raw) {
  for (const [key, slot] of [['color', 'map'], ['normal', 'normalMap']]) {
    if (!raw?.[key]) continue;
    const cacheKey = key + ':' + raw[key];
    if (!textures.has(cacheKey)) textures.set(cacheKey, new T.TextureLoader().loadAsync(raw[key]).then(texture => {
      texture.colorSpace = key === 'color' ? T.SRGBColorSpace : T.NoColorSpace;
      texture.name = raw[key + '_name'] || 'Orbigen_' + key;
      return texture;
    }).catch(error => { textures.delete(cacheKey); throw error; }));
    material[slot] = await textures.get(cacheKey);
  }
  if (raw?.color) material.color.set('#ffffff');
  material.alphaTest = raw?.cutoff ?? .4;
  material.roughness = raw?.roughness ?? .8;
  material.needsUpdate = true;
}

export async function generatePlant(config, { pack = null, textured = true } = {}) {
  validateRecipe(config);
  let root, asset, warnings = [];
  if (['GRASS', 'DRY_GRASS'].includes(config.species)) {
    const data = normalizeVegetation({ enabled: true, kind: 'GRASS', seed: config.seed, species: { GRASS: { height: config.height, width: config.height * .8, count: Math.round(30 * config.density), bend: .35, dry: config.species === 'DRY_GRASS' ? 1 : .06, variation: .32, leaf_width: .016 } } });
    const result = buildVegetation(data, null, 0, [], 16000);
    root = result.group;
  } else {
    pack ||= await loadTreeSpeciesAssets(config.species);
    let document = withTreeSpeciesAssets(createTreeSpeciesDocument(config.species, 'MAIN', config.seed), pack);
    if (config.species === 'CAMPHOR') {
      // Use the original whole-branch generator as an upright tree, with the user's real leaf units.
      document.settings = { ...DEFAULT_SETTINGS, ...document.settings, architecture: 'UPRIGHT', root_elevation: 90, length: 4, base_radius: .16, tip_radius: .014, child_count: 8, child_decay: .65, child_length_ratio: .65, branch_levels: 4, start_clearance: .28, leaf_zone_start: .25, leaf_scale: .12, leaf_density: 55 * config.density, groove_depth: .014, radial_segments: 8 };
      document.authoring.branch_shape = null;
      document.authoring.species_structure = null;
      document.authoring.attachment_layers[0].order_min = 2;
      document.authoring.recipe.tags.push('ORBIGEN_BALANCED_FOLIAGE');
    } else {
      document.settings.leaf_density *= config.density;
      document.settings.groove_depth = .004;
      const flowering = ['JASMINE', 'AZALEA'].includes(config.species);
      document.authoring.tree_organs.mode = flowering ? 'FLOWER' : 'LEAVES';
      document.authoring.tree_organs.amount = flowering ? .65 : 0;
      document.authoring.tree_organs.max_count = flowering ? 100 : 0;
    }
    document.settings.max_triangles = 260000;
    document.settings.max_leaves = Math.round((config.species === 'CAMPHOR' ? 1300 : 900) * config.density);
    document.settings.wind_strength = 0;
    const sources = document.leaf_meshes.map(item => ({ ...item, geometry: deserializeGeometry(item.geometry) }));
    try { asset = buildBranchAsset(document.settings, null, sources, 0, document.authoring); } finally { sources.forEach(item => item.geometry.dispose()); }
    root = asset.group; warnings = asset.report.warnings || [];
    if (textured) {
      const materials = new Set();
      root.traverse(object => { if (object.isMesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material.name === 'M_Leaf' || material.sampleLeafMaterial) materials.add(material); });
      for (const material of materials) await bindTextures(material, material.sampleLeafMaterial || pack.leaf_material);
    }
  }
  // The source software is Z-up; the shared workbench and GLB use Y-up metres.
  const conversion = new T.Matrix4().makeRotationX(-Math.PI / 2);
  root.updateMatrixWorld(true);
  root.traverse(object => {
    if (!object.isMesh) return;
    object.geometry.applyMatrix4(conversion);
    object.geometry.deleteAttribute('color');
    object.geometry.deleteAttribute('uv1');
    object.geometry.deleteAttribute('tangent');
    object.geometry.computeBoundingBox();
    object.geometry.computeBoundingSphere();
    object.userData = { source: 'Orbigen vegetation engine' };
  });
  root.userData = {};
  // All generated meshes are in one source coordinate system; anchor the complete plant on the ground.
  const box = new T.Box3().setFromObject(root), size = box.getSize(new T.Vector3());
  if (!size.toArray().every(Number.isFinite) || size.y <= 0) throw Error('生成的植物没有可用尺寸');
  const scale = config.height / size.y;
  const transform = new T.Matrix4().makeScale(scale * config.width, scale, scale * config.width).multiply(new T.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2));
  let triangles = 0;
  root.traverse(object => {
    if (!object.isMesh) return;
    object.geometry.applyMatrix4(transform); object.geometry.computeBoundingBox(); object.geometry.computeBoundingSphere();
    triangles += (object.geometry.index?.count || object.geometry.attributes.position.count) / 3;
  });
  asset?.lookupTexture?.texture?.dispose?.();
  root.name = SPECIES[config.species].name + '_' + config.seed;
  root.userData = { module: 'vegetation', generatorVersion: config.version, recipe: { ...config } };
  return { root, triangles, warnings, recipe: { ...config } };
}

export function disposePlant(plant) {
  const geometries = new Set(), materials = new Set(), maps = new Set();
  plant.root.traverse(object => { if (!object.isMesh) return; geometries.add(object.geometry); for (const m of Array.isArray(object.material) ? object.material : [object.material]) { materials.add(m); if (m.map?.isDataTexture) maps.add(m.map); } });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); maps.forEach(t => t.dispose());
}
