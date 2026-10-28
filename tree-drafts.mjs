import {hash,inspectGLB} from './store.mjs';
import {QUALITY} from './public/modules/tree/schema.js';
import {stagePayload,numericReview,reviewSummary} from './public/modules/tree/workflow.js';
import {modelDimensions} from './prefab-import.mjs';
export const TREE_DRAFT_SCOPE='待验收样本：仅供生成效果对照与修整。没有通过六步整树复核，树皮、接缝及 UE 用途仍需验收。';
export class TreeDraftStore{
 constructor(store,modules){this.store=store;this.modules=modules;}
 context(id,quality){
  if(!QUALITY[quality])throw Error('模型精度无效');
  const p=this.modules.project('tree',id);
  return {projectId:id,revision:p.revision,quality,signature:hash(Buffer.from(JSON.stringify({id,revision:p.revision,input:stagePayload(p.recipe,'assembly',quality)}))),qualified:false,scope:TREE_DRAFT_SCOPE};
 }
 save(id,guard,bytes){
  const c=this.context(id,guard.quality);
  if(String(c.revision)!==String(guard.revision)||c.signature!==guard.signature)throw Object.assign(Error('工程已改变，请重新生成待验收样本'),{status:409});
  const stats=inspectGLB(bytes),doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  if(doc.nodes?.some(n=>n.extras?.treeReview))throw Error('待验收样本不能携带整树通过标记');
  const d=doc.nodes?.find(n=>n.extras?.treeDraft)?.extras.treeDraft;
  if(!d||d.projectId!==id||d.revision!==c.revision||d.quality!==c.quality||d.signature!==c.signature||d.qualified!==false)throw Error('模型缺少当前工程的待验收样本标记');
  if(d.report?.quality!==c.quality||!numericReview(d.report,'assembly').ok||d.report.triangles!==stats.triangles||stats.triangles>QUALITY[c.quality].budget)throw Error('样本模型数据无效或超过当前精度预算');
  if(!['M_Leaf','M_Bark'].every(name=>doc.materials?.some(m=>m.name===name)))throw Error('样本缺少叶片或树皮材质');
  const project=this.modules.project('tree',id),dimensions=modelDimensions(bytes),treeDraft={...c,reference:project.reference,report:reviewSummary(d.report),notes:project.notes};
  const result=this.store.import(bytes,{name:('待验收 · '+project.name).slice(0,120),category:'植被',tags:['待验收样本','随机树验证','树皮接缝待修',c.quality],source:('树木工程 '+id+' · 待验收样本。'+TREE_DRAFT_SCOPE+' '+project.notes).slice(0,1000),treeDraft},{maxBytes:128*1048576});
  const asset=this.store.updateAsset(result.asset.id,{dimensions,unitScale:1});
  return {...result,asset,qualified:false,scope:c.scope};
 }
}
