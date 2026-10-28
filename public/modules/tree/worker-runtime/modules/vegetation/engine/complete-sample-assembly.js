import * as THREE from '/vendor/three/three.module.js';
import { branchMountAt } from './branch-mount-frame.js';
import { completeInstanceMatrix } from './branch-instance-matrix.js';
import { resolveInstanceAsset, resolveInstanceShape, equalData } from './branch-workbench-data.js';
import { prepareRadialGeometry, applyRadialGeometry, radialMaterial } from './sample-radial.js';
import { skeletonThicknessState } from './skeleton-thickness.js';
import { sampleLeafMaterial, sampleLeafMaterialName } from './leaf-material-data.js';
import { canUpdateSupports, equalGeometry } from './support-update.js';
const sampleAsset = (i,a) => resolveInstanceAsset(i.linked?i:{...i,linked:true},a.branch_library);

// The editable document remains unchanged. Only the viewport uses GPU instances;
// export materializes the same compiled samples with the existing hierarchy UVs.
export function canCompileSamples(a) {
  return !a.vine && !a.vegetation.enabled && a.branch_instances.length > 0
    && a.recipe.tags.includes('SAMPLE_FOLIAGE_FROM_LIBRARY')
    && a.branch_instances.some(i => sampleAsset(i,a)?.sample)
    // Cross-sample topology and blended joints still need the established graph path.
    && !a.symmetry_groups.some(g=>g.enabled) && !Object.keys(a.topology.reparent).length
    && !a.branch_instances.some(i=>i.junction?.enabled)
    && !a.manual_branches.some(b=>a.branch_instances.some(i=>b.parent.startsWith(i.id+'.')))
    && !a.branch_instances.some(i=>!sampleAsset(i,a)?.sample && a.branch_instances.some(parent=>sampleAsset(parent,a)?.sample&&i.parent.startsWith(parent.id+'.')));
}

export function compileSampleAssembly(settings, authoring, sources, lod, materials, helpers, instanced) {
  const { build, frame, lookup, analyze, dispose, deserialize, graph, overlap, allows } = helpers;
  const managed=authoring.branch_instances.filter(i=>sampleAsset(i,authoring)?.sample);
  const base = build(settings, materials, sources, lod, { ...authoring, branch_instances: authoring.branch_instances.filter(i=>!managed.includes(i)), branch_library: authoring.branch_library });
  const prototypes = new Map(), entries = [], batches = [], expanded = [], ownedSources = [], renderMaterials = new Map(), shadowMaterials = [];
  let baseBranches = base.masterBranches.slice(), baseVisible = base.branches.slice(), baseElements = base.elements.slice();
  const baseLeaves = base.placements.slice(), baseMasterLeaves = base.masterPlacements.slice(), baseOrgans = base.treeOrgans.slice();
  const baseMeshes = []; base.group.traverse(o => { if (o.isMesh) baseMeshes.push(o); });
  let baseLookup = base.lookupTexture;
  const nested = managed.some(i => managed.some(parent => i.parent.startsWith(parent.id+'.')));
  const prototypeMeshes = p => { const meshes=[];p.group.updateMatrixWorld(true);p.group.traverse(o=>{if(o.isMesh)meshes.push(o);});return meshes; };
  const sourceMap = new Map((Array.isArray(sources) ? sources : []).map(s => [s.id, s]));
  const organMap = new Map(authoring.tree_organs.units.map((u,i) => [u.id,i]));
  const editedIds = new Set(Object.keys(authoring.overrides).map(id=>id.split('.')[0]));
  for(const layer of authoring.sculpt_layers) for(const id of [...Object.keys(layer.branches),...(layer.operation?.targets||[])]) editedIds.add(id.split('.')[0]);
  for(const id of authoring.topology.suppressed) editedIds.add(id.split('.')[0]);
  const leafEdited=new Set([...authoring.leaf_edits.removed.map(id=>id.split('.')[0]),...authoring.leaf_edits.added.map(v=>v.parent.split('.')[0])]);
  const hasEdits = authoring.branch_instances.some(i => editedIds.has(i.id));
  const editedGraph = hasEdits ? graph(settings, authoring) : null;
  const matrixFor = (i,shape,byStable) => {
    return completeInstanceMatrix(i,shape,byStable.get(i.parent),settings,frame);
  };
  const byStable = new Map(baseBranches.map(b=>[b.stableId,b]));
  function prototype(i, matrix) {
    const item=sampleAsset(i,authoring),sample=item.sample;
    const custom=editedIds.has(i.id);
    const key=JSON.stringify([item.id,item.revision,custom||leafEdited.has(i.id)||authoring.foliage_masks.length||!i.linked?i.id:'']);
    if(prototypes.has(key))return prototypes.get(key);
    let shape=resolveInstanceShape(i,authoring.branch_library);
    if(custom) {
      const inverse=matrix.clone().invert(),family=editedGraph.filter(b=>b.instanceId===i.id), ids=new Map(family.map(b=>[b.id,b.stableId.slice(i.id.length+1)]));
      if(!family.length)return null;
      const scale=new THREE.Vector3().setFromMatrixScale(matrix).x;
      shape={...shape,branches:family.map(b=>({id:ids.get(b.id),parent:ids.get(b.parentId)||'',attach:b.parentT,
        points:b.points.map(p=>p.clone().applyMatrix4(inverse).toArray()),knots:b.controlPoints.map(p=>p.clone().applyMatrix4(inverse).toArray()),
        length:b.length/scale,start_radius:b.startRadius/scale,end_radius:b.endRadius/scale,radius_profile:b.radiusProfile,sections:b.sections}))};
    }
    const localSources=sample.leaf_meshes.map(s=>{
      const texture=sampleLeafMaterial(sample,authoring.branch_library,authoring.leaf_material);
      const materialName=sampleLeafMaterialName(s.id,texture,authoring.leaf_material);
      const shared=sourceMap.get(s.id);
      if(shared)return {...s,geometry:shared.geometry,sampleLeafMaterial:texture,sampleLeafMaterialName:materialName};
      const geometry=deserialize(s.geometry);ownedSources.push(geometry);return {...s,geometry,sampleLeafMaterial:texture,sampleLeafMaterialName:materialName};
    });
    const addedLeaves=authoring.leaf_edits.added.filter(v=>v.parent.startsWith(i.id+'.'));
    const globalLeafIds=new Set(addedLeaves.map(v=>v.id));
    for(const leaf of addedLeaves){const source=[...sourceMap.values()][leaf.source];if(source&&!localSources.some(s=>s.id===source.id))localSources.push(source);}
    const sampleAuthoring={...sample.authoring,branch_shape:shape,branch_library:[],branch_instances:[],
      __sampleOrganMaterial:sampleLeafMaterial(sample,authoring.branch_library,authoring.leaf_material),
      __sampleBaseMaterial:authoring.leaf_material,
      workbench:{...sample.authoring.workbench,skeleton_thickness:undefined},
      recipe:{...sample.authoring.recipe,tags:(sample.authoring.recipe?.tags||[]).filter(t=>!['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY'].includes(t))},
      tree_organs:{...sample.authoring.tree_organs,units:sample.authoring.tree_organs?.units?.length?sample.authoring.tree_organs.units:authoring.tree_organs.units.filter(u=>item.organ_source_ids.includes(u.id))}};
    // A customized shape already contains the local sculpt result.
    if(custom){sampleAuthoring.overrides=Object.fromEntries(Object.entries(authoring.overrides).filter(([id])=>id.startsWith(i.id+'.')).map(([id,value])=>[id.slice(i.id.length+1),{leaf_density:value.leaf_density}]));sampleAuthoring.sculpt_layers=[];sampleAuthoring.topology={};}
    if(leafEdited.has(i.id)){
      const localIndex=new Map(localSources.map((s,n)=>[s.id,n]));const globalSources=[...sourceMap.keys()];
      sampleAuthoring.leaf_edits={removed:[...(sample.authoring.leaf_edits?.removed||[]),...authoring.leaf_edits.removed.filter(id=>id.startsWith(i.id+'.')||globalLeafIds.has(id)).map(id=>globalLeafIds.has(id)?id:id.slice(i.id.length+1))],
        added:[...(sample.authoring.leaf_edits?.added||[]),...addedLeaves.map(v=>({...v,parent:v.parent.slice(i.id.length+1),source:localIndex.get(globalSources[v.source])??-1}))]};
    }
    if(authoring.foliage_masks.length)sampleAuthoring.__sampleWorldFilter=(point,id)=>allows(point.clone().applyMatrix4(matrix),globalLeafIds.has(id)?id:i.id+'.'+id,authoring);
    const built=build({...sample.settings,object_name:item.name},base.materials,localSources,lod,sampleAuthoring);
    const meshes=prototypeMeshes(built);
    if(!custom)for(const mesh of meshes){const branch=built.branches.find(b=>b.stableId===mesh.userData.stable_id);if(branch&&mesh.userData.category==='branch')prepareRadialGeometry(mesh.geometry,branch.points);}
    const result={key,built,meshes,item,custom,globalLeafIds,sourceMap:localSources.map(s=>sourceMap.has(s.id)?[...sourceMap.keys()].indexOf(s.id):-1),organMap:built.authoring.tree_organs.units.map(u=>organMap.get(u.id))};
    prototypes.set(key,result);return result;
  }
  function appendMetadata(entry, target) {
    const {i,p,matrix}=entry, b=p.built,scale=new THREE.Vector3().setFromMatrixScale(matrix).x;
    const rotation=new THREE.Matrix3().getNormalMatrix(matrix),branchIds=new Map(),elementIds=new Map();
    for(const local of b.masterBranches)branchIds.set(local.id,target.masterBranches.length+branchIds.size);
    for(let n=0;n<b.elements.length;n++)elementIds.set(n,target.elements.length+n);
    const parent=target.byStable.get(i.parent);
    const cacheKey=[...matrix.elements,target.masterBranches.length,target.elements.length,parent?.id,parent?.order,parent?.elementIndex,i.attach,...(branchMountAt(parent,i.attach)?.elements||[])];
    if(!nested && equalData(entry.cacheKey,cacheKey)) {
      for(const key of ['masterBranches','branches','elements','placements','masterPlacements','treeOrgans'])target[key].push(...entry.cached[key]);
      entry.cached.masterBranches.forEach(v=>target.byStable.set(v.stableId,v));
      if(parent&&entry.cached.masterBranches.length)parent.children.push(entry.cached.masterBranches[0].id);
      return;
    }
    const offsets=Object.fromEntries(['masterBranches','branches','elements','placements','masterPlacements','treeOrgans'].map(key=>[key,target[key].length]));
    const worldId=id=>p.globalLeafIds.has(id)?id:i.id+'.'+id;
    const transformBranch=local=>({...local,id:branchIds.get(local.id),stableId:i.id+'.'+local.stableId,instanceId:i.id,unitOwner:i.id,mountMatrix:branchMountAt(parent,i.attach),
      parentId:branchIds.get(local.parentId)??parent?.id??-1,parentT:local.parentId<0?i.attach:local.parentT,
      order:Math.min(3,(parent?.order??-1)+1+local.order),shootRole:i.shootRole,
      points:local.points.map(v=>v.clone().applyMatrix4(matrix)),controlPoints:local.controlPoints.map(v=>v.clone().applyMatrix4(matrix)),
      length:local.length*scale,startRadius:local.startRadius*scale*(p.custom?1:i.radius_scale),endRadius:local.endRadius*scale*(p.custom?1:i.radius_scale),parentRadius:local.parentRadius*scale*(p.custom?1:i.radius_scale),
      children:local.children.map(id=>branchIds.get(id)),elementIndex:elementIds.get(local.elementIndex)??-1,
      surfaceNormals:local.surfaceNormals?.map(v=>v.clone().applyMatrix3(rotation).normalize())||null});
    const world=b.masterBranches.map(transformBranch);target.masterBranches.push(...world);world.forEach(v=>target.byStable.set(v.stableId,v));
    if(parent&&world.length)parent.children.push(world[0].id);
    target.branches.push(...b.branches.map(transformBranch));
    target.elements.push(...b.elements.map((e,n)=>({...e,index:elementIds.get(n),id:worldId(e.id),
      parentIndex:elementIds.get(e.parentIndex)??parent?.elementIndex??-1,
      pivot:new THREE.Vector3(...e.pivot).applyMatrix4(matrix).toArray(),axis:new THREE.Vector3(...e.axis).applyMatrix3(rotation).normalize().toArray(),extent:e.extent*scale,
      order:Math.min(4,(parent?.order??-1)+1+e.order)})));
    const transformPlacement=(v,organ=false)=>({...v,stableId:worldId(v.stableId),branchId:branchIds.get(v.branchId),branchStableId:i.id+'.'+v.branchStableId,
      position:v.position.clone().applyMatrix4(matrix),direction:v.direction.clone().applyMatrix3(rotation).normalize(),
      normal:v.normal?.clone().applyMatrix3(rotation).normalize()||null,scale:v.scale*scale,
      source:organ?p.organMap[v.source]:p.sourceMap[v.source],...(organ?{sourceInstanceId:i.id,sourceAssetId:p.item.id}:{} )});
    target.placements.push(...b.placements.map(v=>transformPlacement(v)));
    target.masterPlacements.push(...b.masterPlacements.map(v=>transformPlacement(v)));
    target.treeOrgans.push(...b.treeOrgans.map(v=>transformPlacement(v,true)));
    entry.branchIds=branchIds;entry.elementIds=elementIds;
    entry.cacheKey=cacheKey;entry.cached=Object.fromEntries(Object.entries(offsets).map(([key,start])=>[key,target[key].slice(start)]));
  }
  function metadata(next) {
    const supportIds=new Set(baseBranches.map(b=>b.id));
    const target={masterBranches:baseBranches.map(b=>({...b,children:b.children.filter(id=>supportIds.has(id))})),branches:baseVisible.slice(),elements:baseElements.slice(),placements:baseLeaves.slice(),masterPlacements:baseMasterLeaves.slice(),treeOrgans:baseOrgans.slice()};
    target.byStable=new Map(target.masterBranches.map(b=>[b.stableId,b]));
    const instances=new Map(next.branch_instances.map(i=>[i.id,i]));
    const changed=new Set();
    for(const entry of entries){entry.i=instances.get(entry.i.id);const matrix=matrixFor(entry.i,entry.shape,target.byStable);if(!matrix.equals(entry.matrix))changed.add(entry);entry.matrix=matrix;appendMetadata(entry,target);}
    delete target.byStable;Object.assign(base,target);
    return changed;
  }
  try {
    for(const i of managed){
      if(i.parent&&!byStable.has(i.parent))continue;
      const shape=resolveInstanceShape(i,authoring.branch_library),matrix=matrixFor(i,shape,byStable),p=prototype(i,matrix);if(!p)continue;
      const entry={i,p,matrix,shape};entries.push(entry);
      // Resolve nested installation parents without generating duplicate meshes.
      const temp={masterBranches:baseBranches.slice(),branches:[],elements:[],placements:[],masterPlacements:[],treeOrgans:[],byStable};appendMetadata(entry,temp);
    }
    base.authoring=authoring;base.settings=settings;metadata(authoring);base.lookupTexture=lookup([],base.elements.length);
    const assemblies=new THREE.Group();assemblies.name='06_完整次枝实例';base.group.add(assemblies);
    function mappedData(mesh,entry) {
      const data={...mesh.userData};
      if(data.stable_id)data.stable_id=entry.i.id+'.'+data.stable_id;
      if(typeof data.branch_id==='number')data.branch_id=entry.branchIds.get(data.branch_id);
      if(typeof data.parent_id==='number')data.parent_id=entry.branchIds.get(data.parent_id)??byStable.get(entry.i.parent)?.id??-1;
      return data;
    }
    const proxies=new Map();
    function proxy(mesh,entry) {
      const key=entry.i.id+':'+mesh.uuid;let object=proxies.get(key);
      if(!object){object=new THREE.Mesh(mesh.geometry,mesh.material);object.parent=base.group;proxies.set(key,object);}
      object.userData=mappedData(mesh,entry);object.matrix.copy(entry.matrix).multiply(mesh.matrixWorld);object.matrixAutoUpdate=false;
      object.matrixWorld.copy(base.group.matrixWorld).multiply(object.matrix);return object;
    }
    function addBatches() {
      for(const p of prototypes.values()){
        const members=entries.filter(e=>e.p===p);
        for(const mesh of p.meshes){
          const radial=mesh.geometry.hasAttribute('sampleCenter');
          if(radial&&!renderMaterials.has(mesh.material))renderMaterials.set(mesh.material,radialMaterial(mesh.material));
          const geometry=radial?mesh.geometry.clone():mesh.geometry;
          if(radial){
            geometry.setAttribute('sampleRadius',new THREE.InstancedBufferAttribute(new Float32Array(members.map(e=>e.i.radius_scale)),1));
            const bounds=applyRadialGeometry(mesh.geometry.clone(),Math.max(1,...members.map(e=>e.i.radius_scale)));
            geometry.boundingBox=bounds.boundingBox.clone();geometry.boundingSphere=bounds.boundingSphere.clone();bounds.dispose();
          }
          const batch=new THREE.InstancedMesh(geometry,radial?renderMaterials.get(mesh.material):mesh.material,members.length);batch.name='复用_'+mesh.name;batch.userData={...mesh.userData};
          delete batch.userData.stable_id;delete batch.userData.branch_id;
          batch.castShadow=mesh.castShadow;batch.receiveShadow=mesh.receiveShadow;
          if(radial){batch.customDepthMaterial=radialMaterial(new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking}),false);batch.customDistanceMaterial=radialMaterial(new THREE.MeshDistanceMaterial(),false);shadowMaterials.push(batch.customDepthMaterial,batch.customDistanceMaterial);}
          const cast=batch.raycast.bind(batch);
          batch.raycast=(ray,hits)=>{
            if(radial){
              for(const entry of members){
                const object=proxy(mesh,entry),sphere=geometry.boundingSphere.clone().applyMatrix4(object.matrixWorld);
                if(!ray.ray.intersectsSphere(sphere))continue;
                const pickGeometry=applyRadialGeometry(mesh.geometry.clone(),entry.i.radius_scale),pick=new THREE.Mesh(pickGeometry,mesh.material);pick.matrixWorld.copy(object.matrixWorld);
                const local=[];pick.raycast(ray,local);for(const hit of local){hit.object=object;hits.push(hit);}pickGeometry.dispose();
              }
            }else{const local=[];cast(ray,local);for(const hit of local){hit.object=proxy(mesh,members[hit.instanceId]);hits.push(hit);}}
          };
          assemblies.add(batch);batches.push({batch,members,mesh});
        }
      }
      updateMatrices();
    }
    function updateMatrices(changed=null){
      const matrix=new THREE.Matrix4();
      for(const {batch,members,mesh} of batches){let dirty=false;members.forEach((entry,n)=>{if(changed&&!changed.has(entry))return;batch.setMatrixAt(n,matrix.copy(entry.matrix).multiply(mesh.matrixWorld));batch.instanceMatrix.addUpdateRange(n*16,16);dirty=true;});if(dirty){batch.instanceMatrix.needsUpdate=true;batch.computeBoundingBox();batch.computeBoundingSphere();}}
      for(const entry of entries)if(!changed||changed.has(entry))for(const mesh of entry.p.meshes)if(proxies.has(entry.i.id+':'+mesh.uuid))proxy(mesh,entry);
    }
    function vertexElements(mesh,entry=null,texture=baseLookup){
      const uv=mesh.geometry.getAttribute('uv1');
      return Array.from({length:mesh.geometry.getAttribute('position').count},(_,n)=>{const local=uv?Math.floor(uv.getY(n)*texture.height)*texture.width+Math.floor(uv.getX(n)*texture.width):0;return entry?entry.elementIds.get(local)??0:local;});
    }
    // Read-only bindings for interactive GPU deformation. Keep prototype geometry
    // and atlases shared; only export and the CPU fallback need materialization.
    base.editPreviewBindings=mesh=>{
      const record=batches.find(record=>record.batch===mesh);
      if(!record)return {lookup:base.isInstancedAssembly?baseLookup:base.lookupTexture};
      return {instances:record.members.map(entry=>({
        id:entry.i.id,
        elements:entry.p.built.elements,branches:entry.p.built.masterBranches,lookup:entry.p.built.lookupTexture,
        branchIds:entry.branchIds,stableId:record.mesh.userData.stable_id?entry.i.id+'.'+record.mesh.userData.stable_id:null,
        radius:entry.i.radius_scale,object:()=>proxy(record.mesh,entry),
      }))};
    };
    base.materialize=()=>{
      if(!base.isInstancedAssembly&&expanded.length)return;
      assemblies.clear();for(const {batch,mesh} of batches){batch.dispose();if(batch.geometry!==mesh.geometry)batch.geometry.dispose();}batches.length=0;
      const records=baseMeshes.map(mesh=>({geometry:mesh.geometry,elementIndices:vertexElements(mesh)}));
      for(const entry of entries)for(const mesh of entry.p.meshes){
        const geometry=applyRadialGeometry(mesh.geometry.clone(),entry.i.radius_scale).applyMatrix4(entry.matrix.clone().multiply(mesh.matrixWorld));
        // Preview-only attributes must not enter GLB/FBX merge or export schemas.
        geometry.deleteAttribute('sampleCenter');geometry.deleteAttribute('sampleTangent');
        const object=new THREE.Mesh(geometry,mesh.material);object.userData=mappedData(mesh,entry);object.castShadow=mesh.castShadow;object.receiveShadow=mesh.receiveShadow;
        const b=base.branches.find(b=>b.stableId===object.userData.stable_id);object.name=b?`枝段_B${String(b.id+1).padStart(3,'0')}_L${b.order}`:entry.i.id+'_'+mesh.name;
        assemblies.add(object);expanded.push(object);records.push({geometry,elementIndices:vertexElements(mesh,entry,entry.p.built.lookupTexture)});
      }
      base.lookupTexture=lookup(records,base.elements.length);base.group.userData.lookup_texture=base.lookupTexture;base.isInstancedAssembly=false;
    };
    base.isInstancedAssembly=instanced;
    if(instanced)addBatches();else base.materialize();
    base.branchMesh=id=>{for(const entry of entries)for(const mesh of entry.p.meshes)if(mesh.userData.category==='branch'&&entry.i.id+'.'+mesh.userData.stable_id===id)return proxy(mesh,entry);return null;};
    const geometryQualityCache = new WeakMap();
    function updateReport(){
      base.report=analyze(base.group,settings,geometryQualityCache);Object.assign(base.report,{flower_count:0,flower_budget_limited:false,tree_organ_count:base.treeOrgans.length,tree_organ_budget_limited:false,vegetation_count:0,vegetation_budget_limited:false,
        compiled_samples:prototypes.size,installed_samples:entries.length,instanced_preview:base.isInstancedAssembly});
      updateQuality();
      Object.assign(base.group.userData,{branch_count:base.branches.length,leaf_count:base.placements.length,hierarchy_elements:base.elements.length,lookup_texture:base.lookupTexture,pending_rebuild:false});
    }
    function updateQuality(){
      const ratio=overlap(base.placements,settings.leaf_min_spacing),limit=base.authoring.quality.max_attachment_overlap;
      base.report.attachment_overlap_ratio=ratio;base.report.attachment_overlap_limit=limit;
      base.report.warnings=base.report.warnings.filter(w=>!w.startsWith('附着物重叠率 '));
      base.report.ok=base.report.invalid_vertices===0&&base.report.degenerate_faces===0&&base.report.missing_normals===0&&base.report.missing_tangents===0&&ratio<=limit;
      if(ratio>limit)base.report.warnings.push(`附着物重叠率 ${(ratio*100).toFixed(1)}%，超过 ${(limit*100).toFixed(1)}%`);
    }
    updateReport();
    base.updateAssemblyTransforms=(nextSettings,next)=>{
      if(!equalData(skeletonThicknessState(base.authoring.workbench),skeletonThicknessState(next.workbench)))return false;
      if(!base.isInstancedAssembly||hasEdits||authoring.foliage_masks.length||!equalData(settings,nextSettings))return false;
      const strip=a=>{const {workbench,branch_instances,...rest}=a;return rest;};
      if(!equalData(strip(base.authoring),strip(next))||next.branch_instances.length!==entries.length)return false;
      for(let n=0;n<entries.length;n++){const {scale:oldScale,...old}=base.authoring.branch_instances[n],{scale:newScale,...current}=next.branch_instances[n];if(!equalData(old,current))return false;}
      const changed=metadata(next);base.authoring=next;base.settings=nextSettings;updateMatrices(changed);updateQuality();
      // Geometry, material, topology and counts did not change; no vertex scan.
      base.group.userData.pending_rebuild=false;return true;
    };
    base.updateSupportingBranches=(nextSettings,next,{beforeCommit=()=>{}}={})=>{
      if(!base.isInstancedAssembly||hasEdits||nested||!equalData(settings,nextSettings)
        ||baseLeaves.length||baseMasterLeaves.length||baseOrgans.length
        ||!canUpdateSupports(base.authoring,next,new Set(baseBranches.map(b=>b.stableId)),new Set(managed.map(i=>i.id))))return false;
      const started=performance.now();
      let stage=started;const timings={};const mark=key=>{const now=performance.now();timings[key]=now-stage;stage=now;};
      const candidate=build(nextSettings,base.materials,sources,lod,{...next,branch_instances:next.branch_instances.filter(i=>!managed.some(m=>m.id===i.id))});
      mark('build');
      const meshes=[];candidate.group.traverse(o=>{if(o.isMesh)meshes.push(o);});
      // Palette equality was checked in the document. The displayed mesh may
      // temporarily use a GPU preview wrapper until beforeCommit restores it.
      const compatible=candidate.masterBranches.length===baseBranches.length
        &&candidate.masterBranches.every((b,n)=>b.stableId===baseBranches[n].stableId&&b.id===baseBranches[n].id&&b.parentId===baseBranches[n].parentId)
        &&candidate.elements.length===baseElements.length&&candidate.elements.every((e,n)=>e.id===baseElements[n].id)
        &&!candidate.placements.length&&!candidate.masterPlacements.length&&!candidate.treeOrgans.length
        &&meshes.length===baseMeshes.length&&meshes.every((m,n)=>m.name===baseMeshes[n].name&&['branch','junction'].includes(m.userData.category));
      if(!compatible){dispose(candidate);return false;}
      mark('validate');
      // Validation precedes preview release. A rejected attempt leaves the held
      // GPU preview intact until the full replacement is ready.
      beforeCommit();
      let replaced=0;
      for(let n=0;n<meshes.length;n++){
        const old=baseMeshes[n],fresh=meshes[n];
        if(equalGeometry(old.geometry,fresh.geometry))fresh.geometry.dispose();
        else {old.geometry.dispose();old.geometry=fresh.geometry;replaced++;}
        old.userData=fresh.userData;old.position.copy(fresh.position);old.quaternion.copy(fresh.quaternion);old.scale.copy(fresh.scale);old.updateMatrix();
      }
      mark('geometry');
      baseBranches=candidate.masterBranches.slice();baseVisible=candidate.branches.slice();baseElements=candidate.elements.slice();baseLookup=candidate.lookupTexture;
      byStable.clear();baseBranches.forEach(b=>byStable.set(b.stableId,b));
      const changed=metadata(next);base.authoring=next;base.settings=nextSettings;
      mark('metadata');updateMatrices(changed);mark('matrices');updateReport();mark('report');
      base.report.support_update={updated_samples:changed.size,reused_samples:entries.length-changed.size,replaced_support_meshes:replaced,reused_support_meshes:meshes.length-replaced,ms:performance.now()-started,timings};
      return true;
    };
    base.disposeCompiledSamples=()=>{for(const {batch}of batches)batch.dispose();for(const p of prototypes.values())dispose(p.built);ownedSources.forEach(g=>g?.dispose());for(const m of [...renderMaterials.values(),...shadowMaterials])m.dispose();proxies.clear();};
    return base;
  } catch(error){for(const p of prototypes.values())dispose(p.built);ownedSources.forEach(g=>g?.dispose());dispose(base);throw error;}
}
