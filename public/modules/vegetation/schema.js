export const GENERATOR_VERSION = 1;
export const MAX_PLANTS = 120;
export const SPECIES = {
  CAMPHOR: { name: '香樟', category: '树木', height: 4.5, description: '真实香樟叶片 · 自然分枝' },
  PITTOSPORUM: { name: '海桐', category: '灌木', height: .9, description: '真实海桐叶片 · 紧凑丛形' },
  JASMINE: { name: '茉莉', category: '花卉', height: .65, description: '真实叶片与白花 · 自然花丛' },
  AZALEA: { name: '杜鹃', category: '花卉', height: .75, description: '真实叶片与花朵 · 繁花灌丛' },
  GRASS: { name: '绿草', category: '草丛', height: .35, description: '原软件草叶算法 · 弯曲与疏密变化' },
  DRY_GRASS: { name: '枯草', category: '草丛', height: .45, description: '原软件枯草算法 · 自然干草丛' },
};
export function recipe(species = 'CAMPHOR', values = {}) {
  const value = { version: GENERATOR_VERSION, species, seed: 12037, height: SPECIES[species]?.height, width: 1, density: 1, ...values };
  validateRecipe(value); return value;
}
export function validateRecipe(value) {
  if (!value || value.version !== GENERATOR_VERSION || !SPECIES[value.species]) throw Error('植物生成配方版本或品种无效');
  for (const [key, min, max] of [['height', .05, 15], ['width', .4, 2], ['density', .25, 1.5], ['seed', 1, 2147483646]]) {
    if (!Number.isFinite(value[key]) || value[key] < min || value[key] > max || (key === 'seed' && !Number.isInteger(value[key]))) throw Error('植物参数无效：' + key);
  }
  return value;
}
export function validateInstances(instances) {
  if (!Array.isArray(instances) || instances.length > MAX_PLANTS) throw Error('植被工程最多 ' + MAX_PLANTS + ' 株');
  const ids = new Set();
  for (const instance of instances) {
    if (typeof instance.id !== 'string' || !instance.id || instance.id.length > 100 || ids.has(instance.id)) throw Error('植物实例 ID 无效或重复');
    ids.add(instance.id); validateRecipe(instance.recipe);
    for (const key of ['position', 'rotation', 'scale']) {
      const value = instance[key];
      if (!Array.isArray(value) || value.length !== 3 || value.some(n => !Number.isFinite(n) || Math.abs(n) > 100000)) throw Error('植物变换无效');
    }
    if (instance.scale.some(n => n <= 0 || n > 100)) throw Error('植物缩放须为正数且不超过 100');
    if (typeof instance.name !== 'string' || instance.name.length > 120) throw Error('植物名称无效');
    if (typeof instance.locked !== 'boolean') throw Error('植物锁定状态无效');
  }
  return instances;
}
