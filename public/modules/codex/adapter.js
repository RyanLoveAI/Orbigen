import {FIELDS,RUNS,validateAction} from './protocol.js';
import {recipe as plantRecipe,SPECIES} from '../vegetation/schema.js';
import {config as composeConfig} from '../compose/schema.js';
const $=id=>document.getElementById(id);
export class WorkbenchAdapter {
 constructor(host){this.host=host;}
 workspace(){const h=this.host;return {breakdown:h.breakdown,vegetation:h.vegetation,region:h.region,compose:h.compose,sculpt:h.sculpt}[h.route];}
 scope(){const h=this.host,w=this.workspace();return h.route+':'+(w?.project?.id||(h.route==='assembly'?h.project?.id:null)||(['detail','sculpt'].includes(h.route)?h.asset?.id:null)||'page');}
 fields(){return Object.fromEntries((FIELDS[this.host.route]||[]).filter(id=>$(id)).map(id=>[id,$(id).value]));}
 context(){const h=this.host,w=this.workspace(),p=w?.project||(h.route==='assembly'?h.project:null),cage=h.route==='sculpt'?w?.core?.selection?.cage:null;
 return {route:h.route,scope:this.scope(),page:h.route==='compose'?'木构与场景搭建':document.querySelector('h1')?.textContent,selected:w?.selected??(h.route==='assembly'?h.selected:null),asset:['detail','sculpt'].includes(h.route)?this.asset(h.asset):null,
 project:p?{id:p.id,name:p.name,instances:p.instances,recipe:p.recipe,config:p.config,sources:p.sources,breakdown:p.breakdown,parts:p.parts,marks:p.marks,reference:p.reference,alignment:p.alignment,roi:p.roi,roiPolygon:p.roiPolygon,review:p.review}:null,
 measurements:['assembly','detail','sculpt','region','compose','vegetation'].includes(h.route)?h.stage?.measurementContext?.():undefined,
 fields:this.fields(),species:h.route==='vegetation'?SPECIES:undefined,
 poolIds:h.route==='region'?w?.config?.poolIds:undefined,
 blender:h.route==='compose'?w.blenderPanel?.latest():undefined,
 linkedComponents:h.route==='compose'?(w.linkedRecord?.parts||[]).filter(p=>!p.archived).map(p=>({id:p.id,name:p.name,assetId:p.generation?.assetId,category:p.category})):undefined,
 assets:['library','detail','assembly','region','compose'].includes(h.route)?h.assets.slice().sort((a,b)=>Number(p?.sources?.some(s=>s.id===b.id))-Number(p?.sources?.some(s=>s.id===a.id))).slice(0,100).map(a=>this.asset(a)):undefined,
 nodes:cage?cage.free.map((free,index)=>free?{index,offset:cage.nodes[index].clone().sub(cage.rest[index]).toArray()}:null).filter(Boolean):undefined,
 availableRuns:(RUNS[h.route]||[]).filter(id=>$(id)&&!$(id).disabled),
 note:'仅当前页面数据；历史动作不会自动执行。旋转单位为弧度。measurements 是当前模型几何与实例变换得到的世界包围盒。未校准时可按工作台相对尺寸设计，不得声称是真实物理米数。用户不清楚尺寸或数量时，优先参考门、台阶、建筑边界提出合理默认方案，不强制要求用户提供米数和块数。'};
 }
 asset(a){return a?{id:a.id,name:a.name,category:a.category,unitScale:a.unitScale,dimensions:a.dimensions,triangles:a.triangles}:null;}
 fingerprint(){const w=this.workspace();return JSON.stringify({hash:location.hash,context:this.context(),selection:w?.selectedNode,species:w?.config?.species,mode:w?.mode,history:w?.core?.history?.length,redo:w?.core?.redo?.length});}
 busy(){const h=this.host,w=this.workspace();return Boolean(h.navigating||h.stage?.transform?.dragging||w?.busy||w?.saving||w?.core?.transaction);}
 async visuals(){
 const h=this.host;if(h.route!=='compose')return null;const [T,{cameraFromSpec},{captureView}]=await Promise.all([import('three'),import('../compose/reference-rig.js'),import('../compose/view-state.js')]);const stage=h.stage,canvas=document.createElement('canvas');canvas.width=768;canvas.height=768;const context=canvas.getContext('2d'),images=[];const capture=camera=>{stage.renderer.render(stage.scene,camera);const c=stage.renderer.domElement;canvas.width=Math.min(768,c.width);canvas.height=Math.round(canvas.width*c.height/c.width);context.drawImage(c,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png');};
 images.push({label:'当前用户视角',data:capture(stage.camera)});const p=h.compose.project;if(p.alignment){const r=new T.WebGLRenderer({antialias:true});try{r.setSize(768,768);r.setClearColor(0xeef0f5);r.outputColorSpace=stage.renderer.outputColorSpace;r.toneMapping=stage.renderer.toneMapping;r.toneMappingExposure=stage.renderer.toneMappingExposure;r.render(stage.scene,cameraFromSpec(p.alignment.camera));images.push({label:'参考相机下的当前装配（正方形，与原图对应）',data:r.domElement.toDataURL('image/png')});}finally{r.dispose();}}const review=await (await import('../compose/review.js')).reviewContactSheet(p.review);if(review)images.push(review);const sources=(h.compose.blenderPanel?.latest()?.assets||p.sources).slice(0,32);if(sources.length){const sheet=document.createElement('canvas');sheet.width=768;sheet.height=Math.ceil(sources.length/4)*174;const c=sheet.getContext('2d');c.fillStyle='#eef0f5';c.fillRect(0,0,sheet.width,sheet.height);for(const [n,s] of sources.entries()){const a=h.assets.find(a=>a.id===s.id);if(!a)continue;const img=new Image();img.src=await h.compose.preview(a);await img.decode();c.drawImage(img,n%4*192,Math.floor(n/4)*174,192,144);c.fillStyle='#222';c.font='12px sans-serif';c.fillText(s.name.slice(0,22),n%4*192+3,Math.floor(n/4)*174+160);}images.push({label:'当前工程真实素材预览；ID、尺寸与分类见 sources',data:sheet.toDataURL('image/png')});}stage.renderer.render(stage.scene,stage.camera);stage.dirty=true;return {images,camera:captureView(stage)};
 }
 async apply(action){const h=this.host,w=this.workspace(),p=validateAction(action,h.route);if(this.busy())throw Error('页面正在编辑或生成，请完成当前操作再应用');
 switch(action.type){
 case 'blender_batch': if(!w.blenderPanel)throw Error('请先连接 Blender');return w.blenderPanel.edit(p);
 case 'compose_batch': return (await import('../compose/assistant-edit.js')).applyAssistantEdit(w,p.operations);
 case 'fields': {
 // Preflight the entire set before touching controls. All values must satisfy the actual UI limits.
 const entries=Object.entries(p.values).map(([id,v])=>{const e=$(id);if(!e||e.disabled)throw Error('字段当前不可用：'+id);if(e.tagName==='SELECT'&&![...e.options].some(o=>o.value===String(v)))throw Error('选项无效：'+id);if(['number','range'].includes(e.type)){const n=Number(v);if(!Number.isFinite(n)||(e.min!==''&&n<Number(e.min))||(e.max!==''&&n>Number(e.max)))throw Error('参数超出范围：'+id);}if(e.maxLength>0&&String(v).length>e.maxLength)throw Error('文本过长：'+id);return [e,String(v)];});
 if(h.route==='vegetation')plantRecipe(w.config.species,{...w.readControls(),...Object.fromEntries(Object.entries(p.values).filter(([k])=>['plant-height','plant-width','plant-density','plant-seed'].includes(k)).map(([k,v])=>[k.slice(6),Number(v)]))});
 if(h.route==='compose'&&Object.keys(p.values).some(k=>['compose-span','compose-height','compose-depth'].includes(k))){const next=composeConfig({...w.project.config,...Object.fromEntries(['span','height','depth'].map(k=>[k,Number(p.values['compose-'+k]??$('compose-'+k).value)]))});w.remember();w.project.config=next;w.mark();}
 for(const [e,v] of entries)e.value=v;
 for(const [e] of entries){e.dispatchEvent(new Event('input',{bubbles:true}));if(!['compose-span','compose-height','compose-depth'].includes(e.id))e.dispatchEvent(new Event('change',{bubbles:true}));}return h.route==='library'?'素材库搜索已更新':h.route==='detail'?'规格已填入，请在详情页保存规格':h.route==='tripo'?'Tripo 参数已填入，请在生成页核对报价并确认积分':'参数已填入；生成或加工请执行对应步骤';
 }
 case 'run': return this.run(p.id);
 case 'pool': if(p.ids.some(id=>!h.assets.some(a=>a.id===id)))throw Error('素材池引用不存在');w.config.poolIds=[...new Set(p.ids)];w.config.sourceMode='manual';w.config.selectionSeed=null;$('region-mode').value='manual';w.pool();return '素材池已选择';
 case 'species': w.config=plantRecipe(p.id,{seed:w.config.seed});w.updateControls();return '植物品种已选择';
 case 'select': if(!(w?.project||h.project)?.instances?.some(i=>i.id===p.id))throw Error('实例不存在');if(h.route==='vegetation'){w.mode='scene';await w.rebuild();}if(w)w.select(p.id);else h.select(p.id);return '已选中实例';
 case 'transform': {const project=w?.project||h.project,i=project?.instances.find(i=>i.id===p.id);if(!i)throw Error('实例不存在');if(i.locked)throw Error('实例已锁定，请先解锁');const t=Object.fromEntries(['position','rotation','scale'].filter(k=>p[k]).map(k=>[k,p[k]]));if(h.route==='compose')await w.commitTransform(p.id,t);else if(h.route==='vegetation'){const pending=w.project;w.mode='scene';await w.rebuild();if(h.route!=='vegetation'||w.project!==pending)throw Error('工程已切换，变换未执行');w.commitTransform(p.id,t);await w.rebuild();}else{h.remember();Object.assign(i,t);h.markDirty();await h.rebuild();}return '模型已调整，可撤销';}
 case 'node': {const cage=w.core.selection?.cage;if(!cage||!cage.free[p.index])throw Error('请选择已有点阵内的可编辑点');w.selectNode(p.index);w.core.begin();try{w.core.applyNode(p.index,cage.rest[p.index].clone().add(w.proxy.position.clone().set(...p.offset)));w.core.commit();w.afterEdit();}catch(e){w.core.cancel();throw e;}return '局部点阵已调整；细节保护已生效，可撤销';}
 case 'add_asset': if(!h.assets.some(a=>a.id===p.id))throw Error('素材不存在');await h.addAsset(p.id,true);return '已加入建筑装配';
 }
 }
 async run(id){const h=this.host,w=this.workspace(),e=$(id);if(!e||e.disabled)throw Error('操作当前不可用：'+id);
 if(id.endsWith('-undo')){await w.undo();return '已撤销';}if(id.endsWith('-redo')){await w.undo(true);return '已重做';}
 if(id==='undo'){await h.undo();return '已撤销';}if(id==='redo'){await h.redo();return '已重做';}
 switch(id){
 case 'breakdown-add-part':e.click();return '已添加分拆组件，可填写备注、保存或归档恢复';
 case 'fit':h.stage.fit();break;
 case 'edit-detail':location.hash='sculpt/'+h.asset.id;break;
 case 'plant-generate':await w.generate();break;
 case 'plant-add':await w.add(1);break;
 case 'plant-scatter':await w.add(Number($('plant-count').value),Number($('plant-radius').value));break;
 case 'plant-view-scene':w.mode='scene';await w.rebuild(true);break;
 case 'region-pick':w.pickPool();break;
 case 'region-generate':await w.generate();break;
 case 'compose-build':await w.generate();break;
 case 'compose-ground':await w.repair('ground');break;
 case 'compose-join':await w.repair('join');break;
 case 'sculpt-lattice':w.showLattice();break;
 case 'sculpt-toggle':w.toggleLattice();break;
 case 'sculpt-repeat':w.randomize(false);break;
 default:throw Error('此动作尚未接入');
 }return '操作已执行，可使用页面原有保存与撤销';
 }
}
