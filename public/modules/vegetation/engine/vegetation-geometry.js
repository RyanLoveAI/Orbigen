import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { plantRandom } from './flowering-data.js';
import { vegetationPlacements } from './vegetation-placement.js';
import { surfaceNavigation, walkSurface } from './surface-growth-geometry.js';
import { surfaceSegmentBlocked } from './surface-growth-eaves.js';
import { plantAttachmentBase } from './plant-attachment.js';

const UP=new THREE.Vector3(0,0,1), V=p=>new THREE.Vector3(...p);
function ribbon(width,segments=12) {
  const p=[],uv=[],ix=[];
  for(let i=0;i<=segments;i++){const t=i/segments,w=width*Math.max(.005,Math.sin(Math.PI*t)**.65)*.5;for(let j=0;j<3;j++){p.push((j-1)*w,t,j===1?width*.035*Math.sin(Math.PI*t):0);uv.push(j/2,t);}}
  for(let i=0;i<segments;i++)for(let j=0;j<2;j++){const a=i*3+j;ix.push(a,a+1,a+3,a+1,a+4,a+3);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();return g;
}
function deserialize(source) {
  if(!source)return null;const data=source.geometry,g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data.position,3));g.setIndex(data.index);if(data.normal)g.setAttribute('normal',new THREE.Float32BufferAttribute(data.normal,3));if(data.uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(data.uv,2));else g.setAttribute('uv',new THREE.Float32BufferAttribute(new Array(data.position.length/3*2).fill(0),2));if(!g.attributes.normal)g.computeVertexNormals();
  g.computeBoundingBox();const box=g.boundingBox,height=Math.max(.0001,box.max.y-box.min.y),base=plantAttachmentBase(g);g.translate(-base.x,-base.y,-base.z);g.scale(1/height,1/height,1/height);return g;
}
function tube(points,radius,lod) {
  if(points.length<2||points[0].distanceTo(points.at(-1))<.00001)return null;
  const curve=new THREE.CatmullRomCurve3(points),segments=Math.max(5,Math.round(points.length*[2,1.5,1,.7][lod])),radial=[6,5,4,4][lod],g=new THREE.TubeGeometry(curve,segments,radius,radial,false),p=g.attributes.position;
  for(let i=0;i<=segments;i++){const t=i/segments,c=curve.getPointAt(t);for(let j=0;j<=radial;j++){const n=i*(radial+1)+j,q=new THREE.Vector3().fromBufferAttribute(p,n).sub(c).multiplyScalar(1-.85*t).add(c);p.setXYZ(n,q.x,q.y,q.z);}}g.computeVertexNormals();return g;
}
export function buildVegetation(config,surface,lodIndex,elements,triangleBudget=180000) {
  const lod=0,retention=[1,.75,.5,.3][lodIndex];
  const master=vegetationPlacements(config,surface),group=new THREE.Group();group.name='05_场景植物';
  const batches=new Map(),materials=new Map(),lookupRecords=[],retained=[],sources=new Map(),unitCounts={};let triangles=0,limited=false;
  const nav=surface?.enabled?surfaceNavigation(surface.mesh):null;
  const mat=(kind,part)=>{const key=`${kind}_${part}`;if(!materials.has(key)){const s=config.species[kind],flower=part==='flower',raw=flower?s.flower_material:s.material,custom=flower?s.flower_source:s.source;const m=new THREE.MeshStandardMaterial({color:part==='stem'?'#716248':part==='dry'?'#b4a16b':flower?'#efd344':'#658841',roughness:.85,side:THREE.DoubleSide});m.name=`M_Vegetation_${key}`;if(part!=='stem'&&custom){m.vegetationTexture=raw;if(part==='dry')m.vegetationTint='#b4a16b';}materials.set(key,m);}return materials.get(key);};
  for(const placement of master) {
    const s=config.species[placement.kind],kind=placement.kind,rng=plantRandom(config.seed,placement.id),index=elements.length,root=V(placement.point);
    const aligned=UP.clone().lerp(V(placement.normal),config.mode==='REGION'?config.align:0).normalize();if(aligned.lengthSq()<.1)aligned.copy(UP);
    const rotation=new THREE.Quaternion().setFromUnitVectors(UP,aligned),spin=new THREE.Quaternion().setFromAxisAngle(UP,placement.angle);rotation.multiply(spin);
    const matrix=new THREE.Matrix4().compose(root,rotation,new THREE.Vector3().setScalar(placement.scale));
    let added=false,organ=0;const visible=placement.priority<retention;
    function add(g,part='green',world=false) {
      if(!g)return;if(limited){g.dispose();return;}const cost=(g.index?.count||g.attributes.position.count)/3;
      if(triangles+cost>triangleBudget){limited=true;g.dispose();return;}triangles+=cost;
      if(!visible||(part!=='stem'&&organ++>2&&plantRandom(config.seed,`${placement.id}:organ:${organ}`)()>retention)){g.dispose();return;}
      added=true;
      if(!world)g.applyMatrix4(matrix);
      for(const key of Object.keys(g.attributes))if(!['position','normal','uv'].includes(key))g.deleteAttribute(key);
      if(!g.attributes.uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(new Array(g.attributes.position.count*2).fill(0),2));
      const color=[];for(let i=0;i<g.attributes.position.count;i++)color.push(kind.includes('ROOT')?0:.3,placement.priority,.4,placement.priority);
      g.setAttribute('color',new THREE.Float32BufferAttribute(color,4));const material=mat(kind,part),key=material.name;
      if(!batches.has(key))batches.set(key,{geometries:[],indices:[],material});const batch=batches.get(key);batch.geometries.push(g);for(let i=0;i<g.attributes.position.count;i++)batch.indices.push(index);return true;
    }
    function leaf(at,direction,length,width,bend=0,dry=false,flower=false) {
      if(limited)return;
      const variants=s.sources?.length?s.sources:s.source?[s.source]:[];
      const classified=variants.some(u=>u.variant==='DRY')&&variants.some(u=>u.variant==='GREEN');
      const pool=classified?variants.filter(u=>u.variant===(dry?'DRY':'GREEN')):variants;
      const unit=flower?s.flower_source:pool[Math.floor(rng()*Math.max(1,pool.length))];
      const variant=variants.indexOf(unit),key=kind+(flower?'_flower':`_leaf_${variant}`);
      if(!sources.has(key))sources.set(key,deserialize(unit));
      const source=sources.get(key),g=source?source.clone():ribbon(width/length,lod<2?12:6),p=g.attributes.position,n=g.attributes.normal;
      const directionUnit=direction.clone().normalize(),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),directionUnit);
      for(let i=0;i<p.count;i++){
        const t=p.getY(i),v=new THREE.Vector3(p.getX(i)*length,t*length,p.getZ(i)*length).applyQuaternion(q);v.z-=bend*length*t*t;p.setXYZ(i,v.x+at.x,v.y+at.y,v.z+at.z);
        // Transform the supplied smooth normals along with the bend. Recomputing
        // each UV-split vertex separately introduces visible seams on real units.
        if(source){const normal=new THREE.Vector3().fromBufferAttribute(n,i).applyQuaternion(q),z=normal.z;normal.multiplyScalar(1-2*bend*t*directionUnit.z).addScaledVector(directionUnit,2*bend*t*z).normalize();n.setXYZ(i,normal.x,normal.y,normal.z);}
      }
      if(!source)g.computeVertexNormals();
      if(add(g,flower?'flower':dry&&!classified?'dry':'green')&&unit)unitCounts[unit.name]=(unitCounts[unit.name]||0)+1;
    }
    if(kind==='GRASS') {
      for(let i=0;i<s.count;i++){const rr=plantRandom(config.seed,`${placement.id}:blade:${i}`);if(i&&rr()>[1,.75,.5,.3][lod])continue;const angle=i*2.39996,spread=s.width*(.08+.16*rr()),base=new THREE.Vector3(Math.cos(angle)*spread,Math.sin(angle)*spread,0),height=s.height*(1+(rr()*2-1)*s.variation),out=s.bend*(.2+rr()*.5);leaf(base,new THREE.Vector3(Math.cos(angle)*out,Math.sin(angle)*out,1),height,s.leaf_width,s.bend*.65,rr()<s.dry);}
    } else if(kind==='BROADLEAF') {
      add(tube([new THREE.Vector3(),new THREE.Vector3(0,0,s.height*.98)],s.radius,lod),'stem');
      for(let i=0;i<s.count;i++){const age=(i+.5)/s.count,angle=i*2.39996,at=new THREE.Vector3(0,0,s.height*(.3+.65*age)),reach=s.width*.28*(1-age*.5),end=at.clone().add(new THREE.Vector3(Math.cos(angle)*reach,Math.sin(angle)*reach,s.height*.1));add(tube([at,at.clone().lerp(end,.5),end],Math.max(.003,s.radius*.13),lod),'stem');leaf(end,new THREE.Vector3(Math.cos(angle),Math.sin(angle),.1+age*.9),s.leaf_size*(1-s.variation*age),s.leaf_width,s.bend*(1-age*.6),rng()<s.dry);}
    } else if(kind==='SHRUB'||kind==='FLOWER') {
      for(let i=0;i<s.count;i++){const angle=i*2.39996,length=s.height*(1-s.variation*rng()),spread=s.width*(.2+rng()*.3),points=[];for(let j=0;j<8;j++){const t=j/7;points.push(new THREE.Vector3(Math.cos(angle)*spread*t,Math.sin(angle)*spread*t,length*(t-s.bend*(kind==='FLOWER'?1.3:.65)*t*t)));}add(tube(points,s.radius,lod),'stem');const curve=new THREE.CatmullRomCurve3(points),nodes=Math.min(80,Math.max(4,Math.round(curve.getLength()/.08)));
        for(let j=0;j<nodes;j++){const t=(j+.5)/nodes,at=curve.getPoint(t),a=angle+(j%2?1:-1)*1.2;leaf(at,new THREE.Vector3(Math.cos(a),Math.sin(a),.3),s.leaf_size*(1+(rng()*2-1)*s.variation),s.leaf_width,.1,rng()<s.dry);
          if(kind==='FLOWER'&&t>.15&&rng()<s.flower_amount){if(s.flower_source)leaf(at,new THREE.Vector3(Math.cos(a),Math.sin(a),.5),s.flower_size,s.flower_size,0,false,true);else{const center=at.clone().add(new THREE.Vector3(Math.cos(a),Math.sin(a),.4).multiplyScalar(s.flower_size*.3));for(let k=0;k<6;k++){const b=k*Math.PI/3;leaf(center,new THREE.Vector3(Math.cos(b),Math.sin(b),.3),s.flower_size*.55,s.flower_size*.38,-.2,false,true);}}}
        }
        if(kind==='SHRUB')for(let side=0;side<3;side++){
          const base=curve.getPoint(.3+side*.22),a=angle+(side%2?1:-1)*(.7+rng()*.4),reach=s.width*(.15+rng()*.12),end=base.clone().add(new THREE.Vector3(Math.cos(a)*reach,Math.sin(a)*reach,length*.22)),path=[base,base.clone().lerp(end,.5).add(new THREE.Vector3(0,0,length*.05)),end];
          add(tube(path,s.radius*.4,lod),'stem');const shoot=new THREE.CatmullRomCurve3(path),n=Math.max(3,Math.min(12,Math.round(reach/.055)));
          for(let j=0;j<n;j++){const t=(j+.5)/n,d=a+(j%2?1:-1)*1.1;leaf(shoot.getPoint(t),new THREE.Vector3(Math.cos(d),Math.sin(d),.4),s.leaf_size*(.75+rng()*.45),s.leaf_width,.12,rng()<s.dry);}
        }
      }
    } else {
      for(let i=0;i<s.count;i++){const angle=i*2.39996+(rng()*2-1)*s.variation,points=[],rootLength=s.height*(1-s.variation*rng());
        if(kind==='GROUND_ROOT'&&nav&&placement.face>=0){const direction=new THREE.Vector3(Math.cos(angle),Math.sin(angle),0).applyQuaternion(rotation),anchor={face:placement.face,point:root.clone().addScaledVector(V(placement.normal),-surface.offset).toArray()},blocked=new Set(surface.blocked);const path=walkSurface(nav,anchor,direction,s.width*(.5+rng()*.5),blocked);for(const a of path)points.push(V(a.point).addScaledVector(nav.faces[a.face].normal,(surface.flip?-1:1)*s.radius*placement.scale));add(tube(points,s.radius*placement.scale,lod),'stem',true);}
        else {const offset=new THREE.Vector3(Math.cos(angle)*s.width*.15,Math.sin(angle)*s.width*.15,kind==='AERIAL_ROOT'&&config.mode==='SINGLE'?s.height:0);for(let j=0;j<20;j++){const t=j/19,p=kind==='AERIAL_ROOT'?offset.clone().add(new THREE.Vector3(Math.sin(t*5+i)*s.bend*.1*t,Math.cos(t*4+i)*s.bend*.1*t,-rootLength*t)):new THREE.Vector3(Math.cos(angle)*s.width*t,Math.sin(angle)*s.width*t+Math.sin(t*6+i)*s.bend*.15*t,s.height*Math.sin(Math.PI*t));
            if(nav&&kind==='AERIAL_ROOT'&&placement.face>=0){p.add(root);if(points.length&&surfaceSegmentBlocked(nav,points.at(-1),p,s.radius))break;}points.push(p);}add(tube(points,s.radius,lod),'stem',!!(nav&&kind==='AERIAL_ROOT'&&placement.face>=0));}
      }
    }
    if(added&&visible){retained.push(placement);elements.push({index,type:'VEGETATION',id:placement.id,parentIndex:-1,pivot:placement.point,axis:aligned.toArray(),extent:s.height*placement.scale,order:0,phase:placement.priority});}
    if(limited||triangles>=triangleBudget)break;
  }
  for(const batch of batches.values()){const geometry=mergeGeometries(batch.geometries);batch.geometries.forEach(g=>g.dispose());const mesh=new THREE.Mesh(geometry,batch.material);mesh.name=batch.material.name.replace('M_','');mesh.userData={category:'vegetation'};mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);lookupRecords.push({geometry,elementIndices:batch.indices});}
  sources.forEach(g=>g?.dispose());return {group,materials,lookupRecords,placements:retained,masterPlacements:master,unitCounts,limited,triangles:lookupRecords.reduce((n,r)=>n+(r.geometry.index?.count||r.geometry.attributes.position.count)/3,0)};
}
