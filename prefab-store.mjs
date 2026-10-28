import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateAssetName} from './asset-files.mjs';
import {inspectGLB,hash} from './store.mjs';
import {ASSET_CATEGORIES} from './public/modules/asset-folder/classify.js';
import {PREFAB_MODEL_MAX_BYTES} from './public/modules/prefabs/limits.js';

const vector=v=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6);
const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
export class PrefabStore {
 constructor(store,modules){this.store=store;this.modules=modules;this.db=store.db;this.db.exec('CREATE TABLE IF NOT EXISTS prefabs(id TEXT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,json TEXT NOT NULL)');}
 get(id){const row=this.db.prepare('SELECT json FROM prefabs WHERE id=?').get(id);if(!row)throw Error('半成品不存在');return {...JSON.parse(row.json),asset:this.store.asset(id)};}
 list({includeTrash=false}={}){return this.db.prepare('SELECT id FROM prefabs ORDER BY rowid DESC').all().map(r=>this.get(r.id)).filter(p=>includeTrash||!p.asset.deletedAt);}
 validateInfo(input){validateAssetName(input.name);if(!text(input.name,120)||!ASSET_CATEGORIES.includes(input.category)||!Array.isArray(input.tags)||input.tags.length>20||input.tags.some(t=>!text(t,60)))throw Error('请填写半成品名称、分类和有效标签');if(input.notes!==undefined&&(typeof input.notes!=='string'||input.notes.length>4000))throw Error('备注最多 4000 字');}
 importModel(bytes,input){
  this.validateInfo(input);inspectGLB(bytes);this.db.exec('BEGIN IMMEDIATE');try{
   const result=this.store.import(bytes,{name:input.name.trim(),category:input.category,tags:input.tags,source:'本地半成品 · '+input.file},{maxBytes:PREFAB_MODEL_MAX_BYTES});if(result.duplicate)throw Error('此半成品模型已存在');
   const asset={...result.asset,kind:'prefab',dimensions:input.dimensions,unitScale:1,state:'半成品'},record={schemaVersion:1,id:asset.id,name:asset.name,source:{module:'local',name:input.file,format:input.format.toUpperCase(),file:input.file,originalSHA:input.sourceHash,convertedSHA:input.convertedHash,...(input.conversion?{conversion:input.conversion}:{})},notes:input.notes||'',instances:[],sources:[],anchor:[0,0,0],componentCount:1,createdAt:asset.createdAt};
   this.db.prepare('UPDATE assets SET json=? WHERE id=?').run(JSON.stringify(asset),asset.id);this.db.prepare('INSERT INTO prefabs VALUES(?,?)').run(asset.id,JSON.stringify(record));this.db.exec('COMMIT');return {...record,asset};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 replaceLocalPreview(id,bytes,{expectedSHA,originalSHA,dimensions,conversion,convertedSHA=hash(bytes)}){
  const current=this.get(id),old=current.asset;if(old.deletedAt||current.source.module!=='local'||old.sha!==expectedSHA||current.source.originalSHA!==originalSHA)throw Error('半成品来源或版本已变化，未替换');
  if(!vector(dimensions)||dimensions.some(n=>n<=0))throw Error('模型尺寸无效');
  // Frozen project references keep their original model. Never rewrite a used version.
  this.db.exec('BEGIN IMMEDIATE');try{
   for(const table of ['projects','checkpoints','module_projects','breakdown_projects','prefabs']){
    if(!this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table))continue;
    for(const row of this.db.prepare('SELECT id,json FROM '+table).all())if(row.id!==id&&row.json.includes(id))throw Error('该半成品已被工程引用，请另存修复版本');
   }
   if(old.localFiles)throw Error('该半成品已有命名文件，请另存修复版本');
   const stats=inspectGLB(bytes),sha=hash(bytes);if(sha===old.sha)throw Error('修复模型与旧模型相同');
   const duplicate=this.db.prepare('SELECT id FROM assets WHERE sha=?').get(sha);if(duplicate)throw Error('修复模型已存在');
   const target=path.join(this.store.dir,'blobs',sha+'.glb');if(!fs.existsSync(target)){fs.writeFileSync(target+'.tmp',bytes);fs.renameSync(target+'.tmp',target);}
   const asset={...old,sha,bytes:bytes.length,dimensions,...stats,updatedAt:new Date().toISOString()};const {asset:ignored,...record}=current;
   record.source={...record.source,convertedSHA,conversion};record.previewRevisions=[...(record.previewRevisions||[]),{sha:old.sha,bytes:old.bytes,dimensions:old.dimensions,source:current.source,replacedAt:asset.updatedAt}];record.updatedAt=asset.updatedAt;
   this.db.prepare('UPDATE assets SET sha=?,json=? WHERE id=?').run(sha,JSON.stringify(asset),id);this.db.prepare('UPDATE prefabs SET json=? WHERE id=?').run(JSON.stringify(record),id);this.db.exec('COMMIT');return {...record,asset};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 create(input){
  this.validateInfo(input);
  const source=input.source;if(!source||!['assembly','compose'].includes(source.module)||!text(source.projectId,120))throw Error('半成品来源工程无效');
  const p=source.module==='assembly'?this.store.project(source.projectId):this.modules.project('compose',source.projectId);
  if(p.revision!==source.revision)throw Object.assign(Error('来源工程已改变，请保存并重新选择组件'),{status:409});
  if(!Array.isArray(input.instanceIds)||!input.instanceIds.length||input.instanceIds.length>500||new Set(input.instanceIds).size!==input.instanceIds.length||!vector(input.anchor)||!vector(input.dimensions)||input.dimensions.some(n=>n<=0))throw Error('请选择组件并提供有效尺寸');
  const selected=input.instanceIds.map(id=>{const i=p.instances.find(i=>i.id===id);if(!i)throw Error('选中的组件已不存在');return i;});
  const sources=[...new Set(selected.map(i=>i.assetId))].map(id=>{const a=this.store.asset(id);if(a.deletedAt)throw Error('组件在回收站，请先恢复：'+a.name);return {id:a.id,sha:a.sha,version:a.version,name:a.name,triangles:a.triangles};});
  for(const i of selected)if(sources.find(s=>s.id===i.assetId)?.version!==i.version)throw Error('组件版本不匹配');
  if(typeof input.glb!=='string'||input.glb.length>Math.ceil(64*1048576/3)*4||!/^[A-Za-z0-9+/]+={0,2}$/.test(input.glb))throw Error('半成品模型无效或超过 64 MB');
  const bytes=Buffer.from(input.glb,'base64'),stats=inspectGLB(bytes),triangles=selected.reduce((sum,i)=>sum+(i.geometry?.triangles??sources.find(s=>s.id===i.assetId).triangles),0);
  if(stats.triangles!==triangles)throw Error('半成品模型与组件数量不匹配');
  const instances=selected.map(i=>({...structuredClone(i),position:i.position.map((v,n)=>v-input.anchor[n])}));
  this.db.exec('BEGIN IMMEDIATE');try{
   const result=this.store.import(bytes,{name:input.name.trim(),category:input.category,tags:input.tags,source:'半成品 · '+p.name});
   if(result.duplicate)throw Error('此模型已存在，请另存半成品');
   const asset={...result.asset,kind:'prefab',dimensions:input.dimensions.slice(),unitScale:1,state:'半成品'};
   const record={schemaVersion:1,id:asset.id,name:asset.name,notes:input.notes||'',source:{module:source.module,projectId:p.id,name:p.name,revision:p.revision},instances,sources,anchor:input.anchor.slice(),componentCount:instances.length,createdAt:asset.createdAt};
   this.db.prepare('UPDATE assets SET json=? WHERE id=?').run(JSON.stringify(asset),asset.id);this.db.prepare('INSERT INTO prefabs VALUES(?,?)').run(asset.id,JSON.stringify(record));this.db.exec('COMMIT');return {...record,asset};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 rename(id,input){const {asset:old,...record}=this.get(id);this.validateInfo({name:input.name??old.name,category:input.category??old.category,tags:input.tags??[],notes:input.notes!==undefined?input.notes:record.notes});const asset=this.store.updateAsset(id,input);record.name=asset.name;if(input.notes!==undefined)record.notes=input.notes;record.updatedAt=asset.updatedAt;this.db.prepare('UPDATE prefabs SET json=? WHERE id=?').run(JSON.stringify(record),id);return asset;}
 insert(id,input){
  const prefab=this.get(id),a=prefab.asset;if(a.deletedAt)throw Error('请先恢复半成品');
  if(!['assembly','compose'].includes(input.module)||!text(input.projectId,120))throw Error('请选择目标工程');
  const p=input.module==='assembly'?this.store.project(input.projectId):this.modules.project('compose',input.projectId);
  if(p.revision!==input.baseRevision)throw Object.assign(Error('目标工程已改变，请刷新半成品库后再添加'),{status:409});
  const i={id:randomUUID(),assetId:a.id,version:a.version,name:a.name,unitScale:1,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],locked:false};
  if(input.module==='assembly')return {module:'assembly',project:this.store.saveProject(p.id,p.revision,{...p,instances:[...p.instances,i]})};
  const part={id:randomUUID(),name:a.name,category:a.category,role:'other',rect:[0,0,1,1],depth:0,elevation:0,count:1,status:'confirmed',assetId:a.id,confidence:0,evidence:'从半成品库加入，保留原组合',candidates:[]};i.partId=part.id;
  const sources=p.sources.some(s=>s.id===a.id)?p.sources:[...p.sources,{id:a.id,sha:a.sha,version:a.version,name:a.name,triangles:a.triangles,unitScale:1,dimensions:a.dimensions}];
  return {module:'compose',project:this.modules.save('compose',p.id,{...p,baseRevision:p.revision,parts:[...p.parts,part],sources,instances:[...p.instances,i]})};
 }
 unpack(id){
  const prefab=this.get(id);if(prefab.asset.deletedAt)throw Error('请先恢复半成品');
  if(prefab.source.module==='local'){const p=this.store.createProject(prefab.asset.name+' · 继续组装');return this.insert(id,{module:'assembly',projectId:p.id,baseRevision:0});}
  for(const s of prefab.sources){const a=this.store.asset(s.id);if(a.deletedAt)throw Error('原组件在回收站，请先恢复：'+s.name);if(a.sha!==s.sha||a.version!==s.version)throw Error('原组件版本不匹配：'+s.name);}
  this.db.exec('BEGIN IMMEDIATE');try{const p=this.store.createProject(prefab.asset.name+' · 二次组装'),instances=prefab.instances.map(i=>({...i,id:randomUUID(),locked:false}));const result=this.store.saveProject(p.id,0,{...p,instances});this.db.exec('COMMIT');return {module:'assembly',project:result};}catch(e){this.db.exec('ROLLBACK');throw e;}
 }
}
