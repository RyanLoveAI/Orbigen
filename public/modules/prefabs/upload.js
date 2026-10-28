import {PREFAB_UPLOAD_CHUNK_BYTES} from './limits.js';
export async function uploadPrefabFiles(api,files,info,onProgress=()=>{}){
 const list=[...files],total=list.reduce((n,f)=>n+f.size,0);let id=null,done=0;
 const post=value=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
 try{const session=await api('/api/prefabs/uploads',post({...info,files:list.map(f=>({name:f.webkitRelativePath||f.name,size:f.size}))}));id=session.id;
  for(let i=0;i<list.length;i++){const f=list[i];let offset=0;do{onProgress(`正在上传 ${i+1}/${list.length}：${f.name} · ${total?Math.floor(done/total*100):0}%（${(done/1048576).toFixed(1)}/${(total/1048576).toFixed(1)} MB）`);const end=Math.min(offset+PREFAB_UPLOAD_CHUNK_BYTES,f.size),r=await api(`/api/prefabs/uploads/${id}/files/${i}`,{method:'PUT',headers:{'X-Upload-Offset':String(offset)},body:f.slice(offset,end)});if(r.uploaded!==end)throw Error('上传结果不匹配，请重新导入');done+=end-offset;offset=end;}while(offset<f.size);}
  onProgress('上传完成，正在由 Blender 转换、检查模型并入库…');return await api(`/api/prefabs/uploads/${id}/complete`,post({}));
 }catch(e){if(id)await api(`/api/prefabs/uploads/${id}`,{method:'DELETE'}).catch(()=>{});throw e;}
}
