import {REVIEWED_ASSETS} from './reviewed-assets.js';
export const ASSET_CATEGORIES=['木作','石作','屋面','门窗','雕饰','植被','山体','兽类','武器','其他'];
// Specific object roles precede their contents (a weapon rack is furniture).
// Folder hints are restricted to explicit taxonomy folders: terrain and
// mountain_garden describe context, not the object's category.
const rules=[
 ['其他','建筑组合',/reference architecture|joinery scene|authored scene|整景|场景组合/],
 ['木作','家具',/药柜|书架|木桌|木凳|木床|储物架|工具架|武器架|采药篮|\b(?:rack|shelf(?! fungus)|cabinet|table|desk|bench|stool|bed|basket|scaffold|screen)\b/],
 ['木作','木构件',/木作|木柱|木梁|木板|木平台|木地板|栏杆|\b(?:wood|wooden|timber|plank|beam|railing|joinery)\b/],
 ['门窗','门框',/门框|\b(?:door|gate) frame\b/],
 ['门窗','门窗',/门|窗|\b(?:door|window|gate)\b/],
 ['屋面','屋顶',/屋顶|屋面|瓦顶|瓦片|\b(?:roof|rooftop)\b/],
 ['植被','药草',/药草|草药|幼苗|\b(?:herb|crop|seedling)\b/],
 ['植被','菌类',/蘑菇|菌类|层状菌|\b(?:mushroom|fungus|fungi)\b/],
 ['植被','树木',/树|松柏|竹|\b(?:tree|pine|oak|birch|palm|bamboo|stump|log|roots?)\b/],
 ['植被','花卉',/花卉|花朵|花束|花草|玫瑰|茉莉|\b(?:flower|rose|jasmine)\b/],
 ['植被','草丛',/草丛|草地|\b(?:grass|meadow|reed|cattail)\b/],
 ['植被','灌木',/灌木|\b(?:bush|shrub)\b/],
 ['植被','藤蔓',/藤|\b(?:vine|ivy)\b/],
 ['植被','植被',/植被|植物|蕨|苔藓|落叶|\b(?:vegetation|plant|foliage|fern|moss|leaf litter|pine needle|branches|twig)\b/],
 ['武器','武器',/武器|兵器|刀|剑|弓|枪|斧|\b(?:weapon|sword|dagger|bow|spear|rifle|axe)\b/],
 ['兽类','兽类',/兽|动物|鹿|狼|虎|熊|鸟|马匹|骏马|\b(?:animal|creature|deer|wolf|tiger|bear|horse|bird)\b/],
 ['其他','人物',/人物|角色模型|\b(?:human|character|person|humanoid)\b/],
 ['山体','山体',/山体|山峰|山脉|\b(?:mountain|peak|mountain range)\b/],
 ['石作','岩石',/岩|石头|石块|碎石|\b(?:rock|boulder|cliff|gravel|ore outcrop|stalactite|stalagmite)\b/],
 ['石作','台阶',/石阶|台阶|\b(?:stairs|steps|stair)\b/],
 ['石作','台基',/石基|台基|石台|\b(?:platform|foundation|plinth)\b/],
 ['石作','石作',/石作|石柱|石盘|\b(?:stone|masonry)\b/],
 ['其他','地面',/泥土|沙地|地面|\b(?:terrain|ground|dirt|earth|sand|path|floor)\b/],
 ['雕饰','雕饰',/雕饰|雕刻|雕像|祭器|香案|祭台|\b(?:ornament|statue|sculpture|carving|altar)\b/],
 ['其他','灯具',/灯具|油灯|火把|\b(?:lamp|lantern|torch|brazier)\b/],
 ['其他','设备',/炼丹炉|\b(?:furnace|bellows|retort|chimney|scale)\b/],
 ['其他','容器',/陶器|容器|\b(?:ceramic|pot|jar|bucket|box|bin)\b/],
 ['其他','建筑主体',/建筑|主体|祠|房屋|\b(?:building|house|temple|shrine)\b/]
];
const folderHints={木作:['木作','木构件'],石作:['石作','石作'],屋面:['屋面','屋顶'],门窗:['门窗','门窗'],雕饰:['雕饰','雕饰'],植被:['植被','植被'],树木:['植被','树木'],花卉:['植被','花卉'],草地:['植被','草地'],山体:['山体','山体'],兽类:['兽类','兽类'],武器:['武器','武器'],stone:['石作','石作'],tree_asset:['植被','树木'],grass_asset:['植被','草地']};
const normalize=text=>String(text).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').toLowerCase();
const domain=c=>c==='植被'?'植被':c==='山体'?'场景':c==='兽类'?'兽类':c==='武器'?'武器':c==='其他'?'通用组件':'建筑';
const cleanTags=tags=>[...new Set(tags.filter(t=>typeof t==='string').map(t=>t.trim()).filter(Boolean))].slice(0,20).map(t=>t.slice(0,60));
export function classifyAsset(relative,format,names=[],meta={},sha='') {
 const parts=relative.replaceAll('\\','/').split('/'),stem=(parts.pop()||'').replace(/\.[^.]+$/,'');
 const explicit=ASSET_CATEGORIES.includes(meta.category),review=REVIEWED_ASSETS[sha];
 const filenameHits=rules.filter(([, ,pattern])=>pattern.test(normalize(stem))).map(([category,tag])=>({category,tag,source:'文件名'}));
 const folderHits=parts.toReversed().filter(p=>Object.hasOwn(folderHints,p)).map(p=>({category:folderHints[p][0],tag:folderHints[p][1],source:'分类目录'}));
 const internalHits=rules.filter(([, ,pattern])=>pattern.test(normalize(names.join(' ').slice(0,12000)))).map(([category,tag])=>({category,tag,source:'模型 / 材质名称'}));
 const hits=[...filenameHits,...folderHits,...internalHits];
 const category=explicit?meta.category:review?.category||hits[0]?.category||'其他';
 const visual=review&&(!explicit||category===review.category),selected=hits.filter(h=>h.category===category);
 const tags=cleanTags([...(meta.tags||[]),domain(category),...(visual?review.tags:selected.map(h=>h.tag)),format.toUpperCase(),'本地素材']);
 const recognition=explicit?{method:'素材说明文件',basis:'素材说明文件',needsReview:false}:visual?{
  method:'模型双角度视觉核对',basis:`实际模型双角度预览 · ${review.sheet} 第 ${review.cell} 格`,confidence:review.confidence,reviewedAt:review.reviewedAt,needsReview:review.confidence!=='高',visualIssues:review.tags.filter(t=>/待检查|待核对/.test(t))
 }:{method:'本地名称规则',basis:selected[0]?.source||'未识别',needsReview:!selected.length};
 if(recognition.needsReview&&!visual&&!explicit)tags.unshift('待分类');
 return {name:String(meta.name||stem).slice(0,120),category,tags:cleanTags(tags),recognition};
}
