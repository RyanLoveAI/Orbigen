import { curveSurfaceRoute } from './surface-route-curves.js';
import { vineTraits, forkTraits, walkSideShoot, spreadForks } from './surface-growth-rhythm.js';
import { hangingPoints } from './surface-growth-eaves.js';
import * as THREE from '/vendor/three/three.module.js';
import { plantRandom } from './flowering-data.js';
import { surfaceRoute } from './surface-growth-geometry.js';
import { surfaceBlocked } from './surface-paint.js';
const V=p=>new THREE.Vector3(...p),cache=new WeakMap();

function section(nav,faces,z){
 const segments=[];
 for(const face of faces){const f=nav.faces[face],pts=[];for(let i=0;i<3;i++){const a=nav.vertices[f.ids[i]],b=nav.vertices[f.ids[(i+1)%3]];if(Math.abs(b.z-a.z)<1e-9)continue;const t=(z-a.z)/(b.z-a.z);if(t>=0&&t<=1){const p=a.clone().lerp(b,t);if(!pts.some(q=>q.distanceToSquared(p)<1e-12))pts.push(p);}}if(pts.length===2&&pts[0].distanceTo(pts[1])>.01)segments.push({face,a:pts[0],b:pts[1]});}
 return segments;
}
// Each portal remains on the original shared edge; smoothing never cuts through the pier.
function relaxRoute(nav,path){
 const points=path.map(p=>({...p,point:[...p.point]}));
 for(let pass=0;pass<12;pass++)for(let i=1;i<points.length-1;i++){
  const p=points[i];if(p.nextFace===undefined)continue;const f=nav.faces[p.face],edge=f.neighbors.indexOf(p.nextFace);if(edge<0)continue;
  const a=nav.vertices[f.ids[edge]],b=nav.vertices[f.ids[(edge+1)%3]],prev=V(points[i-1].point),next=V(points[i+1].point);let lo=.00001,hi=.99999;
  const cost=t=>{const p=a.clone().lerp(b,t);return p.distanceTo(prev)+p.distanceTo(next);};
  for(let j=0;j<18;j++){const u=lo+(hi-lo)/3,v=hi-(hi-lo)/3;if(cost(u)<cost(v))hi=v;else lo=u;}
  p.point=a.clone().lerp(b,(lo+hi)/2).toArray();
 }
 const dense=[points[0]];
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],length=V(a.point).distanceTo(V(b.point)),count=Math.ceil(length/.12);for(let j=1;j<count;j++)dense.push({face:a.nextFace??a.face,point:V(a.point).lerp(V(b.point),j/count).toArray()});dense.push(b);}
 return dense;
}
function makeBranch(nav,surface,samples,id,parent,radius,offset){
 const blocked=surfaceBlocked(surface),points=[],normals=[],kept=[];let length=0;
 for(const s of samples){if(blocked.has(s.face)||blocked.atPoint?.(s.face,V(s.point)))break;
  const n=nav.faces[s.face].normal.clone().multiplyScalar(surface.flip?-1:1),normal=n.clone();if(s.nextFace!==undefined)normal.addScaledVector(nav.faces[s.nextFace].normal,surface.flip?-1:1).normalize();
  const point=V(s.point).addScaledVector(normal,offset/Math.max(.25,n.dot(normal)));
  if(points.length){const d=point.distanceTo(V(points.at(-1)));if(d<1e-6)continue;length+=d;}
  points.push(point.toArray());normals.push(normal.toArray());kept.push(s);
 }
 if(length<.08)return null;
 return {id,parent,attach:0,points,knots:points,length,start_radius:radius,end_radius:Math.min(radius*.8,Math.max(.00035,radius*.22)),role:'SURFACE_AREA',surfaceNormals:normals,samples:kept};
}
function junction(child,parent,index){
 // The first sample shares its parent's original surface point and normal offset.
 const delta=V(parent.points[index]).sub(V(child.points[0]));child.points=child.points.map(p=>V(p).add(delta).toArray());child.knots=child.points;
 let arc=0;for(let i=1;i<=index;i++)arc+=V(parent.points[i]).distanceTo(V(parent.points[i-1]));child.attach=arc/parent.length;
}
export function rootedRulerField(nav,surface,vine,walk,faces){
 const raw=surface.growth_ruler,r=raw.recipe_version===2?{...raw,seed:raw.stem_seed}:raw,mainDensity=r.recipe_version===2?r.main_density:r.coverage,sideDensity=r.recipe_version===2?r.side_density:r.coverage,key=JSON.stringify([r.bottom,mainDensity,sideDensity,r.budget,r.seed,r.stem_wander,r.stem_span,faces,surface.blocked,surface.block_strokes,surface.flip,surface.offset,vine.stem,surface.auto_hang,surface.hang_length,surface.hang_reach,surface.hang_variation]);
 let saved=cache.get(nav);if(!saved){saved=new Map();cache.set(nav,saved);}if(saved.has(key))return saved.get(key);
 const blocked=surfaceBlocked(surface),bounds=new THREE.Box3();for(const f of faces)for(const i of nav.faces[f].ids)bounds.expandByPoint(nav.vertices[i]);
 const height=bounds.max.z-r.bottom;if(height<.1)return {branches:[],limited:false};
 const rootLevel=Math.max(bounds.min.z+.025,r.bottom),segments=section(nav,faces,rootLevel),roots=[],spacing=.24/Math.max(.15,mainDensity);
 for(const segment of segments){const length=segment.a.distanceTo(segment.b),count=Math.max(1,Math.ceil(length/spacing));for(let i=0;i<count;i++){const point=segment.a.clone().lerp(segment.b,(i+.5)/count),id=`Z_ruler_R${segment.face}_${i}`;if(blocked.has(segment.face)||blocked.atPoint?.(segment.face,point))continue;roots.push({id,face:segment.face,point:point.toArray(),priority:plantRandom(r.seed,id)()});}}
 roots.sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));const selected=[];for(const root of roots){if(selected.some(p=>V(p.point).distanceTo(V(root.point))<spacing*.7))continue;selected.push(root);if(selected.length>=Math.min(64,Math.max(2,Math.floor(r.budget/8))))break;}
 const targetLevel=bounds.max.z-Math.min(.12,height*.03),targets=section(nav,faces,targetLevel);
 for(const face of faces){const f=nav.faces[face];if(f.normal.z<-.25&&f.center.z>r.bottom+height*.9)targets.push({face,a:f.triangle.a.clone().lerp(f.center,.35),b:f.triangle.b.clone().lerp(f.center,.35),ceiling:true});}
 const center=bounds.getCenter(new THREE.Vector3()),radius=Math.max(vine.stem||.004,.001)*1.8,offset=Math.max(surface.offset,radius*2.2),mains=[];
 for(const root of selected){
  const radial=V(root.point).sub(center).setZ(0).normalize();
  const ranked=targets.map(t=>{const p=t.a.clone().lerp(t.b,.2+plantRandom(r.seed,root.id+':'+t.face)()*.6),direction=p.clone().sub(center).setZ(0).normalize();return {face:t.face,point:p.toArray(),score:1-direction.dot(radial)+V(root.point).distanceTo(p)*.015-(t.ceiling?.75:0)};}).sort((a,b)=>a.score-b.score);
  let path=[];for(const target of ranked.slice(0,8)){path=surfaceRoute(nav,root,target,blocked);if(path.length>1)break;}if(path.length<2)continue;
  const habit=vineTraits(r.seed,root.id);
  const main=makeBranch(nav,surface,curveSurfaceRoute(nav,relaxRoute(nav,path),r.seed,root.id,r.stem_wander,r.stem_span,walk,blocked),root.id,'',radius*habit.radius,offset);if(main){mains.push(main);}
 }
 const branches=[...mains],forks=[];
 for(const main of sideDensity>0?mains:[]){
  let distance=0,last=0,index=0;
  const habit=vineTraits(r.seed,main.id),baseGap=.35/Math.max(.2,sideDensity)*habit.spacing;
  let nextGap=baseGap*forkTraits(r.seed,main.id,0,0).gap;
  for(let i=1;i<main.samples.length-1;i++){
   distance+=V(main.points[i]).distanceTo(V(main.points[i-1]));const sample=main.samples[i];
   if(distance-last<nextGap||sample.nextFace!==undefined)continue;
   last=distance;index++;
   const traits=forkTraits(r.seed,main.id,index,distance/main.length);nextGap=baseGap*traits.gap;
   forks.push({main,i,index,distance,traits,priority:plantRandom(r.seed,main.id+':fork:'+index)()});
  }
 }
 // Reserve room for a real second generation of side shoots and for hanging stems.
 const hangReserve=surface.auto_hang?Math.min(mains.length,Math.floor(r.budget*.1)):0;
 const sideCapacity=Math.max(0,r.budget-mains.length-hangReserve),laterals=[];
 for(const{main,i,index,distance,traits}of spreadForks(forks,Math.floor(sideCapacity*.6))){
  const s=main.samples[i],tangent=V(main.samples[i+1].point).sub(V(main.samples[i-1].point)).normalize(),length=traits.length;
  const base=walkSideShoot(nav,s,tangent,traits,length,walk,blocked);
  const samples=curveSurfaceRoute(nav,base,r.seed,`${main.id}.B${index}`,r.stem_wander*.38*traits.bend,Math.min(r.stem_span,length*.8),walk,blocked);
  const localRadius=main.start_radius*(1-.78*distance/main.length);
  const child=makeBranch(nav,surface,samples,`${main.id}.B${index}`,main.id,Math.min(main.start_radius*.55,Math.max(.0005,localRadius*traits.radius)),offset);
  if(!child)continue;junction(child,main,i);branches.push(child);laterals.push(child);
 }
 const twigs=[];
 for(const main of laterals){
  let distance=0,index=0,last=0;
  for(let i=1;i<main.samples.length-1;i++){
   distance+=V(main.points[i]).distanceTo(V(main.points[i-1]));
   if(distance<main.length*.22||distance>main.length*.82||distance-last<.23||main.samples[i].nextFace!==undefined)continue;
   last=distance;index++;
   const traits=forkTraits(r.seed,main.id,index,distance/main.length);
   traits.length=Math.min(main.length*.55,.24+traits.length*.3);traits.lean*=.7;
   twigs.push({main,i,index,distance,traits});
  }
 }
 for(const{main,i,index,distance,traits}of spreadForks(twigs,Math.max(0,r.budget-hangReserve-branches.length))){
  const tangent=V(main.samples[i+1].point).sub(V(main.samples[i-1].point)).normalize();
  const samples=walkSideShoot(nav,main.samples[i],tangent,traits,traits.length,walk,blocked);
  const child=makeBranch(nav,surface,samples,`${main.id}.T${index}`,main.id,Math.min(main.start_radius*.5,Math.max(.0002,main.start_radius*(1-.78*distance/main.length)*.5)),offset);
  if(!child)continue;junction(child,main,i);branches.push(child);
 }
 if(surface.auto_hang){
  const starts=[];
  for(const main of mains){
   // Only leave actual downward-facing support at the cap, never the column wall.
   if(branches.length>=r.budget)break;
   let lastAttempt=null;
   for(let i=1;i<main.points.length;i++){
    if(main.points[i][2]<=bounds.min.z+(bounds.max.z-bounds.min.z)*.7||nav.faces[main.samples[i].face].normal.z>=-.3||main.samples[i].nextFace!==undefined)continue;
    const origin=V(main.points[i]);if(lastAttempt&&lastAttempt.distanceTo(origin)<.06)continue;lastAttempt=origin;
    if(starts.some(p=>p.distanceTo(origin)<.35))continue;
    const outward=origin.clone().sub(center).setZ(0).normalize(),rng=plantRandom(r.seed,main.id+':hang');
    const points=hangingPoints(nav,origin,outward,surface,rng,radius*.35);if(points.length<4)continue;
    let length=0;for(let j=1;j<points.length;j++)length+=points[j].distanceTo(points[j-1]);if(length<.15)continue;
    const branch={id:main.id+'.H',parent:main.id,attach:0,points:points.map(p=>p.toArray()),length,start_radius:radius*.35,end_radius:.0004,role:'SURFACE_HANG',surfaceNormals:points.map(()=>outward.toArray())};
    junction(branch,main,i);branches.push(branch);starts.push(origin);break;
   }
  }
 }
 // Remove navigation-only samples before caching records used by the normal model builder.
 for(const b of branches)delete b.samples;
 const result={branches,limited:forks.length+twigs.length+mains.length+hangReserve>r.budget,planned:branches.length};saved.set(key,result);if(saved.size>6)saved.delete(saved.keys().next().value);return result;
}
