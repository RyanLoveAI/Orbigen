import * as THREE from '/vendor/three/three.module.js';

const V = p => new THREE.Vector3(...p);
const clamp = x => Math.max(0, Math.min(1, x));
export function brushFaces(nav, anchor, radius, corners = false, view = null) {
  const origin = nav.faces[anchor.face]; if (!origin) return [];
  const point = V(anchor.point), seen = new Set(), pending = [anchor.face], faces = [];
  while (pending.length) {
    const id = pending.pop(); if (seen.has(id)) continue; seen.add(id);
    const f = nav.faces[id];
    if (f.triangle.closestPointToPoint(point, new THREE.Vector3()).distanceToSquared(point) > radius * radius) continue;
    if (f.normal.dot(origin.normal) < (corners ? -.05 : .7)) continue;
    // Only the side facing the brush camera; disconnected back surfaces never enter the traversal.
    if (view && f.normal.dot(V(view)) * origin.normal.dot(V(view)) < 0) continue;
    faces.push(id); for (const n of f.neighbors) if (n >= 0 && !seen.has(n)) pending.push(n);
  }
  return faces;
}

// A stroke stores small circular samples on original faces. No remeshing, UV or face-index changes.
export function makePaintStamp(nav, anchor, brush, erase, view) {
  return { face: anchor.face, point: [...anchor.point], radius: brush.radius, strength: brush.strength,
    softness: brush.softness, erase, faces: brushFaces(nav, anchor, brush.radius, brush.corners, view) };
}
export function paintField(region, blocked = [], blockStrokes = []) {
  const base = new Set(region.faces || []), forbidden = new Set(blocked), bins = new Map(), bans = new Map();
  function index(strokes, map) { for (const stroke of strokes || []) for (const stamp of stroke.samples || []) for (const face of stamp.faces || [stamp.face]) { if (!map.has(face)) map.set(face, []); map.get(face).push({ ...stamp, stroke: stroke.id }); } }
  index(region.strokes, bins); index(blockStrokes, bans);
  function sample(map, face, p, initial) {
    let value = initial, last = '', contribution = 0, subtract = false;
    function apply() { value = subtract ? value * (1 - contribution) : value + (1 - value) * contribution; }
    for (const s of map.get(face) || []) {
      if (s.stroke !== last) { apply(); contribution = 0; last = s.stroke; subtract = s.erase; }
      const d = p.distanceTo(V(s.point)) / s.radius;
      const t = s.softness > 0 ? clamp((1 - d) / s.softness) : d < 1 ? 1 : 0;
      contribution = Math.max(contribution, t * t * (3 - 2 * t) * s.strength);
    }
    apply(); return value;
  }
  const banned = (face,p) => sample(bans,face,p,forbidden.has(face)?1:0);
  return { faces: new Set([...base,...bins.keys()]), bins, base,
    weight: (face,p) => sample(bins,face,p,base.has(face)?1:0) * (1-banned(face,p)),
    edgeDistance(face,p,limit){let d=base.has(face)?limit:0;for(const s of bins.get(face)||[]){const edge=s.radius-p.distanceTo(V(s.point));d=s.erase?Math.min(d,Math.max(0,-edge)):Math.max(d,edge);}const available=d;for(const s of bans.get(face)||[]){const edge=s.radius-p.distanceTo(V(s.point));d=s.erase?Math.max(d,Math.min(available,edge)):Math.min(d,Math.max(0,-edge));}return Math.max(0,Math.min(limit,d));}, banned };
}

const frames = new WeakMap();
export function faceFrame(face) {
  if (frames.has(face)) return frames.get(face);
  const origin = face.triangle.a, x = face.triangle.b.clone().sub(origin).normalize(), y = new THREE.Vector3().crossVectors(face.normal,x).normalize();
  const project = p => { const q=p.clone().sub(origin); return [q.dot(x),q.dot(y)]; };
  const frame={origin,x,y,project,point:(u,v)=>origin.clone().addScaledVector(x,u).addScaledVector(y,v)};frames.set(face,frame);return frame;
}
// Stable face-local cells: adding another painted patch does not renumber previous candidates.
export function paintCells(nav, field, step = .08, limit = 80000) {
  const cells = new Map(); let saturated = false, visited=0;
  for (const id of [...field.faces].sort((a,b)=>a-b)) {
    const f=nav.faces[id];if(!f)continue;const frame=faceFrame(f), ranges=[];
    if(field.base.has(id)){const q=[f.triangle.a,f.triangle.b,f.triangle.c].map(frame.project);ranges.push([Math.min(...q.map(p=>p[0])),Math.min(...q.map(p=>p[1])),Math.max(...q.map(p=>p[0])),Math.max(...q.map(p=>p[1]))]);}
    else for(const s of field.bins.get(id)||[])if(!s.erase){const [u,v]=frame.project(V(s.point));ranges.push([u-s.radius,v-s.radius,u+s.radius,v+s.radius]);}
    for(const [a,b,c,d]of ranges)for(let x=Math.floor(a/step);x<=Math.floor(c/step);x++)for(let y=Math.floor(b/step);y<=Math.floor(d/step);y++){
      if(++visited>limit*24)return {cells:[...cells.values()],saturated:true};const key=`${id}_${x}_${y}`;if(cells.has(key))continue;const point=frame.point((x+.5)*step,(y+.5)*step);
      if(!f.triangle.containsPoint(point))continue;
      const weight=field.weight(id,point);if(weight<=.001)continue;
      cells.set(key,{id:key,face:id,x,y,point,weight,step});if(cells.size>=limit){saturated=true;return {cells:[...cells.values()],saturated};}
    }
  }
  return {cells:[...cells.values()],saturated};
}
export function paintOverlay(nav, region, blocked, blockStrokes) {
  let radius=.36;for(const stroke of region.strokes||[])for(const p of stroke.samples)radius=Math.min(radius,p.radius);
  const step=Math.max(.01,Math.min(.12,radius/3));
  const field=paintField(region,blocked,blockStrokes), {cells,saturated}=paintCells(nav,field,step,50000), positions=[],colors=[];
  for(const cell of cells){const f=nav.faces[cell.face],frame=faceFrame(f),p=[];for(const [dx,dy]of [[0,0],[1,0],[1,1],[0,1]]){const q=frame.point((cell.x+dx)*step,(cell.y+dy)*step);p.push(f.triangle.closestPointToPoint(q,new THREE.Vector3()).addScaledVector(f.normal,.002));}
    for(const k of [0,1,2,0,2,3]){positions.push(...p[k].toArray());const w=.2+.8*cell.weight;colors.push(w,w,w);}}
  return {positions,colors,area:cells.reduce((sum,c)=>sum+c.weight*step*step,0),saturated};
}
export function trimSurfaceSamples(samples, fraction) {
  if(fraction>=1||samples.length<2)return samples;
  let total=0;for(let i=1;i<samples.length;i++)total+=V(samples[i].point).distanceTo(V(samples[i-1].point));
  let left=total*Math.max(.01,fraction);const out=[samples[0]];
  for(let i=1;i<samples.length;i++){const a=V(samples[i-1].point),b=V(samples[i].point),length=a.distanceTo(b);if(length<=left){out.push(samples[i]);left-=length;}else{out.push({face:samples[i-1].nextFace??samples[i-1].face,point:a.lerp(b,left/length).toArray()});break;}}return out;
}
export function surfaceBlocked(surface) {
  const set=new Set(surface.block_strokes?.length?[]:surface.blocked);
  if(surface.block_strokes?.length){const field=paintField({faces:[],strokes:[]},surface.blocked,surface.block_strokes);set.atPoint=(face,p)=>field.banned(face,p)>.05;}
  return set;
}
