import { authorUnits } from './unit-authoring.js';
// Opt-in for assembled plants. Existing projects keep the legacy foliage path.
export function mountSamplePlacement(placement, matrix) {
  if (!matrix) return placement;
  return {...placement,position:placement.position.clone().applyMatrix4(matrix),
    direction:placement.direction.clone().transformDirection(matrix),
    normal:placement.normal?.clone().transformDirection(matrix) || null};
}
export function localSampleBranches(family, instance, asset, profiles) {
  const records = new Map(asset.shape.branches.map(b => [b.id, b]));
  const depth = id => { const b=records.get(id); return b?.parent && records.has(b.parent) ? 1+depth(b.parent) : 0; };
  return family.map(b=>{const id=b.stableId.slice(instance.id.length+1),inverse=b.mountMatrix?.clone().invert();return {...b,
    ...(inverse ? {points:b.points.map(p=>p.clone().applyMatrix4(inverse)),controlPoints:b.controlPoints.map(p=>p.clone().applyMatrix4(inverse)),surfaceNormals:b.surfaceNormals?.map(p=>p.clone().transformDirection(inverse))||null} : {}),
    stableId:id,order:depth(id),instanceId:'',mountMatrix:null,profileSet:profiles||b.profileSet,
    generator:null,override:asset.sample?.authoring?.overrides?.[id]||{},
  };});
}

export function sampleFoliagePlacements(branches, settings, authoring, sources, helpers) {
  const {normalizeAuthoring,normalizeSettings,stateFactors,leafPlacements,expandFoliagePlacements,createRng,stableSeed}=helpers;
  const byInstance=new Map();
  for(const b of branches)if(b.instanceId){if(!byInstance.has(b.instanceId))byInstance.set(b.instanceId,[]);byInstance.get(b.instanceId).push(b);}
  const bySource=new Map((sources||[]).map((s,i)=>[s.id,i])),compiled=new Map(),placements=[];
  const removed=new Set(authoring.leaf_edits.removed);
  for(const instance of authoring.branch_instances){
    const asset=helpers.resolveInstanceAsset(instance,authoring.branch_library),family=byInstance.get(instance.id);
    if(!asset?.sample||!family?.length)continue;
    const key=asset.id+':'+asset.revision;
    if(!compiled.has(key)){
      const a=normalizeAuthoring(asset.sample.authoring,asset.sample.settings.seed);
      a.branch_instances=[];a.branch_library=[];a.recipe.tags=a.recipe.tags.filter(t=>t!=='FOLIAGE_ON_INSTANCES_ONLY');
      compiled.set(key,{a,s:normalizeSettings(asset.sample.settings),sourceMap:asset.sample.leaf_meshes.map(u=>bySource.get(u.id))});
    }
    const {a,s,sourceMap}=compiled.get(key),local=localSampleBranches(family,instance,asset,a.profiles);
    let leaves=expandFoliagePlacements(leafPlacements(local,s,stateFactors(s),createRng(stableSeed(a.seeds.foliage,instance.id)),a),local,s);
    leaves=authorUnits(leaves,local,a.unit_editing,'LEAF',asset.sample.leaf_meshes,s.leaf_scale,a.seeds.foliage);
    const localById=new Map(local.map(b=>[b.id,b]));
    const bounds=leaves.reduce((b,p)=>({minX:Math.min(b.minX,p.position.x),maxX:Math.max(b.maxX,p.position.x),minY:Math.min(b.minY,p.position.y),maxY:Math.max(b.maxY,p.position.y),minZ:Math.min(b.minZ,p.position.z),maxZ:Math.max(b.maxZ,p.position.z)}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minZ:Infinity,maxZ:-Infinity});
    const crown={centerX:(bounds.minX+bounds.maxX)/2,centerY:(bounds.minY+bounds.maxY)/2,minZ:bounds.minZ,height:Math.max(.001,bounds.maxZ-bounds.minZ),radius:Math.max(.001,Math.hypot(bounds.maxX-bounds.minX,bounds.maxY-bounds.minY)/2)};
    for(const p of leaves){
      const stableId=instance.id+'.'+p.stableId;
      const mounted = mountSamplePlacement(p,family[0].mountMatrix);
      if(removed.has(stableId)||!helpers.masksAllow(mounted.position,stableId,authoring))continue;
      let selected=p.source;
      if(selected<0){
        const order=localById.get(p.branchId)?.order||0;
        let pool=asset.sample.leaf_meshes.map((u,i)=>({u,i})).filter(({u})=>!u.manual_only&&order>=(u.orderMin??0)&&order<=(u.orderMax??3)&&(u.season==='ANY'||!u.season||u.season===s.season));
        if(!pool.length)pool=asset.sample.leaf_meshes.map((u,i)=>({u,i})).filter(({u})=>!u.manual_only);
        // Weight is sample-specific: shared source IDs may have different
        // mature/young weights in the three cards. Choose before global merge.
        const bias=createRng(stableSeed(s.seed,'leaf-age:'+p.branchStableId))()-.5;
        const youth=helpers.leafYouthTarget(p,crown,bias);
        const weight=u=>helpers.leafAgeWeight({...u,weight:u.weight??1,ageStage:u.ageStage||'ANY'},youth,s.leaf_age_layering);
        let cursor=p.random*pool.reduce((n,{u})=>n+weight(u),0);selected=pool.at(-1)?.i;
        for(const {u,i} of pool){cursor-=weight(u);if(cursor<=0){selected=i;break;}}
      }
      if(sourceMap[selected]===undefined)continue;
      placements.push({...mounted,stableId,branchStableId:instance.id+'.'+p.branchStableId,source:sourceMap[selected]});
    }
  }
  // Whole-tree manual additions stay editable alongside linked sample foliage.
  if(authoring.leaf_edits.added.length){
    const manual={...authoring,attachment_layers:[]};
    placements.push(...leafPlacements(branches,settings,stateFactors(settings),createRng(authoring.seeds.foliage),manual));
  }
  // Distribute any budget reduction over the whole canopy, not the first limbs.
  return placements.length<=settings.max_leaves?placements:placements.sort((a,b)=>a.priority-b.priority).slice(0,settings.max_leaves);
}
