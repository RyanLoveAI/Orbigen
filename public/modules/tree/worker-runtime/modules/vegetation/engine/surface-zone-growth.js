import * as THREE from '/vendor/three/three.module.js';
import { plantRandom } from './flowering-data.js';
import { paintField, paintCells, surfaceBlocked } from './surface-paint.js';
import { hangingPoints, surfaceSegmentBlocked } from './surface-growth-eaves.js';
const V=p=>new THREE.Vector3(...p), caches=new WeakMap();
export function zoneGrowth(nav,surface,zone,vine,walk) {
  let cache=caches.get(nav);if(!cache){cache=new Map();caches.set(nav,cache);}
  const {name,locked,overlay,enabled,...config}=zone;
  const key=JSON.stringify([config,surface.blocked,surface.block_strokes,surface.flip,surface.offset,surface.hang_length,surface.hang_reach,surface.hang_variation,vine.leaf_size]);
  if(cache.has(key))return cache.get(key);
  const field=paintField(zone,surface.blocked,surface.block_strokes),step=Math.max(.04,Math.min(.18,vine.leaf_size||.08));
  const sampled=paintCells(nav,field,step,80000), candidates=sampled.cells.map(c=>({...c,priority:plantRandom(zone.seed,c.id+':priority')()})).sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));
  const branches=[], forbidden=surfaceBlocked(surface),sign=surface.flip?-1:1, offset=Math.max(surface.offset,zone.radius*2.5);
  let wanted=0;
  const occupied=new Map(),spacing=Math.max(step,zone.clump*.3);
  function reserve(p){const c=p.clone().divideScalar(spacing).floor();for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){const points=occupied.get(`${c.x+x},${c.y+y},${c.z+z}`);if(points?.some(q=>q.distanceToSquared(p)<spacing*spacing))return false;}const k=c.toArray().join(',');if(!occupied.has(k))occupied.set(k,[]);occupied.get(k).push(p);return true;}
  function make(id,parent,attach,samples,radius) {
    const points=[],normals=[],faces=[];
    for(const s of samples){const raw=V(s.point);if(field.weight(s.face,raw)<.04)break;const normal=nav.faces[s.face].normal.clone().multiplyScalar(sign);if(s.nextFace!==undefined)normal.addScaledVector(nav.faces[s.nextFace].normal,sign).normalize();
      const faceNormal=nav.faces[s.face].normal.clone().multiplyScalar(sign),clearance=offset/Math.max(.25,normal.dot(faceNormal));
      const t=points.length/Math.max(1,samples.length-1),height=zone.height*(zone.style==='MOUND'?Math.sin(Math.PI*t):.2)*Math.min(1,points.length/3);
      const base=raw.clone().addScaledVector(normal,clearance),p=base.clone().addScaledVector(normal,parent?0:height);
      if(points.length&&surfaceSegmentBlocked(nav,V(points.at(-1)),p,radius))break;
      if(points.length&&p.distanceToSquared(V(points.at(-1)))<1e-10)continue;points.push(p.toArray());normals.push(normal.toArray());faces.push(s.face);
    }
    if(points.length<2)return null;let length=0;for(let i=1;i<points.length;i++)length+=V(points[i]).distanceTo(V(points[i-1]));if(length<.025)return null;
    const b={id,parent,attach,points,knots:points,length,start_radius:radius,end_radius:Math.max(.00035,radius*.18),role:'SURFACE_AREA',surfaceNormals:normals,surfaceFaces:faces};
    branches.push(b);return b;
  }
  for(const c of candidates){const rng=plantRandom(zone.seed,c.id);const fade=zone.fade>0?field.edgeDistance(c.face,c.point,zone.fade)/zone.fade:1;if(rng()>zone.coverage*c.weight*fade||!reserve(c.point))continue;wanted++;
    if(branches.length>=zone.budget)continue;
    const face=nav.faces[c.face],up=new THREE.Vector3(0,0,1).addScaledVector(face.normal,-face.normal.z);if(up.lengthSq()<1e-8)up.copy(face.triangle.b).sub(face.triangle.a);up.normalize();
    const random=face.triangle.b.clone().sub(face.triangle.a).normalize().applyAxisAngle(face.normal,rng()*Math.PI*2),direction=random.lerp(up,zone.growth==='CLIMB'?zone.up:zone.growth==='HANG'?.1:.35).normalize();
    const length=zone.growth==='COVER'?Math.min(zone.length,zone.clump*(.8+rng()*.6)):zone.length*(.75+rng()*.25),anchor={face:c.face,point:c.point.toArray()},id=`Z_${zone.id}_${c.id}`;
    const samples=walk(nav,anchor,direction,length,forbidden,zone.growth==='HANG'?{...surface,auto_hang:true}:null);
    const main=make(id,'',0,samples,zone.radius);if(!main)continue;
    if(samples.departure&&main.points.length===samples.length&&(zone.growth==='HANG'||rng()<zone.hang)){
      const tail=hangingPoints(nav,V(main.points.at(-1)),samples.departure,{...surface,hang_length:zone.length},rng,zone.radius);for(const p of tail.slice(1)){main.length+=p.distanceTo(V(main.points.at(-1)));main.points.push(p.toArray());main.surfaceNormals.push(samples.departure.toArray());main.surfaceFaces.push(-1);}}
    let distance=0,lastFork=0;
    for(let i=1;i<Math.min(samples.length,main.points.length)-1&&branches.length<zone.budget;i++){
      distance+=V(samples[i].point).distanceTo(V(samples[i-1].point));if(zone.density<=0||zone.spread<=0||distance-lastFork<1/zone.density||samples[i].nextFace!==undefined)continue;
      lastFork=distance;const normal=nav.faces[samples[i].face].normal,tangent=V(samples[i+1].point).sub(V(samples[i-1].point)).normalize();
      const side=new THREE.Vector3().crossVectors(normal,tangent).multiplyScalar(i%2?1:-1).addScaledVector(tangent,.6).normalize();
      const child=make(`${id}.B${i}`,id,distance/main.length,walk(nav,samples[i],side,zone.spread,forbidden),zone.radius*.55);
      if(child){const root=V(main.points[i]),delta=root.clone().sub(V(child.points[0]));child.points=child.points.map(p=>V(p).add(delta).toArray());child.knots=child.points;}
    }
  }
  const result={branches,wanted,actual:branches.length,limited:branches.length>=zone.budget||sampled.saturated,sampled:sampled.cells.length,area:sampled.cells.reduce((a,c)=>a+c.weight*step*step,0)};
  cache.set(key,result);if(cache.size>16)cache.delete(cache.keys().next().value);return result;
}
