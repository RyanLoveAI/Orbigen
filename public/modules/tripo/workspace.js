import {helpTip,bindHelpTips} from '../help-tip.js';
import {ASSET_CATEGORIES} from '../asset-folder/classify.js';
import { TripoBatchPanel } from './batch.js';
import {DEFAULT_GENERATION_SETTINGS} from './defaults.js';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const send = value => ({ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value) });
export const REFERENCE_VIEWS = ['前视图（必填）','左视图','后视图','右视图'];
const labels={submitting:'提交中',unconfirmed:'提交待核对',queued:'排队中',pending:'排队中',running:'生成中',downloading:'下载入库中',download_error:'下载待重试',success:'已入库',failed:'生成失败',expired:'任务已过期',banned:'任务未通过',cancelled:'任务已取消'};
export class TripoWorkspace {
  constructor({api,safe,notify,active,onAsset}){Object.assign(this,{api,safe,notify,active,onAsset});this.requestID=crypto.randomUUID();this.viewFiles=[];this.viewRefs=[];try{this.draft=JSON.parse(sessionStorage.getItem('orbigen-tripo-draft')||'null');}catch{}}
  suspend(){this.captureDraft();this.batchPanel?.suspend();clearInterval(this.timer);clearTimeout(this.quoteTimer);if(this.imageURL)URL.revokeObjectURL(this.imageURL);for(const url of this.viewURLs||[])if(url)URL.revokeObjectURL(url);}
  async mount(){
    this.suspend();
    let account;try{account=await this.api('/api/tripo/account?autoReconnect=1');}catch(e){const state=await this.api('/api/tripo/connection').catch(()=>({}));account={...state,connected:false,error:e.message};}
    if(!this.active())return;this.account=account;
    this.catalog=account.connected?await this.api('/api/tripo/models'):null;
    if(!this.active())return;this.render();this.applyDefaults();this.restoreDraft();this.applyBreakdownHandoff();this.updateFaceLimits();if(account.connected)this.safe(()=>this.quote());this.batchPanel=new TripoBatchPanel({api:this.api,safe:this.safe,notify:this.notify,active:this.active,config:()=>this.config(),connected:()=>this.account.connected,onAsset:this.onAsset});await this.batchPanel.mount();await this.refresh();
    this.timer=setInterval(()=>this.safe(()=>this.refresh()),5000);
  }
  defaultModel(){const models=this.catalog?.h||[];return models.find(m=>m.value===DEFAULT_GENERATION_SETTINGS.model)?.value||models.find(m=>m.value===this.catalog?.default_h)?.value||models[0]?.value||DEFAULT_GENERATION_SETTINGS.model;}
  availableModels(){return this.catalog?.h?.length?this.catalog.h:[{value:DEFAULT_GENERATION_SETTINGS.model,label:'v3.1 – 最高质量'},...(this.draft?.config?.model&&this.draft.config.model!==DEFAULT_GENERATION_SETTINGS.model?[{value:this.draft.config.model,label:this.draft.config.model}]:[])];}
  applyDefaults(){
    $('#tripo-model').value=this.defaultModel();$('#tripo-geometry').value=DEFAULT_GENERATION_SETTINGS.geometryQuality;$('#tripo-texture').value=DEFAULT_GENERATION_SETTINGS.textureQuality;$('#tripo-grid-type').value='quad';$('#tripo-faces').value=DEFAULT_GENERATION_SETTINGS.faceLimit;this.updateFaceLimits();
  }
  captureDraft(){
    if(!$('#tripo-generate-form'))return;
    this.draft={config:this.config(),notes:$('#tripo-notes').value,source:this.source||null,viewRefs:this.viewRefs,imageRef:this.imageRef||null,requestID:this.requestID};
    sessionStorage.setItem('orbigen-tripo-draft',JSON.stringify(this.draft));
  }
  restoreDraft(){
    if(!this.draft)return;
    const c=this.draft.config;
    for(const [key,id] of Object.entries({name:'name',category:'category',prompt:'prompt',model:'model',geometryQuality:'geometry',textureQuality:'texture',faceLimit:'faces'})){
      const el=$('#tripo-'+id);if(c[key]!==undefined&&(el.tagName!=='SELECT'||[...el.options].some(o=>o.value===String(c[key]))))el.value=c[key];
    }
    $('#tripo-grid-type').value=c.quad?'quad':'triangle';$('#tripo-notes').value=this.draft.notes||'';
    this.imageRef=this.draft.imageRef||null;this.source=this.draft.source;this.viewRefs=this.draft.viewRefs||[];this.requestID=this.draft.requestID||this.requestID;
    const radio=$('[name="tripo-mode"][value="'+c.mode+'"]');if(radio)radio.checked=true;
    this.updateMode();this.renderSource();this.renderImage();REFERENCE_VIEWS.forEach((_,i)=>this.renderView(i));
  }
  applyBreakdownHandoff(){
    let handoff;try{handoff=JSON.parse(sessionStorage.getItem('orbigen-tripo-breakdown-handoff')||'null');}catch{return;}
    if(!handoff||handoff.root!==localStorage.getItem('orbigen-tripo-batch-root'))return;this.applyDefaults();
    const part=handoff.part;
    if(part){
      $('#tripo-name').value=part.name;$('#tripo-category').value=part.category;$('#tripo-prompt').value=part.prompt||'';$('#tripo-notes').value=part.notes||'';
      this.source={projectId:handoff.projectId,projectName:handoff.projectName,partId:part.id,partName:part.name};
      this.viewFiles=[];this.viewRefs=['front','left','back','right'].map(key=>part.views?.[key]||null);this.imageFile=null;this.imageRef=null;
    }else{
      if(ASSET_CATEGORIES.includes(handoff.category))$('#tripo-category').value=handoff.category;
      if(handoff.name)$('#tripo-name').value=handoff.name;if(handoff.prompt)$('#tripo-prompt').value=handoff.prompt;
    }
    $('[name="tripo-mode"][value="multiview"]').checked=true;this.requestID=crypto.randomUUID();
    this.updateMode();this.renderSource();REFERENCE_VIEWS.forEach((_,i)=>this.renderView(i));this.captureDraft();
    // Consume only after the form and references are saved; login remount restores this draft.
    sessionStorage.removeItem('orbigen-tripo-breakdown-handoff');
    this.notify(part?`已关联「${part.name}」的四视图和制作信息；批量目录共 ${handoff.count} 件`:`已带入 ${handoff.count} 件分拆组件的四视图目录`);
  }
  updateMode(){const mode=this.config().mode;$('#tripo-reference').hidden=mode!=='image';$('#tripo-multiview').hidden=mode!=='multiview';$('.tripo-reference-section').hidden=mode==='text';$('.tripo-form-grid').classList.toggle('with-reference',mode!=='text');}
  renderSource(){const el=$('#tripo-source');el.hidden=!this.source;el.innerHTML=this.source?`已关联：${esc(this.source.projectName)} / <b>${esc(this.source.partName)}</b> <a href="#breakdown/${esc(this.source.projectId)}">返回分拆记录</a>`:'';}
  renderImage(){if(this.imageURL)URL.revokeObjectURL(this.imageURL);this.imageURL=this.imageFile?URL.createObjectURL(this.imageFile):null;const el=$('#tripo-image-preview'),url=this.imageURL||this.imageRef?.url;el.hidden=!url;if(url)el.src=url;else el.removeAttribute('src');}
  renderView(i){
    this.viewURLs||=[];if(this.viewURLs[i])URL.revokeObjectURL(this.viewURLs[i]);
    const file=this.viewFiles[i],ref=this.viewRefs[i],url=file?URL.createObjectURL(file):ref?.url;
    this.viewURLs[i]=file?url:null;const preview=$('#tripo-view-preview-'+i);preview.hidden=!url;if(url)preview.src=url;else preview.removeAttribute('src');
    $('[data-tripo-clear-view="'+i+'"]').hidden=!url;$('#tripo-view-name-'+i).textContent=(ref?'已关联本地四视图：':'')+(file?.name||ref?.name||'');$('#tripo-view-name-'+i).title=$('#tripo-view-name-'+i).textContent;$('#tripo-view-'+i).hidden=Boolean(url);$('[data-tripo-replace-view="'+i+'"]').hidden=!url;
  }
  updateFaceLimits(){
    const model=this.catalog?.h?.find(m=>m.value===$('#tripo-model').value),quad=$('#tripo-grid-type').value==='quad';
    const max=quad?(model?.quad_max??150000):Math.min(300000,model?.face_max??300000),min=Math.max(500,model?.face_min??500),input=$('#tripo-faces');
    input.min=min;input.max=max;input.value=Math.min(max,Math.max(min,Number(input.value)||min));$('#tripo-faces-label').textContent=quad?'四边形面数上限':'三角面上限';
    $('#tripo-faces-range').min=min;$('#tripo-faces-range').max=max;$('#tripo-faces-range').value=input.value;$('#tripo-grid-hint').textContent=`${quad?'四边形':'三角面'}网格 · 可调范围 ${min.toLocaleString()}–${max.toLocaleString()} 面 · 积分以下方估算为准`;
  }
  async localReferenceFile(ref){
    if(!/^\/references\/[a-f0-9]{64}\.png$/.test(ref.url))throw Error('参考图引用无效，请重新选择');
    const response=await fetch(ref.url);if(!response.ok)throw Error('参考图文件缺失，请重新选择');
    return new File([await response.blob()],ref.name||'参考图.png',{type:'image/png'});
  }
  async referenceFile(i){return this.viewFiles[i]|| (this.viewRefs[i]?await this.localReferenceFile(this.viewRefs[i]):null);}
  render(){
    this.jobsJSON=null;
    const account=this.account;
    $('#main').innerHTML=`<div class="page-heading"><div><span class="eyebrow">TRIPO / 素材生成</span><h1>自定义素材生成</h1><p class="subtitle">连接 Tripo 国际官方 API，使用 API 积分生成素材；完成后自动下载，本地转换预览并入库。</p></div><div class="heading-actions"><button id="tripo-refresh">刷新任务</button><button id="tripo-open-site">打开 Tripo 国际官网</button></div></div>
    <section class="panel tripo-account">${account.connected&&!this.editAccount?`<div><b>Tripo 国际官方 API</b><span id="tripo-balance">${account.user.balance.toLocaleString()} API 积分</span><span>${account.persistent?'API Key 连接 · 与官网网页积分分开计费':'API Key 仅用于当前会话'}</span></div><button id="tripo-edit-account">更换 API Key</button><button id="tripo-disconnect">断开并移除密钥</button>`:`<form id="tripo-login-form"><label>官方 API Key<input id="tripo-api-key" type="password" autocomplete="off" spellcheck="false" aria-label="Tripo 国际官方 API Key" placeholder="tsk_…" required></label>${account.persistent?'<label class="tripo-remember-key"><input id="tripo-remember-key" type="checkbox" checked><span>加密保存在本机</span></label>':''}<button class="primary" id="tripo-login" type="submit">连接官方 API</button><span>${esc(account.error||'使用国际官方 API Key；网页账号密码不能用于 API。')} <a href="https://developers.tripo3d.ai/en/keys" target="_blank" rel="noopener noreferrer">获取 API Key</a> · API 与网页积分分开计费。</span></form>`}</section>
    <div class="tripo-layout"><section class="panel tripo-editor"><div class="tripo-jobs-heading"><h3>生成设置</h3></div><p id="tripo-source" hidden></p><form id="tripo-generate-form"><div class="tripo-form-grid"><div class="tripo-input-section"><div class="tripo-basic-fields"><label class="field"><span>组件名称</span><input id="tripo-name" maxlength="120" value="" placeholder="输入要制作的素材名称" required></label><label class="field"><span>分类</span><select id="tripo-category">${['石作',...ASSET_CATEGORIES.filter(c=>c!=='石作')].map(c=>`<option>${c}</option>`).join('')}</select></label></div><div class="tripo-modes"><label><input type="radio" name="tripo-mode" value="text" checked>文字生成</label><label><input type="radio" name="tripo-mode" value="image">参考图生成</label><label><input type="radio" name="tripo-mode" value="multiview">四视图生成</label></div><label class="field"><span>组件描述 / 制作备注</span><textarea id="tripo-prompt" rows="5" maxlength="4000" placeholder="描述形状、材质、尺寸和需要保留的细节…"></textarea></label><details><summary>制作备注</summary><textarea id="tripo-notes" aria-label="分拆制作备注" rows="3" maxlength="4000"></textarea></details><div class="tripo-output-section"><h4>网格与质量</h4><label class="field"><span>模型版本</span><select id="tripo-model">${this.availableModels().map(m=>`<option value="${esc(m.value)}" ${m.value===this.defaultModel()?'selected':''}>${esc(m.label||m.value)}</option>`).join('')}</select></label><div class="tripo-settings"><label class="field"><span>几何精度</span><select id="tripo-geometry"><option value="detailed">高精度</option><option value="standard" selected>标准</option></select></label><label class="field"><span>贴图精度</span><select id="tripo-texture"><option value="detailed">4K</option><option value="standard" selected>2K</option></select></label></div><div class="tripo-mesh-settings"><label class="field"><span>网格类型</span><select id="tripo-grid-type" aria-label="网格类型"><option value="triangle">三角面（Triangle）</option><option value="quad" selected>四边形（Quad）</option></select></label><label class="field"><span id="tripo-faces-label">三角面上限</span><input id="tripo-faces" aria-label="面数上限" type="number" min="500" max="300000" step="1" value="150000"></label></div><input id="tripo-faces-range" aria-label="拖动调整面数" type="range" min="500" max="300000" step="500" value="150000"><small id="tripo-grid-hint"></small><p>生成带 PBR 材质的静态模型。入库后检查比例与背面，再加入建筑装配。</p><p id="tripo-price-details"></p><small>直接下载官方任务返回的原件；FBX 在本机用 Blender 转为预览 GLB。积分为参考估算，以官方 API 实际扣费为准。</small><button type="submit" id="tripo-generate" class="primary full-width" ${account.connected?'':'disabled'}>连接账号后生成</button><p id="tripo-form-status" role="status"></p></div></div><div class="tripo-reference-section" hidden><label class="field" id="tripo-reference" hidden><span>单件参考图（上传至 Tripo，最大 20 MB）</span><input id="tripo-image" type="file" accept="image/png,image/jpeg,image/webp"><img id="tripo-image-preview" hidden alt="组件参考图"><small>参考图模式使用图片生成，文字仅作为本地制作备注；推荐单件、干净背景的图片。</small></label><section id="tripo-multiview" hidden><h4>四视图</h4><p>同一组件的前、左、后、右视图，至少两张且必须包含前视图；每张最大 20 MB。四张分别传给原生多视图模型。</p><div class="tripo-view-grid">${REFERENCE_VIEWS.map((label,i)=>`<label class="tripo-view"><b>${label}</b><input id="tripo-view-${i}" aria-label="${label}" type="file" accept="image/png,image/jpeg,image/webp"><small id="tripo-view-name-${i}"></small><img id="tripo-view-preview-${i}" hidden alt="${label}预览"><div class="tripo-view-actions"><button type="button" data-tripo-replace-view="${i}" aria-label="替换${label}" hidden>替换</button><button type="button" data-tripo-clear-view="${i}" aria-label="移除${label}" hidden>移除</button></div></label>`).join('')}</div><small>保持主体形状、比例、朝向和背景一致，尽量使用同一个模型的正交渲染或实物转台照片。不要将整个场景或四视图拼图当作单个视角；文字在此模式仅作本地备注。</small></section></div></div></form></section></div>
    <section class="panel tripo-jobs" id="tripo-batch"></section>
    <section class="panel tripo-jobs"><div class="tripo-jobs-heading"><h3 class="help-heading">本地生成任务 ${helpTip('本地生成任务历史说明','在列表内滚动查看历史生成任务。')}</h3><button id="tripo-recover">按官方任务 ID 找回</button></div><div id="tripo-jobs" class="tripo-history-scroll" role="region" aria-label="历史本地生成任务" tabindex="0"></div><div id="tripo-remote"></div></section>`;
    bindHelpTips();
    $('#tripo-open-site').onclick=()=>{window.open('https://www.tripo3d.ai/','_blank');};
    $('#tripo-refresh').onclick=()=>this.safe(()=>this.refresh(true));
    $('#tripo-recover').onclick=()=>this.safe(()=>this.remote());
    if($('#tripo-disconnect'))$('#tripo-disconnect').onclick=()=>this.safe(async()=>{await this.api('/api/tripo/disconnect',send({}));await this.mount();});
    if($('#tripo-edit-account'))$('#tripo-edit-account').onclick=()=>this.safe(async()=>{this.captureDraft();this.editAccount=true;await this.mount();});
    if($('#tripo-forget-account'))$('#tripo-forget-account').onclick=()=>this.safe(async()=>{await this.api('/api/tripo/forget-account',send({}));this.editAccount=false;await this.mount();});
    if($('#tripo-reconnect'))$('#tripo-reconnect').onclick=()=>this.safe(async()=>{const button=$('#tripo-reconnect');button.disabled=true;try{await this.api('/api/tripo/reconnect',send({}));await this.mount();}finally{if(button.isConnected)button.disabled=false;}});
    if($('#tripo-login-form'))$('#tripo-login-form').onsubmit=e=>{e.preventDefault();this.safe(async()=>{const button=$('#tripo-login');button.disabled=true;const apiKey=$('#tripo-api-key').value;$('#tripo-api-key').value='';try{await this.api('/api/tripo/login',send({apiKey,remember:!!$('#tripo-remember-key')?.checked}));this.editAccount=false;await this.mount();}finally{if(button.isConnected)button.disabled=false;}});};
    
    document.querySelectorAll('[name=tripo-mode]').forEach(e=>e.onchange=()=>{this.updateMode();this.captureDraft();this.safe(()=>this.quote());});
    for(const id of ['tripo-model','tripo-geometry','tripo-texture','tripo-faces','tripo-grid-type'])$('#'+id).onchange=()=>{this.updateFaceLimits();this.captureDraft();this.safe(()=>this.quote());};
    $('#tripo-image').onchange=()=>{this.imageFile=$('#tripo-image').files[0]||null;this.imageRef=null;this.renderImage();this.captureDraft();};
    this.viewURLs=[];
    REFERENCE_VIEWS.forEach((_,i)=>{
      const input=$('#tripo-view-'+i),clear=$('[data-tripo-clear-view="'+i+'"]');
      $('[data-tripo-replace-view="'+i+'"]').onclick=()=>input.click();
      input.onchange=()=>{this.viewFiles[i]=input.files[0]||null;this.viewRefs[i]=null;this.renderView(i);this.captureDraft();};
      clear.onclick=()=>{input.value='';this.viewFiles[i]=null;this.viewRefs[i]=null;this.renderView(i);this.captureDraft();};
    });
    $('#tripo-faces-range').oninput=e=>{$('#tripo-faces').value=e.target.value;this.captureDraft();this.batchPanel?.invalidate();};
    $('#tripo-faces-range').onchange=()=>this.safe(()=>this.quote());
    $('#tripo-generate-form').oninput=e=>{this.captureDraft();if(['tripo-name','tripo-prompt','tripo-category'].includes(e.target.id)){clearTimeout(this.quoteTimer);this.quoteTimer=setTimeout(()=>{if(this.active())this.safe(()=>this.quote());},600);}};
    $('#tripo-generate-form').onsubmit=e=>{e.preventDefault();this.safe(()=>this.generate());};
  }
  config(){return{name:$('#tripo-name').value,prompt:$('#tripo-prompt').value,category:$('#tripo-category').value,mode:document.querySelector('[name=tripo-mode]:checked').value,model:$('#tripo-model').value,geometryQuality:$('#tripo-geometry').value,textureQuality:$('#tripo-texture').value,faceLimit:Number($('#tripo-faces').value),quad:$('#tripo-grid-type').value==='quad',notes:$('#tripo-notes').value,sourceBreakdown:this.source||undefined};}
  async quote(){if(!this.account.connected)return;const current=this.config();if(!current.name.trim()||(current.mode==='text'&&!current.prompt.trim())){this.credits=null;$('#tripo-price-details').textContent='填写素材名称'+(current.mode==='text'?'和描述':'')+'后显示积分估算';$('#tripo-generate').textContent='生成并自动入库';return;}const result=await this.api('/api/tripo/quote',send(current));if(!this.active()||JSON.stringify(current)!==JSON.stringify(this.config()))return;this.credits=result.estimatedCredits;const p=result.pricing;$('#tripo-price-details').textContent=p.modelRate?`当前模型定价 ${p.modelRate} 积分 · 免费原件下载 0 积分`:`生成 ${p.base} + 贴图精度 ${p.texture} + 几何精度 ${p.geometry} + 四边形 ${p.quad||0} = 预计 ${this.credits} API 积分；以官方实际扣费为准`;$('#tripo-generate').textContent=`生成并自动入库 · 预计 ${this.credits} 积分`;}
  async generate(){
    if(this.busy)return;this.busy=true;const button=$('#tripo-generate'),status=$('#tripo-form-status'); button.disabled=true;
    try{
      const file=this.imageFile||(this.imageRef?await this.localReferenceFile(this.imageRef):null),config=this.config(),views=config.mode==='multiview'?await Promise.all(REFERENCE_VIEWS.map((_,i)=>this.referenceFile(i))):[],quote=await this.api('/api/tripo/quote',send(config));
      if(quote.estimatedCredits!==this.credits){await this.quote();throw Error('积分估算已更新，请检查新价格后再提交');}
      if(config.mode==='multiview'&&(!views[0]||views.filter(Boolean).length<2))throw Error('至少上传两张不同角度图片，必须包含前视图');
      const references=config.mode==='multiview'?views:config.mode==='image'?[file]:[];
      for(const reference of references.filter(Boolean))if(reference.size>20*1048576||!['image/png','image/jpeg','image/webp'].includes(reference.type))throw Error('每张参考图须为 PNG、JPG 或 WEBP，最大 20 MB');
      if(config.mode==='image'){if(!file)throw Error('请选择单件参考图');status.textContent='正在上传参考图…';const uploaded=await this.api('/api/tripo/upload?name='+encodeURIComponent(file.name),{method:'POST',headers:{'Content-Type':file.type},body:file});config.imageID=uploaded.imageID;}
      if(config.mode==='multiview'){config.imageIDs=[null,null,null,null];for(let i=0;i<4;i++){if(!views[i])continue;status.textContent='正在上传'+REFERENCE_VIEWS[i]+'…';const uploaded=await this.api('/api/tripo/upload?name='+encodeURIComponent(views[i].name),{method:'POST',headers:{'Content-Type':views[i].type},body:views[i]});config.imageIDs[i]=uploaded.imageID;}}
      status.textContent='正在提交生成任务…';
      const job=await this.api('/api/tripo/generate',send({...config,requestID:this.requestID,acceptedCredits:quote.estimatedCredits}));
      this.requestID=crypto.randomUUID();this.captureDraft();await this.refresh(true);
      if(this.active())$('#tripo-form-status').textContent=job.status==='queued'?'已提交，完成后自动下载入库；退出 App 后云端继续生成，重开恢复进度。':job.error||labels[job.status];
    }finally{this.busy=false;if(button.isConnected)button.disabled=false;}
  }
  async refresh(balance=false){
    const jobs=await this.api('/api/tripo/jobs');if(!this.active())return;balance=balance||jobs.some(j=>j.remoteID&&!this.jobs?.find(old=>old.id===j.id)?.remoteID);this.jobs=jobs;
    const signature=JSON.stringify(jobs);if(signature!==this.jobsJSON){this.jobsJSON=signature;
    const jobHost=$('#tripo-jobs'),scrollTop=jobHost.scrollTop;jobHost.innerHTML=jobs.length?jobs.map(j=>`<article class="tripo-job"><div><b>${esc(j.name)}</b><span>${esc(labels[j.status]||j.status)}${!['success','failed','unconfirmed'].includes(j.status)?' · '+j.progress+'%':''}</span><p>${esc(j.legacy?'旧站历史任务 · 已停止请求旧站；已入库素材仍可使用':j.error||`${{text:'文字',image:'参考图',multiview:'四视图'}[j.mode]||'找回'} · ${j.model||'云端模型'} · ${j.estimatedCredits?j.estimatedCredits+' 积分（预计）':'原任务'}${j.triangles?' · '+j.triangles.toLocaleString()+' 三角面':''}`)}</p><small>${esc(j.remoteID||'提交编号待核对')}</small>${j.originalURL?`<p>原生 ${esc(j.nativeFormat.toUpperCase())} · 下载 0 积分 <a href="${esc(j.originalURL)}" download>导出原件${j.originalContainer==='zip'?'（含贴图包）':''}</a></p>`:''}</div><div>${j.assetID?`<button data-tripo-view="${esc(j.assetID)}" class="primary">查看素材</button><button data-tripo-add="${esc(j.assetID)}">加入建筑装配</button>`:j.remoteID&&!j.legacy?`<button data-tripo-retry="${j.id}">${j.status==='download_error'?'重试下载入库':'刷新进度'}</button>`:''}</div></article>`).join(''):'<p>尚无生成任务。生成完成后，这里会显示已入库的组件。</p>';
    jobHost.scrollTop=scrollTop;
    document.querySelectorAll('[data-tripo-view]').forEach(b=>b.onclick=()=>this.safe(async()=>{await this.onAsset();location.hash='detail/'+b.dataset.tripoView;}));
    document.querySelectorAll('[data-tripo-add]').forEach(b=>b.onclick=()=>this.safe(()=>this.onAsset(b.dataset.tripoAdd)));
    document.querySelectorAll('[data-tripo-retry]').forEach(b=>b.onclick=()=>this.safe(async()=>{b.disabled=true;try{await this.api('/api/tripo/jobs/'+b.dataset.tripoRetry+'/refresh',send({}));await this.refresh(true);}finally{if(b.isConnected)b.disabled=false;}}));
    }
    await this.batchPanel?.refresh();
    if(balance&&this.account.connected){this.account=await this.api('/api/tripo/account');if(this.active()&&$('#tripo-balance'))$('#tripo-balance').textContent=this.account.connected?this.account.user.balance.toLocaleString()+' 积分':'授权已过期，请重新连接';if(!this.account.connected&&$('#tripo-generate'))$('#tripo-generate').disabled=true;}
  }
  async remote(){
    const remoteID=prompt('输入国际官方 API 任务 ID（可从官方控制台复制；不支持旧站任务）');if(!remoteID?.trim())return;
    const name=prompt('入库组件名称','找回的 Tripo API 组件');if(name===null)return;
    const job=await this.api('/api/tripo/recover',send({remoteID:remoteID.trim(),name:name||'找回的 Tripo API 组件',category:'其他'}));
    this.notify(job.assetID?'模型已入库':'官方任务已找回，将继续查询并下载');await this.refresh();
  }
}
