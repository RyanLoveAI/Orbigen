import fs from 'node:fs';import path from 'node:path';import {randomUUID,createHash} from 'node:crypto';
import {validateBreakdown,readyParts,VIEWS,STATES} from './public/modules/breakdown/schema.js';
import {ROLES} from './public/modules/compose/schema.js';
const error=message=>{throw Error(message);},digest=value=>createHash('sha256').update(value).digest('hex');
export class BreakdownStore{
 constructor(db,references,data){Object.assign(this,{db,references,data});db.exec('CREATE TABLE IF NOT EXISTS breakdown_projects(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,reference_sha TEXT UNIQUE NOT NULL,json TEXT NOT NULL)');this.seedCompose();}
 withGeneration(project){
  if(!this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='generation_jobs'").get())return project;
  const jobs=this.db.prepare('SELECT json FROM generation_jobs ORDER BY rowid DESC').all().map(r=>JSON.parse(r.json));
  return {...project,parts:project.parts.map(part=>{
   const matches=jobs.filter(job=>{
    if(job.sourceBreakdown?.projectId&&job.sourceBreakdown?.partId)return job.sourceBreakdown.projectId===project.id&&job.sourceBreakdown.partId===part.id;
    if(part.tripoTask&&[job.id,job.remoteID].includes(part.tripoTask.trim()))return true;
    return VIEWS.every(([key])=>part.views[key]?.sha&&job.referenceViews?.find(v=>v?.view===key)?.sha256===part.views[key].sha);
   });
   const job=matches.find(j=>j.status==='success'&&j.assetID);
   const clean={...part};delete clean.generation;
   return job?{...clean,generation:{status:'success',jobId:job.id,taskId:job.remoteID||'',assetId:job.assetID,completedAt:job.completedAt||job.updatedAt}}:clean;
  })};
 }
 reference(ref){
  if(!ref||typeof ref.name!=='string'||ref.name.length>120)error('渲染图信息无效');const file=this.references.file(ref.sha);const stat=fs.statSync(file);if(!stat.isFile()||stat.size>8*1048576)error('图片文件无效');const header=Buffer.alloc(24),fd=fs.openSync(file,'r');try{fs.readSync(fd,header,0,24,0);}finally{fs.closeSync(fd);}if(header.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||header.subarray(12,16).toString()!=='IHDR')error('图片需要有效PNG');const width=header.readUInt32BE(16),height=header.readUInt32BE(20);if(!width||!height||width>4096||height>4096)error('图片尺寸无效');return {sha:ref.sha,name:ref.name,url:'/references/'+ref.sha+'.png',width,height};
 }
 list({includeTrash=false}={}){return this.db.prepare('SELECT json FROM breakdown_projects').all().map(r=>JSON.parse(r.json)).filter(p=>includeTrash||!p.deletedAt).sort((a,b)=>a.order-b.order||a.createdAt.localeCompare(b.createdAt));}
 get(id){const row=this.db.prepare('SELECT json FROM breakdown_projects WHERE id=?').get(id);if(!row)error('分拆记录不存在');return JSON.parse(row.json);}
 create({name,reference,parts=[],sourceComposeId=null}){
  const ref=this.reference(reference),existing=this.db.prepare('SELECT id FROM breakdown_projects WHERE reference_sha=?').get(ref.sha);if(existing){const p=this.get(existing.id);if(p.deletedAt)error('这张渲染图已在分拆回收站，请先恢复记录');return p;}
  const all=this.list({includeTrash:true});if(all.length>=500)error('最多保存500张渲染图分拆记录');const now=new Date().toISOString(),p={id:randomUUID(),revision:0,name:String(name||ref.name.replace(/\.[^.]+$/,'')||'渲染图分拆').slice(0,120),order:all.length?Math.max(...all.map(p=>p.order))+1:0,reference:ref,parts,archived:false,sourceComposeId,createdAt:now,updatedAt:now,events:[{at:now,message:sourceComposeId?'从已有组建渲染图建立分拆记录':'导入渲染图，开始分拆'}]};
  validateBreakdown(p);if(p.parts.some(part=>part.deletedAt!==undefined))error('新组件不能带删除标记');for(const part of p.parts)for(const [key,view] of Object.entries(part.views))part.views[key]=this.reference(view);
  this.db.prepare('INSERT INTO breakdown_projects VALUES(?,?,?,?)').run(p.id,0,ref.sha,JSON.stringify(p));return p;
 }
 seedCompose(){
  if(!this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='module_projects'").get())return {added:0};
  const rows=this.db.prepare("SELECT json FROM module_projects WHERE module='compose' ORDER BY rowid").all();let added=0;
  for(const row of rows){const p=JSON.parse(row.json);if(!p.reference||this.db.prepare('SELECT id FROM breakdown_projects WHERE reference_sha=?').get(p.reference.sha))continue;
   try{this.create({name:p.name,reference:p.reference,sourceComposeId:p.id,parts:(p.parts||[]).map((part,i)=>({id:randomUUID(),name:part.name||`${ROLES[part.role]?.name||'组件'} ${i+1}`,category:ROLES[part.role]?.category||'其他',state:'pending',notes:part.note||'',prompt:'',tripoTask:'',rect:part.rect||null,views:{},archived:false}))});added++;}catch(e){console.error('已有渲染图未导入分拆记录：'+e.message);}
  }return {added};
 }
 save(id,input){
  const old=this.get(id);if(old.deletedAt)error('分拆记录已在回收站，请先恢复');if(input.baseRevision!==old.revision)throw Object.assign(Error('记录已被其他窗口修改，当前草稿已保留，请导出记录后重新读取'),{status:409});
  const next={...old,name:input.name,order:input.order,archived:input.archived,parts:input.parts,revision:old.revision+1,updatedAt:new Date().toISOString()};validateBreakdown(next);
  next.parts=next.parts.map(part=>({...part,views:Object.fromEntries(Object.entries(part.views).map(([k,v])=>[k,this.reference(v)]))}));
  for(const part of next.parts){const previous=old.parts.find(p=>p.id===part.id);if(part.deletedAt!==previous?.deletedAt)error('请通过组件回收站删除或恢复');if(previous?.deletedAt&&JSON.stringify(part)!==JSON.stringify(previous))error('已删除的组件不能编辑，请先恢复');}
  const changes=[];if(next.name!==old.name)changes.push('渲染图名称：'+next.name);if(next.archived!==old.archived)changes.push(next.archived?'归档渲染图':'恢复渲染图');
  for(const part of next.parts){let previous=old.parts.find(x=>x.id===part.id);if(!previous){changes.push('新增组件：'+part.name);previous={...part,views:{},notes:'',prompt:'',tripoTask:'',state:'pending',rect:null};}
   if(part.archived!==previous.archived)changes.push((part.archived?'归档组件：':'恢复组件：')+part.name);
   if(part.state!==previous.state)changes.push(part.name+'：'+STATES[part.state]);
   for(const [key,label] of VIEWS)if(part.views[key]?.sha!==previous.views[key]?.sha)changes.push(part.name+'：'+(part.views[key]?'更新':'移除')+label+'视图');
   if(part.notes!==previous.notes)changes.push(part.name+' · 备注：'+part.notes.slice(0,200));
   if(part.prompt!==previous.prompt)changes.push(part.name+'：更新生成描述');if(part.name!==previous.name||part.category!==previous.category||JSON.stringify(part.rect)!==JSON.stringify(previous.rect))changes.push('调整分拆组件：'+part.name);
   if(part.tripoTask!==previous.tripoTask)changes.push(part.name+'：登记Tripo任务 '+part.tripoTask);
  }
  // Components are archived instead of being dropped, preserving their images and notes.
  if(old.parts.some(p=>!next.parts.some(n=>n.id===p.id)))error('请归档组件，保留分拆过程');
  if(JSON.stringify(old.parts.map(p=>p.id))!==JSON.stringify(next.parts.map(p=>p.id)))changes.push('调整组件排列');
  next.events=[...old.events,...changes.map(message=>({at:next.updatedAt,message}))].slice(-200);
  const result=this.db.prepare('UPDATE breakdown_projects SET revision=?,json=? WHERE id=? AND revision=?').run(next.revision,JSON.stringify(next),id,old.revision);if(result.changes!==1)throw Object.assign(Error('分拆记录版本冲突'),{status:409});return next;
 }
 recycle(id){return this.setDeleted(id,true);}
 restore(id){return this.setDeleted(id,false);}
 setPartDeleted(id,partId,deleted,baseRevision){
  const old=this.get(id);if(old.deletedAt)error('分拆记录已在回收站，请先恢复');
  if(baseRevision!==old.revision)throw Object.assign(Error('分拆记录已变化，请保存或重新读取后再操作组件'),{status:409});
  const part=old.parts.find(p=>p.id===partId);if(!part)error('分拆组件不存在');
  if(Boolean(part.deletedAt)===deleted)return old;
  const now=new Date().toISOString(),next={...old,revision:old.revision+1,updatedAt:now,parts:old.parts.map(p=>{if(p.id!==partId)return p;const restored={...p};if(deleted)restored.deletedAt=now;else delete restored.deletedAt;return restored;}),events:[...old.events,{at:now,message:(deleted?'删除组件，移入组件回收站：':'从组件回收站恢复：')+part.name}].slice(-200)};
  const result=this.db.prepare('UPDATE breakdown_projects SET revision=?,json=? WHERE id=? AND revision=?').run(next.revision,JSON.stringify(next),id,old.revision);
  if(result.changes!==1)throw Object.assign(Error('分拆记录版本冲突，请刷新'),{status:409});return next;
 }
 setDeleted(id,deleted){
  const old=this.get(id);if(Boolean(old.deletedAt)===deleted)return old;
  const now=new Date().toISOString(),p={...old,revision:old.revision+1,updatedAt:now,events:[...old.events,{at:now,message:deleted?'删除分拆记录，移入回收站':'从回收站恢复分拆记录'}].slice(-200)};
  if(deleted)p.deletedAt=now;else delete p.deletedAt;
  const result=this.db.prepare('UPDATE breakdown_projects SET revision=?,json=? WHERE id=? AND revision=?').run(p.revision,JSON.stringify(p),id,old.revision);
  if(result.changes!==1)throw Object.assign(Error('分拆记录版本冲突，请刷新'),{status:409});return p;
 }
 reorder(ids){const all=this.list();if(!Array.isArray(ids)||ids.length!==all.length||new Set(ids).size!==ids.length||ids.some(id=>!all.some(p=>p.id===id)))error('排列清单已变化，请刷新');this.db.exec('BEGIN IMMEDIATE');try{ids.forEach((id,order)=>{const p=this.get(id);if(p.order===order)return;p.order=order;p.revision++;p.updatedAt=new Date().toISOString();this.db.prepare('UPDATE breakdown_projects SET revision=?,json=? WHERE id=?').run(p.revision,JSON.stringify(p),id);});this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}return this.list();}
 export(id,partIds=null){
  const p=this.get(id);if(p.deletedAt)error('分拆记录已在回收站，请先恢复后导出');if(partIds!==null&&(!Array.isArray(partIds)||!partIds.length||new Set(partIds).size!==partIds.length||partIds.some(id=>!p.parts.some(part=>part.id===id&&!part.archived&&!part.deletedAt))))error('导出组件清单无效');const requested={...p,parts:p.parts.filter(part=>!part.deletedAt&&(partIds===null||partIds.includes(part.id)))},parts=readyParts(requested);if(!parts.length)error('请至少准备一件完整且互不重复的四视图组件');
  const clean=name=>name.normalize('NFKC').replace(/[^\p{L}\p{N}._ -]/gu,'_').replace(/^\.+/,'').slice(0,50)||'组件';
  const manifest={schema:'orbigen-breakdown-v1',projectId:p.id,name:p.name,revision:p.revision,reference:p.reference,parts:parts.map((part,i)=>({...part,folder:String(i+1).padStart(3,'0')+'_'+clean(part.name)+'_'+part.id.slice(0,8)})),skipped:requested.parts.filter(part=>!part.archived&&!parts.includes(part)).map(part=>({id:part.id,name:part.name})),events:p.events};
  const base=path.join(this.data,'breakdowns',p.id,'exports'),root=path.join(base,digest(JSON.stringify(manifest)).slice(0,16));fs.mkdirSync(base,{recursive:true});
  if(!fs.existsSync(root)){
   const temp=fs.mkdtempSync(path.join(base,'.export-'));try{
    fs.copyFileSync(this.references.file(p.reference.sha),path.join(temp,'渲染图.png'));for(const part of manifest.parts){const folder=path.join(temp,part.folder);fs.mkdirSync(folder);for(const [key] of VIEWS){this.reference(part.views[key]);fs.copyFileSync(this.references.file(part.views[key].sha),path.join(folder,key+'.png'));}}
    fs.writeFileSync(path.join(temp,'分拆记录.json'),JSON.stringify(manifest,null,2));fs.writeFileSync(path.join(temp,'使用说明.txt'),'每个子文件夹是一件组件，直接包含 front.png、left.png、back.png、right.png。\n在 Tripo 四视图批量页面选择本根目录，先扫描并核对积分，再确认生成。\n分拆记录.json 保存名称、分类、描述、备注和图像哈希。未就绪组件未导出。\n');fs.renameSync(temp,root);
   }catch(e){fs.rmSync(temp,{recursive:true,force:true});throw e;}
  }
  return {root,count:parts.length,skipped:manifest.skipped,projectId:id};
 }
}
