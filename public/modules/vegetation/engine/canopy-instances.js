import * as THREE from 'three';
import { unitPoseQuaternion } from './unit-authoring.js';

export function leafArraysGeometry(a) {
  const g=new THREE.BufferGeometry();
  for(const[name,data,size]of [['position',a.positions,3],['normal',a.normals,3],['uv',a.uvs,2],['color',a.colors,4]])g.setAttribute(name,new THREE.BufferAttribute(data.data||new Float32Array(data),size));
  g.setIndex(a.indices.data?new THREE.BufferAttribute(a.indices.data,1):a.indices);g.computeBoundingBox();return g;
}

// Expanded export has a known size. Avoid enormous growable JS arrays and a
// second full copy while writing tens of thousands of real imported blades.
export function allocateLeafArrays(vertices,indices) {
  const writer=(Type,count)=>({data:new Type(count),length:0,push(...values){this.data.set(values,this.length);this.length+=values.length;}});
  return {positions:writer(Float32Array,vertices*3),normals:writer(Float32Array,vertices*3),uvs:writer(Float32Array,vertices*2),colors:writer(Float32Array,vertices*4),elementIndices:writer(Uint32Array,vertices),indices:writer(vertices>65535?Uint32Array:Uint16Array,indices)};
}

// Preview copies share the original blade and atlas. Exports use the ordinary
// expanded builder, including their individual hierarchy and wind attributes.
export function buildCanopyInstances(source,placements,settings,material,elements,branches,sourceIndex,name,calibration,transform) {
  const arrays={positions:[],normals:[],uvs:[],colors:[],elementIndices:[],indices:[]};
  const template={position:new THREE.Vector3(),direction:new THREE.Vector3(0,1,0),normal:new THREE.Vector3(0,0,1),twist:0,scale:1,phase:0,random:0};
  transform(source,template,{...settings,petiole_length:0},0,arrays,calibration);
  const geometry=leafArraysGeometry(arrays),mesh=new THREE.InstancedMesh(geometry,material,placements.length),elementIndices=[];
  mesh.name=`M_Leaf_叶层复用_${sourceIndex+1}`;mesh.castShadow=true;
  mesh.userData={category:'leaf',source:name,source_index:sourceIndex,element_count:placements.length,canopy_instances:true};
  const stemPositions=[],stemNormals=[],stemIndices=[];
  for(let ring=0;ring<2;ring++)for(let side=0;side<4;side++){const angle=side*Math.PI/2;stemPositions.push(Math.cos(angle),ring,Math.sin(angle));stemNormals.push(Math.cos(angle),0,Math.sin(angle));}
  for(let side=0;side<4;side++){const next=(side+1)%4;stemIndices.push(side,next,4+next,side,4+next,4+side);}
  const stems=new THREE.BufferGeometry();stems.setAttribute('position',new THREE.Float32BufferAttribute(stemPositions,3));stems.setAttribute('normal',new THREE.Float32BufferAttribute(stemNormals,3));stems.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(16),2));stems.setIndex(stemIndices);
  const color=new Float32Array(stems.attributes.position.count*4);color.fill(.35);stems.setAttribute('color',new THREE.BufferAttribute(color,4));
  // Stalks sample the existing attachment texel, never an entire atlas.
  let base=0;const sp=source.attributes.position,suv=source.attributes.uv;
  for(let i=1;i<sp.count;i++)if(sp.getY(i)<sp.getY(base))base=i;
  for(let i=0;i<stems.attributes.uv.count;i++)stems.attributes.uv.setXY(i,suv?.getX(base)||0,suv?.getY(base)||0);
  const stalk=new THREE.InstancedMesh(stems,material,placements.length);stalk.name='叶层连接细柄';stalk.castShadow=true;stalk.userData={...mesh.userData};
  const matrix=new THREE.Matrix4(),scale=new THREE.Vector3();
  placements.forEach((p,i)=>{
    const parent=branches.get(p.branchId),index=elements.length;elementIndices.push(index);
    elements.push({index,type:p.attachmentType||'LEAF',id:p.stableId,parentIndex:parent.elementIndex,pivot:p.position.toArray(),axis:p.direction.toArray(),extent:p.scale,order:parent.order+1,phase:p.phase});
    const end=p.position.clone().addScaledVector(p.direction,settings.petiole_length);
    matrix.compose(end,unitPoseQuaternion(p),scale.setScalar(p.scale));mesh.setMatrixAt(i,matrix);
    const delta=end.clone().sub(p.canopyRoot),axis=delta.clone().normalize(),helper=Math.abs(axis.z)>.9?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1),x=new THREE.Vector3().crossVectors(axis,helper).normalize(),z=new THREE.Vector3().crossVectors(x,axis).normalize();
    matrix.makeBasis(x,axis,z).scale(scale.set(.00065,Math.max(.0001,delta.length()),.00065)).setPosition(p.canopyRoot);stalk.setMatrixAt(i,matrix);
  });
  for(const m of [mesh,stalk]){m.instanceMatrix.needsUpdate=true;m.computeBoundingBox();m.computeBoundingSphere();m.userData.instance_elements=elementIndices;}
  return {mesh,geometry,elementIndices,extraRecords:[{mesh:stalk,geometry:stems,elementIndices}]};
}

// Materialize only for tools that edit individual vertices. Do not mutate the
// original atlas or lose per-instance lookup IDs when leaving the fast preview.
export function materializeCanopyRecords(records) {
  const expanded=[];
  for(const r of records){
    const object=r.mesh;if(!object.isInstancedMesh){expanded.push(r);continue;}
    const source=r.geometry,index=source.index,vertices=source.attributes.position.count,count=object.count;
    const geometry=new THREE.BufferGeometry(),matrix=new THREE.Matrix4(),normalMatrix=new THREE.Matrix3(),v=new THREE.Vector3();
    for(const[name,attr]of Object.entries(source.attributes)){
      if(attr.isInstancedBufferAttribute)continue;
      const out=new Float32Array(attr.array.length*count);
      for(let i=0;i<count;i++){
        object.getMatrixAt(i,matrix);normalMatrix.getNormalMatrix(matrix);
        out.set(attr.array,i*attr.array.length);
        if(['position','normal','tangent'].includes(name))for(let j=0;j<vertices;j++){
          v.fromBufferAttribute(attr,j);if(name==='position')v.applyMatrix4(matrix);else v.applyMatrix3(normalMatrix).normalize();
          const at=i*attr.array.length+j*attr.itemSize;out[at]=v.x;out[at+1]=v.y;out[at+2]=v.z;
        }
      }
      geometry.setAttribute(name,new THREE.BufferAttribute(out,attr.itemSize));
    }
    const indices=new Uint32Array(index.count*count),elements=new Uint32Array(vertices*count);
    for(let i=0;i<count;i++){for(let j=0;j<index.count;j++)indices[i*index.count+j]=i*vertices+index.getX(j);elements.fill(r.elementIndices[i],i*vertices,(i+1)*vertices);}
    geometry.setIndex(new THREE.BufferAttribute(indices,1));geometry.computeBoundingBox();
    const mesh=new THREE.Mesh(geometry,object.material);mesh.name=object.name;mesh.castShadow=object.castShadow;mesh.userData={...object.userData};delete mesh.userData.instance_elements;delete mesh.userData.canopy_instances;
    object.parent.add(mesh);object.removeFromParent();object.dispose();source.dispose();expanded.push({mesh,geometry,elementIndices:elements});
  }
  return expanded;
}
