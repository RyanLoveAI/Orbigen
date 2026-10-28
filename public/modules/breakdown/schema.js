import {ASSET_CATEGORIES} from '../asset-folder/classify.js';
import {validRect} from '../compose/schema.js';
export const VIEWS=[['front','正面'],['left','左面'],['back','背面'],['right','右面']];
export const STATES={pending:'分拆中',views:'四视图就绪',submitted:'已提交 Tripo',done:'已生成'};
export const partState=part=>part.generation?.status==='success'?'done':part.state;
export const viewIssues=part=>{const missing=VIEWS.filter(([key])=>!part.views?.[key]).map(([,name])=>name),sha=VIEWS.map(([key])=>part.views?.[key]?.sha).filter(Boolean);return [...(missing.length?['缺少'+missing.join('、')]:[]),...(new Set(sha).size!==sha.length?['存在重复视图，请分别上传四个方向']:[])];};
export const readyParts=project=>project.parts.filter(p=>!p.archived&&!p.deletedAt&&!viewIssues(p).length);
export function viewKey(name){const stem=name.replace(/\.[^.]+$/,'').toLowerCase().normalize('NFKC');return VIEWS.map(([k])=>k).find((key,i)=>[key,...[['frontview','前','正面','前视图'],['leftview','左','左面','左视图'],['rear','backview','后','背面','后视图'],['rightview','右','右面','右视图']][i]].some(word=>new RegExp('(^|[_. \\-0-9])'+word+'($|[_. \\-0-9])').test(stem)));}
const text=(value,max)=>typeof value==='string'&&value.length<=max;
export function validateBreakdown(p){
 if(!p||!text(p.name,120)||!p.name.trim()||!Number.isInteger(p.order)||p.order<0||p.order>10000||typeof p.archived!=='boolean'||!Array.isArray(p.parts)||p.parts.length>200)throw Error('分拆记录格式无效，每张图最多200件组件');
 const ids=new Set();for(const part of p.parts){
  if(!text(part.id,80)||!/^[a-zA-Z0-9-]+$/.test(part.id)||ids.has(part.id)||!text(part.name,120)||!part.name.trim()||!ASSET_CATEGORIES.includes(part.category)||!Object.hasOwn(STATES,part.state)||!text(part.notes,4000)||!text(part.prompt,4000)||!text(part.tripoTask,200)||typeof part.archived!=='boolean'||part.rect!==null&&!validRect(part.rect)||!part.views||typeof part.views!=='object'||Array.isArray(part.views)||Object.keys(part.views).some(k=>!VIEWS.some(([key])=>key===k)))throw Error('分拆组件格式无效');
  ids.add(part.id);
  if(part.deletedAt!==undefined&&(typeof part.deletedAt!=='string'||!Number.isFinite(Date.parse(part.deletedAt))))throw Error('组件删除时间无效');
  if(part.state==='views'&&viewIssues(part).length)throw Error('四视图尚未完整或存在重复图片');
 }
 return p;
}
export const newPart=(name='新组件',category='其他')=>({id:crypto.randomUUID(),name,category,state:'pending',notes:'',prompt:'',tripoTask:'',rect:null,views:{},archived:false});
