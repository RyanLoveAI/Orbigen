import * as THREE from 'three';
import { surfaceNavigation } from './surface-growth-geometry.js';
import { growthRulerFaces } from './surface-growth-ruler.js';
import { surfaceBlocked } from './surface-paint.js';
import { plantRandom } from './flowering-data.js';
import { attachmentLayerMatches } from './v4-tools.js';
import { canopyField, canopySurfaceFrames } from './surface-canopy-field.js';
import { surfaceSegmentBlocked } from './surface-growth-eaves.js';
import { growthFrontier } from './surface-growth-frontier.js';

export const hasSurfaceCanopy = a => !!(a.vine && a.surface_growth?.enabled && a.surface_growth.growth_ruler?.enabled);

// Measure the actual calibrated blade, rather than enlarging it to hide a leaf budget.
export function leafBladeArea(sources, scale, aspect = 1) {
  let area = 0, weight = 0;
  for (const s of sources || []) {
    if (s.manual_only || !s.geometry) continue;
    const p = s.geometry.attributes.position, ix = s.geometry.index;
    let sum = 0;
    for (let i = 0; i < (ix?.count || p.count); i += 3) {
      const a = ix ? ix.getX(i) : i, b = ix ? ix.getX(i + 1) : i + 1, c = ix ? ix.getX(i + 2) : i + 2;
      sum += Math.abs((p.getX(b)-p.getX(a))*(p.getY(c)-p.getY(a))-(p.getY(b)-p.getY(a))*(p.getX(c)-p.getX(a))) * .5;
    }
    const w = Math.max(.001, s.weight || 1);
    area += sum * (s.calibration?.scale || 1) ** 2 * w; weight += w;
  }
  return Math.max(.00003, (weight ? area / weight : .45) * scale * scale * aspect);
}

function branchGrid(branches) {
  const cells = new Map(), size = .5, key = (x,y,z) => `${x},${y},${z}`;
  for (const b of branches) {
    if (!b.stableId.startsWith('Z_ruler_') || b.vineRole==='SURFACE_HANG' || !b.surfaceNormals) continue;
    for (let i = 1; i < b.points.length; i++) {
      const a = b.points[i-1], end = b.points[i], steps = Math.max(1, Math.ceil(a.distanceTo(end)/.075));
      for (let j = 0; j < steps; j++) {
        const t = j/steps, point = a.clone().lerp(end,t), normal = new THREE.Vector3(...b.surfaceNormals[i-1]).lerp(new THREE.Vector3(...b.surfaceNormals[i]),t).normalize();
        const k = key(Math.floor(point.x/size),Math.floor(point.y/size),Math.floor(point.z/size));
        if (!cells.has(k)) cells.set(k,[]);
        cells.get(k).push({branch:b,point,normal,t:(i-1+t)/(b.points.length-1)});
      }
    }
  }
  return (p,n,accept) => {
    const x=Math.floor(p.x/size), y=Math.floor(p.y/size), z=Math.floor(p.z/size);
    const candidates=[];
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++)for(const a of cells.get(key(x+dx,y+dy,z+dz))||[]) {
      if(a.normal.dot(n)<-.15)continue;
      const d=a.point.distanceToSquared(p);
      if(d<.5**2)candidates.push({a,d});
    }
    candidates.sort((a,b)=>a.d-b.d);
    for(const {a} of candidates.slice(0,12))if(accept(a))return a;
    return null;
  };
}

export function createSurfaceCanopy(branches, settings, authoring, sources, state, allows) {
  const stages={candidates:0,range:0,distribution:0,geometry:0,support:0,edits:0,spacing:0,output:0};
  const result=[]; result.coverageReport={area:0,requested:0,count:0,limited:false,stages};
  if(!hasSurfaceCanopy(authoring)||state.leafDensity<=0||settings.leaf_density<=0)return result;
  const s=authoring.surface_growth,r=s.growth_ruler;
  if((r.recipe_version!==2&&r.coverage<=0)||r.leaf_budget===0)return result;
  const nav=surfaceNavigation(s.mesh),blocked=surfaceBlocked(s),faces=growthRulerFaces(nav,r.bottom),nearest=branchGrid(branches),frames=canopySurfaceFrames(nav,s.flip,blocked);
  const supportTop=faces.reduce((top,id)=>Math.max(top,...nav.faces[id].ids.map(i=>nav.vertices[i].z)),-Infinity);
  const layers=authoring.attachment_layers.filter(l=>['LEAF','CUSTOM','DEAD_LEAF'].includes(l.type)&&l.enabled);
  if(!layers.length)return result;
  const removed=new Set(authoring.leaf_edits.removed);
  const area=leafBladeArea(sources,settings.leaf_scale,settings.leaf_aspect);
  // Two overlapping blade areas produce a mature mat, with coherent gaps and a feathered frontier.
  // Count follows density, not the edited blade size; enlarging a blade must not
  // silently remove other leaves to compensate for its area.
  const referenceArea=leafBladeArea(sources,.08,settings.leaf_aspect);
  const wantedDensity=Math.min(2400,2.25/referenceArea)*Math.min(100/38,settings.leaf_density/38)*state.leafDensity;
  const fullArea=faces.reduce((sum,i)=>sum+nav.faces[i].triangle.getArea(),0);
  const density=Math.min(wantedDensity*1.8,r.leaf_budget*3.5/Math.max(.001,fullArea));
  const spacing=r.leaf_spacing??settings.leaf_min_spacing,occupied=new Map();
  const available=p=>{if(spacing<=0)return true;const x=Math.floor(p.x/spacing),y=Math.floor(p.y/spacing),z=Math.floor(p.z/spacing),key=(a,b,c)=>a+','+b+','+c;
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++)if(occupied.get(key(x+dx,y+dy,z+dz))?.some(v=>v.distanceToSquared(p)<spacing*spacing))return false;
    const k=key(x,y,z);if(!occupied.has(k))occupied.set(k,[]);occupied.get(k).push(p);return true;};
  let requested=0,coveredArea=0;
  for(const face of faces){
    if(blocked.has(face))continue;
    const f=nav.faces[face],tri=f.triangle;
    if(Math.min(tri.a.z,tri.b.z,tri.c.z)>r.top||Math.max(tri.a.z,tri.b.z,tri.c.z)<r.bottom)continue;
    const faceArea=tri.getArea(),count=Math.ceil(faceArea*density*1.6),u=tri.b.clone().sub(tri.a),v=tri.c.clone().sub(tri.a);
    for(let i=0;i<count;i++){
      const id=`CANOPY_${face}_${i}`,rng=plantRandom(r.recipe_version===2?r.leaf_seed:r.seed,id);
      // Low-discrepancy points cover a large triangle evenly, independent of face ordering.
      const a=Math.sqrt((i+.5)/count),b=(i*.61803398875+rng()*.35)%1;
      const p=tri.a.clone().addScaledVector(u,a*(1-b)).addScaledVector(v,a*b);
      stages.candidates++;
      const field=canopyField(p,r,supportTop);
      if(field.mask<=0||p.z<r.bottom||p.z>field.frontier||(r.recipe_version!==2&&field.clump<Math.max(0,1-r.coverage-.1))||blocked.atPoint?.(face,p))continue;
      stages.range++;
      if(field.density<=0||rng()>field.density)continue;
      stages.distribution++;
      const frame=frames[face](p,Math.max(s.offset,.02)+.035+field.depth*(r.recipe_version===2?1:(.4+.6*field.height))*(.5+.5*rng())+(rng()-.5)*.035);
      if(!frame.corner&&rng()>1/1.6)continue;
      const n=frame.normal,position=frame.position;
      if(position.z>growthFrontier(position,r,supportTop)||position.z<r.bottom||surfaceSegmentBlocked(nav,p.clone().addScaledVector(f.normal,s.flip?-.002:.002),position,0))continue;
      stages.geometry++;
      const up=new THREE.Vector3(0,0,1).addScaledVector(n,-n.z);if(up.lengthSq()<.01)up.set(1,0,0).addScaledVector(n,-n.x);up.normalize();
      const side=new THREE.Vector3().crossVectors(n,up).normalize(),angle=(rng()-.5)*3.5;
      const direction=up.multiplyScalar(Math.cos(angle)).addScaledVector(side,Math.sin(angle)).addScaledVector(n,.15+rng()*.38).normalize();
      const tip=position.clone().addScaledVector(direction,settings.petiole_length||0);
      const anchor=nearest(p,n,a=>a.t>=authoring.foliage_range.start&&a.t<=authoring.foliage_range.end&&layers.some(l=>attachmentLayerMatches(l,a.branch,a.t,{season:settings.season,health:settings.health}))&&!surfaceSegmentBlocked(nav,a.point,position,0)&&!surfaceSegmentBlocked(nav,a.point,tip,0));if(!anchor)continue;
      // Sparse upper leaf clusters hug the actual curved supporting strand.
      if(r.recipe_version!==2&&field.height<1&&anchor.point.distanceToSquared(p)>(.12+.38*field.height)**2)continue;
      if(anchor.t<authoring.foliage_range.start||anchor.t>authoring.foliage_range.end)continue;
      const layer=layers.find(l=>attachmentLayerMatches(l,anchor.branch,anchor.t,{season:settings.season,health:settings.health}));if(!layer)continue;
      stages.support++;
      requested++;coveredArea+=1/density;
      if(rng()>Math.min(1,layer.density)||removed.has(id)||!allows(p,id))continue;
      stages.edits++;
      if(!available(position))continue;
      stages.spacing++;
      result.push({stableId:id,branchId:anchor.branch.id,branchStableId:anchor.branch.stableId,branchT:anchor.t,position,direction,normal:n,
        canopyRoot:anchor.point.clone(),canopy:true,scale:settings.leaf_scale*state.leafScale*layer.scale*(1+(rng()*2-1)*authoring.vine.leaf_size_variation),
        source:layer.source>=0?layer.source:-1,attachmentType:layer.type,layerId:layer.id,materialVariant:layer.material_variant||0,
        twist:(rng()-.5)*.35,phase:rng(),random:rng(),priority:rng()*(frame.corner?.55:1)});
    }
  }
  const uncapped=result.length;
  // Hard cap is spatially fair, never a prefix of the triangle list.
  if(result.length>r.leaf_budget){result.sort((a,b)=>a.priority-b.priority);result.length=r.leaf_budget;}
  stages.output=result.length;
  result.coverageReport={stages,samplingLimited:density<wantedDensity*1.8,budgetRemoved:uncapped-result.length,area:coveredArea,requested:Math.round(uncapped*Math.max(1,wantedDensity*1.8/density)),count:result.length,limited:uncapped*Math.max(1,wantedDensity*1.8/density)>r.leaf_budget,bladeArea:area};
  return result;
}
