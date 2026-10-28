import { skeletonBranches } from './skeleton-thickness.js';
import { isAutomaticPlacement, recordGeneratedPlacements, protectedAssemblyInstances, isPreservedAssemblyGap } from './assembly-distribution.js';

const bounded = (v, d, min, max) => Number.isFinite(Number(v)) ? Math.max(min, Math.min(max, Number(v))) : d;
export function growthRule(raw = {}) {
  const start = bounded(raw.start, 0, 0, .99);
  return {start, end:bounded(raw.end, 1, start + .01, 1),
    profile:['UNIFORM','TIP','ROOT'].includes(raw.profile) ? raw.profile : 'UNIFORM', feather:bounded(raw.feather, .12, 0, .45)};
}
export function growthTargets(branches, selected, scope) {
  const bones = skeletonBranches(branches).filter(b => !b.symmetryGroup);
  if (scope === 'TREE') return bones.map(b => b.stableId);
  const root = bones.find(b => b.stableId === selected); if (!root) return [];
  const ids = new Set([root.id]);
  if (scope === 'SUBTREE') {
    let changed = true;
    while (changed) { changed = false; for (const b of bones) if (ids.has(b.parentId) && !ids.has(b.id)) {ids.add(b.id);changed=true;} }
  }
  return bones.filter(b => ids.has(b.id)).map(b => b.stableId);
}
export function growthEligibility(authoring, targets) {
  const parents = new Set(targets), protectedIds = protectedAssemblyInstances(authoring);
  const total = authoring.branch_instances.filter(i => parents.has(i.parent));
  const symmetry = authoring.symmetry_groups?.some(g => g.enabled);
  const editable = total.filter(i => !symmetry && i.linked && !i.array_id && !protectedIds.has(i.id) && isAutomaticPlacement(authoring,i));
  return {total,editable,protectedCount:total.length-editable.length};
}
// Sample the density CDF rather than deleting instances: count, sample, size and
// orientation stay unchanged. Edge feathering widens spacing at the boundaries.
export function growthPositions(count, raw) {
  const r=growthRule(raw), cdf=[0], steps=256;
  for(let n=1;n<=steps;n++) {
    const t=(n-.5)/steps;
    const edge=r.feather ? Math.min(1,t/r.feather,(1-t)/r.feather) : 1;
    const density=r.profile==='TIP' ? .15+t*1.7 : r.profile==='ROOT' ? 1.85-t*1.7 : 1;
    cdf.push(cdf.at(-1)+density*edge);
  }
  return Array.from({length:count},(_,n)=>{
    const quantile=(n+.5)/count*cdf.at(-1);let i=1;while(cdf[i]<quantile)i++;
    const t=(i-1+(quantile-cdf[i-1])/(cdf[i]-cdf[i-1]))/steps;
    return r.start+(r.end-r.start)*t;
  });
}
export function applyGrowthRules(authoring, branches, targets = null) {
  const rules=authoring.workbench?.assembly_growth?.regions || {};
  const live=new Set(skeletonBranches(branches).filter(b=>!b.symmetryGroup).map(b=>b.stableId));
  const ids=(targets || Object.keys(rules)).filter(id=>live.has(id)&&rules[id]);
  const eligible=growthEligibility(authoring,ids), moved=[];
  for(const parent of ids) {
    const instances=eligible.editable.filter(i=>i.parent===parent).sort((a,b)=>a.id.localeCompare(b.id));
    const positions=growthPositions(instances.length,rules[parent]);
    instances.forEach((i,n)=>{if(isPreservedAssemblyGap(authoring,parent,positions[n],i.shootRole))return;if(Math.abs(i.attach-positions[n])<1e-10&&!i.frame)return;i.attach=positions[n];i.frame=null;moved.push(i.id);});
  }
  if(moved.length)recordGeneratedPlacements(authoring,moved);
  return {...eligible,moved};
}
export function setGrowthRule(authoring, branches, targets, patch) {
  const previous=authoring.workbench?.assembly_growth || {}, regions={...previous.regions};
  for(const id of targets) {
    const next={...growthRule(regions[id]),...patch};
    if(next.start>=next.end)throw new Error('部分主枝的起点不小于终点，请先扩大区间或单独调整。');
    regions[id]=growthRule(next);
  }
  authoring.workbench={...authoring.workbench,assembly_growth:{version:1,regions}};
  return applyGrowthRules(authoring,branches,targets);
}
