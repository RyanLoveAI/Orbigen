const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const post=body=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
export class AssetFolderPanel {
 constructor({api,safe,notify,active,onImported}){Object.assign(this,{api,safe,notify,active,onImported});this.open=false;this.lastCompleted=null;}
 suspend(){clearTimeout(this.timer);this.mountId=(this.mountId||0)+1;}
 async mount(){
  this.suspend();const id=this.mountId;
  const state=await this.api('/api/local-assets');if(id!==this.mountId||!this.active()||!document.querySelector('#local-assets-panel'))return;
  this.state=state;
  document.querySelector('#local-assets-panel').innerHTML=`<details class="local-assets" ${this.open?'open':''}><summary>▣ 本地素材目录 <span>递归读取 · 自动分类 · 标签整理</span></summary><div class="local-assets-body"><div class="local-assets-controls"><label class="field"><span>素材目录（含子文件夹）</span><input id="local-assets-root" aria-label="本地素材目录" value="${esc(state.root)}"></label><button id="local-assets-default">使用默认目录</button><button id="local-assets-choose">选择文件夹…</button><button id="local-assets-open">打开文件夹</button><button id="local-assets-scan" class="primary">扫描并入库</button><button id="local-assets-stop" hidden>停止扫描</button></div><p>GLB / FBX / OBJ / glTF，贴图及依赖保留在原位置。已核对素材沿用模型视觉分类；新素材按名称和明确分类目录整理，未识别项标记待分类。不会改动源文件。修改文件后重新扫描，重复素材自动跳过。</p><div id="local-assets-status" role="status"></div><div id="local-assets-result"></div></div></details>`;
  const $=s=>document.querySelector(s),bridge=window.webkit?.messageHandlers?.orbigenFolders;
  $('.local-assets').ontoggle=e=>this.open=e.target.open;
  $('#local-assets-default').onclick=()=>{$('#local-assets-root').value=state.defaultRoot;};
  $('#local-assets-choose').disabled=!bridge;$('#local-assets-open').disabled=!bridge;
  $('#local-assets-choose').onclick=()=>this.safe(async()=>{const root=await bridge.postMessage({action:'choose',kind:'assets',path:$('#local-assets-root').value});if(root&&id===this.mountId&&this.active())$('#local-assets-root').value=root;});
  $('#local-assets-open').onclick=()=>this.safe(async()=>{await bridge.postMessage({action:'open',path:$('#local-assets-root').value});});
  $('#local-assets-scan').onclick=()=>this.safe(async()=>{
   const root=$('#local-assets-root').value;$('#local-assets-scan').disabled=true;
   try{this.state=await this.api('/api/local-assets/scan',post({root}));if(id===this.mountId&&this.active()){this.render();this.poll(id);}}
   catch(e){if(id===this.mountId&&this.active())$('#local-assets-scan').disabled=false;throw e;}
  });
  $('#local-assets-stop').onclick=()=>this.safe(async()=>{this.state=await this.api('/api/local-assets/stop',post({}));if(id===this.mountId&&this.active())this.render();});
  this.render();if(state.job?.state==='running')this.poll(id);
  else if(state.job?.id&&state.job.id!==this.lastCompleted&&state.job.added){this.lastCompleted=state.job.id;await this.onImported();}
 }
 render(){
  const job=this.state.job,$=s=>document.querySelector(s);if(!$('#local-assets-status'))return;
  const running=job?.state==='running';
  for(const id of ['root','default','choose','scan'])$('#local-assets-'+id).disabled=running||(id==='choose'&&!window.webkit?.messageHandlers?.orbigenFolders);
  $('#local-assets-stop').hidden=!running;
  $('#local-assets-status').textContent=job?`${job.current} · ${job.processed} / ${job.total} · 新增 ${job.added} · 重复 ${job.duplicates} · 失败 ${job.failed} · 跳过 ${job.skipped}`:'把模型放入目录后，点击“扫描并入库”。无需 Codex 或 Tripo 积分。';
  $('#local-assets-result').innerHTML=job?`<div class="local-assets-results">${job.items.slice(-100).reverse().map(item=>`<div class="local-asset-result"><span>${item.state==='added'?'已入库':item.state==='duplicate'?'已存在':item.state==='recycled'?'在回收站':'失败'}</span><div><b>${esc(item.name||item.file)}</b><small>${esc(item.file)}${item.error?' · '+esc(item.error):' · '+esc(item.category)+' · '+esc((item.tags||[]).join(' / '))}</small></div>${item.assetId?`<a href="#detail/${esc(item.assetId)}">查看组件</a>`:''}</div>`).join('')}${job.warnings.map(w=>`<p>${esc(w)}</p>`).join('')}</div>`:'';
 }
 poll(id){clearTimeout(this.timer);this.timer=setTimeout(()=>this.safe(async()=>{
  const state=await this.api('/api/local-assets');if(id!==this.mountId||!this.active())return;this.state=state;this.render();
  if(state.job?.state==='running')this.poll(id);
  else{this.lastCompleted=state.job?.id;this.notify(`目录扫描结束：新增 ${state.job?.added||0} 件，重复 ${state.job?.duplicates||0} 件，失败 ${state.job?.failed||0} 件`);if(state.job?.added)await this.onImported();}
 }),700);}
}
