// Read-only diagnostics over the existing generator output; no new geometry kernel.
export function inspectTreeMeshes(meshes,branches=[]){
 const stats={leafVertices:0,barkVertices:0,issues:[],junctions:branches.filter(b=>b.parent).length,surfaceUnion:'not-performed'};
 for(const mesh of meshes){const p=mesh.attributes.position,n=mesh.attributes.normal,uv=mesh.attributes.uv,count=p?.array.length/3;
  if(!Number.isInteger(count)||!count){stats.issues.push('空网格');continue;}if(mesh.material.bark)stats.barkVertices+=count;else if(mesh.material.name==='M_Leaf')stats.leafVertices+=count;
  if(!n||n.array.length!==count*3)stats.issues.push('网格法线缺失');else{let bad=0;for(let i=0;i<n.array.length;i+=3){const l=Math.hypot(n.array[i],n.array[i+1],n.array[i+2]);if(!Number.isFinite(l)||l<.5||l>1.5)bad++;}if(bad)stats.issues.push('异常法线 '+bad+' 个');}
  if(!uv||uv.array.length!==count*2||uv.array.some(v=>!Number.isFinite(v)))stats.issues.push('网格 UV 缺失或无效');if(mesh.index.some(i=>i>=count))stats.issues.push('三角面索引越界');
 }return stats;
}
