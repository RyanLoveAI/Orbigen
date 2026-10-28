import { nearestParameter } from './tree-sculpt.js';

export function radiusFactorAt(branch, t) {
  return (branch.radiusEdits || []).reduce((factor, edit) => {
    const w = edit.start < 0 ? 1 : Math.max(0, Math.min(1, (t-edit.start)/edit.span));
    return factor * (1+(edit.factor-1)*w*w*(3-2*w));
  }, 1);
}

// Evaluate the handle against the curve at this layer, so a later G does not
// relocate an earlier thickness edit. Never enter an installed sample subtree.
export function evaluateBranchRadius(branches, operation, strength = 1) {
  const factor = 1+(operation.factor-1)*strength;
  if (Math.abs(factor-1)<1e-12) return branches;
  const byId = new Map(branches.map(b=>[b.id,b])), targets = new Set(operation.targets);
  const excluded = new Set(operation.excluded || []), edits = new Map(), visiting = new Set();
  const root = operation.point>0 ? branches.find(b=>b.stableId===operation.targets[0]) : null;
  if (operation.point>0 && (!root || operation.point>=root.controlPoints.length-1)) return branches;
  const start = root ? nearestParameter(root.points,root.controlPoints[operation.point]) : -1;
  const span = root ? Math.max(1e-8,Math.min(1-start, Math.max(.025,3/(root.points.length-1)))) : 1;
  function editFor(b) {
    if(edits.has(b.id))return edits.get(b.id);
    if(visiting.has(b.id))return null;
    visiting.add(b.id);
    const parent=byId.get(b.parentId), inherited=parent ? editFor(parent) : null;
    let edit=null;
    if (!b.unitOwner && !b.instanceId && !excluded.has(b.stableId)
      && (!parent || !parent.unitOwner && !parent.instanceId)
      && (!parent || !edits.get(parent.id)?.owned)) {
      if(targets.has(b.stableId))edit={start:b===root?start:-1,span,factor};
      else if(inherited && !inherited.owned) {
        const value=radiusFactorAt({radiusEdits:[inherited]},b.parentT);
        if(Math.abs(value-1)>1e-12)edit={start:-1,span:1,factor:value};
      }
    }
    if(b.unitOwner||b.instanceId||inherited?.owned)edit={owned:true};
    edits.set(b.id,edit);visiting.delete(b.id);return edit;
  }
  return branches.map(b=>{const edit=editFor(b);return edit&&!edit.owned?{...b,radiusEdits:[...(b.radiusEdits||[]),edit]}:b;});
}

// Tube rings retain their actual centers, including adaptive tessellation.
// Only woody vertices move; leaf/fruit meshes and instance matrices stay intact.
export function createRadiusPreview(asset) {
  const records=[];
  asset.group.traverse(mesh=>{
    const rings=mesh.geometry?.userData.radiusRings;
    if(!['branch','junction','marker'].includes(mesh.userData.category)||!rings)return;
    records.push({mesh,rings,original:mesh.geometry,preview:null});
  });
  const baseline=new Map(asset.masterBranches.map(b=>[b.stableId,b]));
  function restore() {for(const r of records)if(r.preview){r.mesh.geometry=r.original;r.preview.dispose();r.preview=null;}}
  return {restore,update(branches) {
    const updated=new Map(branches.map(b=>[b.stableId,b]));
    for(const r of records) {
      const id=r.mesh.userData.stable_id || r.mesh.userData.branch_id,b=baseline.get(id),after=updated.get(b?.symmetrySource || id);
      if(!b||!after||after.radiusEdits===b.radiusEdits){
        if(r.preview){r.mesh.geometry=r.original;r.preview.dispose();r.preview=null;}
        continue;
      }
      if(!r.preview){r.preview=r.original.clone();r.mesh.geometry=r.preview;}
      const source=r.original.getAttribute('position'),p=r.preview.getAttribute('position');
      for(const {t,center,offset,count} of r.rings){
        const factor=radiusFactorAt(after,t)/radiusFactorAt(b,t);
        for(let i=offset;i<offset+count;i++)p.setXYZ(i,...center.map((v,k)=>v+(source.array[i*3+k]-v)*factor));
      }
      p.needsUpdate=true;r.preview.computeVertexNormals();r.preview.computeBoundingBox();r.preview.computeBoundingSphere();
    }
  }};
}
