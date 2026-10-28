import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {TREE_STAGES,stageDefinition,stagePayload,numericReview,reviewSummary,TREE_REVIEW_LIMITS} from './public/modules/tree/workflow.js';
import {normalizeTreeRecipe,QUALITY} from './public/modules/tree/schema.js';
const sha=s=>createHash('sha256').update(s).digest('hex');
const conflict=message=>Object.assign(Error(message),{status:409});
export class TreeReviewStore{
 constructor(db,modules,data){this.db=db;this.modules=modules;this.data=data;db.exec('CREATE TABLE IF NOT EXISTS tree_stage_reviews(id TEXT PRIMARY KEY, project TEXT NOT NULL, stage TEXT NOT NULL, signature TEXT NOT NULL, json TEXT NOT NULL); CREATE INDEX IF NOT EXISTS tree_reviews_project ON tree_stage_reviews(project,stage);');}
 describe(projectId,quality='PREVIEW'){
  if(!QUALITY[quality])throw Error('模型精度无效');const p=this.modules.project('tree',projectId),r=normalizeTreeRecipe(p.recipe);
  const records=this.db.prepare('SELECT json FROM tree_stage_reviews WHERE project=? ORDER BY rowid DESC').all(projectId).map(x=>JSON.parse(x.json));const receipts=[];let allowed=true;
  const stages=TREE_STAGES.map(s=>{
   const signature=sha(JSON.stringify({input:stagePayload(r,s.id,quality),upstream:receipts,...(s.id==='output'?{provenance:{notes:p.notes,reference:p.reference}}:{})}));const current=records.find(x=>x.stage===s.id&&x.signature===signature),historical=records.find(x=>x.stage===s.id);
   const approved=current?.verdict==='passed'&&s.checks.every(([id])=>current.checks?.[id]===true)&&numericReview(current.report,s.id).ok;
   const status=!allowed?'locked':approved?'passed':current?.verdict==='needs-work'?'needs-work':historical?'stale':'pending';
   const item={...s,signature,status,record:allowed?current??null:null,previous:historical?{id:historical.id,reviewedAt:historical.reviewedAt,verdict:historical.verdict,notes:historical.notes}:null};if(status==='passed')receipts.push(current.id);else allowed=false;return item;
  });return {version:1,projectId,revision:p.revision,quality,stages,completed:stages.filter(s=>s.status==='passed').length,limits:TREE_REVIEW_LIMITS};
 }
 record(projectId,input){
  const p=this.modules.project('tree',projectId);if(p.revision!==input.baseRevision)throw conflict('工程已经变化，请保存当前参数后重新复核');
  const workflow=this.describe(projectId,input.quality),s=workflow.stages.find(s=>s.id===input.stage);stageDefinition(input.stage);
  if(s.status==='locked')throw conflict('请先完成前一步复核');if(s.signature!==input.signature)throw conflict('复核模型的参数或前置记录已变化，请重新检查');
  if(!['passed','needs-work'].includes(input.verdict))throw Error('复核结论无效');const checks=Object.fromEntries(s.checks.map(([id])=>[id,input.checks?.[id]===true]));
  if(input.verdict==='passed'&&s.checks.some(([id])=>!checks[id]))throw Error('请逐项复核并确认本步检查项');
  if(typeof input.notes!=='string'||input.notes.length>2000||input.verdict==='needs-work'&&!input.notes.trim())throw Error('请记录需要修整的问题，最多 2000 字');
  const report=reviewSummary(input.report??{}),automatic=numericReview(report,s.id);if(input.verdict==='passed'&&!automatic.ok)throw Error('当前模型检查未通过：'+automatic.issues.join('；'));
  if(report.quality!==input.quality)throw conflict('检查结果的精度与当前复核不同');
  const evidence=this.validateEvidence(input.evidence,s,input.verdict==='passed');if(evidence.some(e=>e.signature!==s.signature))throw conflict('复核预览属于旧版本');
  const record={id:randomUUID(),projectId,stage:s.id,signature:s.signature,quality:input.quality,revision:p.revision,verdict:input.verdict,checks,notes:input.notes,report,automatic,evidence,reviewedAt:new Date().toISOString(),scope:TREE_REVIEW_LIMITS};
  this.db.prepare('INSERT INTO tree_stage_reviews VALUES(?,?,?,?,?)').run(record.id,projectId,s.id,s.signature,JSON.stringify(record));return this.describe(projectId,input.quality);
 }
 validateEvidence(evidence,s,required){
  if(!Array.isArray(evidence)||evidence.length>4)throw Error('复核预览无效');
  const views=evidence.map(e=>{
   if(!e||!['front','side','structure-front','structure-side'].includes(e.view)||e.mode!==s.mode||typeof e.signature!=='string'||!/^[a-f0-9]{64}$/.test(e.signature)||!/^\/previews\/stage_[a-f0-9]{16}\.png$/.test(e.url)||!Array.isArray(e.camera?.position)||e.camera.position.length!==3||e.camera.position.some(v=>!Number.isFinite(v))||!Array.isArray(e.camera.target)||e.camera.target.length!==3||e.camera.target.some(v=>!Number.isFinite(v)))throw Error('复核预览或相机无效');
   const file=path.join(this.data,'previews',path.basename(e.url));if(!fs.existsSync(file))throw Error('复核预览文件不存在，请重新保存');const bytes=fs.readFileSync(file),digest=sha(bytes);
   if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||path.basename(file)!=='stage_'+digest.slice(0,16)+'.png')throw Error('复核预览内容不匹配');
   return {view:e.view,mode:e.mode,url:e.url,signature:e.signature,sha256:digest,camera:{position:e.camera.position,target:e.camera.target},capturedAt:new Date().toISOString()};
  });if(required&&(!views.some(e=>e.view==='front')||!views.some(e=>e.view==='side')))throw Error('请保存正面和侧面复核预览');if(required&&['branch','assembly','quality'].includes(s.id)&&(!views.some(e=>e.view==='structure-front')||!views.some(e=>e.view==='structure-side')))throw Error('请保存隐藏叶片后的枝干接缝复核预览');return views;
 }
 requireOutput(projectId,{quality,signature,revision}){
  const w=this.describe(projectId,quality);if(w.revision!==Number(revision)||w.stages.at(-1).signature!==signature)throw conflict('工程或复核版本已改变，未输出');
  if(w.completed!==TREE_STAGES.length)throw conflict('请按顺序完成六步复核后输出整树');return w;
 }
}
