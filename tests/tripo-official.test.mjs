import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {TripoService,TRIPO_API_BASE,TRIPO_PROVIDER,OFFICIAL_CATALOG,validateGeneration} from '../tripo.mjs';
import {TripoBatch} from '../tripo-batch.mjs';

const key='tsk_test_official_api_key_123456';
const ok=data=>Response.json({code:0,data});
const config=(mode='text')=>({name:'石柱',prompt:'A stone pillar',category:'石作',mode,model:'v3.1-20260211',faceLimit:10000,quad:false,geometryQuality:'standard',textureQuality:'standard'});
function fixture(t,{saved=null,fetcher,converter}={}){
  const db=new DatabaseSync(':memory:'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'orbigen-tripo-test-'));
  let persisted=saved;
  const sessionStore={helper:'test',async load(){return persisted;},async save(v){persisted=structuredClone(v);},async clear(){persisted=null;}};
  const calls=[];
  const service=new TripoService({db,dir,import(bytes,meta){assert.ok(bytes.length);return {asset:{id:'imported-asset',sha:'test-sha',triangles:12},meta};}},
    {sessionStore,converter:converter|| (async b=>b),downloadGuard:async u=>new URL(u),fetcher:async(url,options)=>{calls.push({url:String(url),options});if(fetcher)return fetcher(String(url),options);return ok({balance:1000,frozen:0});}});
  service.resume=()=>{};
  t.after(()=>{service.stop();db.close();fs.rmSync(dir,{recursive:true,force:true});});
  return {service,db,calls,persisted:()=>persisted,dir};
}

test('旧站保存的 token、cookie、密码不会用于国际 API',async t=>{
  const f=fixture(t,{saved:{token:'old-token',cookie:'old-cookie',credentials:{username:'old-user',password:'old-password'}}});
  await f.service.ready;assert.equal((await f.service.account()).connected,false);assert.equal(f.calls.length,0);
  await assert.rejects(f.service.call('/account/balance'),{status:401});assert.equal(f.calls.length,0);
});
test('API Key 连接只请求官方余额，不发送 cookie 或网页密码，也不返回密钥',async t=>{
  const f=fixture(t);const account=await f.service.login(key,{remember:true});
  assert.equal(account.connected,true);assert.equal(account.origin,TRIPO_API_BASE);assert.equal(account.user.balance,1000);
  assert.equal(f.calls[0].url,TRIPO_API_BASE+'/account/balance');assert.equal(f.calls[0].options.headers.Authorization,'Bearer '+key);
  assert.equal(f.calls[0].options.headers.Cookie,undefined);assert.equal(f.calls[0].options.body,undefined);
  assert.equal(JSON.stringify(account).includes(key),false);assert.equal(f.persisted().provider,TRIPO_PROVIDER);
});
test('未勾选保存时移除之前保存的 Key；断开也移除密钥',async t=>{
  const f=fixture(t);await f.service.login(key,{remember:true});assert.ok(f.persisted());
  await f.service.login(key,{remember:false});assert.equal(f.persisted(),null);
  await f.service.disconnect();assert.equal(f.service.session,null);assert.equal(f.persisted(),null);
});
test('无效 Key 不覆盖先前连接且不会重试登录或泄漏响应内密钥',async t=>{
  let fail=false;const f=fixture(t,{fetcher:()=>fail?Response.json({message:key},{status:401}):ok({balance:1000})});
  await f.service.login(key,{remember:true});const previous=f.service.session,saved=f.persisted();fail=true;
  await assert.rejects(f.service.login('tsk_another_test_key_123456'),e=>e.status===401&&!e.message.includes(key));
  assert.equal(f.service.session,previous);assert.deepEqual(f.persisted(),saved);assert.equal(f.calls.length,2);
});
test('官方提示词长度与 H3.1 定价估算',()=>{
  const detailed={...config(),textureQuality:'detailed',geometryQuality:'detailed',quad:true};
  assert.equal(validateGeneration(config(),OFFICIAL_CATALOG).estimatedCredits,20);
  assert.equal(validateGeneration(detailed,OFFICIAL_CATALOG).estimatedCredits,55);
  assert.throws(()=>validateGeneration({...config(),prompt:'x'.repeat(1025)},OFFICIAL_CATALOG));
});
for(const mode of ['text','image','multiview'])test(mode+'：官方 v3 路由、上传 token 与请求格式',async t=>{
  let uploaded=0,submitted;
  const f=fixture(t,{fetcher:(url,options)=>{
    assert.ok(url.startsWith(TRIPO_API_BASE));
    if(url.endsWith('/account/balance'))return ok({balance:1000});
    if(url.endsWith('/files')){assert.ok(options.body instanceof FormData);assert.equal(options.headers['Content-Type'],undefined);return ok({file_token:'file_test_'+(++uploaded)});}
    assert.equal(url,TRIPO_API_BASE+'/generation/'+{text:'text-to-model',image:'image-to-model',multiview:'multiview-to-model'}[mode]);
    submitted=JSON.parse(options.body);return ok({task_id:'task_official_'+mode});
  }});
  await f.service.login(key);const input=config(mode);
  if(mode!=='text'){
    const first=await f.service.upload(Buffer.from('89504e470d0a1a0a01','hex'),'image/png','front.png');
    if(mode==='image')input.imageID=first.imageID;
    else{const second=await f.service.upload(Buffer.from('89504e470d0a1a0a02','hex'),'image/png','back.png');input.imageIDs=[first.imageID,null,second.imageID,null];}
  }
  const quote=await f.service.quote(input);const job=await f.service.generate({...input,requestID:'request_'+mode,acceptedCredits:quote.estimatedCredits});
  assert.equal(job.provider,TRIPO_PROVIDER);assert.equal(job.status,'queued');assert.equal(submitted.type,undefined);assert.equal(submitted.model,'v3.1-20260211');
  if(mode==='text')assert.equal(submitted.prompt,input.prompt);
  if(mode==='image')assert.equal(submitted.input,'file_test_1');
  if(mode==='multiview')assert.deepEqual(submitted.inputs,[{front:'file_test_1'},{back:'file_test_2'}]);
  assert.equal(submitted.file,undefined);assert.equal(submitted.files,undefined);
});
test('提交超时不会自动重新扣费，重复请求返回原本的待核对记录',async t=>{
  let posts=0;const f=fixture(t,{fetcher:url=>{if(url.includes('/generation/')){posts++;throw Error('timeout');}return ok({balance:1000});}});
  await f.service.login(key);const input={...config(),requestID:'uncertain-request',acceptedCredits:20};
  const job=await f.service.generate(input);assert.equal(job.status,'unconfirmed');
  assert.equal((await f.service.generate(input)).id,job.id);assert.equal(posts,1);
});
test('并行重复提交只创建一个官方生成任务',async t=>{
  let posts=0;const f=fixture(t,{fetcher:async url=>{await new Promise(r=>setTimeout(r,5));if(url.includes('/generation/')){posts++;return ok({task_id:'task_unique_123'});}return ok({balance:1000});}});
  await f.service.login(key);const input={...config(),requestID:'parallel-request',acceptedCredits:20};
  const jobs=await Promise.all([f.service.generate(input),f.service.generate(input)]);assert.equal(jobs[0].id,jobs[1].id);assert.equal(posts,1);
});
test('旧站任务不能查询或重提；旧批量队列不会自动运行',async t=>{
  const f=fixture(t);await f.service.login(key);f.calls.length=0;
  f.service.put({id:'old-job',remoteID:'old-task',status:'running',account:'old-account'});
  assert.equal(f.service.list()[0].legacy,true);await f.service.poll();await assert.rejects(f.service.refreshJob('old-job'),{status:409});
  const batch=new TripoBatch(f.service,{auto:false});t.after(()=>batch.stop());batch.put({id:'old-batch',status:'running',items:[{status:'pending'}]});
  assert.deepEqual(batch.list(),[]);await batch.tick();assert.equal(f.calls.length,0);
});
for(const quad of [false,true])test((quad?'FBX':'GLB')+'：成功任务从 output.model_url 下载原件并入库，不向下载站发送 API Key',async t=>{
  let importedFormat;
  const f=fixture(t,{converter:async(b,format)=>{importedFormat=format;return b;},fetcher:(url,options)=>{
    if(url.endsWith('/account/balance'))return ok({balance:1000});
    if(url.startsWith(TRIPO_API_BASE+'/tasks/'))return ok({task_id:'task_result_123',status:'success',progress:100,credits_consumed:25,output:{model_url:'https://cdn.example.test/model.'+(quad?'fbx':'glb')}});
    assert.equal(options.headers?.Authorization,undefined);return new Response(Buffer.from('model-bytes'));
  }});
  await f.service.login(key);f.service.put({id:'new-job',provider:TRIPO_PROVIDER,account:f.service.session.user.name,remoteID:'task_result_123',settings:{quad},name:'模型',category:'石作',status:'running'});
  const result=await f.service.refreshJob('new-job');assert.equal(result.status,'success');assert.equal(result.assetID,'imported-asset');assert.equal(importedFormat,quad?'fbx':'glb');assert.equal(result.creditsConsumed,25);
  assert.ok(f.calls.every(x=>!x.url.includes('/download?')));
});
test('同一官方站不同 Key 的任务和队列隔离',async t=>{
  const f=fixture(t);await f.service.login(key);const first=f.service.session.user.name;
  f.service.put({id:'first-job',provider:TRIPO_PROVIDER,account:first,remoteID:'task_first_123',status:'running'});
  await f.service.login('tsk_second_test_api_key_123456');assert.notEqual(f.service.session.user.name,first);assert.equal(f.service.list().length,0);
  await assert.rejects(f.service.refreshJob('first-job'),{status:403});
});
test('按官方任务 ID 找回并使用 task type，不依赖旧站历史接口',async t=>{
  const f=fixture(t,{fetcher:url=>url.endsWith('/account/balance')?ok({balance:1000}):ok({task_id:'task_recover_123',type:'image_to_model',status:'running',progress:25})});
  await f.service.login(key);const job=await f.service.recover({remoteID:'task_recover_123',name:'找回模型'});assert.equal(job.provider,TRIPO_PROVIDER);assert.equal(job.mode,'image');assert.equal(job.progress,25);
});
