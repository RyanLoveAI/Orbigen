import {validateBlenderOperations} from '../compose/blender-protocol.js';
import {validateOperations} from '../compose/assistant-protocol.js';
// This allowlist is shared by the service and the page adapter. Never execute model text.
export const FIELDS = {
 breakdown: ['breakdown-part-name','breakdown-part-category','breakdown-part-notes','breakdown-part-prompt'], library: ['search'], detail: ['asset-name','asset-category','unit-value'],
 vegetation: ['plant-height','plant-width','plant-density','plant-seed','plant-count','plant-radius'],
 region: ['region-seed','region-width','region-depth','region-count','region-gap','region-minScale','region-maxScale','region-source-count','region-category','region-mode'],
 compose: ['compose-layout','compose-slope','compose-rafters','compose-tileColumns','compose-tileRows','compose-span','compose-height','compose-depth','compose-floor','compose-gap','compose-join-side','compose-note','compose-kind'],
 sculpt: ['sculpt-random-strength','sculpt-random-seed','sculpt-density','sculpt-name'],
 tripo: ['tripo-name','tripo-category','tripo-prompt','tripo-faces'],
 assembly: [], projects: []
};
export const RUNS = {
 breakdown: ['breakdown-add-part'], library: [], detail: ['edit-detail'], assembly: ['fit','undo','redo'],
 vegetation: ['plant-generate','plant-add','plant-scatter','plant-undo','plant-redo','plant-view-scene'],
 region: ['region-pick','region-generate','region-undo','region-redo'],
 compose: ['compose-build','compose-ground','compose-join','compose-undo','compose-redo'],
 sculpt: ['sculpt-lattice','sculpt-toggle','sculpt-repeat','sculpt-undo','sculpt-redo'],
 tripo: [], projects: []
};
export const TYPES = ['fields','run','select','transform','pool','species','node','add_asset','compose_batch','blender_batch'];
export const responseSchema = {type:'object',additionalProperties:false,required:['reply','actions'],properties:{reply:{type:'string'},actions:{type:'array',items:{type:'object',additionalProperties:false,required:['type','label','payload'],properties:{type:{type:'string',enum:TYPES},label:{type:'string'},payload:{type:'string'}}}}}};
const obj = v => v && typeof v==='object' && !Array.isArray(v);
export function validateAction(action, route) {
 if(!obj(action)||!TYPES.includes(action.type)||typeof action.label!=='string'||typeof action.payload!=='string'||action.payload.length>180000)throw Error('助手操作格式无效');
 const p=JSON.parse(action.payload);if(!obj(p))throw Error('操作参数必须是对象');
 const only=keys=>{if(Object.keys(p).some(k=>!keys.includes(k)))throw Error('操作包含未知参数');};
 switch(action.type){
 case 'blender_batch': only(['sessionId','operations']);if(route!=='compose'||typeof p.sessionId!=='string'||!/^[a-f0-9-]{36}$/.test(p.sessionId))throw Error('Blender 会话无效');validateBlenderOperations(p.operations);break;
 case 'compose_batch': only(['operations']);if(route!=='compose')throw Error('此页不能执行搭建事务');validateOperations(p.operations);break;
 case 'fields': only(['values']);if(!obj(p.values)||!Object.keys(p.values).length||Object.keys(p.values).some(k=>!FIELDS[route]?.includes(k))||Object.values(p.values).some(v=>!['string','number'].includes(typeof v)||String(v).length>3000))throw Error('不允许调整这个字段');break;
 case 'run': only(['id']);if(!RUNS[route]?.includes(p.id))throw Error('此操作不支持自动执行');break;
 case 'select': only(['id']);if(!['assembly','vegetation','region','compose'].includes(route)||typeof p.id!=='string')throw Error('此页不能选择实例');break;
 case 'transform': only(['id','position','rotation','scale']);if(!['assembly','vegetation','compose'].includes(route)||typeof p.id!=='string')throw Error('此页不能调整实例');if(!['position','rotation','scale'].some(k=>p[k]))throw Error('缺少变换');for(const k of ['position','rotation','scale'])if(p[k]&&(!Array.isArray(p[k])||p[k].length!==3||p[k].some(v=>!Number.isFinite(v)||Math.abs(v)>10000||(k==='scale'&&v<=0))))throw Error('变换超出范围');break;
 case 'pool': only(['ids']);if(route!=='region'||!Array.isArray(p.ids)||p.ids.length>32||!p.ids.length||p.ids.some(i=>typeof i!=='string'))throw Error('素材池无效');break;
 case 'species': only(['id']);if(route!=='vegetation'||typeof p.id!=='string')throw Error('植物类型无效');break;
 case 'node': only(['index','offset']);if(route!=='sculpt'||!Number.isInteger(p.index)||p.index<0||!Array.isArray(p.offset)||p.offset.length!==3||p.offset.some(v=>!Number.isFinite(v)||Math.abs(v)>10))throw Error('点阵参数无效');break;
 case 'add_asset': only(['id']);if(!['assembly','library','detail'].includes(route)||typeof p.id!=='string')throw Error('此页不能加入装配');break;
 }
 return p;
}
export function validateReply(value, route){if(!obj(value)||typeof value.reply!=='string'||value.reply.length>20000||!Array.isArray(value.actions)||value.actions.length>12)throw Error('Codex 返回格式不符合约定');for(const a of value.actions)validateAction(a,route);return value;}
