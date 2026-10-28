import {validateReview} from './review-schema.js';
import {validateAlignment} from './reference-schema.js';
import {timberInstances} from './timber.js';
import {ASSET_CATEGORIES} from '../asset-folder/classify.js';
import {validPolygon} from './selection.js';
import {validateSources} from '../region/schema.js';
export const ROLES={rock:{name:'围岩 / 岩石',category:'石作',words:/岩|岩壁|石头|石块|rock|cliff|boulder/i,labels:/^rocks?$|cliff|boulder|canyon|mountain|cave|stone_wall/i},stairs:{name:'台阶',category:'石作',words:/阶|stairs|steps/i,labels:/stair|steps/i},door:{name:'门框 / 门',category:'门窗',words:/门|door|gate/i,labels:/(^|_)(door|gate|entrance)(_|$)/i},roof:{name:'屋顶',category:'屋面',words:/屋顶|屋面|瓦顶|瓦片|筒瓦|板瓦|roof/i,labels:/roof|tile_roof/i},base:{name:'台基 / 平台',category:'石作',words:/台基|石基|平台|base|platform/i,labels:/patio|terrace|platform/i},vegetation:{name:'树木 / 花草',category:'植被',words:/树|草|花|藤|植被|tree|grass|plant|vine/i,labels:/tree|forest|woodland|plant|flower|grass|vegetation|jungle|moss|fern/i},timber:{name:'木构 / 梁柱',category:'木作',words:/立柱|木柱|木梁|檐枋|椽|斜撑|托木|承托|封檐|木构|timber|beam|rafter/i,labels:/timber|wooden_structure|rafter|beam/i},building:{name:'建筑主体',category:'其他',words:/主体|建筑|祠|房|building|house|temple/i,labels:/building|house|temple|shrine|architecture|pagoda/i},other:{name:'其他构件',category:'其他',words:/$^/,labels:/$^/}};
const num=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
const str=(v,max=120)=>typeof v==='string'&&v.length<=max;
export function validRect(r){return Array.isArray(r)&&r.length===4&&r.every(n=>num(n,0,1))&&r[2]>=.005&&r[3]>=.005&&r[0]+r[2]<=1.000001&&r[1]+r[3]<=1.000001;}
export function config(input={}){const r={span:12,height:8,depth:8,layout:'image',slope:14,rafters:11,tileColumns:12,tileRows:4,...input};if(!['image','timber'].includes(r.layout)||!num(r.slope,0,30)||!Number.isInteger(r.rafters)||!num(r.rafters,2,20)||!Number.isInteger(r.tileColumns)||!num(r.tileColumns,2,16)||!Number.isInteger(r.tileRows)||!num(r.tileRows,1,5))throw Error('木构布局、坡度或排列数量无效');if(['span','height','depth'].some(k=>!num(r[k],.1,500)))throw Error('组建宽、高、深须为 0.1–500 m');return r;}
export function rankCandidates(role,assets,preferred=[]){const r=ROLES[role];if(!r)throw Error('素材类型无效');return assets.filter(a=>!a.deletedAt).map(a=>{const text=[a.name,...(a.tags||[])].join(' '),word=r.words.test(text),category=a.category===r.category;const linked=preferred.indexOf(a.id);let score=linked>=0?100:word?90:category?45:0;if(linked<0&&role==='rock'&&/阶|石基|台基|盘|柱/.test(text)&&!word)score=0;if(linked<0&&role==='roof'&&!word&&!category)score=0;return {assetId:a.id,score,reason:linked>=0?'此分拆生成入库':word?'名称 / 标签匹配':category?'素材分类匹配':'人工选择'};}).filter(a=>a.score>0).sort((a,b)=>b.score-a.score||(preferred.indexOf(a.assetId)-preferred.indexOf(b.assetId))||a.assetId.localeCompare(b.assetId));}
export function breakdownRole(part){const text=part.name+' '+(part.category||'');return Object.keys(ROLES).find(k=>k!=='other'&&k!=='building'&&ROLES[k].words.test(text))||'other';}
export function linkedParts(project,assets){
 const parts=project.parts.filter(p=>!p.archived&&!p.deletedAt);if(parts.length>40)throw Error('分拆组件超过40项，请先归档不用的组件');
 return parts.map(part=>{const role=breakdownRole(part),preferred=part.generation?.assetId,available=assets.some(a=>a.id===preferred&&!a.deletedAt),placed=validRect(part.rect);return {id:'linked-'+part.id,category:available?assets.find(a=>a.id===preferred).category:part.category,name:part.name,breakdownPartId:part.id,preferredAssetId:preferred||null,needsPlacement:!placed,role,rect:placed?part.rect.slice():[0,0,1,1],depth:0,elevation:0,count:1,status:'pending',assetId:available?preferred:null,confidence:0,evidence:'分拆组件：'+part.name+(placed?'；沿用分拆范围':'；尚未定位，请放大圈选校正'),candidates:rankCandidates(role,assets,preferred?[preferred]:[]).slice(0,8)};});
}
export function prioritizeParts(parts,breakdown,assets){return parts.map(p=>({...p,candidates:rankCandidates(p.role,assets,breakdown?.parts.filter(b=>!b.archived&&!b.deletedAt&&breakdownRole(b)===p.role).map(b=>b.generation?.assetId).filter(Boolean)||[]).slice(0,8)}));}
export function suggestParts(analysis,assets,roi=[0,0,1,1]){
 if(!validRect(roi)||!Array.isArray(analysis?.blocks))throw Error('参考图分析结果无效');
 const suggestions=[];
 for(const [role,r] of Object.entries(ROLES)){if(role==='other')continue;const hits=analysis.blocks.map(b=>({rect:b.rect,labels:b.labels.filter(l=>r.labels.test(l.label)),score:Math.max(0,...b.labels.filter(l=>r.labels.test(l.label)).map(l=>l.confidence))})).filter(b=>b.score>=.025&&validRect(b.rect)).sort((a,b)=>b.score-a.score);
  if(!hits.length)continue;
  const hit=hits[0];suggestions.push({id:'part-'+role,role,rect:hit.rect.slice(),depth:0,elevation:role==='roof'?2.5:0,count:1,status:'pending',assetId:null,confidence:hit.score,evidence:hit.labels.map(l=>l.label).join(', ').slice(0,400),candidates:rankCandidates(role,assets).slice(0,8)});
 }
 return suggestions;
}
export function validateCompose(p){
 config(p.config);validateSources(p.sources);
 if(p.reference!==null){const r=p.reference;if(!r||!/^([a-f0-9]{64})$/.test(r.sha)||r.url!=='/references/'+r.sha+'.png'||!str(r.name)||!Number.isInteger(r.width)||!Number.isInteger(r.height)||!num(r.width,1,4096)||!num(r.height,1,4096))throw Error('参考图记录无效');}
 if(!validRect(p.roi)||p.roiPolygon!=null&&!validPolygon(p.roiPolygon,p.roi))throw Error('目标区域无效');
 if(p.breakdown!=null&&(!str(p.breakdown.projectId)||!p.breakdown.projectId||!str(p.breakdown.name)||!Number.isInteger(p.breakdown.revision)||p.breakdown.revision<0))throw Error('分拆关联无效');
 if(!Array.isArray(p.parts)||p.parts.length>40||!Array.isArray(p.instances)||p.instances.length>200||!Array.isArray(p.marks)||p.marks.length>200)throw Error('组建构件或标注数量超限');
 const sources=new Map(p.sources.map(s=>[s.id,s])),ids=new Set(),parts=new Set();
 for(const s of p.parts){if(!str(s.id)||!s.id||parts.has(s.id)||!ROLES[s.role]||!validRect(s.rect)||!num(s.depth,-500,500)||!num(s.elevation,-500,500)||!Number.isInteger(s.count)||!num(s.count,1,40)||!['pending','confirmed','missing','excluded'].includes(s.status)||!num(s.confidence,0,1)||!str(s.evidence,400)||!Array.isArray(s.candidates)||s.candidates.length>100)throw Error('构件类型、框选范围或确认状态无效');if(s.category!=null&&!ASSET_CATEGORIES.includes(s.category))throw Error('素材分类无效');if(s.name!=null&&!str(s.name)||s.breakdownPartId!=null&&!str(s.breakdownPartId)||s.preferredAssetId!=null&&!str(s.preferredAssetId)||s.needsPlacement!=null&&typeof s.needsPlacement!=='boolean'||s.polygon!=null&&!validPolygon(s.polygon,s.rect))throw Error('分拆构件或圈选无效');if(s.status==='confirmed'&&s.needsPlacement)throw Error('请先定位分拆构件范围');parts.add(s.id);if(s.assetId!==null&&(!str(s.assetId)||!s.assetId))throw Error('素材选择无效');if(s.status==='confirmed'&&!sources.has(s.assetId))throw Error('确认的素材未冻结版本');for(const c of s.candidates)if(!str(c.assetId)||!num(c.score,0,100)||!str(c.reason))throw Error('候选匹配记录无效');}
 for(const s of p.sources)if(s.geometry&&(!/^[a-f0-9]{64}$/.test(s.geometry.sha)||!Number.isInteger(s.geometry.triangles)||!num(s.geometry.triangles,1,35000)||!Array.isArray(s.geometry.dimensions)||s.geometry.dimensions.length!==3||s.geometry.dimensions.some(n=>!num(n,.00001,1e6))))throw Error('组建轻量网格无效');
 let triangles=0;
 for(const i of p.instances){const s=sources.get(i.assetId);if(!s||!str(i.id)||!i.id||ids.has(i.id)||!parts.has(i.partId)||i.version!==s.version||i.unitScale!==s.unitScale||!str(i.name,180)||typeof i.locked!=='boolean')throw Error('组建实例或素材引用无效');ids.add(i.id);if(i.geometry&&JSON.stringify(i.geometry)!==JSON.stringify(s.geometry))throw Error('实例组建网格不匹配');triangles+=i.geometry?.triangles??s.triangles;for(const key of ['position','rotation','scale'])if(!Array.isArray(i[key])||i[key].length!==3||i[key].some(n=>!num(n,key==='scale'?.00001:-1e6,1e6)))throw Error('实例变换无效');}
 if(triangles>6000000)throw Error('组建超过 600 万三角面，请减少构件');
 const marks=new Set();for(const m of p.marks){if(!str(m.id)||!m.id||marks.has(m.id)||!ids.has(m.instanceId)||!['ground','join','replace','shape','other'].includes(m.kind)||!str(m.note,1000)||!['open','repaired'].includes(m.state)||!Array.isArray(m.local)||m.local.length!==3||m.local.some(n=>!num(n,-1e6,1e6))||!str(m.action,180))throw Error('瑕疵标注无效');marks.add(m.id);}
 if(p.analysis!==null){if(!p.analysis||!str(p.analysis.engine)||!Array.isArray(p.analysis.blocks)||p.analysis.blocks.length>20)throw Error('识图记录无效');for(const b of p.analysis.blocks){if(!validRect(b.rect)||!Array.isArray(b.labels)||b.labels.length>30||b.labels.some(l=>!str(l.label)||!num(l.confidence,0,1)))throw Error('识图标签无效');}}
 return {review:validateReview(p.review),alignment:validateAlignment(p.alignment,p),reference:p.reference,breakdown:p.breakdown??null,roiPolygon:p.roiPolygon??null,roi:p.roi,config:config(p.config),parts:p.parts,sources:p.sources,instances:p.instances,marks:p.marks,analysis:p.analysis};
}
export function assemble(p){
 validateCompose(p);if(!p.reference)throw Error('请先导入渲染图');
 const included=p.parts.filter(s=>s.status==='confirmed');if(!included.length)throw Error('至少确认一种素材');
 if(config(p.config).layout==='timber'){const next={...structuredClone(p),instances:timberInstances(p),marks:[]};validateCompose(next);return next;}
 const cfg=config(p.config),sources=new Map(p.sources.map(s=>[s.id,s])),instances=[];
 for(const part of included){const s=sources.get(part.assetId),[rx,ry,rw,rh]=p.roi;const x=Math.max(rx,part.rect[0]),y=Math.max(ry,part.rect[1]),w=part.rect[0]>=rx&&part.rect[0]+part.rect[2]<=rx+rw?part.rect[2]:Math.min(rx+rw,part.rect[0]+part.rect[2])-x,h=part.rect[1]>=ry&&part.rect[1]+part.rect[3]<=ry+rh?part.rect[3]:Math.min(ry+rh,part.rect[1]+part.rect[3])-y;if(w<=0||h<=0)throw Error('目标范围未包含已确认组件：'+(part.name||ROLES[part.role].name)+'，请重新圈选整个搭建区域或选择木构入口布局');
  const targetW=w/rw*cfg.span,targetH=h/rh*cfg.height;
  const scale=Math.max(.0001,Math.min(targetW/Math.max(s.dimensions[0],.001),targetH/Math.max(s.dimensions[1],.001),cfg.depth/Math.max(s.dimensions[2],.001)));
  for(let n=0;n<part.count;n++){const offset=(n-(part.count-1)/2)*s.dimensions[0]*scale;instances.push({id:part.id+'-'+n,partId:part.id,name:((part.name||ROLES[part.role].name)+' · '+s.name).slice(0,180),assetId:s.id,version:s.version,unitScale:s.unitScale,position:[((x+w/2-rx)/rw-.5)*cfg.span+offset,part.elevation,((y+h-ry)/rh-.5)*cfg.depth+part.depth],rotation:[0,0,0],scale:[scale,scale,scale],locked:false});}
 }
 const next={...structuredClone(p),instances,marks:[]};validateCompose(next);return next;
}
export function applyRepair(p,markId,delta,action){const next=structuredClone(p),m=next.marks.find(m=>m.id===markId),i=m&&next.instances.find(i=>i.id===m.instanceId);if(!i||m.state!=='open')throw Error('请选中尚未维修的标注');if(!Array.isArray(delta)||delta.length!==3||delta.some(n=>!num(n,-1e6,1e6)))throw Error('维修位移无效');i.position=i.position.map((n,k)=>n+delta[k]);m.state='repaired';m.action=action;validateCompose(next);return next;}
