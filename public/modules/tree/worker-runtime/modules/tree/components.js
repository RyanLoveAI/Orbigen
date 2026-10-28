import * as T from '/vendor/three/three.module.js';
import {inspectTreeMeshes} from './inspect.js';
import {deserializeGeometry} from '../vegetation/engine/branch-kernel.js';

// Units share the original plant kernel's Y-up leaf frame and UV convention.
// A unit is evaluated once, then the branch kernel distributes that same mesh.
export function leafGeometry(r,quality,pack,rnd){
  const l=r.leaf;
  if(l.kind==='CUSTOM')return deserializeGeometry(l.mesh);
  if(l.kind==='CAMPHOR'){
    const g=deserializeGeometry(pack?.leaf_meshes?.[0]?.geometry);if(!g)throw Error('香樟叶片素材尚未载入');
    g.computeBoundingBox();const size=g.boundingBox.getSize(new T.Vector3()),base=g.boundingBox.min.y;
    const p=g.attributes.position;for(let i=0;i<p.count;i++)p.setXYZ(i,p.getX(i)/size.y*l.aspect/.46,(p.getY(i)-base)/size.y,p.getZ(i)/size.y);
    deform(g,l);return g;
  }
  if(l.kind==='NEEDLE')return needles(r,quality,rnd);
  if(l.kind==='FAN'){
    const segments=quality==='FINE'?36:quality==='STANDARD'?24:16,pos=[0,.28,0],uv=[.5,.28],idx=[];
    // Short stalk and a radial fan with the characteristic central cleft.
    for(let i=0;i<=segments;i++){const a=(-65+130*i/segments)*Math.PI/180,radius=.72-.06*Math.exp(-Math.pow(a/.13,2)),x=Math.sin(a)*radius*l.aspect/1.3,y=.28+Math.cos(a)*radius;pos.push(x,y,0);uv.push(.5+x/(l.aspect||1),y);}
    for(let i=0;i<segments;i++)idx.push(0,i+1,i+2);
    const off=pos.length/3;pos.push(-.012,0,0,.012,0,0,-.012,.3,0,.012,.3,0);uv.push(.48,0,.52,0,.48,.3,.52,.3);idx.push(off,off+1,off+2,off+1,off+3,off+2);
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);deform(g,l);return g;
  }
  if(l.kind==='LOBED'){
    const outline=[[0,0],[-.025,.18],[-.12,.20],[-.40,.15],[-.26,.32],[-.50,.48],[-.30,.49],[-.37,.75],[-.17,.66],[-.13,.90],[0,1],[.13,.90],[.17,.66],[.37,.75],[.30,.49],[.50,.48],[.26,.32],[.40,.15],[.12,.20],[.025,.18]],shape=new T.Shape(outline.map(([x,y])=>new T.Vector2(x*l.aspect,y))),g=new T.ShapeGeometry(shape);
    const p=g.attributes.position;g.setAttribute('uv',new T.Float32BufferAttribute(Array.from({length:p.count},(_,i)=>[p.getX(i)/(l.aspect||1)+.5,p.getY(i)]).flat(),2));deform(g,l);return g;
  }
  const pos=[],uv=[],idx=[],rows=quality==='FINE'?24:quality==='STANDARD'?16:10,cols=4;
  for(let row=0;row<=rows;row++){
    const y=.02+row/rows*.96,t=row/rows;
    let half=Math.sin(Math.PI*t)**.75*l.aspect*.5;
    if(l.kind==='LANCE')half=Math.sin(Math.PI*t)*l.aspect*.5;
    if(l.kind==='FAN')half=(.04+Math.sin(Math.PI*t*.66)*.96)*l.aspect*.5;
    if(l.kind==='LOBED')half*=.55+.45*Math.abs(Math.cos(t*Math.PI*4));
    half=Math.max(.002,half);
    for(let col=0;col<=cols;col++){const s=col/cols*2-1;pos.push(s*half,y,.028*(1-s*s)*Math.sin(Math.PI*t));uv.push(col/cols,y);}
  }
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){const a=row*(cols+1)+col,b=a+cols+1;idx.push(a,b,a+1,a+1,b,b+1);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);deform(g,l);return g;
}
function deform(g,l){const p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);p.setZ(i,z+l.bend*y*y+l.curl*x*x);}g.computeVertexNormals();g.computeBoundingBox();g.userData.sourceName='树木组件叶片';}
function needles(r,quality,rnd){
  const n=quality==='FINE'?28:quality==='STANDARD'?20:12,pos=[],uv=[],idx=[];
  for(let i=0;i<n;i++){const a=i*2.39996,start=new T.Vector3(0,.03+i/n*.32,0),dir=new T.Vector3(Math.cos(a)*(.25+rnd()*.25),.48+rnd()*.3,Math.sin(a)*(.25+rnd()*.25)),side=new T.Vector3().crossVectors(dir,new T.Vector3(0,0,1)).normalize(),out=new T.Vector3().crossVectors(side,dir).normalize(),offset=pos.length/3;
    for(let ring=0;ring<2;ring++)for(let j=0;j<3;j++){const p=start.clone().addScaledVector(dir,ring*.5).addScaledVector(side,Math.cos(j*2*Math.PI/3)*r.needleWidth*(1-ring*.4)).addScaledVector(out,Math.sin(j*2*Math.PI/3)*r.needleWidth*(1-ring*.4));pos.push(...p.toArray());uv.push(j/2,ring*.5);}
    pos.push(...start.clone().add(dir).toArray());uv.push(.5,1);for(let j=0;j<3;j++)idx.push(offset+j,offset+(j+1)%3,offset+3+j,offset+(j+1)%3,offset+3+(j+1)%3,offset+3+j,offset+3+j,offset+3+(j+1)%3,offset+6);
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeBoundingBox();const h=g.boundingBox.max.y;g.scale(1/h,1/h,1/h);deform(g,r.leaf);return g;
}

export function leafPreview(r,quality,pack){
  let s=r.seed;const rnd=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
  const g=leafGeometry(r,quality,pack,rnd);g.scale(r.leafSize,r.leafSize,r.leafSize);g.computeVertexNormals();
  const attributes=Object.fromEntries(Object.entries(g.attributes).map(([name,a])=>[name,{array:new Float32Array(a.array),itemSize:a.itemSize}]));
  const triangles=g.index.count/3,positions=g.attributes.position.array;let invalid=0,degenerate=0;
  for(const v of positions)if(!Number.isFinite(v))invalid++;
  const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();for(let i=0;i<g.index.count;i+=3){a.fromBufferAttribute(g.attributes.position,g.index.getX(i));b.fromBufferAttribute(g.attributes.position,g.index.getX(i+1));c.fromBufferAttribute(g.attributes.position,g.index.getX(i+2));if(b.sub(a).cross(c.sub(a)).lengthSq()<1e-20)degenerate++;}
  const result={meshes:[{material:{name:'M_Leaf',color:r.leafColor,roughness:.72,doubleSided:true,bark:false,leafTexture:r.leaf.kind==='CAMPHOR'?pack.leaf_material:null,proceduralLeaf:!['CAMPHOR','CUSTOM','NEEDLE'].includes(r.leaf.kind)},attributes,index:new Uint32Array(g.index.array)}],report:{ok:!invalid&&!degenerate,triangles,invalid_vertices:invalid,degenerate_faces:degenerate,draw_calls:1,quality,branches:0,sprays:1,height:r.leafSize,attachment_overlap_ratio:0,attachment_overlap_limit:1,mode:'LEAF'},frame:new T.Matrix4().toArray(),document:null};result.report.review=inspectTreeMeshes(result.meshes);g.dispose();if(!result.report.ok)throw Error('叶片网格存在无效顶点或退化面');return result;
}
