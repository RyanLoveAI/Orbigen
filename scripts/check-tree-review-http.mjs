import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import * as T from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {buildTree} from '../public/modules/tree/generator.js';
import {treeRecipe} from '../public/modules/tree/schema.js';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),diag=fs.mkdtempSync(path.join(os.tmpdir(),'orbigen-tree-http-'));
const data=fs.mkdtempSync(path.join(diag,'http-data-'));const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const log=fs.openSync(path.join(data,'server.log'),'a'),child=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,env:{...process.env,ASSET_WORKBENCH_DATA:data,ASSET_WORKBENCH_PORT:String(port),ORBIGEN_DESKTOP_TOKEN:'',ORBIGEN_INSTANCE_ID:'tree-review-isolated-test'},detached:process.argv.includes('--keep'),windowsHide:true,stdio:['ignore',log,log]});fs.closeSync(log);const base='http://127.0.0.1:'+port;
async function req(url,method='GET',body,extra={}){const r=await fetch(base+url,{method,headers:body&&!Buffer.isBuffer(body)?{'Content-Type':'application/json',...extra}:extra,body:body?Buffer.isBuffer(body)?body:JSON.stringify(body):undefined});const d=await r.json();return {status:r.status,data:d};}
const ok=async(...args)=>{const r=await req(...args);assert.equal(r.status,200,JSON.stringify(r));return r.data;};
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(r=>{this.result=r;this.onloadend?.({target:this});});}readAsDataURL(blob){blob.arrayBuffer().then(r=>{this.result='data:'+blob.type+';base64,'+Buffer.from(r).toString('base64');this.onloadend?.({target:this});});}};
try{
 for(let i=0;i<80;i++){try{await ok('/api/health');break;}catch{if(i===79)throw Error('test server did not start');await new Promise(r=>setTimeout(r,100));}}
 let p=await ok('/api/modules/tree/projects','POST',{name:'隔离接口测试树 非写实素材验收'});const recipe=treeRecipe();recipe.height=3;recipe.rootCount=0;recipe.tiers=recipe.tiers.slice(0,1);recipe.branch.arms=1;recipe.branch.fans=1;recipe.branch.shoots=1;recipe.density=.2;
 p=await ok('/api/modules/tree/projects/'+p.id,'PUT',{...p,recipe,baseRevision:p.revision});let w=await ok('/api/tree/projects/'+p.id+'/workflow');
 const guard=()=>({'X-Tree-Revision':String(p.revision),'X-Tree-Signature':w.stages.at(-1).signature});
 assert.equal((await req('/api/tree/projects/'+p.id+'/outputs?target=download','POST',Buffer.from('not-a-glb'),guard())).status,409);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4YQAAAAASUVORK5CYII=','base64'),v=await ok('/api/previews?name=stage','POST',png);let model;
 for(const stage of w.stages){const s=w.stages.find(s=>s.id===stage.id),pack=buildTree(recipe,'PREVIEW',null,s.mode);model=pack;
  const checks=Object.fromEntries(s.checks.map(([k])=>[k,true])),views=['front','side',...(['branch','assembly','quality'].includes(s.id)?['structure-front','structure-side']:[])];
  w=await ok('/api/tree/projects/'+p.id+'/reviews','POST',{baseRevision:p.revision,stage:s.id,signature:s.signature,quality:'PREVIEW',verdict:'passed',notes:'此记录只验证接口契约，图片为测试夹具，不是实际素材验收',checks,report:pack.report,evidence:views.map(view=>({view,url:v.url,mode:s.mode,signature:s.signature,camera:{position:[1,2,3],target:[0,0,0]}}))});
 }
 assert.equal(w.completed,6);const group=new T.Group();group.name='隔离测试';group.userData.treeReview={projectId:p.id,revision:p.revision,quality:'PREVIEW',reviewIds:w.stages.map(s=>s.record.id),target:'prefab'};
 for(const item of model.meshes){const g=new T.BufferGeometry();for(const [key,a]of Object.entries(item.attributes))g.setAttribute(key,new T.BufferAttribute(a.array,a.itemSize));g.setIndex(new T.BufferAttribute(item.index,1));const m=new T.MeshStandardMaterial({color:item.material.color});m.name=item.material.name;group.add(new T.Mesh(g,m));}
 const bytes=Buffer.from(await new GLTFExporter().parseAsync(group,{binary:true}));const receipt=await ok('/api/tree/projects/'+p.id+'/outputs?target=prefab','POST',bytes,guard());assert.equal(receipt.verified,true);assert(receipt.prefab.asset.dimensions.every(v=>v>0));const repeated=await ok('/api/tree/projects/'+p.id+'/outputs?target=prefab','POST',bytes,guard());assert.equal(repeated.duplicate,true);assert.equal(repeated.prefab.id,receipt.prefab.id);
 assert.equal((await req('/api/tree/projects/'+p.id+'/outputs?target=library','POST',bytes,guard())).status,400);
 p=await ok('/api/modules/tree/projects/'+p.id,'PUT',{...p,recipe:{...recipe,height:4},baseRevision:p.revision});assert.equal((await req('/api/tree/projects/'+p.id+'/outputs?target=prefab','POST',bytes,guard())).status,409);
 p=await ok('/api/modules/tree/projects/'+p.id,'PUT',{...p,recipe,baseRevision:p.revision});assert.equal((await ok('/api/tree/projects/'+p.id+'/workflow')).completed,6);
 const ui=await ok('/api/modules/tree/projects','POST',{name:'开发验证 · 逐步复核演示（非入库素材）'});await ok('/api/modules/tree/projects/'+ui.id,'PUT',{...ui,recipe,baseRevision:0});
 const draft=await ok('/api/tree/projects/'+ui.id+'/draft?quality=PREVIEW');group.userData={treeDraft:{...draft,report:model.report}};
 const draftBytes=Buffer.from(await new GLTFExporter().parseAsync(group,{binary:true})),draftGuard={'X-Tree-Revision':String(draft.revision),'X-Tree-Signature':draft.signature};
 const pending=await ok('/api/tree/projects/'+ui.id+'/draft?quality=PREVIEW','POST',draftBytes,draftGuard);assert.equal(pending.qualified,false);assert.equal(pending.asset.state,'待验收');assert.equal(pending.asset.treeDraft.projectId,ui.id);assert.equal(pending.asset.treeDraft.qualified,false);
 const again=await ok('/api/tree/projects/'+ui.id+'/draft?quality=PREVIEW','POST',draftBytes,draftGuard);assert.equal(again.duplicate,true);assert.equal(again.asset.id,pending.asset.id);
 assert.equal((await req('/api/tree/projects/'+ui.id+'/draft?quality=PREVIEW','POST',draftBytes,{...draftGuard,'X-Tree-Revision':'0'})).status,409);
 assert.equal((await req('/api/tree/projects/'+ui.id+'/draft?quality=PREVIEW','POST',bytes,draftGuard)).status,400);
 assert.equal((await req('/api/tree/projects/'+ui.id+'/outputs?target=library','POST',draftBytes,draftGuard)).status,409);
 fs.writeFileSync(path.join(data,'runtime.json'),JSON.stringify({port,pid:child.pid,data},null,2));fs.writeFileSync(path.join(diag,'http_validation.json'),JSON.stringify({passed:true,checks:['incomplete output blocked','six receipts accepted with actual generated meshes','GLB receipt verified','prefab dimensions measured','repeated prefab output reuses stored record','wrong output target blocked','changed source output blocked','exact input rollback restores matching receipts',"unreviewed draft saved with pending state","duplicate draft reuses stored asset","stale draft revision blocked","draft cannot contain qualified receipt","draft does not unlock qualified output"],isolatedData:data,port,pid:child.pid,uiProjectId:ui.id,validatedProjectId:p.id,productionAssetsChanged:false},null,2));console.log('HTTP CHECKS PASSED; isolated UI server:',base,'UI project:',ui.id);
 if(process.argv.includes('--keep')){child.unref();}else child.kill();
}catch(e){child.kill();throw e;}
