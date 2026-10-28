import {helpTip,bindHelpTips} from '../help-tip.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const send=value=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
const stateLabels={running:'运行中',paused:'已暂停',needs_attention:'需要处理',complete:'已完成',pending:'等待上传',uploading:'正在上传',submitting:'正在提交',waiting:'生成与入库中',success:'已入库',invalid:'图片无效',existing:'已在队列中',skipped:'已跳过',error:'需要处理'};
export function batchProgress(batch){
 const items=batch.items.filter(i=>!['invalid','skipped'].includes(i.status));
 return {total:items.length,submitted:items.filter(i=>i.remoteID||i.submittedAt||['waiting','success'].includes(i.status)).length,active:items.filter(i=>i.status==='waiting').length,imported:items.filter(i=>i.status==='success').length};
}
export function batchItemLabel(item){
 if(item.status!=='waiting')return stateLabels[item.status]||item.status;
 if(item.stage==='queued')return '云端排队';
 if(item.stage==='downloading')return '下载与入库中';
 return '云端生成中';
}
export class TripoBatchPanel {
  constructor({api,safe,notify,active,config,connected,onAsset}){Object.assign(this,{api,safe,notify,active,config,connected,onAsset});}
  suspend(){this.disposed=true;this.scanEpoch=(this.scanEpoch||0)+1;}
  async mount(){
    const data=await this.api('/api/tripo/batches');if(this.disposed||!this.active())return;
    this.mode='multiview';let root=data.defaultRoot;try{this.mode=localStorage.getItem('orbigen-tripo-batch-mode')==='image'?'image':'multiview';if(this.config().sourceBreakdown)this.mode='multiview';root=(!this.config().sourceBreakdown&&localStorage.getItem('orbigen-tripo-batch-last-root'))||localStorage.getItem(this.mode==='image'?'orbigen-tripo-single-root':'orbigen-tripo-batch-root')||root;}catch{}
    document.querySelector('#tripo-batch').innerHTML=`<div class="tripo-jobs-heading"><h3 class="help-heading">图片文件夹批量生成 ${helpTip('批量生成流程说明','先扫描并导入待生成清单，再按当前设置连续上传提交；前一件提交成功后继续下一件，云端生成、下载与入库在后台进行。')}</h3></div><div class="tripo-batch-folder"><label class="field"><span>图片素材目录</span><input id="tripo-batch-root" aria-label="图片素材目录" value="${esc(root)}"></label><button id="tripo-batch-choose">选择文件夹…</button><button id="tripo-batch-open">打开文件夹</button><div class="tripo-batch-scan-modes" role="group" aria-label="扫描图片模式"><span class="action-with-help"><button id="tripo-batch-scan">扫描四视图</button>${helpTip('扫描四视图说明','每个子文件夹一件素材，提供 front、left、back、right（也支持中文视角名）。本地扫描无需登录，不上传图片、不提交生成。')}</span><span class="action-with-help"><button id="tripo-batch-scan-single">扫描单张图</button>${helpTip('扫描单张图说明','目录及子目录中每张 PNG/JPG/WEBP 图片一件素材，无需视角命名；忽略隐藏文件和软链接。本地扫描无需登录，不上传图片、不提交生成。')}</span></div></div><div id="tripo-batch-scan-result"></div><div class="action-with-help tripo-batch-start-row"><button class="primary" id="tripo-batch-start" disabled>先扫描目录</button>${helpTip('批量生成设置与提交说明','批量使用上方的模型、几何精度、贴图精度、网格类型、面数与分类设置。连接账号后再核对积分并生成。提交成功后至少间隔 4 秒继续下一件，云端可同时生成多件；限流或提交结果不明时暂停后续提交。暂停队列只停止新提交，已提交任务仍会自动入库。')}</div><p id="tripo-batch-status" role="status"></p><h4 class="help-heading">生成队列 ${helpTip('生成队列历史说明','最新记录在上方，可在列表内上下滚动查看历史。')}</h4><div id="tripo-batch-queues" class="tripo-history-scroll" role="region" aria-label="历史生成队列" tabindex="0"></div>`;
    bindHelpTips();
    const $=s=>document.querySelector(s);
    $('#tripo-batch-choose').onclick=()=>this.safe(async()=>{
      const bridge=window.webkit?.messageHandlers?.orbigenFolders;if(!bridge){this.notify('网页版请在输入框填写本机文件夹路径');return;}
      const root=await bridge.postMessage({action:'choose',path:$('#tripo-batch-root').value});if(root&&this.active()){$('#tripo-batch-root').value=root;this.rememberRoot();this.invalidate();}
    });
    $('#tripo-batch-open').onclick=()=>this.safe(async()=>{const bridge=window.webkit?.messageHandlers?.orbigenFolders;if(!bridge){this.notify('请在 Finder 打开输入框中的目录');return;}await bridge.postMessage({action:'open',path:$('#tripo-batch-root').value});});
    $('#tripo-batch-root').oninput=()=>{this.rememberRoot();this.invalidate();};
    for(const id of ['tripo-model','tripo-geometry','tripo-texture','tripo-faces','tripo-grid-type','tripo-category'])$('#'+id).addEventListener('change',()=>this.invalidate());
    $('#tripo-batch-scan').onclick=()=>this.safe(()=>this.scan('multiview'));$('#tripo-batch-scan-single').onclick=()=>this.safe(()=>this.scan('image'));this.updateModeButtons();
    $('#tripo-batch-start').onclick=()=>this.safe(()=>this.start());
    this.renderQueues(data.batches);
  }
  rememberRoot(){try{localStorage.setItem('orbigen-tripo-batch-last-root',document.querySelector('#tripo-batch-root').value);}catch{}}
  invalidate(){this.scanEpoch=(this.scanEpoch||0)+1;this.scanned=null;document.querySelector('#tripo-batch-scan-result')?.replaceChildren();const button=document.querySelector('#tripo-batch-start');if(button){button.disabled=true;button.textContent='设置变化后请重新扫描';}}
  updateModeButtons(){for(const [id,mode] of [['tripo-batch-scan','multiview'],['tripo-batch-scan-single','image']]){const b=document.getElementById(id);if(b){b.classList.toggle('active',this.mode===mode);b.setAttribute('aria-pressed',String(this.mode===mode));}}}
  input(){return {...this.config(),mode:this.mode||'multiview',root:document.querySelector('#tripo-batch-root').value,localOnly:!this.connected()};}
  async scan(mode=this.mode||'multiview'){
    if(this.scanning||this.starting)return;this.mode=mode;this.rememberRoot();this.invalidate();this.updateModeButtons();this.scanning=true;const epoch=this.scanEpoch,input=this.input(),buttons=['tripo-batch-scan','tripo-batch-scan-single'].map(id=>document.getElementById(id));buttons.forEach(b=>b.disabled=true);
    try{
      const scanned=await this.api('/api/tripo/batches/scan',send(input));if(this.disposed||!this.active()||epoch!==this.scanEpoch)return;this.scanned=scanned;
      try{localStorage.setItem(this.mode==='image'?'orbigen-tripo-single-root':'orbigen-tripo-batch-root',scanned.root);localStorage.setItem('orbigen-tripo-batch-mode',this.mode);localStorage.setItem('orbigen-tripo-batch-last-root',scanned.root);}catch{}
      const priced=Number.isFinite(scanned.perItemCredits)&&Number.isFinite(scanned.estimatedTotalCredits);
      document.querySelector('#tripo-batch-scan-result').innerHTML=`<p><span class="tripo-batch-mode-label">${this.mode==='image'?'单张图':'四视图'}</span> <b>${scanned.pending} 件待生成 · ${priced?`预计共 ${scanned.estimatedTotalCredits} 积分（每件 ${scanned.perItemCredits}）`:'积分待连接后核对'}</b>；${scanned.invalid} 件无效，${scanned.existing} 件已排队或已处理。免费原件下载 0 积分。</p><div class="tripo-batch-scan-list">${scanned.items.map(i=>`<article><b>${esc(i.folder)}</b><span>${esc(stateLabels[i.status])}</span><small>${esc(i.issues.length?i.issues.join('；'):i.views.map(v=>v.file).join(' / '))}</small></article>`).join('')||`<p>${this.mode==='image'?'目录中没有 PNG/JPG/WEBP 图片。':'目录中没有组件子文件夹。'}</p>`}</div>`;
      const start=document.querySelector('#tripo-batch-start');start.disabled=!scanned.pending||!priced||!this.connected();start.textContent=!scanned.pending?'没有新的有效图片':!this.connected()?'连接账号后核对积分':!priced?'重新扫描核对积分':`批量生成 ${scanned.pending} 件 · 预计 ${scanned.estimatedTotalCredits} 积分`;
      document.querySelector('#tripo-batch-status').textContent=priced?'待生成清单已导入工作台，尚未上传或提交 Tripo。':scanned.pricingError?'本地扫描完成，但积分暂未核对：'+scanned.pricingError+'。连接账号后重新扫描，核对积分再生成。':'本地扫描完成。请在页面上方连接 Tripo 账号，再重新扫描核对积分后生成。';
    }finally{this.scanning=false;for(const button of buttons)if(button.isConnected)button.disabled=false;}
  }
  async start(){
    if(this.starting||this.scanning||!this.scanned)return;if(!this.connected()||!Number.isFinite(this.scanned.estimatedTotalCredits))throw Error('请先连接 Tripo 账号，并重新扫描核对积分');this.starting=true;const button=document.querySelector('#tripo-batch-start');button.disabled=true;
    try{const batch=await this.api('/api/tripo/batches/start',send({...this.input(),snapshot:this.scanned.snapshot,acceptedTotalCredits:this.scanned.estimatedTotalCredits}));this.scanned=null;if(this.disposed||!this.active())return;document.querySelector('#tripo-batch-scan-result').replaceChildren();button.textContent='队列已启动';document.querySelector('#tripo-batch-status').textContent='已启动'+(batch.config.mode==='image'?'单张图':'四视图')+'批量生成：连续上传提交，不等待前一件入库。关闭 App 后已提交云端任务继续，重开后按原队列恢复，不重复生成。';await this.refresh();return batch;}
    catch(error){if(!this.disposed&&this.active()){this.invalidate();document.querySelector('#tripo-batch-status').textContent='启动未完成，请重新扫描并核对队列后再试。';}throw error;}
    finally{this.starting=false;}
  }
  async refresh(){const data=await this.api('/api/tripo/batches');if(!this.disposed&&this.active())this.renderQueues(data.batches);}
  renderQueues(batches){
    const signature=JSON.stringify(batches);if(signature===this.signature)return;this.signature=signature;
    const host=document.querySelector('#tripo-batch-queues'),scrollTop=host.scrollTop;host.innerHTML=batches.map(b=>{const p=batchProgress(b);return `<section class="tripo-batch-queue"><div class="tripo-jobs-heading"><b>${esc(stateLabels[b.status])} · 已提交 ${p.submitted}/${p.total} · 生成与入库中 ${p.active} · 已入库 ${p.imported}/${p.total}</b><div>${b.status==='running'?`<span class="action-with-help"><button data-batch-control="pause" data-batch-id="${b.id}">暂停队列</button>${helpTip('暂停队列说明','只停止新任务的上传提交，已提交的云端任务继续生成，并会自动下载入库。')}</span>`:['paused','needs_attention'].includes(b.status)?`<button data-batch-control="resume" data-batch-id="${b.id}">继续队列</button>`:''}</div></div><small><span class="tripo-batch-mode-label">${b.config.mode==='image'?'单张图':'四视图'}</span> ${esc(b.root)} · 每件预计 ${b.perItemCredits} 积分</small>${b.error?`<p class="tripo-batch-error">${esc(b.error)}</p>`:''}${b.items.map((i,index)=>`<article class="tripo-batch-item"><div><b>${esc(i.name)}</b><span>${esc(batchItemLabel(i))}${i.status==='uploading'?` ${i.uploadedViews||0}/${i.views?.length||(b.config.mode==='image'?1:4)}`:i.status==='waiting'?` ${i.progress||0}%`:''}</span>${i.error?`<p>${esc(i.error)}</p>`:''}</div>${i.assetID?`<a class="button" href="#detail/${esc(i.assetID)}">查看素材</a>`:i.status==='error'?`<button data-batch-control="skip" data-batch-id="${b.id}" data-batch-index="${index}">跳过此项</button>`:''}</article>`).join('')}</section>`;}).join('');
    host.scrollTop=scrollTop;
    document.querySelectorAll('[data-batch-control]').forEach(button=>button.onclick=()=>this.safe(async()=>{button.disabled=true;try{await this.api('/api/tripo/batches/'+button.dataset.batchId+'/control',send({action:button.dataset.batchControl,index:Number(button.dataset.batchIndex)}));await this.refresh();}finally{if(button.isConnected)button.disabled=false;}}));
    document.querySelectorAll('#tripo-batch-queues a[href^="#detail/"]').forEach(link=>link.onclick=event=>{event.preventDefault();this.safe(async()=>{await this.onAsset();location.hash=link.getAttribute('href');});});
  }
}
