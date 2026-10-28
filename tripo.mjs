import {windowsCommand} from './desktop-bridge.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { convertNative } from './model-convert.mjs';
import {ASSET_CATEGORIES} from './public/modules/asset-folder/classify.js';

export const TRIPO_ORIGIN = 'https://openapi.tripo3d.ai';
export const TRIPO_API_BASE = TRIPO_ORIGIN + '/v3';
export const TRIPO_WEBSITE = 'https://studio.tripo3d.ai/';
export const TRIPO_PROVIDER = 'tripo-official-v3';
// Published H3.1 pricing, checked 2026-10-28. Estimates; final charge is returned by the API.
export const OFFICIAL_CATALOG = Object.freeze({ default_h:'v3.1-20260211', h:[
  {value:'v3.1-20260211',label:'H3.1 · 国际官方 API',face_min:500,face_max:1500000,quad_max:150000}
] });
const terminal = new Set(['success', 'failed', 'cancelled', 'banned', 'expired']);
const categories = new Set(ASSET_CATEGORIES);
const now = () => new Date().toISOString();
export const AUTO_LOGIN_INTERVAL_MS = 30 * 60 * 1000; // Retained export for older callers; API keys do not auto-login.
const error = (message, status = 400) => Object.assign(Error(message), { status });
const uuid = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{6,100}$/.test(id);

export function validateGeneration(input, catalog) {
  const name = String(input.name || '').trim(), prompt = String(input.prompt || '').trim();
  if (!name || name.length > 120 || (input.mode==='text' ? !prompt || prompt.length>1024 : prompt.length>4000)) throw error('填写组件名称；文字生成需要 1–1024 字的提示词，图片备注最多 4000 字');
  if(input.quad!==undefined&&typeof input.quad!=='boolean')throw error('四边形选项须为布尔值');
  if(input.notes!==undefined&&(typeof input.notes!=='string'||input.notes.length>4000))throw error('制作备注最多 4000 字');
  const model = catalog.h?.find(item => item.value === input.model);
  if (!model) throw error('请选择当前可用的 H 系列模型');
  const faceLimit = Number(input.faceLimit),quad=Boolean(input.quad),faceMax=quad?(model.quad_max??150000):Math.min(300000,model.face_max||2000000);
  if (!Number.isInteger(faceLimit) || faceLimit < Math.max(500, model.face_min || 500) || faceLimit > faceMax) throw error(`${quad?'四边形':'三角'}面上限须在当前模型范围内，最多 ${faceMax}`);
  if (!['standard', 'detailed'].includes(input.textureQuality) || !['standard', 'detailed'].includes(input.geometryQuality)) throw error('生成精度无效');
  if (!['text', 'image', 'multiview'].includes(input.mode)) throw error('选择文字、参考图或四视图生成');
  const cost = Number(model.credits) > 0 ? Number(model.credits) : (input.mode === 'text' ? 20 : 30) + (input.textureQuality === 'detailed' ? 10 : 0) + (input.geometryQuality === 'detailed' && input.model !== 'v2.5-20250123' ? 20 : 0) + (quad ? 5 : 0);
  return { name, prompt, category: categories.has(input.category) ? input.category : '其他', mode: input.mode, imageID: input.imageID, imageIDs: input.imageIDs, estimatedCredits: cost,
    payload: { type: {text:'text_to_model',image:'image_to_model',multiview:'multiview_to_model'}[input.mode], model: input.model, face_limit: faceLimit, texture: true, pbr: true, ...(quad?{quad:true}:{}), texture_quality: input.textureQuality, ...(input.model !== 'v2.5-20250123' ? { geometry_quality: input.geometryQuality } : {}), ...(input.mode === 'text' ? { prompt } : {}) } };
}

export class KeychainSession {
  constructor(helper = process.env.ORBIGEN_KEYCHAIN_HELPER || (process.platform==='win32'?'windows-dpapi':null)) { this.helper = helper; this.memory = null; }
  command(action, value) {
    if(this.helper==='windows-dpapi')return windowsCommand(action,value);
    return new Promise((resolve, reject) => {
      const child = execFile(this.helper, [action], { timeout: 15000, maxBuffer: 65536 }, (err, stdout) => {
        if (err) reject(error('macOS 钥匙串无法访问，请重新连接账号', 503)); else { try { resolve(stdout.trim() ? JSON.parse(stdout) : null); } catch { reject(error('账号授权存储无法读取', 503)); } }
      });
      child.stdin.end(value ? JSON.stringify(value) : '');
    });
  }
  async load() { return this.helper ? this.command('read') : this.memory; }
  async save(session) { if (this.helper) await this.command('write', session); this.memory = session; }
  async clear() { if (this.helper) await this.command('delete'); this.memory = null; }
}

export function privateAddress(address) {
  if (address.includes(':')) return address === '::' || address === '::1' || /^(fc|fd|fe[89ab]|ff)/i.test(address) || address.startsWith('::ffff:');
  const [a,b] = address.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0) || a === 100 && b >= 64 && b <= 127;
}

export class TripoService {
  constructor(store, { fetcher = fetch, sessionStore = new KeychainSession(), downloadGuard = null, converter = convertNative } = {}) {
    this.store = store; this.db = store.db; this.fetcher = fetcher; this.sessionStore = sessionStore; this.downloadGuard = downloadGuard; this.converter = converter; this.inflight = new Set(); this.images = new Map(); this.stopped = false;
    this.db.exec('CREATE TABLE IF NOT EXISTS generation_jobs(id TEXT PRIMARY KEY, json TEXT NOT NULL)');
    this.ready = this.sessionStore.load().then(session => { this.session = session?.provider === TRIPO_PROVIDER && session?.apiBase === TRIPO_API_BASE && typeof session?.token === 'string' ? session : null; this.resume(); }).catch(() => { this.session = null; });
  }
  safeUser(user) { return user ? { name: user.username || user.name || 'Tripo API', balance: Number(user.balance ?? 0), frozen: Number(user.frozen ?? 0) } : null; }
  async persist() { if (this.session) await this.sessionStore.save(this.session); }
  connectionState() {
    return { origin:TRIPO_API_BASE, website:TRIPO_WEBSITE, provider:TRIPO_PROVIDER, persistent:Boolean(this.sessionStore.helper), remembered:Boolean(this.session?.token), username:'', autoConnect:false };
  }
  async call(endpoint, {method='GET',body,timeout=30000}={}) {
    await this.ready;
    if (!this.session?.token || this.session.provider !== TRIPO_PROVIDER || this.session.authExpired) throw error('请连接 Tripo 国际官方 API Key',401);
    if (!endpoint.startsWith('/') || endpoint.startsWith('//') || endpoint.includes('..')) throw error('Tripo 接口路径无效');
    const session=this.session;
    const headers={Authorization:'Bearer '+session.token};
    if (body && !(body instanceof FormData)) headers['Content-Type']='application/json';
    let response;
    try { response=await this.fetcher(TRIPO_API_BASE+endpoint,{method,headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(timeout)}); }
    catch { throw error(method==='POST'&&endpoint.startsWith('/generation/')?'提交结果尚未确认，请在官方 API 控制台核对；不要重复生成。':'Tripo 国际官方 API 暂时无法连接，请稍后重试',502); }
    if(response.status===401||response.status===403){session.authExpired=true;throw error('Tripo API Key 无效、已撤销或无访问权限，请重新连接',401);}
    let raw;try{raw=await response.json();}catch{throw error('Tripo 返回了无法读取的响应',502);}
    if(!response.ok||raw.code!==undefined&&Number(raw.code)!==0){
      // Do not echo remote payloads or credentials to the UI.
      const status=response.status===429?429:!response.ok?response.status:Number(raw.code)===2010?402:400;
      throw error(status===429?'Tripo 请求过于频繁，请稍后手动重试':status===402?'Tripo API 积分不足':status>=500?'Tripo 服务异常，请稍后核对任务状态':'Tripo API 操作失败（代码 '+String(raw.code??response.status).replace(/[^0-9]/g,'').slice(0,12)+'），请检查参数或官方控制台',status);
    }
    return raw.data??raw;
  }
  async login(apiKey, {remember=false}={}) {
    if(typeof apiKey!=='string'||!/^tsk_[A-Za-z0-9_-]{8,500}$/.test(apiKey.trim()))throw error('请输入国际官方 API Key（以 tsk_ 开头），不是网页账号密码');
    await this.ready;
    if(this.loginPromise)throw error('正在连接 API Key，请稍后重试',409);
    this.loginPromise=(async()=>{
      const previous=this.session,token=apiKey.trim();
      const identity='Tripo API · '+createHash('sha256').update(token).digest('hex').slice(0,16);
      this.session={provider:TRIPO_PROVIDER,apiBase:TRIPO_API_BASE,token,user:{name:identity},remember:Boolean(remember&&this.sessionStore.helper)};
      try {const account=await this.account();if(this.session.remember)await this.persist();else await this.sessionStore.clear();this.images.clear();this.resume();return account;}
      catch(e){this.session=previous;throw e;}
    })();
    try{return await this.loginPromise;}finally{this.loginPromise=null;}
  }
  async reconnect() { return this.account(); }
  async account() {
    await this.ready;
    if(!this.session?.token||this.session.authExpired)return {connected:false,...this.connectionState()};
    const balance=await this.call('/account/balance');
    this.session.user=this.safeUser({...balance,name:this.session.user.name});
    return {connected:true,...this.connectionState(),user:this.session.user};
  }
  async disconnect() {await this.ready;this.session=null;this.images.clear();await this.sessionStore.clear();return {connected:false,...this.connectionState()};}
  async forgetAccount() { return this.disconnect(); }
  async catalog() { return structuredClone(OFFICIAL_CATALOG); }
  list() { return this.db.prepare('SELECT json FROM generation_jobs ORDER BY rowid DESC').all().map(r => JSON.parse(r.json)).filter(job => job.provider !== TRIPO_PROVIDER || !this.session?.user?.name || job.account === this.session.user.name).map(job=>({...job,legacy:job.provider!==TRIPO_PROVIDER})); }
  job(id) { const row = this.db.prepare('SELECT json FROM generation_jobs WHERE id=?').get(id); if (!row) throw error('生成任务不存在', 404); return JSON.parse(row.json); }
  put(job) { job.updatedAt = now(); this.db.prepare('INSERT INTO generation_jobs VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(job.id, JSON.stringify(job)); return job; }
  async upload(bytes, type, name) {
    if (bytes.length > 20*1048576 || !['image/png', 'image/jpeg', 'image/webp'].includes(type)) throw error('参考图支持 PNG、JPG、WEBP，最大 20 MB');
    const valid = type === 'image/png' ? bytes.subarray(0,8).toString('hex') === '89504e470d0a1a0a' : type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 : bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP';
    if (!valid) throw error('参考图格式与文件内容不匹配');
    const form = new FormData(); form.append('file', new Blob([bytes], { type }), String(name || 'reference').slice(0,120));
    const result = await this.call('/files', { method: 'POST', body: form, timeout: 60000 });
    if (!result.file_token) throw error('参考图上传未完成', 502);
    const id = randomUUID(); this.images.set(id, { token: result.file_token, type: type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg', sha: createHash('sha256').update(bytes).digest('hex'), expires: Date.now()+3600000 });
    return { imageID: id, name: String(name || 'reference').slice(0,120) };
  }
  async quote(input) { const catalog = await this.catalog(); const value = validateGeneration(input, catalog), model=catalog.h.find(m=>m.value===input.model); return { estimatedCredits: value.estimatedCredits, pricing: Number(model.credits)>0 ? { modelRate:Number(model.credits) } : { base:input.mode==='text'?20:30, texture:input.textureQuality==='detailed'?10:0, geometry:input.geometryQuality==='detailed'&&input.model!=='v2.5-20250123'?20:0,quad:input.quad?5:0 }, downloadCredits:0, payload: value.payload }; }
  async generate(input) {
    if (!uuid(input.requestID)) throw error('生成请求 ID 无效');
    const old = this.list().find(job => job.provider === TRIPO_PROVIDER && job.requestID === input.requestID); if (old) return old;
    const config = validateGeneration(input, await this.catalog());
    if (Number(input.acceptedCredits) !== config.estimatedCredits) throw error('积分估算已变化，请检查后重新提交', 409);
    const balance = await this.call('/account/balance'); if (Number(balance.balance) < config.estimatedCredits) throw error('积分不足');
    const image = config.mode === 'image' ? this.images.get(config.imageID) : null;
    if (config.mode === 'image' && (!image || image.expires < Date.now())) throw error('请重新选择并上传参考图');
    if (image) config.payload.input = image.token;
    let views;
    if (config.mode === 'multiview') {
      if (!Array.isArray(config.imageIDs) || config.imageIDs.length !== 4 || !config.imageIDs[0] || config.imageIDs.filter(Boolean).length < 2) throw error('四视图至少需要两张图片，必须包含前视图');
      views = config.imageIDs.map(id => id ? this.images.get(id) : null);
      if (config.imageIDs.some((id,i) => id && (!views[i] || views[i].expires < Date.now()))) throw error('视图已过期，请重新上传');
      if (new Set(views.filter(Boolean).map(v => v.sha)).size !== views.filter(Boolean).length) throw error('请上传不同角度的视图，不要重复使用同一张图片');
      config.payload.inputs = views.map((v,i) => v ? { [['front','left','back','right'][i]]:v.token } : null).filter(Boolean);
    }
    const concurrent = this.list().find(job => job.provider === TRIPO_PROVIDER && job.requestID === input.requestID); if (concurrent) return concurrent;
    const job = this.put({ id: randomUUID(), provider:TRIPO_PROVIDER, account: this.session.user?.name, requestID: input.requestID, name: config.name, category: config.category, prompt: config.prompt, mode: config.mode, model: input.model, estimatedCredits: config.estimatedCredits, notes:input.notes||'',sourceBreakdown:input.sourceBreakdown?{projectId:String(input.sourceBreakdown.projectId||'').slice(0,80),partId:String(input.sourceBreakdown.partId||'').slice(0,80),projectName:String(input.sourceBreakdown.projectName||'').slice(0,120),partName:String(input.sourceBreakdown.partName||'').slice(0,120)}:undefined, settings: { quad:Boolean(input.quad),faceLimit: input.faceLimit, textureQuality: input.textureQuality, geometryQuality: input.geometryQuality }, ...(image ? { referenceSHA256: image.sha } : {}), ...(views ? { referenceViews: views.map((v,i) => v ? {view:['front','left','back','right'][i],sha256:v.sha} : null) } : {}), status: 'submitting', progress: 0, createdAt: now() });
    try {
      const {type,...payload}=config.payload;
      const remote = await this.call('/generation/'+{text:'text-to-model',image:'image-to-model',multiview:'multiview-to-model'}[config.mode], { method: 'POST', body: payload, timeout: 60000 });
      if (!uuid(remote.task_id)) throw error('任务编号未返回，请核对网页任务记录', 502);
      job.remoteID = remote.task_id; job.status = 'queued'; this.put(job); this.resume(); return job;
    } catch (e) { job.status = e.status >= 500 ? 'unconfirmed' : 'failed'; job.error = e.message; this.put(job); return job; }
  }
  resume() {
    if (this.stopped || !this.session?.token || this.session.authExpired) return;
    // New submissions share the existing polling loop; never query every active
    // task again immediately for each model in a batch.
    if (this.timer) return;
    this.timer = setInterval(() => this.poll().catch(() => {}), 8000); this.timer.unref();
    this.poll().catch(() => {});
  }
  async poll() {
    if (this.polling || this.stopped || !this.session?.token || this.session.authExpired) return; this.polling = true;
    try { for (const job of this.list()) if (job.provider===TRIPO_PROVIDER && job.remoteID && !job.assetID && !terminal.has(job.status) && job.status !== 'download_error') await this.refreshJob(job.id).catch(() => {}); } finally { this.polling = false; }
  }
  async refreshJob(id) {
    const job = this.job(id); if(job.provider!==TRIPO_PROVIDER)throw error('这是旧站历史任务，不能在国际官方 API 中继续请求；已入库素材可正常使用',409);if(job.account!==this.session?.user?.name)throw error('任务属于另一个 API Key',403); if (!job.remoteID || job.assetID || this.inflight.has(id)) return job;
    this.inflight.add(id);
    try {
      const remote = await this.call('/tasks/' + job.remoteID);
      job.progress = Number(remote.progress || 0); job.status = remote.status || job.status; job.nativeFormat = job.settings?.quad ? 'fbx' : remote.native_format || 'glb';job.modelURL=remote.output?.model_url;job.creditsConsumed=remote.credits_consumed;delete job.error;
      if (job.status === 'success') { job.status = 'downloading'; this.put(job); return await this.download(job); }
      if (terminal.has(job.status)) job.error = job.status === 'failed' ? '生成失败，请查看 Tripo 工作台的任务详情；没有自动重新扣费生成。' : '任务已结束：' + job.status;
      return this.put(job);
    } catch (e) { job.error = e.message; return this.put(job); } finally { this.inflight.delete(id); }
  }
  async guardURL(value) {
    if (this.downloadGuard) return this.downloadGuard(value);
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443') throw error('模型下载地址无效', 502);
    const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some(x => privateAddress(x.address))) throw error('模型下载地址不是公共服务器', 502);
    return url;
  }
  async bytes(url) {
    for (let redirects = 0; redirects < 5; redirects++) {
      const safeURL = await this.guardURL(url);
      const response = await this.fetcher(safeURL, { redirect: 'manual', signal: AbortSignal.timeout(120000) });
      if (response.status >= 300 && response.status < 400) { url = new URL(response.headers.get('location'), safeURL).href; continue; }
      if (!response.ok) throw error('模型下载暂时失败，请刷新此任务重试下载', 502);
      if (Number(response.headers.get('content-length') || 0) > 64*1048576) throw error('模型超过 64 MB 入库上限，请在网页导出优化版本');
      const chunks = []; let size = 0;
      for await (const chunk of response.body) { size += chunk.length; if (size > 64*1048576) { await response.body.cancel?.().catch(() => {}); throw error('模型超过 64 MB 入库上限，请在网页导出优化版本'); } chunks.push(chunk); }
      return Buffer.concat(chunks);
    }
    throw error('模型下载跳转过多', 502);
  }
  async download(job) {
    try {
      const format = job.nativeFormat;
      if (!['glb','fbx'].includes(format)) throw error('尚未确认免费原生格式，请在网页核对；没有自动调用收费转换');
      const dir = path.join(this.store.dir,'tripo-originals'); fs.mkdirSync(dir,{recursive:true});
      const original = path.join(dir,job.id+'.'+format);
      let source;
      if (job.originalSHA256 && fs.existsSync(original)) {
        source = fs.readFileSync(original);
        if (createHash('sha256').update(source).digest('hex') !== job.originalSHA256) throw error('已下载原件哈希不匹配');
      } else {
        const remote=await this.call('/tasks/'+job.remoteID);
        const url=remote.output?.model_url;
        if (!url) throw error('Tripo 未返回模型下载链接',502);
        source=await this.bytes(url);
        fs.writeFileSync(original+'.tmp',source);fs.renameSync(original+'.tmp',original);
        job.originalSHA256=createHash('sha256').update(source).digest('hex');job.originalContainer=source.subarray(0,4).toString('hex')==='504b0304'?'zip':format;job.originalURL='/api/tripo/jobs/'+job.id+'/original';job.downloadCredits=0;this.put(job);
      }
      const bytes = await this.converter(source,format);
      const result = this.store.import(bytes, { name: job.name, category: job.category, source: 'Tripo 国际官方 API · '+TRIPO_API_BASE+' · task '+job.remoteID });
      job.assetID = result.asset.id; job.sha = result.asset.sha; job.triangles = result.asset.triangles; job.status = 'success'; job.progress = 100; job.completedAt = now(); delete job.error;
    } catch (e) { job.status = 'download_error'; job.error = e.message; }
    return this.put(job);
  }
  async remoteTasks() {
    const usage=await this.call('/account/usage');
    const ids=[...new Set([...(Array.isArray(usage)?usage:[]).map(t=>t.task_id),...this.list().filter(j=>!j.legacy).map(j=>j.remoteID)].filter(uuid))].slice(0,100);
    if(!ids.length)return [];
    const result=await this.call('/tasks/list',{method:'POST',body:{task_ids:ids}});
    return Object.values(result.tasks||{}).filter(t=>['text_to_model','image_to_model','multiview_to_model'].includes(t.type)).map(t=>({remoteID:t.task_id,status:t.status,progress:Number(t.progress||0),name:'Tripo API 模型',createdAt:t.created_at,model:t.model}));
  }
  async recover(input) {
    if(!uuid(input.remoteID))throw error('任务编号无效');
    const previous=this.list().find(job=>!job.legacy&&job.remoteID===input.remoteID);if(previous)return this.refreshJob(previous.id);
    const known=await this.call('/tasks/'+input.remoteID);
    if(!['text_to_model','image_to_model','multiview_to_model'].includes(known.type))throw error('该任务不是模型生成任务');
    // A recovered task has no local quad settings. Infer only from an explicit URL/format.
    const modelURL=known.output?.model_url;
    const nativeFormat=known.native_format||(/\.fbx(?:[?#]|$)/i.test(modelURL||'')?'fbx':'glb');
    const job=this.put({id:randomUUID(),provider:TRIPO_PROVIDER,account:this.session.user.name,name:String(input.name||'找回的 Tripo API 模型').slice(0,120),category:categories.has(input.category)?input.category:'其他',remoteID:input.remoteID,mode:{text_to_model:'text',image_to_model:'image',multiview_to_model:'multiview'}[known.type],model:known.model,status:known.status,progress:known.progress,nativeFormat,settings:{quad:nativeFormat==='fbx'},createdAt:known.created_at||now(),recovered:true});
    return this.refreshJob(job.id);
  }
  stop() { this.stopped = true; clearInterval(this.timer); }
}
