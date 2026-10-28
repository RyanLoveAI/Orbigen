import {ASSET_IMPORT_MAX_BYTES,checkAssetSize} from './public/modules/library/import.js';
import {verifyComposeMesh} from './compose-meshes.mjs';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {actualAssetDate,assetDateOf,isAssetDate,withAssetDateTag} from './public/modules/library/dates.js';
import {validateAssetName,syncAssetFiles,recoverAssetFileRenames,purgeAssetFiles} from './asset-files.mjs';
import {ASSET_CATEGORIES} from './public/modules/asset-folder/classify.js';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function inspectGLB(bytes){
 if(bytes.length<20||bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('需要完整的 GLB 2.0 文件');
 let json=null,offset=12;
 while(offset<bytes.length){if(offset+8>bytes.length)throw Error('GLB 数据块不完整');const len=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);if(offset+8+len>bytes.length||len%4)throw Error('GLB 数据块长度无效');if(offset===12&&type!==0x4e4f534a)throw Error('GLB 首块必须为 JSON');if(type===0x4e4f534a)json=JSON.parse(bytes.subarray(offset+8,offset+8+len).toString());offset+=8+len;}
 if(!json||json.asset?.version!=='2.0'||!json.meshes?.length)throw Error('文件没有可用静态网格');
 if(json.skins?.length||json.animations?.length)throw Error('本版支持静态 GLB，请先导出静态模型');
 if([...(json.buffers||[]),...(json.images||[])].some(x=>x.uri&&!x.uri.startsWith('data:')))throw Error('请内嵌所有模型和贴图依赖后再导入');
 const supported=new Set(['KHR_materials_unlit','KHR_materials_clearcoat','KHR_materials_ior','KHR_materials_specular','KHR_materials_transmission','KHR_materials_volume','KHR_materials_emissive_strength','KHR_materials_iridescence','KHR_materials_sheen','KHR_materials_anisotropy','KHR_texture_transform','KHR_mesh_quantization']);
 const unsupported=(json.extensionsRequired||[]).filter(x=>!supported.has(x));if(unsupported.length)throw Error('请先转换为普通静态 GLB，暂不支持：'+unsupported.join('、'));
 const counts=[];let uniqueTriangles=0;for(const mesh of json.meshes)for(const p of mesh.primitives||[]){const count=json.accessors?.[p.indices??p.attributes?.POSITION]?.count||0;const mode=p.mode??4;if(mode!==4)throw Error('请先转换为三角面网格');uniqueTriangles+=Math.floor(count/3);}
 for(const mesh of json.meshes)counts.push((mesh.primitives||[]).reduce((sum,p)=>sum+Math.floor((json.accessors?.[p.indices??p.attributes?.POSITION]?.count||0)/3),0));
 let triangles=0;const roots=json.scenes?.[json.scene||0]?.nodes||[];let visited=0;const walk=(id,trail=new Set())=>{if(trail.has(id)||++visited>50000)throw Error('场景层级循环或过大');const node=json.nodes?.[id];if(!node)throw Error('模型节点引用无效');if(node.mesh!==undefined){if(counts[node.mesh]===undefined)throw Error('网格引用无效');triangles+=counts[node.mesh];}const next=new Set(trail);next.add(id);for(const child of node.children||[])walk(child,next);};roots.forEach(id=>walk(id));if(!roots.length)triangles=uniqueTriangles;
 return {triangles,uniqueTriangles,materials:json.materials?.length||0,textures:json.textures?.length||0};
}
const categories=new Set(ASSET_CATEGORIES);
const tags=value=>{if(!Array.isArray(value)||value.some(t=>typeof t!=='string'))throw Error('标签需要文字列表');return [...new Set(value.map(t=>t.trim()).filter(Boolean))].slice(0,20).map(t=>t.slice(0,60));};
export class Store{
 constructor(dir){this.dir=dir;fs.mkdirSync(path.join(dir,'blobs'),{recursive:true});this.db=new DatabaseSync(path.join(dir,'library.sqlite'));this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,sha TEXT UNIQUE NOT NULL,json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS checkpoints(id TEXT PRIMARY KEY,project TEXT NOT NULL,json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS asset_revision(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL); INSERT OR IGNORE INTO asset_revision VALUES(1,0); CREATE TRIGGER IF NOT EXISTS asset_revision_insert AFTER INSERT ON assets BEGIN UPDATE asset_revision SET revision=revision+1 WHERE id=1; END; CREATE TRIGGER IF NOT EXISTS asset_revision_update AFTER UPDATE ON assets WHEN OLD.json IS NOT NEW.json OR OLD.sha IS NOT NEW.sha BEGIN UPDATE asset_revision SET revision=revision+1 WHERE id=1; END; CREATE TRIGGER IF NOT EXISTS asset_revision_delete AFTER DELETE ON assets BEGIN UPDATE asset_revision SET revision=revision+1 WHERE id=1; END;');recoverAssetFileRenames(this);}
 assetRevision(){return this.db.prepare('SELECT revision FROM asset_revision WHERE id=1').get().revision;}
 list({includeTrash=false}={}){return this.db.prepare('SELECT json FROM assets ORDER BY rowid').all().map(x=>JSON.parse(x.json)).filter(a=>includeTrash||!a.deletedAt);}
 trashReferences(){
  const refs=new Map(),ids=new Set(this.list({includeTrash:true}).filter(a=>a.deletedAt).map(a=>a.id));
  const collect=(value,found)=>{if(typeof value==='string'&&ids.has(value))found.add(value);else if(Array.isArray(value))value.forEach(v=>collect(v,found));else if(value&&typeof value==='object')Object.values(value).forEach(v=>collect(v,found));};
  for(const table of ['projects','checkpoints','module_projects','prefabs']){
   if(!this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table))continue;
   for(const row of this.db.prepare('SELECT json FROM '+table).all()){const p=JSON.parse(row.json),found=new Set();collect(table==='prefabs'?p.instances:p,found);for(const id of found){if(!refs.has(id))refs.set(id,[]);refs.get(id).push((table==='prefabs'?'半成品：':table==='checkpoints'?'检查点：':'工程：')+(p.name||p.id));}}
  }
  return refs;
 }
 trash(){const refs=this.trashReferences();return this.list({includeTrash:true}).filter(a=>a.deletedAt).map(a=>({...a,trashReferences:refs.get(a.id)||[]})).sort((a,b)=>b.deletedAt.localeCompare(a.deletedAt));}
 recycle(id,now=Date.now()){
  const a=this.asset(id);if(a.deletedAt)return a;
  a.deletedAt=new Date(now).toISOString();a.purgeAfter=new Date(now+30*24*60*60*1000).toISOString();
  this.db.prepare('UPDATE assets SET json=? WHERE id=?').run(JSON.stringify(a),id);return a;
 }
 restore(id){const a=this.asset(id);delete a.deletedAt;delete a.purgeAfter;this.db.prepare('UPDATE assets SET json=? WHERE id=?').run(JSON.stringify(a),id);return a;}
 purgeExpired(now=Date.now()){
  // Referenced components remain recoverable until their projects/checkpoints release them.
  // A durable unlink queue also retries interrupted file cleanup on the next launch.
  this.db.exec('CREATE TABLE IF NOT EXISTS asset_purge_files(sha TEXT PRIMARY KEY);CREATE TABLE IF NOT EXISTS asset_named_purge_files(id TEXT PRIMARY KEY)');
  const refs=this.trashReferences(),expired=this.list({includeTrash:true}).filter(a=>a.deletedAt&&Date.parse(a.purgeAfter)<=now&&!refs.has(a.id));
  this.db.exec('BEGIN IMMEDIATE');try{for(const a of expired){this.db.prepare('DELETE FROM assets WHERE id=?').run(a.id);this.db.prepare('INSERT OR IGNORE INTO asset_purge_files VALUES(?)').run(a.sha);if(a.localFiles)this.db.prepare('INSERT OR IGNORE INTO asset_named_purge_files VALUES(?)').run(a.id);}this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}
  for(const {sha} of this.db.prepare('SELECT sha FROM asset_purge_files').all()){
   if(!/^[a-f0-9]{64}$/.test(sha))continue;
   try{if(!this.db.prepare('SELECT id FROM assets WHERE sha=?').get(sha))fs.rmSync(path.join(this.dir,'blobs',sha+'.glb'),{force:true});this.db.prepare('DELETE FROM asset_purge_files WHERE sha=?').run(sha);}catch(e){if(!['EACCES','EPERM','EBUSY'].includes(e.code))throw e;}
  }
  for(const {id} of this.db.prepare('SELECT id FROM asset_named_purge_files').all()){try{if(!this.db.prepare('SELECT id FROM assets WHERE id=?').get(id))purgeAssetFiles(this,id);this.db.prepare('DELETE FROM asset_named_purge_files WHERE id=?').run(id);}catch(e){if(!['EACCES','EPERM','EBUSY'].includes(e.code))throw e;}}
  return {purged:expired.length,retained:this.trash().filter(a=>Date.parse(a.purgeAfter)<=now).length};
 }
 asset(id){const x=this.db.prepare('SELECT json FROM assets WHERE id=?').get(id);if(!x)throw Error('素材不存在');return JSON.parse(x.json);}
 import(bytes,meta,{maxBytes=ASSET_IMPORT_MAX_BYTES}={}){checkAssetSize(bytes.length,maxBytes);const stats=inspectGLB(bytes),sha=hash(bytes),existing=this.db.prepare('SELECT json FROM assets WHERE sha=?').get(sha);if(existing){if(JSON.parse(existing.json).deletedAt)throw Error('该素材已在回收站，请先恢复后再导入');const a={...JSON.parse(existing.json),...stats};this.db.prepare('UPDATE assets SET json=? WHERE id=?').run(JSON.stringify(a),a.id);return {asset:a,duplicate:true};}const now=new Date(),assetDate=actualAssetDate(now);const asset={id:randomUUID(),sha,version:1,name:String(meta.name||'未命名素材').slice(0,120),category:categories.has(meta.category)?meta.category:'其他',source:String(meta.source||'用户导入').slice(0,1000),state:meta.treeDraft?'待验收':'待校准',...(meta.treeDraft?{treeDraft:meta.treeDraft}:{}),unitScale:1,dimensions:null,sockets:[],assetDate,tags:withAssetDateTag(tags(meta.tags||[]),assetDate),...(meta.localSource?{localSource:meta.localSource,recognition:meta.recognition}:{}),createdAt:now.toISOString(),bytes:bytes.length,...stats};const target=path.join(this.dir,'blobs',sha+'.glb');if(!fs.existsSync(target)){const temp=target+'.tmp';fs.writeFileSync(temp,bytes);fs.renameSync(temp,target);}this.db.prepare('INSERT INTO assets VALUES(?,?,?)').run(asset.id,sha,JSON.stringify(asset));return {asset,duplicate:false};}
 derive(bytes,parentID,name){const parent=this.asset(parentID),sha=hash(bytes);inspectGLB(bytes);if(sha===parent.sha)throw Error('加工结果与原件相同');const existing=this.db.prepare('SELECT json FROM assets WHERE sha=?').get(sha);if(existing){if(JSON.parse(existing.json).deletedAt)throw Error('加工结果已在回收站，请先恢复');return {asset:JSON.parse(existing.json),duplicate:true};}this.db.exec('BEGIN');try{const result=this.import(bytes,{name:name||parent.name+' · 加工',category:parent.category,source:'Orbigen 本地加工 · '+parent.id+' · SHA256 '+parent.sha});result.asset.derivedFrom={id:parent.id,sha:parent.sha,unitScale:parent.unitScale};this.db.prepare('UPDATE assets SET json=? WHERE id=?').run(JSON.stringify(result.asset),result.asset.id);this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 updateAsset(id,patch){const a=this.asset(id);if(a.deletedAt)throw Error('请先从回收站恢复素材后再编辑');if(patch.name!==undefined)a.name=validateAssetName(patch.name);if(patch.category!==undefined&&categories.has(patch.category))a.category=patch.category;if(patch.unitScale!==undefined){if(!Number.isFinite(patch.unitScale)||patch.unitScale<1e-6||patch.unitScale>1e6)throw Error('单位换算范围无效');a.unitScale=patch.unitScale;}if(patch.dimensions!==undefined){if(!Array.isArray(patch.dimensions)||patch.dimensions.length!==3||patch.dimensions.some(x=>!Number.isFinite(x)||x<=0))throw Error('尺寸无效');a.dimensions=patch.dimensions;}if(patch.tags!==undefined)a.tags=tags(patch.tags);if(patch.assetDate!==undefined&&!isAssetDate(patch.assetDate))throw Error('素材日期需要有效的年月日');a.assetDate=patch.assetDate??assetDateOf(a);a.tags=withAssetDateTag(a.tags,a.assetDate);a.updatedAt=new Date().toISOString();const persist=next=>this.db.prepare('UPDATE assets SET json=? WHERE id=?').run(JSON.stringify(next),id);if(patch.name!==undefined)return syncAssetFiles(this,a,persist);persist(a);return a;}
 projects(){return this.db.prepare('SELECT json FROM projects').all().map(x=>JSON.parse(x.json));}
 project(id){const row=this.db.prepare('SELECT json FROM projects WHERE id=?').get(id);if(!row)throw Error('工程不存在');return JSON.parse(row.json);}
 createProject(name){const p={schemaVersion:1,id:randomUUID(),name:String(name||'未命名装配').slice(0,120),revision:0,instances:[],updatedAt:new Date().toISOString()};this.db.prepare('INSERT INTO projects VALUES(?,?,?)').run(p.id,0,JSON.stringify(p));return p;}
 saveProject(id,base,patch){const p=this.project(id);if(p.revision!==base){const e=Error('工程版本已变化。当前修改保留在浏览器，请另存工程或重新打开。');e.status=409;throw e;}if(!Array.isArray(patch.instances)||patch.instances.length>500)throw Error('工程最多 500 个实例');const ids=new Set();for(const i of patch.instances){if(typeof i.id!=='string'||ids.has(i.id))throw Error('实例 ID 重复或无效');ids.add(i.id);const a=this.asset(i.assetId);if(i.version!==a.version)throw Error('素材版本不存在');if(i.geometry)verifyComposeMesh(this.db,a.sha,i.geometry);if(!Number.isFinite(i.unitScale)||i.unitScale<=0||i.unitScale>1e6)throw Error('实例单位无效');for(const k of ['position','rotation','scale']){if(!Array.isArray(i[k])||i[k].length!==3||i[k].some(x=>!Number.isFinite(x)||Math.abs(x)>1e6))throw Error('变换数值无效');}if(i.scale.some(x=>x<=0))throw Error('缩放必须为正数');}const next={...p,name:String(patch.name||p.name).slice(0,120),instances:patch.instances,revision:p.revision+1,updatedAt:new Date().toISOString()};this.db.prepare('UPDATE projects SET revision=?,json=? WHERE id=? AND revision=?').run(next.revision,JSON.stringify(next),id,base);return next;}
 checkpoints(id){return this.db.prepare('SELECT id,json FROM checkpoints WHERE project=? ORDER BY rowid DESC').all(id).map(x=>({checkpointId:x.id,...JSON.parse(x.json)}));}
 checkpoint(id){const p=this.project(id),key=randomUUID();this.db.prepare('INSERT INTO checkpoints VALUES(?,?,?)').run(key,id,JSON.stringify(p));return {id:key,...p};}
 close(){this.db.close();}
}
