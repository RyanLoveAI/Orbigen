import * as THREE from '/vendor/three/three.module.js';
import { plantRandom } from './flowering-data.js';

export function vineTraits(seed,id) {
  const rng=plantRandom(seed,id+':habit');
  return {radius:.82+rng()*.36,spacing:.85+rng()*.35};
}
export function forkTraits(seed,id,index,t) {
  const rng=plantRandom(seed,id+':fork-habit:'+index);
  return {gap:.8+rng()*.45,sign:rng()<.5?-1:1,
    length:.85+Math.pow(rng(),1.2)*1.2,lean:.3+rng()*.85,
    radius:.36+rng()*.23,bend:.75+rng()*.5};
}

// Allocate along each parent, not by one global lottery that can leave its crown bare.
export function spreadForks(candidates,capacity){
 const groups=new Map();for(const c of candidates){if(!groups.has(c.main.id))groups.set(c.main.id,[]);groups.get(c.main.id).push(c);}
 const buckets=[...groups.values()].map(items=>({items:items.sort((a,b)=>a.distance-b.distance),count:0}));
 for(let left=Math.min(capacity,candidates.length);left>0;){for(const b of buckets){if(!left)break;if(b.count<b.items.length){b.count++;left--;}}}
 return buckets.flatMap(({items,count})=>Array.from({length:count},(_,i)=>{
  const jitter=.15+.7*plantRandom(123,items[0].main.id+':distribution:'+i)();
  return items[Math.min(items.length-1,Math.floor((i+jitter)*items.length/count))];
 }));
}

// A side shoot first opens away from its parent, then turns toward its parent's growth direction.
// Each short step unfolds over connected faces, including the bridge soffit.
export function walkSideShoot(nav,start,tangent,traits,length,walk,blocked) {
  const result=[{face:start.face,point:[...start.point]}];let forward=tangent.clone(),previousNormal=nav.faces[start.face].normal,travel=0;
  for(let step=0;step<256&&travel<length-.0001;step++){
    const last=result.at(-1),anchor={face:last.nextFace??last.face,point:last.point},normal=nav.faces[anchor.face].normal;
    forward.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(previousNormal,normal));previousNormal=normal;
    forward.addScaledVector(normal,-forward.dot(normal)).normalize();if(forward.lengthSq()<.5)break;
    const t=travel/length,ease=t*t*(3-2*t),lateral=new THREE.Vector3().crossVectors(normal,forward).multiplyScalar(traits.sign);
    const direction=lateral.multiplyScalar(1-.65*ease).addScaledVector(forward,traits.lean+ease*.85).normalize();
    const part=walk(nav,anchor,direction,Math.min(.09,length-travel),blocked);if(part.length<2)break;
    let moved=0;for(let i=1;i<part.length;i++)moved+=new THREE.Vector3(...part[i].point).distanceTo(new THREE.Vector3(...part[i-1].point));
    if(moved<.0001)break;result.push(...part.slice(1));travel+=moved;
    if(moved<.025)break;
  }
  return result;
}
