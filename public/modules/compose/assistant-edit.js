import {validateOperations} from './assistant-protocol.js';
import {validateCompose} from './schema.js';
import {releaseAlignmentInstances} from './reference-schema.js';
import {roleForCategory} from './stock.js';
import {cameraFromSpec,segmentInstance} from './reference-rig.js';
export function editCandidate(project,operations,assets){
 validateOperations(operations);const p=structuredClone(project),assetMap=new Map(assets.filter(a=>!a.deletedAt).map(a=>[a.id,a]));
 const instance=id=>{const i=p.instances.find(i=>i.id===id);if(!i)throw Error('实例不存在：'+id);if(i.locked)throw Error('实例已锁定：'+i.name);return i;};
 const partFor=assetId=>{let part=p.parts.find(x=>x.assetId===assetId&&x.status==='confirmed');if(!part){const a=assetMap.get(assetId);if(!a)throw Error('素材不存在或已删除');part={id:'assistant-part-'+assetId,name:a.name,category:a.category,role:roleForCategory(a.category),rect:[...p.roi],depth:0,elevation:0,count:1,status:'confirmed',needsPlacement:false,assetId,confidence:0,evidence:'助手使用本地真实素材搭建',candidates:[]};p.parts.push(part);}return part;};
 for(const o of operations){
 if(o.kind==='remove'){instance(o.id);p.instances=p.instances.filter(i=>i.id!==o.id);p.marks=p.marks.filter(m=>m.instanceId!==o.id);releaseAlignmentInstances(p.alignment,new Set([o.id]));continue;}
 if(o.kind==='update'){Object.assign(instance(o.id),Object.fromEntries(['name','position','rotation','scale'].filter(k=>o[k]!=null).map(k=>[k,o[k]])));continue;}
 if(p.instances.some(i=>i.id===o.id)&&o.kind!=='fit')throw Error('新实例 ID 已存在：'+o.id);
 if(o.kind==='duplicate'){const source=instance(o.sourceId);p.instances.push({...structuredClone(source),id:o.id,locked:false,...Object.fromEntries(['name','position','rotation','scale'].filter(k=>o[k]!=null).map(k=>[k,o[k]]))});continue;}
 const source=p.sources.find(s=>s.id===o.assetId);if(!source||!assetMap.has(o.assetId))throw Error('素材版本尚未准备');const part=partFor(o.assetId);
 let i;if(o.kind==='fit'){if(!p.alignment)throw Error('此工程尚未记录参考相机');const built=segmentInstance({source,part,id:o.id,name:o.name||source.name,camera:cameraFromSpec(p.alignment.camera),pixels:o.pixels,thickness:o.thickness,depth:o.depth});i=built.instance;const existing=p.instances.find(x=>x.id===o.id);if(existing){instance(o.id);if(existing.assetId!==o.assetId)throw Error('端点对齐不能替换既有实例的素材');Object.assign(existing,i);}else p.instances.push(i);const step=p.alignment.steps.find(s=>s.instanceId===o.id||s.id===o.id);if(step)Object.assign(step,{instanceId:o.id,status:'placed',anchors:built.anchors});continue;}
 i={id:o.id,partId:part.id,name:o.name||source.name,assetId:source.id,version:source.version,unitScale:source.unitScale,locked:false,position:o.position,rotation:o.rotation,scale:o.scale,...(source.geometry?{geometry:structuredClone(source.geometry)}:{})};p.instances.push(i);
 }
 validateCompose(p);return p;
}
export async function applyAssistantEdit(w,operations){
 validateOperations(operations);if(w.busy)throw Error('请等待当前编辑完成');const epoch=w.epoch,project=w.project,initial=JSON.stringify(w.snapshot());w.setBusy(true);
 try{const prepared=structuredClone(project);for(const id of new Set(operations.filter(o=>['add','fit'].includes(o.kind)).map(o=>o.assetId))){if(!prepared.sources.some(s=>s.id===id)){const source=await w.descriptor(id),g=await w.api('/api/assets/'+id+'/compose-mesh',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});source.geometry={...g,dimensions:source.dimensions.map(d=>d/source.unitScale)};prepared.sources.push(source);}}
 const candidate=editCandidate(prepared,operations,w.assets()),group=await w.scene(candidate);if(w.project!==project||w.epoch!==epoch||!w.active()||JSON.stringify(w.snapshot())!==initial)throw Error('工程已变化，助手修改未应用');w.remember();Object.assign(project,candidate);w.mark();w.parts();w.inspector();w.show(group);await w.save();return '已执行 '+operations.length+' 项组件操作并保存；可一次撤销本组';
 }finally{w.setBusy(false);}
}
