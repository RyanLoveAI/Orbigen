import { TREE_SPECIES } from './tree-species-library.js';
import { loadPlantAssets } from './builtin-plant-assets.js';
import { normalizeLeafMaterial } from './leaf-material-data.js';
import { normalizeTreeOrgans } from './tree-organ-data.js';

export function loadTreeSpeciesAssets(id) {
  if (!TREE_SPECIES[id]) throw new Error('未知树种');
  if (TREE_SPECIES[id].pending) throw new Error(`${TREE_SPECIES[id].name}参考图已备好，等待单元模型；可先新建结构预览`);
  return loadPlantAssets(`${id}_LEAVES_V1`, `tree-${id.toLowerCase()}-v1.json`, TREE_SPECIES[id].leafCount || 8, TREE_SPECIES[id].name);
}

// Embed geometry and atlas so projects can move to another computer.
// Replacing leaves must leave the user's edited branch curves intact.
export function withTreeSpeciesAssets(document, pack) {
  const id = pack.species;
  if (!TREE_SPECIES[id] || pack.id !== `${id}_LEAVES_V1` || pack.leaf_meshes?.length !== (TREE_SPECIES[id].leafCount || 8) || !pack.leaf_material?.color) throw new Error('树种素材不完整');
  if (!document.authoring.recipe.tags.includes(id)) throw new Error('叶片素材与当前枝条树种不匹配');
  const next = structuredClone(document);
  next.leaf_meshes = structuredClone(pack.leaf_meshes);
  next.leaf_mesh = null;
  next.authoring.leaf_material = normalizeLeafMaterial(pack.leaf_material);
  const spec = TREE_SPECIES[id];
  const previous = next.authoring.tree_organs;
  next.authoring.tree_organs = normalizeTreeOrgans({species:id, units:pack.organ_meshes || [], habit:spec.organHabit,
    mode:previous?.species === id ? previous.mode : next.authoring.plant_form ? 'LEAVES' : spec.organMode || 'LEAVES',
    amount:previous?.species === id ? previous.amount : spec.organAmount ?? .65,
    scale:previous?.species === id ? previous.scale : 1,
    max_count:previous?.species === id ? previous.max_count : 200,
    color:previous?.species === id ? previous.color : ''});
  if (spec.organMode && next.authoring.tree_organs.units.length !== (spec.organCount ?? 3)) throw new Error('树种花果素材不完整');
  if (spec.organMode) next.settings.max_triangles = Math.max(next.settings.max_triangles, 500000);
  // The imported shape already contains its true width and a modeled petiole.
  next.settings.leaf_aspect = 1;
  next.settings.petiole_length = 0;
  next.settings.branch_clearance = 0;
  next.settings.leaf_double_sided = true;
  next.settings.object_name = next.settings.object_name.replace('占位叶', '成品叶');
  next.authoring.recipe.name = next.authoring.recipe.name.replace('占位叶', '成品叶');
  next.authoring.workbench.name = next.authoring.workbench.name.replace('占位叶', '成品叶');
  next.authoring.recipe.tags = [...new Set([...next.authoring.recipe.tags.filter(t => t !== 'PLACEHOLDER_LEAVES'), 'REAL_TREE_LEAVES'])];
  for (const layer of next.authoring.attachment_layers) if (layer.name === '待替换树种叶片') layer.name = `${TREE_SPECIES[id].name}成品叶片`;
  return next;
}
