import {folderCommand} from './desktop-bridge.mjs';
import {PrefabUploads} from './prefab-upload.mjs';
import {ASSET_IMPORT_MAX_BYTES} from './public/modules/library/import.js';
import {importPrefabFiles} from './prefab-import.mjs';
import {PREFAB_IMPORT_BODY_BYTES} from './public/modules/prefabs/limits.js';
import {ComposeMeshes} from './compose-meshes.mjs';
import {assetFileInfo,assetFileDownload,assetFileStem} from './asset-files.mjs';
import {TreeComponentStore} from './tree-components.mjs';
import {TreeReviewStore} from './tree-reviews.mjs';
import {TreeDraftStore} from './tree-drafts.mjs';
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {Store,hash} from './store.mjs';import {ModuleStore} from './module-store.mjs';import {MODULES} from './public/modules/registry.js';import {TripoService} from './tripo.mjs';import {TripoBatch} from './tripo-batch.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),publicDir=path.join(root,'public'),data=path.resolve(process.env.ASSET_WORKBENCH_DATA||path.join(root,'data')),store=new Store(data),port=Number(process.env.ASSET_WORKBENCH_PORT||8766);
// Windows credential storage uses the same data directory as the server.
process.env.ASSET_WORKBENCH_DATA=data;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.glb':'model/gltf-binary','.jpg':'image/jpeg','.png':'image/png','.mp4':'video/mp4','.json':'application/json'};
const modules=new ModuleStore(store.db),composeMeshes=new ComposeMeshes(store);
const treeComponents=new TreeComponentStore(store.db);
const treeReviews=new TreeReviewStore(store.db,modules,data);
const {PrefabStore}=await import('./prefab-store.mjs');const prefabs=new PrefabStore(store,modules),prefabUploads=new PrefabUploads(prefabs);
const {ReferenceStore}=await import('./reference-store.mjs');const references=new ReferenceStore(data);
const {BreakdownStore}=await import('./breakdown-store.mjs');const breakdowns=new BreakdownStore(store.db,references,data);
const {TripoPresetStore}=await import('./tripo-presets.mjs');const tripoPresets=new TripoPresetStore(store.db,references);
const tripo=new TripoService(store);
const batches=new TripoBatch(tripo);
function cleanTrash(){try{store.purgeExpired();}catch(e){console.error('回收站清理失败：'+e.message);}}
cleanTrash();const trashTimer=setInterval(cleanTrash,60*60*1000);trashTimer.unref();
const {BlenderBridge}=await import('./blender-bridge.mjs');const blender=new BlenderBridge(store,modules);
const {CodexService}=await import('./codex.mjs');const codex=new CodexService(data);
const {AssetFolder}=await import('./asset-folder.mjs');const assetFolder=new AssetFolder(store,{defaultRoot:process.env.ORBIGEN_ASSET_FOLDER||path.join(root,'本地素材')});
async function body(req,limit=2*1024*1024){const chunks=[];let n=0;for await(const c of req){n+=c.length;if(n>limit){const e=Error('文件超过大小上限');e.status=413;throw e;}chunks.push(c);}return Buffer.concat(chunks);}
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
function file(req,res,target){if(!fs.existsSync(target)||!fs.statSync(target).isFile()){res.writeHead(404);res.end();return;}const size=fs.statSync(target).size,headers={'Content-Type':mime[path.extname(target)]||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-cache'};const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');if(match){const start=Number(match[1]),end=Math.min(Number(match[2]||size-1),size-1);if(start>end||start>=size){res.writeHead(416,{'Content-Range':`bytes */${size}`});res.end();return;}res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1});fs.createReadStream(target,{start,end}).pipe(res);}else{res.writeHead(200,{...headers,'Content-Length':size});fs.createReadStream(target).pipe(res);}}
const server=http.createServer(async(req,res)=>{try{
 const host=req.headers.host||'';if(!['127.0.0.1:'+port,'localhost:'+port].includes(host))return json(res,403,{error:'仅允许本机访问'});
 if(req.headers.origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin))return json(res,403,{error:'来源不匹配'});
 res.setHeader('X-Content-Type-Options','nosniff');const u=new URL(req.url,'http://'+host),p=u.pathname;
 if(p==='/api/health')return json(res,200,{app:'AssetWorkbench',version:'1.57.0',dataDirectory:data,platform:process.platform,portable:Boolean(process.env.ORBIGEN_PORTABLE_ROOT),instance:process.env.ORBIGEN_INSTANCE_ID||null});
 if(p==='/api/desktop/capabilities'&&req.method==='GET')return json(res,200,{folders:process.platform==='win32'&&Boolean(process.env.ORBIGEN_DESKTOP_TOKEN),token:process.platform==='win32'&&req.headers['sec-fetch-site']!=='cross-site'?process.env.ORBIGEN_DESKTOP_TOKEN:null});
 if(p==='/api/desktop/folders'&&req.method==='POST'){
  if(process.platform!=='win32'||!process.env.ORBIGEN_DESKTOP_TOKEN||req.headers['x-orbigen-desktop']!==process.env.ORBIGEN_DESKTOP_TOKEN||req.headers.origin!=='http://127.0.0.1:'+port)return json(res,403,{error:'本地文件夹操作未授权'});
  return json(res,200,{result:await folderCommand(JSON.parse((await body(req,8192)).toString()))});
 }
 if(p==='/api/desktop/stop'&&req.method==='POST'){
  if(!process.env.ORBIGEN_DESKTOP_TOKEN||req.headers['x-orbigen-desktop']!==process.env.ORBIGEN_DESKTOP_TOKEN)return json(res,403,{error:'退出未授权'});
  json(res,200,{stopping:true});shutdown();return;
 }
 if(p==='/api/prefabs'&&req.method==='GET')return json(res,200,prefabs.list({includeTrash:u.searchParams.get('includeTrash')==='1'}));
 if(p==='/api/prefabs'&&req.method==='POST')return json(res,200,prefabs.create(JSON.parse((await body(req,90*1048576)).toString())));
 if(p==='/api/prefabs/uploads'&&req.method==='POST')return json(res,200,prefabUploads.create(JSON.parse((await body(req,262144)).toString())));
 const prefabUpload=/^\/api\/prefabs\/uploads\/([a-f0-9-]{36})(?:\/(complete|files\/(\d+)))?$/.exec(p);
 if(prefabUpload){const [,id,action,index]=prefabUpload;if(req.method==='PUT'&&index!==undefined)return json(res,200,await prefabUploads.chunk(id,Number(index),Number(req.headers['x-upload-offset']),req));if(req.method==='POST'&&action==='complete')return json(res,200,await prefabUploads.complete(id));if(req.method==='DELETE'&&!action){prefabUploads.remove(id);return json(res,200,{removed:true});}return json(res,405,{error:'操作不支持'});}
 if(p==='/api/prefabs/import'&&req.method==='POST')return json(res,200,await importPrefabFiles(prefabs,JSON.parse((await body(req,PREFAB_IMPORT_BODY_BYTES)).toString())));
 const prefabRoute=/^\/api\/prefabs\/([a-f0-9-]+)(?:\/(insert|unpack|restore))?$/.exec(p);
 if(prefabRoute){const [,id,action]=prefabRoute;if(action==='insert'&&req.method==='POST')return json(res,200,prefabs.insert(id,JSON.parse((await body(req)).toString())));if(action==='unpack'&&req.method==='POST')return json(res,200,prefabs.unpack(id));if(action==='restore'&&req.method==='POST'){prefabs.get(id);return json(res,200,store.restore(id));}if(!action&&req.method==='GET')return json(res,200,prefabs.get(id));if(!action&&req.method==='PATCH')return json(res,200,prefabs.rename(id,JSON.parse((await body(req)).toString())));if(!action&&req.method==='DELETE'){prefabs.get(id);return json(res,200,store.recycle(id));}}
 if(p==='/api/breakdowns'&&req.method==='GET')return json(res,200,breakdowns.list({includeTrash:u.searchParams.get('includeTrash')==='1'}).map(p=>breakdowns.withGeneration(p)));
 if(p==='/api/breakdowns'&&req.method==='POST')return json(res,200,breakdowns.create(JSON.parse((await body(req)).toString())));
 if(p==='/api/breakdowns/from-compose'&&req.method==='POST')return json(res,200,breakdowns.seedCompose());
 if(p==='/api/breakdowns/order'&&req.method==='POST')return json(res,200,breakdowns.reorder(JSON.parse((await body(req)).toString()).ids));
 const breakdownPart=/^\/api\/breakdowns\/([a-f0-9-]+)\/parts\/([a-zA-Z0-9-]+)\/(trash|restore)$/.exec(p);
 if(breakdownPart&&req.method==='POST'){const input=JSON.parse((await body(req)).toString());return json(res,200,breakdowns.withGeneration(breakdowns.setPartDeleted(breakdownPart[1],breakdownPart[2],breakdownPart[3]==='trash',input.baseRevision)));}
 const breakdown=/^\/api\/breakdowns\/([a-f0-9-]+)(\/(export|restore))?$/.exec(p);
 if(breakdown){if(breakdown[3]==='restore'&&req.method==='POST')return json(res,200,breakdowns.restore(breakdown[1]));if(!breakdown[2]&&req.method==='DELETE')return json(res,200,breakdowns.recycle(breakdown[1]));if(breakdown[3]==='export'&&req.method==='POST')return json(res,200,breakdowns.export(breakdown[1],JSON.parse((await body(req)).toString()||'{}').partIds??null));if(!breakdown[2]&&req.method==='GET')return json(res,200,breakdowns.withGeneration(breakdowns.get(breakdown[1])));if(!breakdown[2]&&req.method==='PUT')return json(res,200,breakdowns.save(breakdown[1],JSON.parse((await body(req)).toString())));}
 if(p==='/api/modules'&&req.method==='GET')return json(res,200,MODULES);
 if(p==='/api/local-assets'&&req.method==='GET')return json(res,200,assetFolder.status());
 if(p==='/api/local-assets/scan'&&req.method==='POST')return json(res,200,assetFolder.start(JSON.parse((await body(req,8192)).toString())));
 if(p==='/api/local-assets/stop'&&req.method==='POST')return json(res,200,assetFolder.stop());
 if(p==='/api/blender/status'&&req.method==='GET')return json(res,200,blender.status());
 if(p==='/api/blender/sessions'&&req.method==='GET')return json(res,200,blender.list(u.searchParams.get('projectId')));
 if(p==='/api/blender/sessions'&&req.method==='POST')return json(res,200,await blender.create(JSON.parse((await body(req,92*1048576)).toString())));
 if(p==='/api/blender/events'&&req.method==='GET')return blender.events(req,res,u.searchParams.get('projectId'));
 const blenderRoute=/^\/api\/blender\/sessions\/([a-f0-9-]{36})\/(open|edit|refresh)$/.exec(p);
 if(blenderRoute&&req.method==='POST'){const [,id,action]=blenderRoute;const input=JSON.parse((await body(req,250000)).toString()||'{}');return json(res,200,action==='open'?await blender.open(id,input):action==='edit'?await blender.edit(id,input):(blender.receive(id),blender.public(blender.get(id))));}
 if(p==='/api/codex/models'&&req.method==='GET')return json(res,200,codex.models());
 if(p==='/api/codex/status'&&req.method==='GET')return json(res,200,await codex.status());
 if(p==='/api/codex/history'&&req.method==='GET')return json(res,200,codex.session(u.searchParams.get('scope')));
 if(p==='/api/codex/start'&&req.method==='POST')return json(res,200,await codex.start(JSON.parse((await body(req,8*1048576)).toString())));
 if(p==='/api/codex/clear'&&req.method==='POST')return json(res,200,codex.clear(JSON.parse((await body(req,4096)).toString()).scope));
 if(p==='/api/codex/restore'&&req.method==='POST'){const input=JSON.parse((await body(req,4096)).toString());return json(res,200,codex.restore(input.scope,input.id));}
 if(p==='/api/codex/receipt'&&req.method==='POST'){const input=JSON.parse((await body(req,8192)).toString());return json(res,200,codex.receipt(input.scope,input.jobId,input.text,input.outcome));}
 const chatJob=/^\/api\/codex\/jobs\/([a-f0-9-]+)(\/cancel)?$/.exec(p);
 if(chatJob&&req.method===(chatJob[2]?'POST':'GET'))return json(res,200,chatJob[2]?codex.cancel(chatJob[1]):codex.get(chatJob[1]));
 if(process.env.ORBIGEN_SMOKE_REPORT&&process.env.ORBIGEN_SMOKE_REFERENCE_FILE&&p==='/api/smoke-reference'&&req.method==='GET')return json(res,200,references.upload(fs.readFileSync(process.env.ORBIGEN_SMOKE_REFERENCE_FILE),'验证参考图.png'));
 if(p==='/api/references'&&req.method==='POST')return json(res,200,references.upload(await body(req,8*1048576),u.searchParams.get('name')));
 if(p==='/api/references/analyze'&&req.method==='POST'){const input=JSON.parse((await body(req,65536)).toString());return json(res,200,await references.analyze(input.sha,input.roi,input.polygon??null));}
 if(/^\/references\/[a-f0-9]{64}\.png$/.test(p)&&req.method==='GET')return file(req,res,references.file(path.basename(p,'.png')));
 if(p==='/api/tripo/account'&&req.method==='GET')return json(res,200,await tripo.account(u.searchParams.get('autoReconnect')==='1'));
 if(p==='/api/tripo/login'&&req.method==='POST'){const credentials=JSON.parse((await body(req,4096)).toString());return json(res,200,await tripo.login(credentials.apiKey,{remember:credentials.remember===true}));}
 if(p==='/api/tripo/connection'&&req.method==='GET'){await tripo.ready;return json(res,200,tripo.connectionState());}
 if(p==='/api/tripo/reconnect'&&req.method==='POST')return json(res,200,await tripo.reconnect(true));
 if(p==='/api/tripo/forget-account'&&req.method==='POST')return json(res,200,await tripo.forgetAccount());
 if(p==='/api/tripo/disconnect'&&req.method==='POST')return json(res,200,await tripo.disconnect());
 if(p==='/api/tripo/models'&&req.method==='GET')return json(res,200,await tripo.catalog());
 if(p==='/api/tripo/presets'&&req.method==='GET')return json(res,200,tripoPresets.list());
 if(p==='/api/tripo/presets'&&req.method==='POST')return json(res,200,tripoPresets.save(JSON.parse((await body(req,60000)).toString())));
 const presetRoute=/^\/api\/tripo\/presets\/([a-f0-9-]+)$/.exec(p);
 if(presetRoute&&req.method==='PUT')return json(res,200,tripoPresets.save(JSON.parse((await body(req,60000)).toString()),presetRoute[1]));
 if(presetRoute&&req.method==='DELETE')return json(res,200,tripoPresets.delete(presetRoute[1]));
 if(p==='/api/tripo/jobs'&&req.method==='GET')return json(res,200,tripo.list());
 if(p==='/api/tripo/batches'&&req.method==='GET'){await tripo.ready;return json(res,200,{defaultRoot:batches.defaultRoot,batches:batches.list()});}
 if(p==='/api/tripo/batches/scan'&&req.method==='POST')return json(res,200,await batches.scan(JSON.parse((await body(req)).toString())));
 if(p==='/api/tripo/batches/start'&&req.method==='POST')return json(res,200,await batches.start(JSON.parse((await body(req)).toString())));
 const batchControl=/^\/api\/tripo\/batches\/([a-zA-Z0-9_-]+)\/control$/.exec(p);
 if(batchControl&&req.method==='POST'){const input=JSON.parse((await body(req)).toString());return json(res,200,batches.control(batchControl[1],input.action,input.index));}
 if(p==='/api/tripo/remote-tasks'&&req.method==='GET')return json(res,200,await tripo.remoteTasks());
 if(p==='/api/tripo/recover'&&req.method==='POST')return json(res,200,await tripo.recover(JSON.parse((await body(req)).toString())));
 if(p==='/api/tripo/quote'&&req.method==='POST')return json(res,200,await tripo.quote(JSON.parse((await body(req)).toString())));
 if(p==='/api/tripo/generate'&&req.method==='POST')return json(res,200,await tripo.generate(JSON.parse((await body(req)).toString())));
 if(p==='/api/tripo/upload'&&req.method==='POST')return json(res,200,await tripo.upload(await body(req,20*1048576),req.headers['content-type'],u.searchParams.get('name')));
 const generationJob=/^\/api\/tripo\/jobs\/([a-zA-Z0-9_-]+)\/refresh$/.exec(p);
 if(generationJob&&req.method==='POST')return json(res,200,await tripo.refreshJob(generationJob[1]));
 const originalJob=/^\/api\/tripo\/jobs\/([a-zA-Z0-9_-]+)\/original$/.exec(p);
 if(originalJob&&req.method==='GET'){const job=tripo.job(originalJob[1]);if(!job.originalSHA256||!['glb','fbx'].includes(job.nativeFormat))return json(res,404,{error:'原件尚未下载'});res.setHeader('Content-Disposition',`attachment; filename="Tripo.${job.originalContainer==='zip'?'zip':job.nativeFormat}"; filename*=UTF-8''${encodeURIComponent(assetFileStem(job.assetID?store.asset(job.assetID).name:job.name)+'.'+(job.originalContainer==='zip'?'zip':job.nativeFormat))}`);return file(req,res,path.join(data,'tripo-originals',job.id+'.'+job.nativeFormat));}
 const treeReviewRoute=/^\/api\/tree\/projects\/([a-f0-9-]+)\/(workflow|reviews|outputs|component|draft)$/.exec(p);
 if(treeReviewRoute){
  const [,id,action]=treeReviewRoute;
  if(action==='draft'){
   const drafts=new TreeDraftStore(store,modules),quality=u.searchParams.get('quality')||'PREVIEW';
   if(req.method==='GET')return json(res,200,drafts.context(id,quality));
   if(req.method==='POST'){const bytes=await body(req,128*1048576);return json(res,200,drafts.save(id,{quality,revision:req.headers['x-tree-revision'],signature:req.headers['x-tree-signature']},bytes));}
  }
  if(action==='workflow'&&req.method==='GET')return json(res,200,treeReviews.describe(id,u.searchParams.get('quality')||'PREVIEW'));
  if(action==='reviews'&&req.method==='POST')return json(res,200,treeReviews.record(id,JSON.parse((await body(req,262144)).toString())));
  if(action==='component'&&req.method==='POST'){
   const input=JSON.parse((await body(req)).toString()),w=treeReviews.describe(id,input.quality),s=w.stages.find(s=>s.id===input.stage);
   if(w.revision!==input.baseRevision||s?.status!=='passed'||s.signature!==input.signature||!['leaf','trunk','branch'].includes(input.stage))throw Object.assign(Error('请完成当前组件复核后保存'),{status:409});
   const {componentFromRecipe}=await import('./public/modules/tree/schema.js'),project=modules.project('tree',id),kind={leaf:'LEAF',trunk:'TRUNK',branch:'BRANCH'}[input.stage];
   const item=treeComponents.create(componentFromRecipe(project.recipe,kind,input.name),{projectId:id,revision:project.revision,quality:w.quality,reviewId:s.record.id,scope:s.record.scope});return json(res,200,item);
  }
  if(action==='outputs'&&req.method==='POST'){
   const quality=u.searchParams.get('quality')||'PREVIEW',target=u.searchParams.get('target');if(!['download','library','prefab'].includes(target))throw Error('输出位置无效');
   const guard={quality,revision:req.headers['x-tree-revision'],signature:req.headers['x-tree-signature']};let w=treeReviews.requireOutput(id,guard);
   const bytes=await body(req,128*1048576),stats=(await import('./store.mjs')).inspectGLB(bytes);w=treeReviews.requireOutput(id,guard);
   if(stats.triangles!==w.stages.at(-1).record.report.triangles)throw Error('输出模型与复核模型的三角面不一致');
   const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString()),receipt=doc.nodes?.find(n=>n.extras?.treeReview)?.extras.treeReview;
   if(receipt?.projectId!==id||receipt?.revision!==w.revision||receipt?.quality!==quality||receipt?.target!==target||JSON.stringify(receipt?.reviewIds)!==JSON.stringify(w.stages.map(s=>s.record.id)))throw Error('输出模型缺少当前版本的逐步复核凭据');
   const {modelDimensions}=await import('./prefab-import.mjs'),dimensions=modelDimensions(bytes);
   const project=modules.project('tree',id),notes=project.notes+'\n'+w.limits+'\n工作台逐步复核；未执行原生枝干表面融合。',tags=['树木逐步复核','静态制作复核','用途需引擎验收',quality];let result={verified:true,sha256:hash(bytes),reviews:w.stages.map(s=>s.record.id),scope:w.limits};
   if(target==='library')result={...result,...store.import(bytes,{name:project.name,category:'植被',tags,source:'树木工程 '+id+' · 逐步复核'},{maxBytes:128*1048576})};
   if(target==='prefab'){const existing=prefabs.list().find(p=>p.source?.convertedSHA===hash(bytes));result={...result,duplicate:!!existing,prefab:existing||prefabs.importModel(bytes,{name:(project.name+' · 静态制作复核').slice(0,120),category:'植被',tags,notes:notes.slice(0,4000),file:project.name+'.glb',format:'glb',sourceHash:w.stages.at(-1).signature,convertedHash:hash(bytes),dimensions})};}
   return json(res,200,result);
  }
  return json(res,405,{error:'操作不支持'});
 }
 if(p==='/api/tree/components'){if(req.method==='GET')return json(res,200,treeComponents.list());if(req.method==='POST')return json(res,200,treeComponents.create(JSON.parse((await body(req)).toString())));return json(res,405,{error:'操作不支持'});}
 const moduleRoute=/^\/api\/modules\/([a-z]+)\/projects(?:\/([^/]+))?$/.exec(p);
 if(moduleRoute){const [,module,id]=moduleRoute;if(req.method==='GET')return json(res,200,id?modules.project(module,id):modules.list(module));if(req.method==='POST'&&!id)return json(res,200,modules.create(module,JSON.parse((await body(req)).toString()).name));if(req.method==='PUT'&&id){const patch=JSON.parse((await body(req)).toString());if(['compose','tree'].includes(module)&&patch.reference&&!fs.existsSync(references.file(patch.reference.sha)))throw Error('参考图文件不存在，请重新导入');return json(res,200,modules.save(module,id,patch));}return json(res,405,{error:'操作不支持'});}
 if(p==='/api/previews'&&req.method==='POST'){const bytes=await body(req,8*1024*1024);if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('预览需要 PNG 图片');const name=['library','form','stage'].includes(u.searchParams.get('name'))?u.searchParams.get('name'):'stage';const dir=path.join(data,'previews');fs.mkdirSync(dir,{recursive:true});const target=path.join(dir,name+'_'+hash(bytes).slice(0,16)+'.png');fs.writeFileSync(target+'.tmp',bytes);fs.renameSync(target+'.tmp',target);return json(res,200,{path:target,url:'/previews/'+path.basename(target)});}
 const derived=/^\/api\/assets\/([^/]+)\/derived$/.exec(p);
 if(derived&&req.method==='POST')return json(res,200,store.derive(await body(req,ASSET_IMPORT_MAX_BYTES),derived[1],u.searchParams.get('name')));
 const namedFiles=/^\/api\/assets\/([a-f0-9-]+)\/files(?:\/(glb|fbx|zip))?$/.exec(p);
 if(namedFiles){const [,id,format]=namedFiles;if(!format&&req.method==='POST'){store.updateAsset(id,{name:store.asset(id).name});return json(res,200,assetFileInfo(store,id));}if(!format&&req.method==='GET')return json(res,200,assetFileInfo(store,id));if(format&&req.method==='GET'){const item=assetFileDownload(store,id,format);res.setHeader('Content-Disposition',`attachment; filename="Orbigen.${format}"; filename*=UTF-8''${encodeURIComponent(item.name)}`);return file(req,res,item.path);}}
 const composeMesh=/^\/api\/assets\/([a-f0-9-]+)\/compose-mesh$/.exec(p);if(composeMesh&&req.method==='POST')return json(res,200,await composeMeshes.get(composeMesh[1]));
 if(p==='/api/assets/revision'&&req.method==='GET')return json(res,200,{revision:store.assetRevision()});
 if(p==='/api/assets/snapshot'&&req.method==='GET')return json(res,200,{revision:store.assetRevision(),assets:store.list({includeTrash:true}),trash:store.trash()});
 if(p==='/api/assets/trash'&&req.method==='GET')return json(res,200,store.trash());
 const restoreAsset=/^\/api\/assets\/([^/]+)\/restore$/.exec(p);
 if(restoreAsset&&req.method==='POST')return json(res,200,store.restore(restoreAsset[1]));
 if(/^\/api\/assets\/[^/]+$/.test(p)&&req.method==='DELETE')return json(res,200,store.recycle(p.split('/').pop()));
 if(p==='/api/assets'&&req.method==='GET')return json(res,200,store.list({includeTrash:u.searchParams.get('includeTrash')==='1'}));
 if(p==='/api/assets'&&req.method==='POST'){const bytes=await body(req,ASSET_IMPORT_MAX_BYTES);return json(res,200,store.import(bytes,{name:u.searchParams.get('name'),category:u.searchParams.get('category')}));}
 if(/^\/api\/assets\/[^/]+$/.test(p)&&req.method==='PATCH')return json(res,200,store.updateAsset(p.split('/').pop(),JSON.parse((await body(req)).toString())));
 if(p==='/api/projects'&&req.method==='GET')return json(res,200,store.projects());
 if(p==='/api/projects'&&req.method==='POST')return json(res,200,store.createProject(JSON.parse((await body(req)).toString()).name));
 if(/^\/api\/projects\/[^/]+\/checkpoints$/.test(p)&&req.method==='GET')return json(res,200,store.checkpoints(p.split('/')[3]));
 if(/^\/api\/projects\/[^/]+\/checkpoint$/.test(p)&&req.method==='POST')return json(res,200,store.checkpoint(p.split('/')[3]));
 if(/^\/api\/projects\/[^/]+$/.test(p)){const id=p.split('/').pop();if(req.method==='GET')return json(res,200,store.project(id));if(req.method==='PUT'){const x=JSON.parse((await body(req)).toString());return json(res,200,store.saveProject(id,x.baseRevision,x));}}
 if(/^\/previews\/(library|form|stage)_[a-f0-9]{16}\.png$/.test(p)&&req.method==='GET')return file(req,res,path.join(data,p));
 if(/^\/blobs\/[a-f0-9]{64}\.glb$/.test(p)&&req.method==='GET')return file(req,res,path.join(data,p));
 if(p.startsWith('/api/'))return json(res,404,{error:'接口不存在'});
 if(req.method!=='GET')return json(res,405,{error:'操作不支持'});
 let rel=decodeURIComponent(p).replace(/^\/+/, '')||'index.html';const target=path.resolve(publicDir,rel);if(!target.startsWith(publicDir+path.sep))return json(res,403,{error:'路径无效'});file(req,res,target);
 }catch(e){json(res,e.status||400,{error:e.message});}});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`端口 ${port} 已占用。请先检查 http://127.0.0.1:${port}/api/health；可设置 ASSET_WORKBENCH_PORT。`:e.message);process.exitCode=1;store.close();});
server.listen(port,'127.0.0.1',()=>console.log(`Asset Workbench: http://127.0.0.1:${port}\nData: ${data}`));
function shutdown(){clearInterval(trashTimer);prefabUploads.stop();codex.stop();blender.stop();assetFolder.stop();batches.stop();tripo.stop();Promise.resolve(assetFolder.task).finally(()=>server.close(()=>{store.close();process.exit(0);}));}
for(const s of ['SIGTERM','SIGINT'])process.on(s,shutdown);
