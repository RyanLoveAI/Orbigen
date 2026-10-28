import * as THREE from '/vendor/three/three.module.js';
import { plantRandom } from './flowering-data.js';

const num=(v,d,min,max)=>Math.min(max,Math.max(min,v!=null&&Number.isFinite(Number(v))?Number(v):d));
const vector=(v,d=[0,0,0])=>d.map((x,i)=>num(v?.[i],x,-1e4,1e4));
const curve=v=>[0,1,2,3,4].map(i=>num(v?.[i],1,0,5));
export const unitCurve=(v,t)=>{const x=Math.min(1,Math.max(0,t))*4,i=Math.min(3,Math.floor(x));return v[i]+(v[i+1]-v[i])*(x-i);};
export function normalizeUnitRule(r={}) {
  return {id:String(r.id||'RULE'),kind:r.kind==='ORGAN'?'ORGAN':'LEAF',enabled:r.enabled!==false,
    targets:[...new Set((r.targets||[]).map(String))],order_min:num(r.order_min,0,0,12),order_max:num(r.order_max,12,0,12),
    spacing:num(r.spacing,.12,.005,5),start:num(r.start,.15,0,1),end:num(r.end,.98,0,1),
    arrangement:['ALTERNATE','OPPOSITE','WHORLED'].includes(r.arrangement)?r.arrangement:'ALTERNATE',
    count:Math.round(num(r.count,3,1,8)),angle:num(r.angle,137.5,-360,360),spread:num(r.spread,55,0,180),
    droop:num(r.droop,0,-1,1),twist:num(r.twist,15,0,180),variation:num(r.variation,.12,0,.8),
    seed:Math.round(num(r.seed,32044,1,2147483646)),size:num(r.size,1,.05,10),amount:num(r.amount,1,0,1),
    habit:['AXILLARY','TERMINAL','PENDANT'].includes(r.habit)?r.habit:'AXILLARY',
    density:curve(r.density),sizes:curve(r.sizes),avoid:num(r.avoid,0,0,1),
    weights:(r.weights||[]).map(w=>({id:String(w.id),weight:num(w.weight,1,0,100)}))};
}
export function normalizeUnitEditing(raw={}) {
  return {version:1,rules:(raw.rules||[]).slice(0,128).map(normalizeUnitRule),
    removed:[...new Set((raw.removed||[]).map(String))],
    items:(raw.items||[]).slice(0,20000).filter(v=>v?.id&&v.parent).map(v=>({
      id:String(v.id),kind:v.kind==='ORGAN'?'ORGAN':'LEAF',parent:String(v.parent),t:num(v.t,.5,0,1),
      offset:vector(v.offset),direction:vector(v.direction,[0,1,0]),normal:vector(v.normal,[0,0,1]),
      twist:num(v.twist,0,-1e4,1e4),scale:num(v.scale,.1,.0001,100),source_id:String(v.source_id||''),
      source:Math.round(num(v.source,0,-1,999)),base_scale:num(v.base_scale,v.scale||.1,.0001,100),added:v.added===true,
    }))};
}
// Arc-length attachment frames use parallel transport, avoiding a sudden roll
// when a sculpted tangent crosses a world-axis threshold.
export function unitFrame(branch,t) {
  if(branch.mountMatrix){
    const matrix=branch.mountMatrix,inverse=matrix.clone().invert();
    const f=unitFrame({...branch,mountMatrix:null,points:branch.points.map(p=>p.clone().applyMatrix4(inverse))},t);
    const q=new THREE.Quaternion();matrix.decompose(new THREE.Vector3(),q,new THREE.Vector3());
    f.position.applyMatrix4(matrix);f.quaternion.premultiply(q);return f;
  }
  const pts=branch.points, lens=pts.slice(1).map((p,i)=>p.distanceTo(pts[i])),total=lens.reduce((a,b)=>a+b,0);
  let distance=Math.min(1,Math.max(0,t))*total,idx=0;
  while(idx<lens.length-1&&distance>lens[idx])distance-=lens[idx++];
  const tangents=pts.slice(1).map((p,i)=>p.clone().sub(pts[i]).normalize());
  let y=tangents[0].clone();if(y.lengthSq()<1e-8)y.set(0,0,1);
  let x=new THREE.Vector3(1,0,0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),y));
  for(let i=1;i<=idx;i++){if(tangents[i].lengthSq()<1e-8)continue;x.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(y,tangents[i]));y.copy(tangents[i]);}
  const z=new THREE.Vector3().crossVectors(x,y).normalize(),matrix=new THREE.Matrix4().makeBasis(x,y,z);
  return {position:pts[idx].clone().lerp(pts[idx+1],distance/Math.max(1e-10,lens[idx])),quaternion:new THREE.Quaternion().setFromRotationMatrix(matrix)};
}
export function nearestUnitT(branch,point) {
  let best=Infinity,result=0,along=0;const lengths=branch.points.slice(1).map((p,i)=>p.distanceTo(branch.points[i])),total=lengths.reduce((a,b)=>a+b,0);
  for(let i=0;i<lengths.length;i++){const a=branch.points[i],d=branch.points[i+1].clone().sub(a),t=THREE.MathUtils.clamp(point.clone().sub(a).dot(d)/Math.max(d.lengthSq(),1e-12),0,1),p=a.clone().addScaledVector(d,t),dist=p.distanceToSquared(point);if(dist<best){best=dist;result=(along+lengths[i]*t)/Math.max(total,1e-12);}along+=lengths[i];}return result;
}
// Saved unit anchors use arc length. Existing placement.branchT remains the
// established polyline-index parameter used by the rest of the export chain.
export function unitBranchT(branch,t){const lengths=branch.points.slice(1).map((p,i)=>p.distanceTo(branch.points[i]));let d=t*lengths.reduce((a,b)=>a+b,0),i=0;while(i<lengths.length-1&&d>lengths[i])d-=lengths[i++];return (i+d/Math.max(lengths[i],1e-12))/lengths.length;}
export function unitPoseQuaternion(p) {
  const y=p.direction.clone().normalize(),helper=Math.abs(y.z)>.9?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1);
  const x=new THREE.Vector3().crossVectors(y,p.normal||helper).normalize();if(x.lengthSq()<1e-10)x.crossVectors(y,helper).normalize();
  const z=new THREE.Vector3().crossVectors(x,y).normalize(),q=new THREE.Quaternion().setFromAxisAngle(y,p.twist||0);x.applyQuaternion(q);z.applyQuaternion(q);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
}
export function captureUnit(p,branch,sources,kind='LEAF',added=false) {
  const t=p.unitT??nearestUnitT(branch,p.position),f=unitFrame(branch,t),inverse=f.quaternion.clone().invert();
  const q=unitPoseQuaternion(p);
  return {id:p.stableId,kind,parent:branch.stableId,t,offset:p.position.clone().sub(f.position).applyQuaternion(inverse).toArray(),
    direction:new THREE.Vector3(0,1,0).applyQuaternion(q).applyQuaternion(inverse).toArray(),
    normal:new THREE.Vector3(0,0,1).applyQuaternion(q).applyQuaternion(inverse).toArray(),twist:0,scale:p.scale,
    source_id:sources[p.source]?.id||'',source:p.source,base_scale:p.scale,added};
}
export function resolveUnit(v,branch,sources) {
  const source=v.source_id?sources.findIndex(s=>s.id===v.source_id):v.source;
  if(source<0||source>=sources.length)return null;
  const f=unitFrame(branch,v.t),r=plantRandom(1,v.id),role=v.kind==='LEAF'?'LEAF':sources[source].role||'FLOWER';
  return {stableId:v.id,branchStableId:branch.stableId,branchId:branch.id,branchT:unitBranchT(branch,v.t),unitT:v.t,
    position:new THREE.Vector3(...v.offset).applyQuaternion(f.quaternion).add(f.position),direction:new THREE.Vector3(...v.direction).applyQuaternion(f.quaternion).normalize(),
    normal:new THREE.Vector3(...v.normal).applyQuaternion(f.quaternion).normalize(),twist:v.twist,scale:v.scale,source,
    attachmentType:role==='BUD'?'FLOWER':role,organRole:role,phase:r(),random:r(),priority:-1,unitEdited:true};
}
export function ruleMatches(r,b){return r.enabled&&!b.unitOwner&&!b.instanceId&&b.order>=r.order_min&&b.order<=r.order_max&&(!r.targets.length||r.targets.includes(b.stableId));}
export function unitRuleFor(rules,b,kind){return [...rules].reverse().find(r=>r.kind===kind&&ruleMatches(r,b));}
export function unitNodes(b,r){const length=b.points.slice(1).reduce((s,p,i)=>s+p.distanceTo(b.points[i]),0),count=Math.min(2000,Math.max(1,Math.floor(length/r.spacing)));return Array.from({length:count},(_,i)=>({index:i,t:length<r.spacing?.5:(i+.5)*r.spacing/Math.max(length,1e-9)})).filter(n=>n.t>=r.start&&n.t<=r.end);}
export function authorUnits(legacy,branches,editing,kind,sources,baseScale,seed=1,maxCount=20000) {
  if(!editing?.rules?.length&&!editing?.items?.length&&!editing?.removed?.length)return legacy;
  const byId=new Map(branches.map(b=>[b.stableId,b])),removed=new Set(editing.removed),frozen=new Map(editing.items.filter(v=>v.kind===kind).map(v=>[v.id,v]));
  const result=legacy.filter(p=>!removed.has(p.stableId)&&!frozen.has(p.stableId)&&(p.manualPlacement||!unitRuleFor(editing.rules,byId.get(p.branchStableId)||{},kind)));
  for(const b of branches){
    const r=unitRuleFor(editing.rules,b,kind);if(!r||!sources.length)continue;
    const leafRule=unitRuleFor(editing.rules,b,'LEAF'),lattice=kind==='ORGAN'&&r.habit==='AXILLARY'&&leafRule?leafRule:r;
    const nodes=kind==='ORGAN'&&r.habit==='TERMINAL'?[{index:0,t:r.end}]:unitNodes(b,lattice).filter(n=>n.t>=r.start&&n.t<=r.end);
    const group=kind==='ORGAN'?1:r.arrangement==='OPPOSITE'?2:r.arrangement==='WHORLED'?r.count:1;
    const occupied=[];
    nodeLoop: for(const n of nodes)for(let slot=0;slot<group;slot++){
      if(result.length>=maxCount)break nodeLoop;
      const id=`${b.stableId}:UNIT:${r.id}:${n.index}:${slot}`,random=plantRandom(r.seed,id),chance=random();
      if(frozen.has(id)||removed.has(id)||chance>Math.min(1,r.amount*unitCurve(r.density,n.t)))continue;
      const choices=sources.map((s,i)=>({s,i,w:(r.weights.find(w=>w.id===s.id)?.weight??s.weight??1)*(kind==='LEAF'&&s.ageStage==='YOUNG'?.1+.9*n.t:kind==='LEAF'&&s.ageStage==='MATURE'?1-.7*n.t:1)}));
      for(const c of choices)if(c.s.manual_only)c.w=0;
      const sum=choices.reduce((s,c)=>s+c.w,0);if(sum<=0)continue;let cursor=random()*sum,chosen=choices.at(-1);for(const c of choices){if(c.w<=0)continue;cursor-=c.w;if(cursor<=0){chosen=c;break;}}
      const f=unitFrame(b,n.t),az=THREE.MathUtils.degToRad(n.index*lattice.angle+slot*360/group),spread=THREE.MathUtils.degToRad(r.spread);
      const d=new THREE.Vector3(Math.cos(az)*Math.sin(spread),Math.cos(spread),Math.sin(az)*Math.sin(spread)).applyQuaternion(f.quaternion);
      d.z-=r.droop;if(kind==='ORGAN'&&r.habit==='PENDANT')d.z-=1;d.normalize();
      if(r.avoid>0&&occupied.some(p=>p.node!==n.index&&p.position.distanceTo(f.position)<r.avoid))continue;
      occupied.push({node:n.index,position:f.position});const role=kind==='LEAF'?'LEAF':chosen.s.role||'FLOWER';
      result.push({stableId:id,branchStableId:b.stableId,branchId:b.id,branchT:unitBranchT(b,n.t),unitT:n.t,position:f.position,direction:d,normal:null,
        twist:THREE.MathUtils.degToRad((random()*2-1)*r.twist),scale:(kind==='LEAF'?baseScale:chosen.s.size||baseScale)*r.size*unitCurve(r.sizes,n.t)*(1+(random()*2-1)*r.variation),
        source:chosen.i,attachmentType:role==='BUD'?'FLOWER':role,organRole:role,phase:random(),random:random(),priority:random(),unitGenerated:true});
    }
  }
  for(const v of frozen.values()){if(removed.has(v.id))continue;const b=byId.get(v.parent);if(!b)continue;const p=resolveUnit(v,b,sources);if(p)result.push(p);}
  if(result.length>maxCount){const kept=result.filter(p=>p.unitEdited).concat(result.filter(p=>!p.unitEdited));return Object.assign(kept.slice(0,maxCount),{unitBudgetLimited:true});}
  if(result.length>=maxCount)result.unitBudgetLimited=true;
  return result;
}
export function inspectUnits(placements,branches,editing,sourcesByKind) {
  const byId=new Map(branches.map(b=>[b.stableId,b])),issues=[];
  for(const item of editing.items){if(!byId.has(item.parent))issues.push({id:item.id,reason:'挂接枝条已不存在'});else if(item.source_id&&!sourcesByKind[item.kind].some(s=>s.id===item.source_id))issues.push({id:item.id,reason:'素材引用缺失'});}
  const cells=new Map();
  for(const p of placements){const b=byId.get(p.branchStableId);if(!b)continue;const nearest=unitFrame(b,nearestUnitT(b,p.position)).position;if(p.position.distanceTo(nearest)>Math.max(.01,b.startRadius*2))issues.push({id:p.stableId,reason:'柄根偏离枝干，请检查连接'});
    const xyz=p.position.toArray().map(v=>Math.floor(v/.01)),key=xyz.join(',');
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const q of cells.get([xyz[0]+x,xyz[1]+y,xyz[2]+z].join(','))||[]){if(p.position.distanceTo(q.position)<.008&&p.direction.dot(q.direction)>.94)issues.push({id:p.stableId,reason:'挂点与朝向近似重叠'});}
    if(!cells.has(key))cells.set(key,[]);cells.get(key).push(p);
  }return issues;
}
