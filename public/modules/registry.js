export const MODULES = [
  { id: 'prefabs', name: '半成品库', route: 'prefabs', available: true },
  { id: 'breakdown', name: '渲染图分拆', route: 'breakdown', available: true },
  { id: 'building', name: '建筑', route: 'assembly', available: true },
  { id: 'vegetation', name: '植被', route: 'vegetation', available: true },
  { id: 'tree', name: '树木制作', route: 'tree', available: true },
  { id: 'compose', name: '渲染图一键组建', route: 'compose', available: true },
  { id: 'region', name: '区域铺设', route: 'region', available: true },
];
// New modules own their editor, schema and project namespace; building records keep their existing IDs.
