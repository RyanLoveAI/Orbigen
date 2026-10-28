import * as T from 'three';
import {projectGroup,exportGLB} from '../../view.js';
import {ASSET_CATEGORIES} from '../asset-folder/classify.js';
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const send=(method,value)=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
function base64(buffer){const bytes=new Uint8Array(buffer),parts=[];for(let n=0;n<bytes.length;n+=32768)parts.push(String.fromCharCode(...bytes.subarray(n,n+32768)));return btoa(parts.join(''));}

export async function savePrefab({api,notify,project,module,assets,save}){
 if(!project?.instances.length)throw Error('请先搭建组件，再保存到半成品库');
 await save();const snapshot=structuredClone(project),dialog=document.createElement('dialog');dialog.className='prefab-save-dialog';
 dialog.innerHTML=`<form id="prefab-save-form"><h2>保存到半成品库</h2><p>勾选要保存的组件，保留它们的相对位置、旋转、大小和材质。</p><label class="field"><span>半成品名称</span><input id="prefab-name" aria-label="半成品名称" required maxlength="120" value="${esc(snapshot.name+' · 半成品')}"></label><div class="prefab-fields"><label class="field"><span>分类</span><select id="prefab-category" aria-label="半成品分类">${ASSET_CATEGORIES.map(c=>`<option value="${c}">${c}</option>`).join('')}</select></label><label class="field"><span>标签（逗号分隔）</span><input id="prefab-tags" aria-label="半成品标签" placeholder="入口框架, 木结构"></label></div><label class="field"><span>备注</span><textarea id="prefab-notes" aria-label="半成品备注" maxlength="4000" rows="3"></textarea></label><div class="prefab-pick-heading"><strong>保存哪些组件</strong><button type="button" id="prefab-select-all">全选</button><button type="button" id="prefab-select-none">清空</button><span id="prefab-picked-count"></span></div><div class="prefab-picks">${snapshot.instances.map(i=>`<label><input type="checkbox" data-prefab-pick="${esc(i.id)}" checked><span>${esc(i.name||'未命名组件')}</span></label>`).join('')}</div><p id="prefab-save-message" role="status"></p><div class="prefab-dialog-actions"><button type="button" id="prefab-cancel">取消</button><button type="submit" id="prefab-save-confirm" class="primary">保存半成品</button></div></form>`;
 document.body.append(dialog);const q=s=>dialog.querySelector(s),picks=()=>[...dialog.querySelectorAll('[data-prefab-pick]:checked')].map(e=>e.dataset.prefabPick);
 const categories=snapshot.instances.map(i=>assets.find(a=>a.id===i.assetId)?.category);q('#prefab-category').value=categories.every(c=>c===categories[0])?categories[0]:'其他';
 const count=()=>{q('#prefab-picked-count').textContent='已选 '+picks().length+' / '+snapshot.instances.length;q('#prefab-save-confirm').disabled=!picks().length;};
 for(const e of dialog.querySelectorAll('[data-prefab-pick]'))e.onchange=count;
 for(const [id,checked] of [['all',true],['none',false]])q('#prefab-select-'+id).onclick=()=>{for(const e of dialog.querySelectorAll('[data-prefab-pick]'))e.checked=checked;count();};count();
 return new Promise(resolve=>{
  let result=null,busy=false;dialog.onclose=()=>{dialog.remove();resolve(result);};dialog.oncancel=e=>{if(busy)e.preventDefault();};q('#prefab-cancel').onclick=()=>dialog.close();
  q('#prefab-save-form').onsubmit=async event=>{
   event.preventDefault();if(busy)return;busy=true;const button=q('#prefab-save-confirm');button.disabled=true;q('#prefab-cancel').disabled=true;
   q('#prefab-save-message').textContent='正在保存真实模型与组件关系…';
   try{
    const instanceIds=picks();if(!instanceIds.length)throw Error('请至少选择一个组件');
    const group=await projectGroup({...snapshot,instances:snapshot.instances.filter(i=>instanceIds.includes(i.id))},assets),box=new T.Box3().setFromObject(group),dimensions=box.getSize(new T.Vector3()).toArray(),anchor=[(box.min.x+box.max.x)/2,box.min.y,(box.min.z+box.max.z)/2];
    group.children.forEach(o=>o.position.sub(new T.Vector3(...anchor)));group.name=q('#prefab-name').value.trim();group.userData={prefabExportId:crypto.randomUUID()};
    const bytes=await exportGLB(group);if(bytes.byteLength>64*1048576)throw Error('半成品模型超过 64 MB，请减少组件后保存');
    result=await api('/api/prefabs',send('POST',{name:group.name,notes:q('#prefab-notes').value,category:q('#prefab-category').value,tags:q('#prefab-tags').value.split(/[,，;；]/).map(t=>t.trim()).filter(Boolean),source:{module,projectId:snapshot.id,revision:snapshot.revision},instanceIds,anchor,dimensions,glb:base64(bytes)}));
    notify('已保存到半成品库：'+result.asset.name);dialog.close();
   }catch(error){q('#prefab-save-message').textContent=error.message;}
   finally{busy=false;if(button.isConnected){button.disabled=!picks().length;q('#prefab-cancel').disabled=false;}}
  };dialog.showModal();
 });
}
