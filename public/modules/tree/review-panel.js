import {TREE_STAGES,numericReview,reviewSummary,TREE_REVIEW_LIMITS} from './workflow.js';
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const send=v=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(v)});
const labels={passed:'已复核',pending:'待复核',stale:'需要重检','needs-work':'待修整',locked:'前步未完成'};
export function installTreeReviews(Workspace){
 const proto=Workspace.prototype,old={};for(const name of ['render','controls','outputs','generate','mark','save','open','create','importKit','useComponent','exportModel','saveComponent','capture','suspend','show'])old[name]=proto[name];
 proto.reviewCurrent=function(){return this.workflow?.projectId===this.project?.id&&this.workflow?.quality===this.quality&&!this.workflowStale?this.workflow.stages[this.step]:null;};
 proto.reviewReady=function(){const s=this.reviewCurrent();return !!s&&s.status!=='locked'&&!this.busy&&!this.reviewBusy&&!this.reviewMoving&&this.resultKey===this.key()&&this.previewMode===s.mode&&numericReview(this.result?.report,s.id).ok;};
 proto.refreshReviews=async function(){
  if(!this.project||this.changed())return;const project=this.project.id;
  if(this.reviewResumeProject!==project){this.reviewResumeProject=project;this.resumeReview=true;const quality=localStorage.getItem('orbigen-tree-review-quality-'+project);if(['PREVIEW','STANDARD','FINE'].includes(quality)){this.quality=quality;if($('#tree-quality'))$('#tree-quality').value=quality;}}
  const quality=this.quality,revision=this.project.revision;const w=await this.api('/api/tree/projects/'+project+'/workflow?quality='+quality);
  if(this.project.id!==project||this.quality!==quality||this.changed()||this.project.revision!==revision)return;this.workflow=w;this.workflowStale=false;
  if(this.active()){
   if(this.resumeReview&&!this.reviewMoving){this.resumeReview=false;const raw=localStorage.getItem('orbigen-tree-review-step-'+project),cached=raw===null?Math.min(w.completed,5):Number(raw),target=Number.isInteger(cached)&&cached>=0&&cached<6&&w.stages[cached].status!=='locked'?cached:Math.min(w.completed,5),tab=localStorage.getItem('orbigen-tree-review-tab-'+project)||'edit';if(target!==this.step||this.previewMode!==w.stages[target].mode||this.resultKey!==this.key())await this.moveReviewStep(target);this.reviewTab=localStorage.getItem('orbigen-tree-review-tab-'+project)||tab;}
   else if(!this.reviewMoving&&w.stages[this.step]?.status==='locked')await this.moveReviewStep(Math.min(w.completed,5));
   this.reviewPanel();
  }
 };
 proto.reviewPanel=function(){
  if(!this.active())return;
  let panel=$('#tree-review-panel');if(!panel){panel=document.createElement('section');panel.id='tree-review-panel';panel.className='tree-review-panel';$('#tree-step-controls').after(panel);}
  const s=this.reviewCurrent(),def=TREE_STAGES[this.step],record=s?.record,passed=s?.status==='passed';
  if(!$('#tree-control-tabs'))$('#tree-step-controls').insertAdjacentHTML('beforebegin','<div id="tree-control-tabs" class="tree-control-tabs"><button id="tree-edit-tab">制作参数</button><button id="tree-review-tab">本步复核</button></div>');
  this.bind('tree-edit-tab',()=>{this.reviewTab='edit';localStorage.setItem('orbigen-tree-review-tab-'+this.project.id,'edit');this.reviewPanel();});this.bind('tree-review-tab',()=>{this.reviewTab='review';localStorage.setItem('orbigen-tree-review-tab-'+this.project.id,'review');this.reviewPanel();});
  const draft=this.reviewDraft?.signature===s?.signature?this.reviewDraft:null;
  panel.innerHTML=`<h3>本步制作复核</h3><p class="tree-review-status">${this.workflowStale?'参数已改变，保存后更新复核状态':labels[s?.status]||'正在读取复核记录'}${record?' · '+new Date(record.reviewedAt).toLocaleString():''}</p>
   <p>先查看当前${def.mode==='LEAF'?'叶片':def.mode==='TRUNK'?'树干':def.mode==='BRANCH'?'带叶枝条':'整树'}的正面、背面和侧面，再逐项确认。</p><p class="tree-auto-review">${this.resultKey===this.key()?numericReview(this.result?.report,def.id).ok?'模型数据检查通过：叶片与枝干网格、UV 和法线已核对；外观仍需下方逐项确认。':esc(numericReview(this.result?.report,def.id).issues.join('；')):'当前模型尚未生成完成。'}</p>
   <div class="tree-review-checks">${def.checks.map(([id,text])=>`<label><input type="checkbox" data-tree-check="${id}" ${(draft?.checks?.[id]??record?.checks?.[id])?'checked':''} ${passed?'disabled':''}><span>${text}</span></label>`).join('')}</div>
   ${!record&&s?.previous?.notes?`<details class="tree-review-history"><summary>上次复核记录 已过期</summary><p>${esc(s.previous.notes)}</p></details>`:''}<label class="field"><span>复核记录与需要修整的问题</span><textarea id="tree-review-notes" maxlength="2000" rows="3" ${passed?'readonly':''}>${esc(draft?.notes??record?.notes??'')}</textarea></label>
   <div class="tree-review-actions">${passed?'<button id="tree-review-again">重新复核本步</button>':'<button id="tree-review-pass" class="primary">保存本步复核</button><button id="tree-review-fail">记录待修问题</button>'}<button id="tree-review-next">${this.step<5?'复核后进入下一步':'复核通过，打开输出选项'}</button></div>
   <div class="tree-review-evidence">${(record?.evidence||[]).map(e=>{const label=({'front':'完整正面','side':'完整侧面','structure-front':'枝干正面','structure-side':'枝干侧面'})[e.view];return `<a href="${esc(e.url)}" target="_blank" rel="noopener"><img src="${esc(e.url)}" alt="${label}复核记录"><span>${label}</span></a>`;}).join('')}</div><p class="tree-hint">保存复核时自动记录当前参数、精度及正侧面预览；枝条和整树另保存隐藏叶片的接缝视图。${TREE_REVIEW_LIMITS}</p>`;
  this.bind('tree-review-pass',()=>this.saveReview('passed'));this.bind('tree-review-fail',()=>this.saveReview('needs-work'));this.bind('tree-review-again',()=>{this.reviewDraft={signature:s.signature,checks:{},notes:record?.notes||''};this.rechecking=s.signature;this.reviewPanel();});
  // A receipt stays immutable; starting another review creates a fresh receipt.
  if(this.rechecking===s?.signature&&passed){this.reviewDraft??={signature:s.signature,checks:{},notes:''};panel.querySelectorAll('[data-tree-check]').forEach(e=>{e.disabled=false;e.checked=!!this.reviewDraft.checks[e.dataset.treeCheck];});$('#tree-review-notes').readOnly=false;$('#tree-review-again').outerHTML='<button id="tree-review-pass" class="primary">保存本步复核</button><button id="tree-review-fail">记录待修问题</button>';this.bind('tree-review-pass',()=>this.saveReview('passed'));this.bind('tree-review-fail',()=>this.saveReview('needs-work'));}
  for(const e of panel.querySelectorAll('[data-tree-check]'))e.onchange=()=>{this.reviewDraft={signature:s?.signature,checks:Object.fromEntries([...panel.querySelectorAll('[data-tree-check]')].map(x=>[x.dataset.treeCheck,x.checked])),notes:$('#tree-review-notes').value};this.reviewButtons();};
  $('#tree-review-notes').oninput=()=>{this.reviewDraft={signature:s?.signature,checks:Object.fromEntries([...panel.querySelectorAll('[data-tree-check]')].map(x=>[x.dataset.treeCheck,x.checked])),notes:$('#tree-review-notes').value};};
  this.bind('tree-review-next',()=>{if(this.step===5){this.reviewTab='edit';this.reviewPanel();}else return this.moveReviewStep(this.step+1);});this.reviewButtons();$('#tree-edit-tab').textContent=this.step===5?'输出选项':'制作参数';
  $('#tree-step-controls').hidden=this.reviewTab==='review';panel.hidden=this.reviewTab!=='review';$('#tree-edit-tab').classList.toggle('active',this.reviewTab!=='review');$('#tree-review-tab').classList.toggle('active',this.reviewTab==='review');if(this.model&&this.resultKey===this.key())this.show(false);
  for(const b of document.querySelectorAll('[data-tree-step]')){const i=Number(b.dataset.treeStep),stage=this.workflow?.stages[i],status=this.workflowStale?'核对中':labels[stage?.status]||'待读取';b.innerHTML=`<span>${i+1}</span><div><b>${TREE_STAGES[i].title}</b><small>${status}</small></div>`;b.classList.toggle('reviewed',!this.workflowStale&&stage?.status==='passed');b.disabled=this.reviewBusy||this.reviewMoving||this.workflowStale||!stage||stage.status==='locked';b.title=status;b.onclick=()=>this.safe(()=>this.moveReviewStep(i));}
  let summary=$('#tree-flow-summary');if(!summary){summary=document.createElement('div');summary.id='tree-flow-summary';summary.className='tree-flow-summary';$('.tree-steps').after(summary);}summary.textContent=this.workflowStale?'参数已更新 · 正在核对受影响的复核记录':`制作流程 · 已复核 ${this.workflow?.completed||0} / 6 步 · ${this.quality==='PREVIEW'?'快速预览精度':this.quality==='FINE'?'精细模型精度':'标准模型精度'}。完成本步复核后再进入下一步；更换参数或精度会重新检查。`;
 };
 proto.reviewButtons=function(){
  if($('#tree-library-draft'))$('#tree-library-draft').disabled=this.busy||this.reviewBusy||this.draftBusy||this.reviewMoving||this.previewMode!=='TREE'||this.resultKey!==this.key()||!numericReview(this.result?.report,'assembly').ok;
  if($('#tree-leaves'))$('#tree-leaves').disabled=this.previewMode==='LEAF'||this.previewMode==='TRUNK';
  const ready=this.reviewReady();if($('#tree-review-pass'))$('#tree-review-pass').disabled=!ready||[...document.querySelectorAll('[data-tree-check]')].some(e=>!e.checked);
  if($('#tree-review-fail'))$('#tree-review-fail').disabled=!this.reviewCurrent()||this.reviewCurrent().status==='locked'||this.busy||this.reviewBusy;
  if($('#tree-review-next'))$('#tree-review-next').disabled=this.reviewCurrent()?.status!=='passed'||this.reviewBusy||this.reviewMoving;
  const reviewed=!this.workflowStale&&this.workflow?.completed===6;for(const id of ['tree-export-glb','tree-library','tree-prefab'])if($('#'+id))$('#'+id).disabled=!reviewed||this.busy||this.reviewBusy||this.resultKey!==this.key();
  for(const id of ['tree-component-save','tree-component-glb'])if($('#'+id))$('#'+id).disabled=this.reviewCurrent()?.status!=='passed'||this.busy||this.resultKey!==this.key();
  if($('#tree-component-export'))$('#tree-component-export').textContent='导出组件草稿配方';
  if($('#tree-report')&&this.result?.report.review){$('#tree-report .tree-review-limit')?.remove();const r=this.result.report.review;$('#tree-report').insertAdjacentHTML('beforeend',`<p class="tree-review-limit">叶片顶点 ${r.leafVertices.toLocaleString()} · 枝干顶点 ${r.barkVertices.toLocaleString()}。${r.junctions} 处枝段挂接关系；表面融合未执行，接缝需要隐藏叶片后人工复核。</p>`);}
 };
 proto.moveReviewStep=async function(i){
  if(this.reviewMoving)return;this.reviewMoving=true;
  try{await this.save();await this.refreshReviews();const s=this.workflow?.stages[i];if(!s||s.status==='locked')throw Error('请先完成前一步制作复核');this.step=i;localStorage.setItem('orbigen-tree-review-step-'+this.project.id,String(i));this.handle=-1;this.hideLeaves=false;this.reviewTab='edit';this.previewMode=s.mode;this.reviewDraft=null;this.rechecking=null;this.stage.transform.detach();$('#tree-preview-mode').value=s.mode;if(i<3){this.shelfKind=s.mode;this.componentShelf();}if($('#tree-leaves'))$('#tree-leaves').textContent='隐藏叶片查接缝';this.controls();this.cancel();await this.generate();}finally{this.reviewMoving=false;if(this.active())this.reviewPanel();}
 };
 proto.captureReviewViews=async function(s){
  const position=this.stage.camera.position.clone(),target=this.stage.orbit.target.clone(),hidden=this.hideLeaves,mode=this.stage.mode;const evidence=[];
  try{const views=['front','side',...(['branch','assembly','quality'].includes(s.id)?['structure-front','structure-side']:[])];for(const view of views){this.hideLeaves=view.startsWith('structure');this.stage.setMode(this.hideLeaves?'clay':'material');this.show(false);this.view(view.endsWith('side')?'side':'front');this.stage.transform.detach();this.handles.forEach(o=>o.visible=false);this.stage.box.visible=false;this.stage.dirty=true;await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);const blob=await(await fetch(this.stage.previewDataURL())).blob();const v=await this.api('/api/previews?name=stage',{method:'POST',body:blob});evidence.push({view,url:v.url,mode:s.mode,signature:s.signature,camera:{position:this.stage.camera.position.toArray(),target:this.stage.orbit.target.toArray()}});}return evidence;}
  finally{this.hideLeaves=hidden;this.show(false);this.stage.camera.position.copy(position);this.stage.orbit.target.copy(target);this.stage.orbit.update();this.stage.setMode(mode);this.stage.dirty=true;}
 };
 proto.saveReview=async function(verdict){
  if(this.reviewBusy)throw Error('正在保存复核，请稍候');await this.save();await this.refreshReviews();const s=this.reviewCurrent();if(!s||s.status==='locked'||verdict==='passed'&&this.resultKey!==this.key()||s.mode!==this.previewMode)throw Error('请生成当前步骤的模型后复核');
  const report=this.resultKey===this.key()?this.result.report:{ok:false,mode:s.mode,quality:this.quality,triangles:0,review:{leafVertices:0,barkVertices:0,issues:[this.reviewBuildError||'当前模型生成未完成'],junctions:0}};
  const input={baseRevision:this.project.revision,quality:this.quality,stage:s.id,signature:s.signature,verdict,checks:Object.fromEntries([...document.querySelectorAll('[data-tree-check]')].map(e=>[e.dataset.treeCheck,e.checked])),notes:$('#tree-review-notes').value,report};
  const key=this.key(),project=this.project.id;this.reviewBusy=true;this.reviewButtons();
  try{input.evidence=verdict==='passed'?await this.captureReviewViews(s):[];if(key!==this.key()||project!==this.project.id)throw Error('制作参数已变化，请重新复核');this.workflow=await this.api('/api/tree/projects/'+project+'/reviews',send(input));this.workflowStale=false;this.reviewDraft=null;this.rechecking=null;this.notify(verdict==='passed'?'本步复核已保存，可以进入下一步':'问题已记录，请修整后重新复核');}
  finally{this.reviewBusy=false;if(this.active())this.reviewPanel();}
 };
 proto.render=function(){old.render.call(this);$('#tree-capture').insertAdjacentHTML('afterend','<button id="tree-library-draft" title="保存当前整树用于验证，不表示验收通过">存为待验收样本</button>');this.bind('tree-library-draft',()=>this.saveLibraryDraft());$('#tree-front').insertAdjacentHTML('afterend','<button id="tree-back">背面</button>');$('#tree-wire').insertAdjacentHTML('afterend','<button id="tree-clay">灰模</button><button id="tree-leaves">隐藏叶片查接缝</button>');this.bind('tree-back',()=>this.view('back'));this.bind('tree-clay',()=>this.stage.setMode(this.stage.mode==='clay'?'material':'clay'));this.bind('tree-leaves',()=>{this.hideLeaves=!this.hideLeaves;$('#tree-leaves').textContent=this.hideLeaves?'恢复完整叶片':'隐藏叶片查接缝';this.show(false);});const change=$('#tree-preview-mode').onchange;$('#tree-preview-mode').onchange=e=>{this.hideLeaves=false;$('#tree-leaves').textContent='隐藏叶片查接缝';change(e);};const qualityChange=$('#tree-quality').onchange;$('#tree-quality').onchange=e=>{localStorage.setItem('orbigen-tree-review-quality-'+this.project.id,e.target.value);this.workflowStale=true;qualityChange(e);this.reviewPanel();};$('#tree-generate').insertAdjacentHTML('afterend','<button id="tree-open-review" class="full-width">完成制作，进入本步复核</button>');this.bind('tree-open-review',()=>{this.reviewTab='review';localStorage.setItem('orbigen-tree-review-tab-'+this.project.id,'review');this.reviewPanel();});this.reviewPanel();};
 proto.show=function(...args){old.show.apply(this,args);if(this.reviewTab==='review'&&this.step===1){this.stage.transform.detach();this.stage.selected=null;this.stage.box.visible=false;for(const handle of this.handles||[])handle.removeFromParent();this.stage.dirty=true;}};
 proto.controls=function(){old.controls.call(this);if(this.step===5){$('#tree-library').textContent='保存阶段复核模型到素材库';$('#tree-library').insertAdjacentHTML('afterend','<button id="tree-prefab" class="full-width">保存阶段复核模型到半成品库</button>');this.bind('tree-prefab',()=>this.exportWhole('prefab'));}this.reviewPanel();};
 proto.outputs=function(){old.outputs.call(this);this.reviewButtons();};
 proto.mark=function(){this.workflowStale=true;old.mark.call(this);if(this.active())this.reviewPanel();};
 proto.save=async function(){await old.save.call(this);await this.refreshReviews();};
 proto.generate=async function(...args){try{await old.generate.apply(this,args);if(this.step===5&&this.resultKey===this.key())await this.deliveryPreview();this.reviewBuildError=null;}catch(e){this.reviewBuildError=e.message;throw e;}finally{if(!this.changed())await this.refreshReviews();}};
 proto.deliveryPreview=async function(){
  if(this.deliveryModel===this.model&&this.deliveryKey===this.key())return;const key=this.key(),project=this.project.id;this.busy=true;this.outputs();$('#tree-generation-status').textContent='正在检查实际 GLB 交付模型与材质…';
  try{const {exportGLB}=await import('../../view.js'),{GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');const bytes=await exportGLB(this.model.clone(true)),loaded=await new GLTFLoader().parseAsync(bytes,'');
   if(key!==this.key()||project!==this.project.id||!this.active()){this.release(loaded.scene);throw Error('参数已变化，交付模型需要重新检查');}let triangles=0;loaded.scene.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});if(triangles!==this.result.report.triangles){this.release(loaded.scene);throw Error('交付模型的几何与制作模型不一致');}
   const previous=this.model;this.model=loaded.scene;this.model.name=this.project.name;this.deliveryModel=this.model;this.deliveryKey=key;this.show(true);this.release(previous);$('#tree-generation-status').textContent='实际交付模型已载入 · 请再次查看叶片、树皮和接缝';
  }catch(e){this.resultKey=null;throw e;}finally{this.busy=false;this.outputs();}
 };
 proto.useComponent=async function(...args){await old.useComponent.apply(this,args);await this.save();if(this.workflow?.stages[this.step]?.status==='locked'){const next=this.workflow.stages.findIndex(s=>s.status!=='passed');await this.moveReviewStep(next);this.notify('组件已应用，请从受影响的上游步骤开始复核');}};
 proto.saveComponent=async function(){await this.save();const s=this.reviewCurrent();if(s?.status!=='passed')throw Error('请先完成当前组件复核');const c=this.currentComponent();await this.api('/api/tree/projects/'+this.project.id+'/component',send({baseRevision:this.project.revision,stage:s.id,quality:this.quality,signature:s.signature,name:c.name}));this.components=await this.api('/api/tree/components');this.componentShelf();this.notify('已保存带复核记录的组件');};
 proto.saveLibraryDraft=async function(){
  if(this.draftBusy||this.previewMode!=='TREE'||this.resultKey!==this.key()||!numericReview(this.result?.report,'assembly').ok)throw Error('请先生成当前整树预览');
  this.draftBusy=true;this.reviewButtons();const geometries=[];
  try{await this.save();const project=this.project.id,key=this.key(),quality=this.quality,c=await this.api('/api/tree/projects/'+project+'/draft?quality='+quality);
   const {exportGLB}=await import('../../view.js'),out=this.model.clone(true);out.userData.treeDraft={...c,report:reviewSummary(this.result.report)};delete out.userData.treeReview;
   out.traverse(o=>{if(o.isMesh){o.geometry=o.geometry.clone();geometries.push(o.geometry);if(o.geometry.hasAttribute('_BRANCH_WIND')){o.geometry.setAttribute('BRANCH_WIND',o.geometry.getAttribute('_BRANCH_WIND'));o.geometry.deleteAttribute('_BRANCH_WIND');}}});
   const bytes=await exportGLB(out);if(this.project.id!==project||this.key()!==key||this.project.revision!==c.revision)throw Error('工程已改变，请重新生成样本');
   const result=await this.api('/api/tree/projects/'+project+'/draft?quality='+quality,{method:'POST',headers:{'X-Tree-Revision':String(c.revision),'X-Tree-Signature':c.signature},body:bytes});await this.onAsset?.();this.notify(result.duplicate?'这份待验收样本已在素材库':'已保存到素材库，标记为待验收样本');return result;
  }finally{geometries.forEach(g=>g.dispose());this.draftBusy=false;if(this.active())this.reviewButtons();}
 };
 proto.exportModel=async function(target=false){
  await this.requireModel();if(this.previewMode!=='TREE'){if(this.reviewCurrent()?.status!=='passed')throw Error('请复核当前组件后导出');return old.exportModel.call(this,false);}if(this.step!==5||this.deliveryModel!==this.model||this.deliveryKey!==this.key())throw Error('请在输出步骤复核实际交付模型后输出');
  await this.save();const w=this.workflow;if(this.workflowStale||w?.completed!==6)throw Error('请按制作流程完成六步复核后输出整树');
  const {exportGLB}=await import('../../view.js'),out=this.model.clone(true),geometries=[];const kind=target==='prefab'?'prefab':target?'library':'download';out.userData.treeReview={projectId:this.project.id,revision:this.project.revision,quality:this.quality,reviewIds:w.stages.map(s=>s.record.id),scope:TREE_REVIEW_LIMITS,target:kind};
  out.traverse(o=>{if(o.isMesh){o.geometry=o.geometry.clone();geometries.push(o.geometry);if(o.geometry.hasAttribute('_BRANCH_WIND')){o.geometry.setAttribute('BRANCH_WIND',o.geometry.getAttribute('_BRANCH_WIND'));o.geometry.deleteAttribute('_BRANCH_WIND');}}});let bytes;
  try{bytes=await exportGLB(out);}finally{geometries.forEach(g=>g.dispose());}
  const result=await this.api('/api/tree/projects/'+this.project.id+'/outputs?quality='+this.quality+'&target='+kind,{method:'POST',headers:{'X-Tree-Revision':String(this.project.revision),'X-Tree-Signature':w.stages.at(-1).signature},body:bytes});
  if(kind==='download'){this.download(bytes,this.project.name+' · 静态制作复核.glb');this.download(JSON.stringify(w,null,2),this.project.name+' · 逐步复核.json','application/json');this.notify('整树模型与逐步复核记录已导出');}else{await this.onAsset?.();this.notify(kind==='prefab'?result.duplicate?'这个复核版本已在半成品库':'已保存到半成品库，包含静态复核范围':'模型已加入素材库，包含逐步复核标记');}return result;
 };
}
