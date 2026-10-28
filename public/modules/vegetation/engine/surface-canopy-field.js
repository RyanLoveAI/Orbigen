import * as THREE from 'three';
import { heightDensity } from './surface-height-density.js';
import { growthFrontier } from './surface-growth-frontier.js';

const smooth = t => t*t*(3-2*t);
function noise(x,y,z,seed) {
  const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),tx=smooth(x-ix),ty=smooth(y-iy),tz=smooth(z-iz);
  const hash=(a,b,c)=>{let n=Math.imul(a,374761393)^Math.imul(b,668265263)^Math.imul(c,1442695041)^seed;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
  let value=0;
  for(let a=0;a<2;a++)for(let b=0;b<2;b++)for(let c=0;c<2;c++)value+=hash(ix+a,iy+b,iz+c)*(a?tx:1-tx)*(b?ty:1-ty)*(c?tz:1-tz);
  return value;
}

export function leafGapMask(p,r){
 const ratio=r.leaf_gap_ratio??0;if(ratio<=0)return 1;if(ratio>=1)return 0;
 const size=r.leaf_gap_size??.6;
 const value=noise(p.x/size+23,p.y/size-11,p.z/size,(r.recipe_version===2?r.gap_seed:r.seed)+701);
 const rank=smooth(THREE.MathUtils.clamp((value-.2)/.6,0,1));
 return smooth(THREE.MathUtils.clamp((rank-ratio)/.12+.5,0,1));
}

// World-space fields stay continuous across triangle edges and around the support.
export function canopyField(p,r,supportTop=Infinity) {
  const size=r.canopy_clump ?? .85, seed=r.recipe_version===2?r.leaf_seed:r.seed;
  const broad=noise(p.x/size,p.y/size,p.z/(size*1.35),seed);
  const fine=noise(p.x/size*3.7+13,p.y/size*3.7-7,p.z/size*3.7,seed+61);
  const clump=smooth(THREE.MathUtils.clamp((broad-.23)/.54,0,1));
  const frontier=growthFrontier(p,r,supportTop),height=heightDensity(p.z,{...r,top:frontier});
  if(r.recipe_version===2)return {height,mask:1,clump,depth:(r.canopy_depth??.32)*(.06+.94*clump*clump)+.025*fine,
    density:height*(r.distribution==='CLUMP'?.15+.85*clump:1)*leafGapMask(p,r),frontier};
  // Slowly wandering vertical patches narrow with height, rather than deleting unrelated leaves.
  const laneSize=size*.55;
  const lane=noise(p.x/laneSize+19.1+Math.sin(p.z*.29)*.15,p.y/laneSize-31.7+Math.cos(p.z*.23)*.15,17.39,seed+193);
  const score=smooth(THREE.MathUtils.clamp((lane-.3)/.4,0,1));
  const mask=height>=1?1:height<=0?0:smooth(THREE.MathUtils.clamp((score-(1-height))/.16+.5,0,1));
  return {height,mask,clump,depth:(r.canopy_depth??.32)*(.06+.94*clump*clump)+.025*fine,
    density:(.65+.35*clump)*mask*(.7+.3*height)*leafGapMask(p,r),frontier};
}

export function canopySurfaceFrames(nav,flip,blocked) {
  const sign=flip?-1:1,edges=[];
  nav.faces.forEach((f,id)=>f.neighbors.forEach((other,e)=>{
    if(other<id||other<0||blocked.has(id)||blocked.has(other))return;
    const g=nav.faces[other],n=f.normal.clone().multiplyScalar(sign),m=g.normal.clone().multiplyScalar(sign);
    if(n.dot(m)>.995||n.dot(m)<-.95)return;
    const a=nav.vertices[f.ids[e]],b=nav.vertices[f.ids[(e+1)%3]];
    if(g.center.clone().sub(a).dot(n)>=-1e-7)return; // concave corners need no outward bridge
    edges.push({line:new THREE.Line3(a,b),a,n,m});
  }));
  // Include the entire coplanar patch, not only the triangle sharing the edge.
  return nav.faces.map(f=>{
    const normal=f.normal.clone().multiplyScalar(sign),local=[];
    for(const e of edges){const match=normal.dot(e.n)>.9999?e.m:normal.dot(e.m)>.9999?e.n:null;
      if(match&&Math.abs(f.center.clone().sub(e.a).dot(normal))<1e-5)local.push({line:e.line,other:match});}
    return (p,depth)=>{
      const n=normal.clone();let corner=false;
      for(const edge of local){const distance=edge.line.closestPointToPoint(p,true,new THREE.Vector3()).distanceTo(p),width=Math.max(.12,depth*1.6);
        if(distance>=width)continue;const weight=smooth(1-distance/width);
        n.addScaledVector(edge.other,weight);corner=true;
      }
      return {position:p.clone().addScaledVector(n.normalize(),depth),normal:n,corner};
    };
  });
}
