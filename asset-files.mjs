import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const validID=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);
const plainFile=file=>{const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('素材文件必须是普通文件');return file;};
const directory=dir=>{fs.mkdirSync(dir,{recursive:true});if(!fs.lstatSync(dir).isDirectory()||fs.lstatSync(dir).isSymbolicLink())throw Error('本地素材目录不能是软链接');return dir;};
export function validateAssetName(value){
 if(typeof value!=='string')throw Error('素材名称需要文字');const name=value.trim().normalize('NFC');
 if(!name||name==='.'||name==='..')throw Error('请输入素材名称');
 if(/[\x00-\x1f\x7f/\\:*?"<>|]/.test(name)||name.startsWith('.')||/[. ]$/.test(name))throw Error('名称不能包含 / \\ : * ? " < > |、控制字符或首尾句点');
 if(name.length>120||Buffer.byteLength(name)>200)throw Error('名称过长，请使用 200 字节以内的名称（约 66 个汉字）');return name;
}
export function assetFileStem(value){let stem=String(value||'素材').normalize('NFC').replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g,'_').replace(/^\.+|[. ]+$/g,'').trim();while(Buffer.byteLength(stem)>200)stem=Array.from(stem).slice(0,-1).join('');return stem||'素材';}
function locations(store,id){if(!validID(id))throw Error('素材编号无效');const root=directory(path.join(store.dir,'素材文件'));return {root,dir:directory(path.join(root,id)),journal:path.join(root,'.rename-'+id+'.json')};}
function sources(store,asset){
 const files=[{format:'glb',sha:asset.sha,source:plainFile(path.join(store.dir,'blobs',asset.sha+'.glb'))}];
 if(store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='generation_jobs'").get()){
  const jobs=store.db.prepare('SELECT json FROM generation_jobs ORDER BY rowid DESC').all().map(r=>JSON.parse(r.json));
  const job=jobs.find(j=>j.assetID===asset.id&&j.originalSHA256&&['glb','fbx'].includes(j.nativeFormat)&&validID(j.id));
  if(job){const source=path.join(store.dir,'tripo-originals',job.id+'.'+job.nativeFormat),format=job.originalContainer==='zip'?'zip':job.nativeFormat;if(format!=='glb'){if(!fs.existsSync(source))throw Error('Tripo 原件文件缺失，请先找回本地原件');files.push({format,sha:job.originalSHA256,source:plainFile(source)});}}
 }
 return files;
}
const baseName=name=>typeof name==='string'&&name===path.basename(name)&&name!=='.'&&name!=='..';
function rollback(dir,plans){for(const p of plans.slice().reverse()){
 const from=path.join(dir,p.from),to=path.join(dir,p.to);
 if(fs.existsSync(to)&&!fs.existsSync(from)){if(digest(plainFile(to))!==p.sha)throw Error('改名后的文件已被外部修改，无法自动回退');fs.renameSync(to,from);}
 if(p.created&&fs.existsSync(from))fs.unlinkSync(from);
}}
export function recoverAssetFileRenames(store){
 const root=path.join(store.dir,'素材文件');if(!fs.existsSync(root))return;directory(root);
 for(const name of fs.readdirSync(root).filter(n=>/^\.rename-[a-f0-9-]{36}\.json$/.test(n))){
  const journal=path.join(root,name),record=JSON.parse(fs.readFileSync(plainFile(journal),'utf8'));if(!validID(record.id)||!Array.isArray(record.plans)||record.plans.some(p=>!baseName(p.from)||!baseName(p.to)||!/^[a-f0-9]{64}$/.test(p.sha)))throw Error('本地改名恢复记录无效');
  const dir=directory(path.join(root,record.id)),row=store.db.prepare('SELECT json FROM assets WHERE id=?').get(record.id),committed=row&&JSON.stringify(JSON.parse(row.json).localFiles)===JSON.stringify(record.nextFiles);
  if(!committed)rollback(dir,record.plans);else for(const p of record.plans)if(p.created&&fs.existsSync(path.join(dir,p.from)))fs.unlinkSync(path.join(dir,p.from));
  fs.unlinkSync(journal);
 }
}
export function syncAssetFiles(store,asset,persist){
 const {dir,journal}=locations(store,asset.id),stem=assetFileStem(asset.name),inputs=sources(store,asset),plans=[],nextFiles={directory:path.relative(store.dir,dir),files:[]};
 let committed=false;try{
  for(const input of inputs){
   const name=stem+'.'+input.format,old=asset.localFiles?.files?.find(f=>f.format===input.format),target=path.join(dir,name);nextFiles.files.push({name,format:input.format,sha:input.sha});
   if(old&&!baseName(old.name))throw Error('本地文件记录无效');
   const previous=old&&path.join(dir,old.name);
   if(previous&&fs.existsSync(previous)){if(digest(plainFile(previous))!==input.sha)throw Error('本地素材文件已被外部修改，请先保留修改版本再同步改名');if(previous===target)continue;if(fs.existsSync(target))throw Error('目标文件名已存在，请换一个名称');plans.push({from:old.name,to:name,sha:input.sha,created:false});}
   else{if(fs.existsSync(target)){if(digest(plainFile(target))!==input.sha)throw Error('目标文件名已存在，请换一个名称');continue;}if(digest(input.source)!==input.sha)throw Error('模型或原件哈希不匹配，未同步改名');const temp='.'+randomUUID()+'.tmp';plans.push({from:temp,to:name,sha:input.sha,created:true});fs.copyFileSync(input.source,path.join(dir,temp),fs.constants.COPYFILE_FICLONE);}
  }
  // The journal distinguishes a committed database record from interrupted moves.
  fs.writeFileSync(journal,JSON.stringify({id:asset.id,plans,nextFiles}),{flag:'wx'});
  for(const p of plans){if(fs.existsSync(path.join(dir,p.to)))throw Error('目标文件名已存在，请换一个名称');fs.renameSync(path.join(dir,p.from),path.join(dir,p.to));}
  const next={...asset,localFiles:nextFiles};persist(next);committed=true;fs.unlinkSync(journal);return next;
 }catch(e){if(committed)return {...asset,localFiles:nextFiles};rollback(dir,plans);if(fs.existsSync(journal))fs.unlinkSync(journal);throw e;}
}
export function assetFileInfo(store,id){const asset=store.asset(id);return {assetId:id,name:asset.name,directory:asset.localFiles?path.join(store.dir,asset.localFiles.directory):null,files:(asset.localFiles?.files||[]).map(f=>({...f,path:path.join(store.dir,asset.localFiles.directory,f.name),url:'/api/assets/'+id+'/files/'+f.format}))};}
export function assetFileDownload(store,id,format){const a=store.asset(id),f=a.localFiles?.files.find(f=>f.format===format);if(!f||!baseName(f.name)||![path.join('素材文件',id),path.posix.join('素材文件',id)].includes(a.localFiles.directory)||!validID(id))throw Error('请先同步本地素材文件');return {...f,path:plainFile(path.join(store.dir,a.localFiles.directory,f.name))};}

export function purgeAssetFiles(store,id){if(!validID(id))throw Error('素材编号无效');const root=path.join(store.dir,'素材文件');if(!fs.existsSync(root))return;directory(root);const dir=path.join(root,id);if(fs.existsSync(dir)){if(!fs.lstatSync(dir).isDirectory()||fs.lstatSync(dir).isSymbolicLink())throw Error('本地素材目录不能是软链接');fs.rmSync(dir,{recursive:true,force:true});}}
