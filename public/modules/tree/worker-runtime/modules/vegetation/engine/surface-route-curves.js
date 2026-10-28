import * as THREE from '/vendor/three/three.module.js';
import { plantRandom } from './flowering-data.js';

const V=p=>new THREE.Vector3(...p),smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
// Smooth seeded bends at different scales; no per-vertex jitter or repeating sine wave.
export function curveSurfaceRoute(nav,samples,seed,id,amplitude,span,walk,blocked) {
  if(!amplitude||samples.length<2)return samples;
  const dense=[samples[0]],arcs=[0];
  for(let i=1;i<samples.length;i++){
    const a=samples[i-1],b=samples[i],distance=V(a.point).distanceTo(V(b.point)),steps=Math.max(1,Math.ceil(distance/.08));
    for(let j=1;j<=steps;j++){
      dense.push(j===steps?b:{face:a.nextFace??a.face,point:V(a.point).lerp(V(b.point),j/steps).toArray()});
      arcs.push(arcs.at(-1)+distance/steps);
    }
  }
  const total=arcs.at(-1);if(total<.1)return samples;
  const rng=plantRandom(seed,id+':bends'),phase=rng()*10,period=span*(.75+rng()*.5),values=new Map();
  const noise=x=>{const i=Math.floor(x),f=smooth(x-i);const value=k=>{if(!values.has(k))values.set(k,plantRandom(seed,id+':bend:'+k)()*2-1);return values.get(k);};return value(i)*(1-f)+value(i+1)*f;};
  const portals=[0,total];
  dense.forEach((s,i)=>{if(s.nextFace!==undefined&&nav.faces[s.face].normal.dot(nav.faces[s.nextFace].normal)<.995)portals.push(arcs[i]);});
  const shifted=dense.map((s,i)=>{
    if(i===0||i===dense.length-1||s.nextFace!==undefined&&nav.faces[s.face].normal.dot(nav.faces[s.nextFace].normal)<.995)return s;
    const normal=nav.faces[s.face].normal,tangent=V(dense[Math.min(i+1,dense.length-1)].point).sub(V(dense[Math.max(0,i-1)].point));
    const lateral=new THREE.Vector3().crossVectors(normal,tangent).normalize();if(lateral.lengthSq()<.5)return s;
    const fade=smooth(Math.min(...portals.map(p=>Math.abs(p-arcs[i])))/Math.min(.4,total*.25));
    const amount=amplitude*fade*(.8*noise(arcs[i]/period+phase)+.2*noise(arcs[i]/(period*.43)+phase+37));
    const path=walk(nav,{face:s.nextFace??s.face,point:s.point},lateral.multiplyScalar(Math.sign(amount)),Math.abs(amount),blocked);
    const end=path.at(-1);if(!end||path.some(p=>nav.faces[p.face].normal.dot(normal)<.995))return s;
    return end;
  });
  const result=[shifted[0]];
  for(let i=1;i<shifted.length;i++){
    const a=result.at(-1),b=shifted[i],from={face:a.nextFace??a.face,point:a.point},delta=V(b.point).sub(V(a.point));
    if(delta.length()<1e-7)continue;
    const path=walk(nav,from,delta,delta.length(),blocked);
    if(!path.length||V(path.at(-1).point).distanceTo(V(b.point))>.003)return samples; // keep the connected safe baseline
    result.push(...path.slice(1));
    if(b.nextFace!==undefined)Object.assign(result[result.length-1],b);
  }
  // The surface walker steps at 4 cm; retain portals but avoid doubled near-identical samples.
  const compact=[result[0]];
  for(let i=1;i<result.length;i++){
    const previous=compact.at(-1),sample=result[i];
    if(i===result.length-1||sample.nextFace!==undefined||previous.nextFace!==undefined||sample.face!==previous.face||V(sample.point).distanceTo(V(previous.point))>=.065)compact.push(sample);
  }
  return compact;
}
