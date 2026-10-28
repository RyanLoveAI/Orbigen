import {ASSET_IMPORT_MAX_BYTES,checkAssetSize} from './public/modules/library/import.js';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {inspectGLB,hash} from './store.mjs';
import {convertLocalModel,checkLocalDependencies} from './model-convert.mjs';
import {classifyAsset} from './public/modules/asset-folder/classify.js';
const models=new Set(['.glb','.fbx','.obj','.gltf']);
const dependencies=new Set(['.bin','.mtl','.png','.jpg','.jpeg','.webp','.tga','.bmp','.tif','.tiff','.exr','.hdr','.dds']);
const unsupported=new Set(['.blend','.max','.ma','.mb','.usd','.usdz','.stl','.zip']);
const folders=['建筑/木作','建筑/石作','建筑/屋面','建筑/门窗','建筑/雕饰','植被/树木','植被/花卉','植被/草地','山体','兽类','武器','待分类'];
function glbNames(bytes){const n=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+n).toString());return [...(j.nodes||[]),...(j.meshes||[]),...(j.materials||[])].map(x=>x.name||'');}
async function digestFile(file){const h=createHash('sha256');for await(const bytes of fs.createReadStream(file))h.update(bytes);return h.digest('hex');}
export class AssetFolder {
 constructor(store,{defaultRoot,convert=convertLocalModel}={}) {
  this.store=store;this.convert=convert;this.defaultRoot=path.resolve(defaultRoot);this.configFile=path.join(store.dir,'local-asset-folder.json');
  let saved={};try{saved=JSON.parse(fs.readFileSync(this.configFile));}catch{}
  this.root=saved.root||this.defaultRoot;this.job=saved.job||null;
  if(this.job?.state==='running')this.job={...this.job,state:'interrupted',current:'上次扫描中断，可重新扫描继续去重入库'};
  this.store.db.exec('CREATE TABLE IF NOT EXISTS local_asset_sources(root TEXT NOT NULL,relative TEXT NOT NULL,signature TEXT NOT NULL,asset_id TEXT NOT NULL,PRIMARY KEY(root,relative))');
  for(const folder of folders)fs.mkdirSync(path.join(this.defaultRoot,folder),{recursive:true});
  const guide=path.join(this.defaultRoot,'使用说明.txt');
  if(!fs.existsSync(guide))fs.writeFileSync(guide,'把 GLB、FBX、OBJ、glTF 放入本目录或子文件夹，然后在 Orbigen 素材库点击“扫描并入库”。\n贴图、MTL、BIN 等依赖文件需保留在模型引用的位置。FBX、OBJ、glTF 转换需要本机 Blender。\n源文件不会被移动、重命名或删除；素材库保存 GLB 副本。重复扫描会去重；已经入库的名称、分类和标签不会被自动覆盖。\n已核对素材按模型 SHA-256 复用双角度视觉分类；新素材依据文件名、明确分类目录及模型 / 材质名称，无法判断时标记待分类。可在组件详情页修改标签和分类。\n可选：在模型旁放置“模型名.asset.json”，内容示例：{"name":"洞口岩壁","category":"石作","tags":["岩壁","洞口"]}。\n扫描为手动触发；修改文件后再次扫描。不自动删除素材库中已有组件。\n');
 }
 persist(){fs.writeFileSync(this.configFile+'.tmp',JSON.stringify({root:this.root,job:this.job}));fs.renameSync(this.configFile+'.tmp',this.configFile);}
 status(){const job=this.job?{...this.job,items:this.job.items.map(item=>{
  if(item.state==='failed'&&item.file.endsWith('.gltf')&&item.error?.includes('转换失败')){
   try{checkLocalDependencies(path.join(this.job.root,item.file));}catch(e){return {...item,error:e.message};}
  }return item;
 })}:null;return {defaultRoot:this.defaultRoot,root:this.root,formats:[...models].map(x=>x.slice(1).toUpperCase()),job};}
 start(input={}) {
  if(this.job?.state==='running')throw Error('素材目录正在扫描，请等待或停止');
  const requested=input.root||this.root;
  if(typeof requested!=='string'||requested.length>4096||!path.isAbsolute(requested))throw Error('请选择绝对路径的本地素材目录');
  const root=fs.realpathSync(requested);if(!fs.statSync(root).isDirectory())throw Error('素材路径需要是文件夹');
  this.root=root;this.controller=new AbortController();
  this.job={id:randomUUID(),state:'running',root,startedAt:new Date().toISOString(),total:0,processed:0,added:0,duplicates:0,failed:0,skipped:0,current:'正在读取子文件夹…',items:[],warnings:[]};
  this.persist();this.task=this.run(this.job,this.controller.signal);return this.status();
 }
 stop(){if(this.job?.state==='running'){this.controller.abort();this.job.current='正在停止…';}return this.status();}
 async run(job,signal) {
  try {
   const list=[],resources=[];let visited=0;
   const walk=async dir=>{
    if(signal.aborted)return;
    const entries=await fs.promises.readdir(dir,{withFileTypes:true});entries.sort((a,b)=>a.name.localeCompare(b.name,'zh-CN',{numeric:true}));
    for(const entry of entries){
     if(signal.aborted)return;
     if(++visited>10000)throw Error('目录超过 10000 项，请拆分子目录扫描');
     if(entry.name.startsWith('.'))continue;
     const file=path.join(dir,entry.name),ext=path.extname(entry.name).toLowerCase(),relative=path.relative(job.root,file);
     if(entry.isSymbolicLink()){job.skipped++;job.warnings.push(relative+'：跳过符号链接');continue;}
     if(entry.isDirectory()){await walk(file);continue;}
     if(!entry.isFile())continue;
     if(models.has(ext)){if(list.length>=1000)throw Error('一次最多扫描 1000 个模型，请拆分子目录');list.push({file,relative,format:ext.slice(1)});}
     else if(dependencies.has(ext))resources.push(file);
     else if(unsupported.has(ext)){job.skipped++;job.warnings.push(relative+'：此格式请先导出 GLB / FBX / OBJ / glTF');}
    }
   };
   await walk(job.root);job.total=list.length;
   const dependencyHashes=new Map();
   for(const item of list) {
    if(signal.aborted)break;
    job.current=item.relative;this.persist();
    try {
     const info=await fs.promises.stat(item.file);checkAssetSize(info.size);
     const original=await fs.promises.readFile(item.file),sourceSHA256=hash(original);
     const sidecar=item.file.slice(0,-path.extname(item.file).length)+'.asset.json';let meta={},metaBytes='';
     try {const stat=await fs.promises.lstat(sidecar);if(!stat.isFile()||stat.size>16384)throw Error('素材说明需为 16 KB 以内的普通 JSON 文件');metaBytes=await fs.promises.readFile(sidecar,'utf8');meta=JSON.parse(metaBytes);if(!meta||typeof meta!=='object'||Array.isArray(meta)||meta.tags!==undefined&&(!Array.isArray(meta.tags)||meta.tags.some(t=>typeof t!=='string')))throw Error('素材说明格式无效');}
     catch(e){if(e.code!=='ENOENT')throw e;}
     let direct=false;if(item.format==='glb'){try{inspectGLB(original);direct=true;}catch(e){if(!e.message.includes('KHR_draco_mesh_compression'))throw e;}}
     const dep=[];
     // Include shared texture folders referenced by ../ paths as well. Hashes
     // are streamed once per scan and reused by the remaining models.
     if(!direct)for(const resource of resources) {
      if(signal.aborted)break;
      if(!dependencyHashes.has(resource)){const stat=await fs.promises.stat(resource);if(stat.size>128*1048576)throw Error('贴图或依赖超过 128 MB，请先优化');dependencyHashes.set(resource,await digestFile(resource));}
      dep.push([path.relative(job.root,resource),dependencyHashes.get(resource)]);
     }
     const signature=hash(Buffer.from(JSON.stringify([sourceSHA256,dep,metaBytes])));
     const known=this.store.db.prepare('SELECT * FROM local_asset_sources WHERE root=? AND relative=? AND signature=?').get(job.root,item.relative,signature);
     if(known){try{const asset=this.store.asset(known.asset_id);job.duplicates++;job.items.push({file:item.relative,state:asset.deletedAt?'recycled':'duplicate',assetId:asset.id,name:asset.name,category:asset.category,tags:asset.tags});continue;}catch{}}
     const bytes=direct?original:await this.convert(item.file,{signal,maxBytes:ASSET_IMPORT_MAX_BYTES});if(signal.aborted)break;
     if(await digestFile(item.file)!==sourceSHA256)throw Error('扫描过程中源模型发生变化，请再次扫描');
     const classified=classifyAsset(item.relative,item.format,glbNames(bytes),meta,hash(bytes));
     const result=this.store.import(bytes,{...classified,source:'本地素材目录 · '+item.relative,localSource:{root:job.root,path:item.relative,format:item.format,sourceSHA256}});
     this.store.db.prepare('INSERT INTO local_asset_sources VALUES(?,?,?,?) ON CONFLICT(root,relative) DO UPDATE SET signature=excluded.signature,asset_id=excluded.asset_id').run(job.root,item.relative,signature,result.asset.id);
     if(result.duplicate)job.duplicates++;else job.added++;
     job.items.push({file:item.relative,state:result.duplicate?'duplicate':'added',assetId:result.asset.id,name:result.asset.name,category:result.asset.category,tags:result.asset.tags});
    }catch(e){if(signal.aborted)break;job.failed++;job.items.push({file:item.relative,state:'failed',error:e.message});}
    finally{job.processed++;this.persist();}
   }
   job.state=signal.aborted?'cancelled':'complete';job.current=signal.aborted?'已停止，已入库的素材保留':'扫描完成';
  }catch(e){job.state=signal.aborted?'cancelled':'failed';job.current=e.message;}
  finally{job.finishedAt=new Date().toISOString();job.warnings=job.warnings.slice(0,100);this.persist();}
 }
}
