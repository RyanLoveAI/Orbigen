import {TRIPO_PROVIDER} from './tripo.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID, createHash } from 'node:crypto';

export const VIEW_KEYS = ['front','left','back','right'];
export const SUBMISSION_INTERVAL_MS = 4000;
const finished = new Set(['success','invalid','skipped']);
const jobErrors = new Set(['unconfirmed','failed','cancelled','banned','expired','download_error','submitting']);
const aliases = [['front','frontview','前','正面','前视图'],['left','leftview','左','左面','左视图'],['back','rear','backview','后','背面','后视图'],['right','rightview','右','右面','右视图']];
const types={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
const digest = value => createHash('sha256').update(value).digest('hex');
const timestamp = () => new Date().toISOString();
const fail = message => { throw Error(message); };
function viewIndex(name) {
  const stem=path.parse(name).name.toLowerCase().normalize('NFKC');
  return aliases.findIndex(words=>words.some(word=>new RegExp('(^|[_. \\-0-9])'+word+'($|[_. \\-0-9])').test(stem)));
}
function settings(input) { return {model:input.model,geometryQuality:input.geometryQuality,textureQuality:input.textureQuality,faceLimit:Number(input.faceLimit),category:input.category||'其他',...(input.quad?{quad:true}:{})}; }
function batchMode(input) { if(input.mode!=null&&!['image','multiview'].includes(input.mode))fail('请选择单张图或四视图批量模式');return input.mode||'multiview'; }
function fingerprint(views,config) {
  // Preserve historical four-view identities so an App update cannot resubmit them.
  const identity=[views.map(v=>v.sha256),settings(config)];if(batchMode(config)==='image')identity.push('image');return digest(JSON.stringify(identity));
}
function imageFile(target,file,type,view) {
  const stat=fs.lstatSync(target);if(!stat.isFile()||stat.isSymbolicLink())fail(file+' 不是普通图片文件');
  if(stat.size>20*1048576)fail(file+' 超过 20 MB');
  const bytes=fs.readFileSync(target);
  const valid=type==='image/png'?bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a':type==='image/jpeg'?bytes[0]===255&&bytes[1]===216:bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  if(!valid)fail(file+' 格式不匹配');
  return {view,file,type,sha256:digest(bytes),bytes:bytes.length};
}
function singleImageItem(root,file) {
  const issues=[],views=[];
  try {
    // Do not follow a folder that has been replaced with a symbolic link since scanning.
    const parts=file.split(path.sep);if(parts.some(p=>!p||p==='.'||p==='..'))fail('源图片路径无效');
    let current=root;const rootStat=fs.lstatSync(root);if(!rootStat.isDirectory()||rootStat.isSymbolicLink())fail('源图片目录不是普通文件夹');for(const part of parts.slice(0,-1)){current=path.join(current,part);const stat=fs.lstatSync(current);if(!stat.isDirectory()||stat.isSymbolicLink())fail('源图片目录不是普通文件夹');}
    const type=types[path.extname(file).toLowerCase()];if(!type)fail('图片格式不支持');views.push(imageFile(path.join(root,file),file,type,'image'));
  }catch(e){issues.push(e.message);}
  return {folder:file,name:path.parse(file).name.slice(0,120),views,issues,valid:issues.length===0};
}
export function scanSingleImageDirectory(directory) {
  if(typeof directory!=='string'||!path.isAbsolute(directory)||directory.length>4096)fail('请选择绝对路径的图片目录');
  const root=fs.realpathSync(directory);if(!fs.statSync(root).isDirectory())fail('选择的路径不是文件夹');
  const items=[],walk=relative=>{
    for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){
      if(entry.name.startsWith('.')||entry.isSymbolicLink())continue;
      const file=path.join(relative,entry.name);
      if(entry.isDirectory())walk(file);
      else if(types[path.extname(entry.name).toLowerCase()])items.push(singleImageItem(root,file));
    }
  };walk('');items.sort((a,b)=>a.folder.localeCompare(b.folder,'zh-CN',{numeric:true}));return {root,items};
}
export function scanFourViewDirectory(directory) {
  if(typeof directory!=='string'||!path.isAbsolute(directory)||directory.length>4096)fail('请选择绝对路径的四视图根目录');
  const root=fs.realpathSync(directory);if(!fs.statSync(root).isDirectory())fail('选择的路径不是文件夹');
  return {root,items:fs.readdirSync(root,{withFileTypes:true}).filter(d=>d.isDirectory()&&!d.name.startsWith('.')).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN',{numeric:true})).map(folder=>{
    const folderPath=path.join(root,folder.name),views=new Array(4).fill(null),issues=[];
    for(const entry of fs.readdirSync(folderPath,{withFileTypes:true})) {
      const type=types[path.extname(entry.name).toLowerCase()],index=viewIndex(entry.name);
      if(!type||index<0)continue;
      if(!entry.isFile()){issues.push(entry.name+' 不是普通图片文件');continue;}
      if(views[index]){issues.push(VIEW_KEYS[index]+' 有多张候选图片');continue;}
      const target=path.join(folderPath,entry.name);
      try{views[index]=imageFile(target,entry.name,type,VIEW_KEYS[index]);}catch(e){issues.push(e.message);}
    }
    for(let i=0;i<4;i++)if(!views[i])issues.push('缺少 '+VIEW_KEYS[i]);
    if(views.every(Boolean)&&new Set(views.map(v=>v.sha256)).size<4)issues.push('存在重复图片，请提供不同视角');
    return {folder:folder.name,name:folder.name,views,issues,valid:issues.length===0};
  })};
}

export class TripoBatch {
  constructor(service,{defaultRoot=process.env.ORBIGEN_FOUR_VIEW_INBOX||path.join(os.homedir(),'Orbigen','FourViewInbox'),auto=true,clock=Date.now}={}) {
    this.service=service;this.db=service.db;this.defaultRoot=defaultRoot;this.auto=auto;this.clock=clock;this.busy=false;this.stopped=false;
    this.db.exec('CREATE TABLE IF NOT EXISTS generation_batches(id TEXT PRIMARY KEY,json TEXT NOT NULL)');
    // An upload may be repeated after a crash. A generation POST may never be repeated blindly.
    for(const batch of this.all())for(const item of batch.items)if(item.status==='uploading'){item.status='pending';this.put(batch);}
    if(auto){this.timer=setInterval(()=>this.tick().catch(()=>{}),SUBMISSION_INTERVAL_MS);this.timer.unref();}
  }
  all(){return this.db.prepare('SELECT json FROM generation_batches ORDER BY rowid DESC').all().map(r=>JSON.parse(r.json));}
  list(){return this.all().filter(b=>b.provider===TRIPO_PROVIDER&&(!this.service.session?.user?.name||b.account===this.service.session.user.name));}
  get(id){const row=this.db.prepare('SELECT json FROM generation_batches WHERE id=?').get(id);if(!row)fail('批量队列不存在');return JSON.parse(row.json);}
  put(batch){batch.updatedAt=timestamp();this.db.prepare('INSERT INTO generation_batches VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(batch.id,JSON.stringify(batch));return batch;}
  updateItem(id,index,patch){const batch=this.get(id);Object.assign(batch.items[index],patch);return this.put(batch);}
  prior(key){return this.list().flatMap(b=>b.items).find(item=>item.fingerprint===key&&!['skipped','invalid'].includes(item.status));}
  async scan(input,{requireQuote=false}={}){
    await this.service.ready;
    const mode=batchMode(input),config={...settings(input),mode,name:mode==='image'?'单张图批量素材':'四视图批量组件',prompt:mode==='image'?'Single reference component':'Four-view reference component'};
    const scan=(mode==='image'?scanSingleImageDirectory:scanFourViewDirectory)(input.root||this.defaultRoot);
    let quote=null,pricingError=null;
    if(requireQuote)quote=await this.service.quote(config);
    else if(this.service.session?.token&&input.localOnly!==true){try{quote=await this.service.quote(config);}catch(e){pricingError=e.message;}}
    const seen=new Map();
    const items=scan.items.map(item=>{if(!item.valid)return {...item,status:'invalid'};const key=fingerprint(item.views,config),previous=this.prior(key),duplicate=seen.get(key);seen.set(key,item.folder);return {...item,fingerprint:key,status:previous||duplicate?'existing':'pending',...(previous?{jobID:previous.jobID,previousStatus:previous.status}:duplicate?{duplicateOf:duplicate}:{})};});
    const pending=items.filter(i=>i.status==='pending').length;
    const perItemCredits=quote?.estimatedCredits??null;
    const snapshot=digest(JSON.stringify([scan.root,mode,settings(config),perItemCredits,items.map(i=>[i.folder,i.fingerprint,i.status,i.issues])]));
    return {root:scan.root,mode,config:{...settings(config),mode},items,snapshot,quoted:Boolean(quote),pricingError,perItemCredits,estimatedTotalCredits:quote?pending*perItemCredits:null,pending,invalid:items.filter(i=>i.status==='invalid').length,existing:items.filter(i=>i.status==='existing').length};
  }
  async start(input){
    const account=await this.service.account();if(!account.connected)fail('请先连接 Tripo 账号');
    const scan=await this.scan(input,{requireQuote:true});
    if(input.snapshot!==scan.snapshot||Number(input.acceptedTotalCredits)!==scan.estimatedTotalCredits)fail('目录、设置或积分估算已变化，请重新扫描后启动');
    if(!scan.pending)fail(scan.mode==='image'?'没有新的有效单张图片需要生成':'没有新的完整四视图组件需要生成');
    if(account.user.balance<scan.estimatedTotalCredits)fail('余额不足以完成整批任务');
    if(this.list().some(b=>['running','needs_attention'].includes(b.status)))fail('已有运行或待处理队列，请先暂停或处理它');
    // Recheck after awaiting network calls so two Start clicks cannot create duplicate queues.
    if(scan.items.some(i=>i.status==='pending'&&this.prior(i.fingerprint)))fail('这些视图已经排入队列，请刷新任务');
    const batch=this.put({id:randomUUID(),provider:TRIPO_PROVIDER,account:account.user.name,root:scan.root,config:scan.config,perItemCredits:scan.perItemCredits,estimatedTotalCredits:scan.estimatedTotalCredits,status:'running',createdAt:timestamp(),items:scan.items.map(i=>({...i,status:i.status==='existing'?'skipped':i.status,requestID:randomUUID()}))});
    if(this.auto)this.tick().catch(()=>{});return batch;
  }
  control(id,action,index){
    const batch=this.get(id);if(batch.account!==this.service.session?.user?.name)fail('队列属于另一个账号');
    if(action==='pause')batch.status='paused';
    else if(action==='resume'){if(this.list().some(b=>b.id!==id&&['running','needs_attention'].includes(b.status)))fail('请先处理另一个队列');batch.status='running';delete batch.error;}
    else if(action==='skip'){
      if(!Number.isInteger(index)||!batch.items[index]||!['error','submitting'].includes(batch.items[index].status))fail('只能跳过待处理的项目');
      const job=batch.items[index].jobID?this.service.job(batch.items[index].jobID):null;
      if(job?.remoteID&&!['failed','cancelled','banned','expired','download_error'].includes(job.status))fail('任务还在生成，不能跳过');
      batch.items[index].status='skipped';batch.status='paused';delete batch.error;
    }else fail('队列操作无效');
    return this.put(batch);
  }
  async tick(){
    await this.service.ready;
    if(this.busy||this.stopped||!this.service.session?.token)return;
    this.busy=true;
    try {
      // Only reconcile local records here. TripoService owns cloud polling and
      // downloads, so a slow generation/conversion never blocks the next upload.
      const jobs=new Map(this.service.list().map(job=>[job.requestID,job]));
      for(const batch of this.list().filter(b=>['running','paused','needs_attention'].includes(b.status)))this.syncJobs(batch,jobs);
      const batch=this.list().find(b=>b.status==='running');if(!batch)return;
      if(this.service.session.authExpired||this.clock()<Number(batch.nextSubmissionAt||0))return;
      const index=batch.items.findIndex(i=>i.status==='pending');if(index<0)return;
      const item=batch.items[index];
      let job;
      try {
        const mode=batchMode(batch.config),current=mode==='image'?singleImageItem(batch.root,item.folder):scanFourViewDirectory(batch.root).items.find(i=>i.folder===item.folder);
        if(!current?.valid||fingerprint(current.views,batch.config)!==item.fingerprint)fail('源图片发生变化或缺失，请跳过此项并重新扫描');
        this.updateItem(batch.id,index,{status:'uploading',uploadedViews:0});
        const imageIDs=[];
        for(let i=0;i<item.views.length;i++){
          if(this.stopped||this.get(batch.id).status!=='running') {this.updateItem(batch.id,index,{status:'pending'});return;}
          const view=item.views[i],target=mode==='image'?path.join(batch.root,view.file):path.join(batch.root,item.folder,view.file),stat=fs.lstatSync(target);
          if(!stat.isFile()||stat.isSymbolicLink()||stat.size>20*1048576)fail('源文件不是有效图片');
          const bytes=fs.readFileSync(target);if(digest(bytes)!==view.sha256)fail('源图片在上传前发生变化');
          const uploaded=await this.service.upload(bytes,view.type,view.file);imageIDs.push(uploaded.imageID);
          this.updateItem(batch.id,index,{uploadedViews:i+1});
        }
        if(this.stopped||this.get(batch.id).status!=='running'){this.updateItem(batch.id,index,{status:'pending'});return;}
        this.updateItem(batch.id,index,{status:'submitting'});
        const submitting=this.get(batch.id);submitting.nextSubmissionAt=this.clock()+SUBMISSION_INTERVAL_MS;this.put(submitting);
        job=await this.service.generate({...batch.config,name:item.name,prompt:mode==='image'?'Single image of a standalone component':'Four orthographic views of the same standalone component',mode,...(mode==='image'?{imageID:imageIDs[0]}:{imageIDs}),requestID:item.requestID,acceptedCredits:batch.perItemCredits});
        const submitted=this.get(batch.id);submitted.nextSubmissionAt=this.clock()+SUBMISSION_INTERVAL_MS;this.put(submitted);
        this.updateItem(batch.id,index,{jobID:job.id,status:'waiting',progress:job.progress,stage:job.status,...(job.remoteID?{submittedAt:timestamp()}: {})});
        if(jobErrors.has(job.status))this.attention(batch.id,index,job.error||'提交结果待核对，没有自动重复生成');
        else this.syncJobs(this.get(batch.id),new Map([[item.requestID,job]]));
      }catch(e){this.attention(batch.id,index,e.message);}
    }finally{this.busy=false;}
  }
  syncJobs(batch,jobs){
    const before=JSON.stringify(batch);let error;
    for(const item of batch.items){
      if(finished.has(item.status))continue;
      let job=jobs.get(item.requestID);
      if(!job&&item.jobID){try{job=this.service.job(item.jobID);}catch{/* Missing records must block submission, never recreate it. */}}
      if(job){
        item.jobID=job.id;item.progress=job.progress;item.stage=job.status;
        if(job.remoteID){item.remoteID=job.remoteID;item.submittedAt||=job.createdAt||timestamp();}
        if(job.assetID){item.status='success';item.assetID=job.assetID;item.progress=100;delete item.error;}
        else if(jobErrors.has(job.status)){item.status='error';item.error=job.error||'提交结果待核对，没有自动重复生成';}
        else if(job.remoteID){item.status='waiting';delete item.error;}
        else {item.status='error';item.error='提交结果待核对，没有自动重新扣费';}
      }else if(['submitting','waiting'].includes(item.status)){item.status='error';item.error='提交记录缺失，需人工核对，没有自动重新扣费';}
      if(item.status==='error')error||=item.error||'队列项目需要处理';
    }
    if(error){batch.error=error; if(batch.status!=='paused')batch.status='needs_attention';}
    else if(batch.items.every(i=>finished.has(i.status))){batch.status='complete';batch.completedAt=timestamp();delete batch.error;}
    else if(batch.status==='needs_attention'){batch.status='paused';delete batch.error;}
    if(JSON.stringify(batch)!==before)this.put(batch);
  }
  attention(id,index,message){const batch=this.get(id);batch.items[index].status='error';batch.items[index].error=message;batch.error=message;batch.status='needs_attention';this.put(batch);}
  stop(){this.stopped=true;clearInterval(this.timer);}
}
