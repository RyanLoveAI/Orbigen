import {findBlender,blenderGPUArgs} from './platform.mjs';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {inspectGLB,hash} from './store.mjs';
import {validateBlenderOperations} from './public/modules/compose/blender-protocol.js';
import {validateReview} from './public/modules/compose/review-schema.js';
import {verifyComposeMesh} from './compose-meshes.mjs';
export const BLENDER_RETURN_MAX_BYTES=256*1048576;
const worker=fileURLToPath(new URL('./scripts/blender-bridge.py',import.meta.url));
const write=(file,value)=>{fs.writeFileSync(file+'.tmp',JSON.stringify(value,null,2));fs.renameSync(file+'.tmp',file);};
export class BlenderBridge{
 constructor(store,modules,{binary=findBlender(),launch=spawn}={}){
  Object.assign(this,{store,modules,binary,launch});this.dir=path.join(store.dir,'blender-sessions');fs.mkdirSync(this.dir,{recursive:true});this.sessions=new Map();this.watchers=new Map();this.clients=new Set();this.tasks=new Map();
  store.db.exec('CREATE TABLE IF NOT EXISTS blender_returns(session TEXT NOT NULL, token TEXT NOT NULL, project TEXT NOT NULL, PRIMARY KEY(session,token))');
  for(const id of fs.readdirSync(this.dir).filter(id=>/^[a-f0-9-]{36}$/.test(id)).slice(-100)){try{const s=JSON.parse(fs.readFileSync(path.join(this.dir,id,'session.json')));if(s.id!==id)continue;if(s.guiPID){try{process.kill(s.guiPID,0);}catch{s.guiPID=null;}}if(['working','preparing'].includes(s.state))s.state='ready';this.sessions.set(id,s);this.watch(s);if(fs.existsSync(path.join(this.dir,id,'ready.json')))this.receive(id);}catch{}}
 }
 status(){return {available:fs.existsSync(this.binary),binary:this.binary,message:fs.existsSync(this.binary)?'本机 Blender 已就绪':'未找到 Blender，可将便携 Blender 放在工作台的 Blender 文件夹，或配置 ORBIGEN_BLENDER_BIN'};}
 get(id){const s=this.sessions.get(id);if(!s)throw Error('Blender 会话不存在');return s;}
 directory(id){this.get(id);return path.join(this.dir,id);}
 public(s){return {id:s.id,module:s.module||'compose',sourceKind:s.sourceKind||'project',projectId:s.projectId,name:s.name,state:s.state,error:s.error||s.notificationError||null,updatedAt:s.updatedAt,result:s.result||null,inventory:s.inventory||[],gui:!!s.guiPID,revision:s.revision||0,camera:s.camera,assets:s.assets||[]};}
 list(projectId){return [...this.sessions.values()].filter(s=>s.projectId===projectId||s.result?.projectId===projectId).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(s=>this.public(s));}
 persist(s){s.updatedAt=new Date().toISOString();write(path.join(this.directory(s.id),'session.json'),s);this.emit(s);}
 emit(s){const value=this.public(s);for(const c of this.clients){if(!c.project||c.project===s.projectId||c.project===s.result?.projectId)c.res.write('event: session\ndata: '+JSON.stringify(value)+'\n\n');}}
 events(req,res,project){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(': connected\n\n');const c={res,project};this.clients.add(c);req.on('close',()=>this.clients.delete(c));for(const s of this.list(project))res.write('event: session\ndata: '+JSON.stringify(s)+'\n\n');}
 watch(s){const dir=this.directory(s.id);try{const watcher=fs.watch(dir,(_,name)=>{if(name!=='ready.json'&&name!=='export-error.json')return;try{if(name==='export-error.json'){s.error=JSON.parse(fs.readFileSync(path.join(dir,name))).error;this.persist(s);}else this.receive(s.id);}catch(e){s.state='failed';s.error=e.message;this.persist(s);}});watcher.on('error',()=>{watcher.close();this.watchers.delete(s.id);s.notificationError='本机文件通知暂不可用，请点击刷新回传';this.persist(s);});this.watchers.set(s.id,watcher);}catch{s.notificationError='本机文件通知暂不可用，请点击刷新回传';}}
 safeFile(id,name){const dir=fs.realpathSync(this.directory(id)),file=fs.realpathSync(path.join(dir,name));if(path.dirname(file)!==dir||!fs.statSync(file).isFile())throw Error('Blender 回传文件路径无效');return file;}
 async run(s,mode,input){
  if(this.tasks.has(s.id))throw Error('Blender 正在处理此会话');const dir=this.directory(s.id);if(input)write(path.join(dir,'operations.json'),input);
  const args=['--background','--factory-startup',...blenderGPUArgs(),'--python-exit-code','1','--python',worker,'--',mode,dir];
  await new Promise((resolve,reject)=>{const child=this.launch(this.binary,args,{stdio:['ignore','pipe','pipe']});this.tasks.set(s.id,child);let log='';for(const stream of [child.stdout,child.stderr])stream.on('data',c=>{log=(log+c).slice(-32000);});const timer=setTimeout(()=>{child.kill('SIGTERM');},180000);child.on('error',e=>{clearTimeout(timer);this.tasks.delete(s.id);reject(e);});child.on('close',code=>{clearTimeout(timer);this.tasks.delete(s.id);fs.writeFileSync(path.join(dir,'worker.log'),log);if(code!==0)reject(Error('Blender 制作失败；原工程保留，可查看本地 worker.log'));else resolve();});});
 }
 async create(input){
  if(!this.status().available)throw Error(this.status().message);const module=input.module||'compose';if(!['assembly','compose'].includes(module))throw Error('不支持此制作页面');
  const original=module==='assembly'?this.store.project(input.projectId):this.modules.project('compose',input.projectId);if(original.revision!==input.revision)throw Error('工程已变化，请保存后重新连接');let p=structuredClone(original);
  if(module==='assembly'&&input.assetIds!==undefined){
   if(!Array.isArray(input.assetIds)||!input.assetIds.length||input.assetIds.length>200||new Set(input.assetIds).size!==input.assetIds.length)throw Error('请选择 1–200 件不同素材');
   if(!Array.isArray(input.instances)||input.instances.length!==input.assetIds.length||new Set(input.instances.map(i=>i.assetId)).size!==input.assetIds.length||new Set(input.instances.map(i=>i.id)).size!==input.instances.length)throw Error('预选素材实例不完整');
   p.instances=input.instances.map(i=>{if(!input.assetIds.includes(i.assetId)||typeof i.id!=='string'||!i.id.length||i.id.length>120)throw Error('预选素材不匹配');const a=this.store.asset(i.assetId);if(a.deletedAt||a.version!==i.version||a.unitScale!==i.unitScale)throw Error('素材已改变，请刷新后重新选择');for(const k of ['position','rotation','scale'])if(!Array.isArray(i[k])||i[k].length!==3||i[k].some(n=>!Number.isFinite(n)||Math.abs(n)>1e6))throw Error('素材变换无效');if(i.scale.some(n=>n<=0))throw Error('缩放无效');return {...i,name:a.name,locked:false};});
  }
  if(!p.instances.length)throw Error('请先放入要制作的素材');
  if(module==='assembly'){p.sources=[...new Set(p.instances.map(i=>i.assetId))].map(id=>{const a=this.store.asset(id);if(a.deletedAt)throw Error('素材在回收站，请先恢复：'+a.name);return {id:a.id,sha:a.sha,version:a.version,name:a.name,triangles:a.triangles};});p.parts=[];p.reference=null;p.review=null;}
  const localAssets=input.transfer==='local-assets';
  if(input.transfer!==undefined&&!localAssets||localAssets&&module!=='assembly')throw Error('不支持此模型传输方式');
  let bytes=null;
  if(!localAssets){if(typeof input.glb!=='string'||input.glb.length>90*1048576)throw Error('工程模型超过上限');bytes=Buffer.from(input.glb,'base64');inspectGLB(bytes);if(bytes.length>64*1048576)throw Error('工程模型超过 64 MB');}
  else if(input.glb!==undefined)throw Error('本地素材导入无需上传合并模型');
  const s={id:randomUUID(),module,sourceKind:input.assetIds?'library':'project',projectId:p.id,name:p.name+(input.assetIds?' · 预选素材':''),state:'preparing',revision:0,updatedAt:new Date().toISOString(),sourceRevision:p.revision,camera:input.camera};const dir=path.join(this.dir,s.id);fs.mkdirSync(path.join(dir,'assets'),{recursive:true});this.sessions.set(s.id,s);this.watch(s);
  try{if(bytes)fs.writeFileSync(path.join(dir,'scene.glb'),bytes);const manifest={schemaVersion:1,sceneSource:localAssets?'assets':'glb',project:structuredClone(p),camera:input.camera,review:validateReview(p.review),assets:[]};
   const ids=new Set([...p.sources.map(s=>s.id),...p.parts.map(p=>p.assetId).filter(Boolean)]);for(const id of ids){const a=this.store.asset(id);if(a.deletedAt)continue;const originalFile=path.join(this.store.dir,'blobs',a.sha+'.glb');if(!fs.existsSync(originalFile)){if(p.sources.some(s=>s.id===id))throw Error('缺少素材原件：'+a.name);continue;}fs.copyFileSync(originalFile,path.join(dir,'assets',a.sha+'.glb'));manifest.assets.push({id:a.id,name:a.name,sha:a.sha,category:a.category,unitScale:a.unitScale,triangles:a.triangles,dimensions:a.dimensions,file:'assets/'+a.sha+'.glb'});}
   if(p.reference){fs.copyFileSync(path.join(this.store.dir,'references',p.reference.sha+'.png'),path.join(dir,'reference.png'));manifest.reference='reference.png';}
   if(localAssets){manifest.instanceAssets=p.instances.map(i=>{const a=this.store.asset(i.assetId);if(i.version!==a.version)throw Error('素材版本已变化，请刷新后重新导入');const sha=i.geometry?.sha||a.sha;if(i.geometry)verifyComposeMesh(this.store.db,a.sha,i.geometry);const source=path.join(this.store.dir,'blobs',sha+'.glb');if(!fs.existsSync(source))throw Error('缺少素材模型：'+a.name);const file='assets/'+sha+'.glb';if(!fs.existsSync(path.join(dir,file)))fs.copyFileSync(source,path.join(dir,file));return {instanceId:i.id,assetId:a.id,sha,file,dimensions:i.geometry?.dimensions||null};});}
   s.assets=manifest.assets;write(path.join(dir,'manifest.json'),manifest);this.persist(s);await this.run(s,'prepare');s.inventory=JSON.parse(fs.readFileSync(path.join(dir,'inventory.json')));s.state='ready';this.persist(s);return this.public(s);
  }catch(e){s.state='failed';s.error=e.message;this.persist(s);throw e;}
 }
 async edit(id,input){const s=this.get(id);if(s.module==='assembly')throw Error('请在 Blender 窗口中加工此素材装配会话，保存后自动回传');if(s.guiPID)throw Error('请先在 Blender 保存并关闭此制作窗口，再让 Codex 后台调整');if(s.state==='preparing'||s.state==='working')throw Error('Blender 仍在制作');if(input.revision!==s.revision)throw Error('Blender 会话版本已变化，请重新让助手读取');validateBlenderOperations(input.operations);const current=this.modules.project('compose',input.projectId);if(current.revision!==input.projectRevision||current.id!==s.projectId&&current.review?.sessionId!==id)throw Error('查验工程已变化或不属于此会话');s.returnReview=validateReview(current.review);s.state='working';s.error=null;this.persist(s);try{await this.run(s,'edit',{operations:input.operations});s.inventory=JSON.parse(fs.readFileSync(path.join(this.directory(id),'inventory.json')));this.receive(id);s.state='completed';this.persist(s);return this.public(s);}catch(e){s.state='failed';s.error=e.message;this.persist(s);throw e;}}
 async open(id,input={}){const s=this.get(id);if(input.projectId){const p=s.module==='assembly'?this.store.project(input.projectId):this.modules.project('compose',input.projectId);if(p.revision!==input.projectRevision||p.id!==s.projectId&&p.review?.sessionId!==id)throw Error('当前工程已变化，请保存后重新打开 Blender');s.returnReview=validateReview(p.review);}if(this.tasks.has(id))throw Error('请等待 Blender 制作完成');if(!fs.existsSync(path.join(this.directory(id),'scene.blend')))throw Error('请先成功连接当前工程');if(s.guiPID)throw Error('此会话的 Blender 窗口已经打开');
  const child=this.launch(this.binary,['--factory-startup',...blenderGPUArgs(),'--python',worker,'--','open',this.directory(id)],{stdio:'ignore'});s.guiPID=child.pid;this.persist(s);child.on('error',e=>{s.guiPID=null;s.error='无法打开 Blender：'+e.message;this.persist(s);});child.on('close',()=>{s.guiPID=null;this.persist(s);});return this.public(s);
 }
 receive(id){
  const s=this.get(id),dir=this.directory(id),marker=path.join(dir,'ready.json');if(!fs.existsSync(marker))return;const ready=JSON.parse(fs.readFileSync(this.safeFile(id,'ready.json')));if(!/^[a-f0-9]{64}$/.test(ready.sha)||!Array.isArray(ready.bounds)||ready.bounds.length!==2||ready.bounds.some(v=>!Array.isArray(v)||v.length!==3||v.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6)))throw Error('Blender 回传数据无效');
  const old=this.store.db.prepare('SELECT project FROM blender_returns WHERE session=? AND token=?').get(id,ready.sha);if(old){s.result={...s.result,projectId:old.project,sha:ready.sha};return;}
  const resultFile=this.safeFile(id,'result.glb');if(fs.statSync(resultFile).size>BLENDER_RETURN_MAX_BYTES)throw Error('Blender 回传超过 256 MB，请先减面或压缩贴图');
  const bytes=fs.readFileSync(resultFile);if(hash(bytes)!==ready.sha)throw Error('Blender 回传文件未完成或哈希不匹配');const stats=inspectGLB(bytes);if(stats.triangles>6000000)throw Error('回传超过 600 万三角面，请先减面');
  const [min,max]=ready.bounds,dimensions=min.map((v,k)=>max[k]-v);if(dimensions.some(v=>v<=0))throw Error('回传模型尺寸无效');const original=s.module==='assembly'?this.store.project(s.projectId):this.modules.project('compose',s.projectId),source=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'))).project;
  this.store.db.exec('BEGIN IMMEDIATE');try{
   const {asset}=this.store.import(bytes,{name:(s.name+' · Blender').slice(0,120),category:'其他',tags:['Blender制作','待查验'],source:'Blender 会话 '+id},{maxBytes:BLENDER_RETURN_MAX_BYTES});
   if(s.module==='assembly'){
    const p=this.store.createProject((s.name+' · Blender查验').slice(0,120)),next=this.store.saveProject(p.id,0,{...p,instances:[{id:randomUUID(),assetId:asset.id,version:asset.version,unitScale:1,name:asset.name,locked:false,position:[(min[0]+max[0])/2,min[1],(min[2]+max[2])/2],rotation:[0,0,0],scale:[1,1,1]}]});
    this.store.db.prepare('INSERT INTO blender_returns VALUES(?,?,?)').run(id,ready.sha,next.id);this.store.db.exec('COMMIT');s.result={module:'assembly',projectId:next.id,assetId:asset.id,sha:ready.sha,sourceChanged:original.revision!==s.sourceRevision};
   }else{
   const p=this.modules.create('compose',(s.name+' · Blender查验').slice(0,120)),partId='blender-result',sourceInfo={id:asset.id,name:asset.name,sha:asset.sha,version:asset.version,unitScale:1,dimensions,triangles:asset.triangles};
   const next=this.modules.save('compose',p.id,{...p,baseRevision:p.revision,reference:source.reference,breakdown:source.breakdown,roi:source.roi,roiPolygon:source.roiPolygon,review:{sessionId:id,frames:structuredClone(s.returnReview?.frames||[])},parts:[{id:partId,name:'Blender 完整装配',role:'building',category:'其他',rect:source.roi,depth:0,elevation:0,count:1,status:'confirmed',assetId:asset.id,confidence:1,evidence:'本机 Blender 真实制作回传，等待人工查验',candidates:[]}],sources:[sourceInfo],instances:[{id:'blender-model',partId,assetId:asset.id,version:asset.version,unitScale:1,name:asset.name,locked:false,position:[(min[0]+max[0])/2,min[1],(min[2]+max[2])/2],rotation:[0,0,0],scale:[1,1,1]}]});
   this.store.db.prepare('INSERT INTO blender_returns VALUES(?,?,?)').run(id,ready.sha,next.id);this.store.db.exec('COMMIT');s.result={projectId:next.id,assetId:asset.id,sha:ready.sha,sourceChanged:original.revision!==s.sourceRevision};
   }
  }catch(e){this.store.db.exec('ROLLBACK');throw e;}
  s.inventory=JSON.parse(fs.readFileSync(this.safeFile(id,'inventory.json')));s.revision=(s.revision||0)+1;s.state='completed';s.error=null;this.persist(s);
 }
 stop(){for(const w of this.watchers.values())w.close();for(const c of this.clients)c.res.end();this.clients.clear();for(const child of this.tasks.values())child.kill('SIGTERM');}
}
