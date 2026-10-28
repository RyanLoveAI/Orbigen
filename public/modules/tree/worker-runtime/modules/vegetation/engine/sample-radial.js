import * as THREE from '/vendor/three/three.module.js';

// Legacy trees carry a different radius_scale on almost every installation.
// Keep that authored thickness as per-instance data rather than compiling
// hundreds of copies of the same sample. The export uses the identical formula.
export function prepareRadialGeometry(geometry, points) {
  const position=geometry.getAttribute('position'),centers=[],tangents=[];
  const point=new THREE.Vector3(),closest=new THREE.Vector3(),candidate=new THREE.Vector3(),axis=new THREE.Vector3();
  for(let n=0;n<position.count;n++){
    point.fromBufferAttribute(position,n);let distance=Infinity;
    for(let j=1;j<points.length;j++){
      const line=new THREE.Line3(points[j-1],points[j]);line.closestPointToPoint(point,true,candidate);
      const d=candidate.distanceToSquared(point);if(d<distance){distance=d;closest.copy(candidate);axis.copy(points[j]).sub(points[j-1]).normalize();}
    }
    centers.push(closest.x,closest.y,closest.z);tangents.push(axis.x,axis.y,axis.z);
  }
  geometry.setAttribute('sampleCenter',new THREE.Float32BufferAttribute(centers,3));
  geometry.setAttribute('sampleTangent',new THREE.Float32BufferAttribute(tangents,3));
}

export function applyRadialGeometry(geometry, radius) {
  const center=geometry.getAttribute('sampleCenter'),axis=geometry.getAttribute('sampleTangent');if(!center)return geometry;
  const position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal');const n=new THREE.Vector3(),t=new THREE.Vector3();
  for(let i=0;i<position.count;i++){
    position.setXYZ(i,center.getX(i)+(position.getX(i)-center.getX(i))*radius,center.getY(i)+(position.getY(i)-center.getY(i))*radius,center.getZ(i)+(position.getZ(i)-center.getZ(i))*radius);
    if(normal){n.fromBufferAttribute(normal,i);t.fromBufferAttribute(axis,i);const along=t.multiplyScalar(n.dot(t));n.sub(along).divideScalar(radius).add(along).normalize();normal.setXYZ(i,n.x,n.y,n.z);}
  }
  geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

export function radialMaterial(source, clone = true) {
  const material=clone?source.clone():source;
  material.onBeforeCompile=shader=>{
    shader.vertexShader='attribute vec3 sampleCenter;\nattribute vec3 sampleTangent;\nattribute float sampleRadius;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed = sampleCenter + (transformed - sampleCenter) * sampleRadius;')
      .replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nvec3 sampleAlong = sampleTangent * dot(objectNormal, sampleTangent);\nobjectNormal = normalize(sampleAlong + (objectNormal - sampleAlong) / sampleRadius);');
  };
  material.customProgramCacheKey=()=> 'orbigen-sample-radius-v1';return material;
}
