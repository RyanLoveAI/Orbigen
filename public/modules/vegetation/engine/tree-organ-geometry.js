import * as THREE from 'three';
import { plantRandom } from './flowering-data.js';

// Draw only the requested season's organs. Sizes are calibrated independently
// of the source sheet, where flowers and leaves were enlarged for modeling.
export function treeOrganPlacements(branches, organs, seed, samplePoint, masksAllow=()=>true) {
  if(organs.mode==='LEAVES'||organs.amount<=0)return [];
  const sources=organs.units.map((u,i)=>({...u,index:i})).filter(u=>!u.manual_only).filter(u=>
    organs.mode==='MIXED' ? ['FLOWER','BUD','FRUIT'].includes(u.role)
      : organs.mode==='FRUIT' ? u.role==='FRUIT' : ['FLOWER','BUD'].includes(u.role));
  if(!sources.length)return [];
  const parents=new Set(branches.filter(b=>b.parentId>=0).map(b=>b.parentId));
  const candidates=[];
  for(const branch of branches){
    if(branch.order<(organs.order_min??1))continue;
    if(organs.terminal_branches_only&&parents.has(branch.id))continue;
    if(organs.habit==='TERMINAL'&&parents.has(branch.id))continue;
    const sites=organs.habit==='TERMINAL'?[1]:organs.habit==='PENDANT'?[.55,.86]:[.32,.56,.80];
    for(let i=0;i<sites.length;i++){
      const id=`${branch.stableId}:TREE_ORGAN:${i}`,rng=plantRandom(seed,id),priority=rng();
      if(priority>organs.amount)continue;
      let choice=rng()*sources.reduce((s,u)=>s+u.weight,0),unit=sources.at(-1);
      for(const source of sources){choice-=source.weight;if(choice<=0){unit=source;break;}}
      const t=sites[i],position=samplePoint(branch.points,t);
      if(!masksAllow(position,id))continue;
      const angle=rng()*Math.PI*2;
      const down=organs.habit==='PENDANT'||unit.role==='FRUIT';
      const direction=new THREE.Vector3(Math.cos(angle)*.25,Math.sin(angle)*.25,down?-1:organs.habit==='TERMINAL'?1:.35).normalize();
      const normal=new THREE.Vector3(Math.sin(angle),-Math.cos(angle),0);
      candidates.push({stableId:id,branchId:branch.id,branchStableId:branch.stableId,branchT:t,position,direction,normal,
        scale:unit.size*organs.scale*(.88+rng()*.24),twist:(rng()-.5)*.8,phase:rng(),random:rng(),priority,
        source:unit.index,attachmentType:unit.role==='BUD'?'FLOWER':unit.role,organRole:unit.role});
    }
  }
  return candidates.sort((a,b)=>a.priority-b.priority||a.stableId.localeCompare(b.stableId)).slice(0,organs.max_count??200);
}
