import * as THREE from 'three';
import { rootedRulerField } from './surface-rooted-growth.js';
import { growthFrontier, frontierDepth } from './surface-growth-frontier.js';
const V=p=>new THREE.Vector3(...p),groupsCache=new WeakMap();
// Whole connected surfaces crossing the start level, including their corners and soffits.
export function growthRulerFaces(nav,bottom){
 let groups=groupsCache.get(nav);if(!groups){const seen=new Set();groups=[];for(let i=0;i<nav.faces.length;i++){if(seen.has(i))continue;const ids=[],pending=[i];let lo=Infinity,hi=-Infinity;while(pending.length){const f=pending.pop();if(seen.has(f))continue;seen.add(f);ids.push(f);for(const j of nav.faces[f].ids){lo=Math.min(lo,nav.vertices[j].z);hi=Math.max(hi,nav.vertices[j].z);}for(const n of nav.faces[f].neighbors)if(n>=0&&!seen.has(n))pending.push(n);}groups.push({ids,lo,hi});}groupsCache.set(nav,groups);}
 const level=Math.max(bottom,Math.min(...groups.map(g=>g.lo)));
 return groups.filter(g=>g.lo<=level+.03&&g.hi>=level).flatMap(g=>g.ids);
}
// Clip a polyline to the controller's height range without scaling its width or points.
// A path may cross a height plane more than once, so keep separate connected runs.
export function clipGrowthPath(branch,bottom,top){
 const runs=[];let current=null;
 for(let i=1;i<branch.points.length;i++){
  const a=V(branch.points[i-1]),b=V(branch.points[i]),dz=b.z-a.z;let lo=0,hi=1;
  if(Math.abs(dz)<1e-10){if(a.z<bottom||a.z>top){current=null;continue;}}
  else {const x=(bottom-a.z)/dz,y=(top-a.z)/dz;lo=Math.max(0,Math.min(x,y));hi=Math.min(1,Math.max(x,y));if(hi-lo<1e-9){current=null;continue;}}
  const p=a.clone().lerp(b,lo),q=a.clone().lerp(b,hi),na=V(branch.surfaceNormals[i-1]),nb=V(branch.surfaceNormals[i]),pn=na.clone().lerp(nb,lo).normalize(),qn=na.clone().lerp(nb,hi).normalize();
  if(!current||V(current.points.at(-1)).distanceToSquared(p)>1e-10){current={points:[p.toArray()],normals:[pn.toArray()],start:(i-1)+lo};runs.push(current);}
  if(p.distanceToSquared(q)>1e-10){current.points.push(q.toArray());current.normals.push(qn.toArray());}
  if(hi<1-1e-9)current=null;
 }
 return runs.filter(r=>r.points.length>1).map(r=>{let length=0;for(let i=1;i<r.points.length;i++)length+=V(r.points[i]).distanceTo(V(r.points[i-1]));return {...r,length};}).filter(r=>r.length>.025);
}
export function createRulerGrowth(nav,surface,vine,walk){
 const r=surface.growth_ruler;if(!r?.enabled||(r.recipe_version===2?r.main_density:r.coverage)===0)return {branches:[],limited:false};
 const faces=growthRulerFaces(nav,r.bottom);if(!faces.length)return {branches:[],limited:false};
 const full=rootedRulerField(nav,surface,vine,walk,faces),branches=[],runsById=new Map();
 const supportTop=faces.reduce((top,id)=>Math.max(top,...nav.faces[id].ids.map(i=>nav.vertices[i].z)),-Infinity);
 for(const source of full.branches){
  const runs=clipGrowthPath(source,r.bottom,r.top).filter(run=>!source.parent||run.start<1e-8).slice(0,1).map(run=>clipFrontierRun(run,r,supportTop)).filter(Boolean),made=[];
  for(let i=0;i<runs.length;i++){
   const run=runs[i];let parent='',attach=0;
   // A lateral keeps its parent only when that original junction remains visible.
   if(source.parent&&run.start<1e-8){let best=Infinity;for(const p of runsById.get(source.parent)||[]){let arc=0;for(let j=1;j<p.points.length;j++){const a=V(p.points[j-1]),b=V(p.points[j]),line=new THREE.Line3(a,b),t=line.closestPointToPointParameter(V(run.points[0]),true),d=line.at(t,new THREE.Vector3()).distanceTo(V(run.points[0]));if(d<best&&d<1e-6){best=d;parent=p.id;attach=(arc+a.distanceTo(b)*t)/p.length;}arc+=a.distanceTo(b);}}}
   if(source.parent&&!parent)continue;
   const b={...source,id:i?`${source.id}.C${i}`:source.id,parent,attach,points:run.points,knots:run.points,surfaceNormals:run.normals,length:run.length};delete b.surfaceFaces;branches.push(b);made.push(b);
  }
  runsById.set(source.id,made);
 }
 return {branches,limited:full.limited,planned:full.actual};
}

// Cut where the actual route crosses the shared envelope, not at one height per vine.
function clipFrontierRun(run,r,supportTop){
 const amount=frontierDepth(r,supportTop);if(!amount)return run;
 const inside=p=>p.z<=growthFrontier(p,r,supportTop)+1e-9;
 if(!inside(V(run.points[0])))return null;
 const points=[run.points[0]],normals=[run.normals[0]];let length=0;
 for(let i=1;i<run.points.length;i++){
  const a=V(run.points[i-1]),b=V(run.points[i]),distance=a.distanceTo(b);
  const steps=Math.max(a.z,b.z)<r.top-amount?1:Math.max(1,Math.ceil(distance/Math.min(.04,(r.frontier_span??1.6)/32)));
  for(let j=1;j<=steps;j++)if(!inside(a.clone().lerp(b,j/steps))){
   let lo=(j-1)/steps,hi=j/steps;for(let k=0;k<22;k++){const mid=(lo+hi)/2;if(inside(a.clone().lerp(b,mid)))lo=mid;else hi=mid;}
   const end=a.clone().lerp(b,lo);length+=a.distanceTo(end);points.push(end.toArray());normals.push(V(run.normals[i-1]).lerp(V(run.normals[i]),lo).normalize().toArray());
   return length>.025?{...run,points,normals,length}:null;
  }
  points.push(run.points[i]);normals.push(run.normals[i]);length+=distance;
 }
 return {...run,points,normals,length};
}

