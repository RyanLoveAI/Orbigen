import * as T from '../../vendor/three/three.module.js';
// The lattice is drawn through the model; selection includes visible projections
// at every depth, while fixed boundary nodes remain excluded.
export function nodesInRectangle(cage,camera,rect,from,to){
  camera.updateMatrixWorld();const minX=Math.min(from[0],to[0]),maxX=Math.max(from[0],to[0]),minY=Math.min(from[1],to[1]),maxY=Math.max(from[1],to[1]),selected=[];
  cage.nodes.forEach((node,i)=>{if(!cage.free[i])return;const p=node.clone().project(camera),x=rect.left+(p.x+1)*rect.width/2,y=rect.top+(1-p.y)*rect.height/2;
    if(p.z>=-1&&p.z<=1&&x>=minX&&x<=maxX&&y>=minY&&y<=maxY)selected.push(i);
  });return selected;
}
export function selectionCenter(cage,indices){const center=new T.Vector3();for(const i of indices)center.add(cage.nodes[i]);return indices.size?center.divideScalar(indices.size):center;}
