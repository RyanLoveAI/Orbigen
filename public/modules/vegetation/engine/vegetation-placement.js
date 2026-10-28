import * as THREE from 'three';
import { plantRandom } from './flowering-data.js';
import { surfaceNavigation } from './surface-growth-geometry.js';
import { paintField, paintCells } from './surface-paint.js';

export function vegetationPlacements(config, surface) {
  if (!config.enabled) return [];
  if (config.mode === 'SINGLE') return [{ id:'VP_SINGLE', kind:config.kind, point:[0,0,0], normal:[0,0,1], scale:1, angle:0, priority:0, face:-1 }];
  if (!surface?.enabled) return [];
  const weights = Object.entries(config.weights).filter(([k,v])=>k!=='IVY'&&v>0), sum = weights.reduce((a,[,v])=>a+v,0); if (!sum) return [];
  const nav=surfaceNavigation(surface.mesh), blocked=new Set(surface.block_strokes?.length?[]:surface.blocked), allowed=surface.region.enabled?surface.region.faces.filter(f=>!blocked.has(f)):[], legacyField=paintField(surface.region,surface.blocked,surface.block_strokes);
  const area=allowed.reduce((a,f)=>a+nav.faces[f].triangle.getArea(),0), density=Math.min(config.density,8000/Math.max(.0001,area)), candidates=[];
  const min=Math.min(config.slope_min,config.slope_max),max=Math.max(config.slope_min,config.slope_max);
  for(const face of allowed) {
    const f=nav.faces[face],normal=f.normal.clone().multiplyScalar(surface.flip?-1:1),slope=THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(normal.z,-1,1)));
    if(slope<min||slope>max)continue;
    const expected=f.triangle.getArea()*density,count=Math.floor(expected)+(plantRandom(config.seed,`face:${face}`)()<expected%1?1:0);
    for(let i=0;i<count;i++) {
      const id=`VP_${face}_${i}`,rng=plantRandom(config.seed,id),u=Math.sqrt(rng()),v=rng(),point=f.triangle.a.clone().multiplyScalar(1-u).addScaledVector(f.triangle.b,u*(1-v)).addScaledVector(f.triangle.c,u*v);
      if(legacyField.weight(face,point)<=plantRandom(config.seed,id+':mask')())continue;
      let pick=rng()*sum,kind=weights.at(-1)[0];for(const [k,w]of weights){pick-=w;if(pick<=0){kind=k;break;}}
      const variation=config.species[kind].variation;
      candidates.push({id,kind,point:point.addScaledVector(normal,surface.offset).toArray(),normal:normal.toArray(),scale:1+(rng()*2-1)*variation,angle:rng()*Math.PI*2,priority:rng(),face});
    }
  }
  // New precise regions share the same brush mask as ivy. Legacy roots keep their IDs.
  for(const zone of [surface.region,...(surface.regions||[])]) {
    if(!zone.enabled||!zone.strokes?.length)continue;
    const oldFaces=new Set(zone.faces), extra={...zone,faces:[],strokes:zone.strokes.map(s=>({...s,samples:s.samples.map(p=>({...p,faces:p.faces.filter(f=>!oldFaces.has(f))}))}))};
    const field=paintField(extra,surface.blocked,surface.block_strokes),step=Math.max(.08,Math.min(.3,1/Math.sqrt(config.density))),cells=paintCells(nav,field,step,8000).cells;
    for(const c of cells){
      const id=`VP_Z_${zone.id}_${c.id}`,rng=plantRandom(config.seed,id),normal=nav.faces[c.face].normal.clone().multiplyScalar(surface.flip?-1:1),slope=THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(normal.z,-1,1)));
      const fade=zone.fade>0?field.edgeDistance(c.face,c.point,zone.fade)/zone.fade:1;
      if(slope<min||slope>max||rng()>Math.min(1,config.density*step*step)*c.weight*zone.coverage*fade)continue;
      let pick=rng()*sum,kind=weights.at(-1)[0];for(const[k,w]of weights){pick-=w;if(pick<=0){kind=k;break;}}
      const variation=config.species[kind].variation;
      candidates.push({id,kind,point:c.point.clone().addScaledVector(normal,surface.offset).toArray(),normal:normal.toArray(),scale:1+(rng()*2-1)*variation,angle:rng()*Math.PI*2,priority:rng(),face:c.face});
    }
  }
  candidates.sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));
  const placements=[];
  for(const p of candidates){const radius=Math.max(config.spacing,config.species[p.kind].width*p.scale*.22);if(placements.some(q=>new THREE.Vector3(...p.point).distanceTo(new THREE.Vector3(...q.point))<Math.max(radius,Math.max(config.spacing,config.species[q.kind].width*q.scale*.22))))continue;placements.push(p);if(placements.length>=config.max_count)break;}
  return placements;
}
