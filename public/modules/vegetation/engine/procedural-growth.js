import { growthRule, growthPositions } from './assembly-growth.js';
import { skeletonBranches } from './skeleton-thickness.js';
import { sampleLine } from './tree-sculpt.js';

export function proceduralGrowthEligibility(authoring, branches, targets) {
  const bones=new Set(skeletonBranches(branches).map(b=>b.id)),parents=new Set(branches.filter(b=>targets.includes(b.stableId)).map(b=>b.id));
  const total=branches.filter(b=>parents.has(b.parentId)&&bones.has(b.id)&&!b.symmetryGroup);
  const edited=new Set([...Object.keys(authoring.overrides||{}),...Object.keys(authoring.topology?.reparent||{}),...Object.keys(authoring.topology?.attach||{})]);
  for(const layer of authoring.sculpt_layers||[]){Object.keys(layer.branches||{}).forEach(id=>edited.add(id));(layer.operation?.targets||[]).forEach(id=>edited.add(id));}
  for(const unit of [...(authoring.unit_editing?.items||[]),...(authoring.leaf_edits?.added||[])])edited.add(unit.parent);
  const children=new Map();for(const b of branches){if(!children.has(b.parentId))children.set(b.parentId,[]);children.get(b.parentId).push(b);}
  const protectedTree=b=>{
    if(b.manual||b.instanceId||b.unitOwner||b.symmetryGroup||edited.has(b.stableId))return true;
    if(authoring.branch_instances?.some(i=>i.parent===b.stableId))return true;
    return (children.get(b.id)||[]).some(protectedTree);
  };
  const editable=authoring.branch_shape||authoring.vine||authoring.symmetry_groups?.some(g=>g.enabled)?[]:total.filter(b=>!protectedTree(b));
  return {total,editable,protectedCount:total.length-editable.length};
}
export function setProceduralGrowthRule(authoring,targets,patch) {
  const regions={...authoring.workbench?.procedural_growth?.regions};
  for(const id of targets){const r={...growthRule(regions[id]),...patch};if(r.start>=r.end)throw new Error('终点需大于起点。');regions[id]=growthRule(r);}
  authoring.workbench={...authoring.workbench,procedural_growth:{version:1,regions}};
}
// Evaluate once after the authored skeleton, before foliage/meshes. Translating
// the whole child bundle retains its length, radii and shape, with no drift on
// rebuild. Authored/custom shapes and edited/installed descendants are excluded.
export function applyProceduralGrowth(branches,authoring) {
  const rules=authoring.workbench?.procedural_growth?.regions;if(!rules)return;
  const eligible=proceduralGrowthEligibility(authoring,branches,Object.keys(rules)).editable;
  const children=new Map();for(const b of branches){if(!children.has(b.parentId))children.set(b.parentId,[]);children.get(b.parentId).push(b);}
  const translate=(b,delta)=>{const points=new Set([...b.points,...(b.controlPoints||[])]);points.forEach(p=>p.add(delta));(children.get(b.id)||[]).forEach(c=>translate(c,delta));};
  // Parent first: all lower attachment coordinates use the already moved axis.
  for(const parent of branches){if(!rules[parent.stableId])continue;
    const group=eligible.filter(b=>b.parentId===parent.id).sort((a,b)=>a.stableId.localeCompare(b.stableId));
    const positions=growthPositions(group.length,rules[parent.stableId]);
    group.forEach((b,n)=>{const delta=sampleLine(parent.points,positions[n]).sub(b.points[0]);translate(b,delta);b.parentT=positions[n];});
  }
}
