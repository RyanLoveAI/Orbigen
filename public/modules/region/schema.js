export const MAX_INSTANCES=200, TRIANGLE_BUDGET=6000000;
export const DEFAULTS={version:1,seed:'石头地-001',width:12,depth:12,count:24,gap:.25,minScale:.35,maxScale:1.1,sourceMode:'manual',sourceCount:3,category:'石作',poolIds:[],selectionSeed:null};
const finite=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
export function recipe(input={}){
 const r={...DEFAULTS,...input,poolIds:[...(input.poolIds||[])]};
 if(r.version!==1||typeof r.seed!=='string'||!r.seed.trim()||r.seed.length>120)throw Error('世界种子须为 1–120 个字符');
 for(const [key,min,max] of [['width',.2,500],['depth',.2,500],['gap',0,50],['minScale',.05,20],['maxScale',.05,20]])if(!finite(r[key],min,max))throw Error('区域宽深、间隔或大小倍率无效');
 if(r.minScale>r.maxScale)throw Error('最小石块倍率不能大于最大倍率');
 if(!Number.isInteger(r.count)||r.count<1||r.count>MAX_INSTANCES)throw Error('铺设数量须为 1–'+MAX_INSTANCES);
 if(!['manual','random'].includes(r.sourceMode)||!Number.isInteger(r.sourceCount)||r.sourceCount<1||r.sourceCount>32)throw Error('选材方式或素材种类数量无效');
 if(typeof r.category!=='string'||r.category.length>30||r.poolIds.length>32||new Set(r.poolIds).size!==r.poolIds.length||r.poolIds.some(id=>typeof id!=='string'||!id||id.length>120))throw Error('最多选择 32 种素材，不能重复');
 if(r.selectionSeed!==null&&(typeof r.selectionSeed!=='string'||r.selectionSeed.length>120))throw Error('素材池种子无效');
 return r;
}
export function hashSeed(text){let h=2166136261;for(const c of String(text)){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return h>>>0;}
export function rng(seed){let state=hashSeed(seed);return()=>{state=(state+0x6d2b79f5)>>>0;let x=state;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return ((x^(x>>>14))>>>0)/4294967296;};}
export function choosePool(config,assets){
 const r=recipe(config),ordered=assets.filter(a=>!a.deletedAt).slice().sort((a,b)=>a.sha<b.sha?-1:a.sha>b.sha?1:0);
 if(r.sourceMode==='manual'||(r.selectionSeed===r.seed&&r.poolIds.length===r.sourceCount)){if(!r.poolIds.length)throw Error('请至少选择一种素材');return r.poolIds.slice().sort().map(id=>{const a=ordered.find(a=>a.id===id);if(!a)throw Error('选中的素材已不存在');return a;});}
 const pool=ordered.filter(a=>r.category==='全部'||a.category===r.category);
 if(pool.length<r.sourceCount)throw Error('当前分类只有 '+pool.length+' 种素材，请减少素材种类数量');
 const random=rng(r.seed+'/sources');for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}return pool.slice(0,r.sourceCount).sort((a,b)=>a.sha<b.sha?-1:1);
}
export function validateSources(sources){
 if(!Array.isArray(sources)||sources.length>32)throw Error('区域素材记录无效');const ids=new Set();
 for(const s of sources){if(typeof s.id!=='string'||!s.id||ids.has(s.id)||!/^([a-f0-9]{64})$/.test(s.sha)||!Number.isInteger(s.version)||s.version<1||!finite(s.unitScale,1e-6,1e6)||typeof s.name!=='string'||s.name.length>120||!Array.isArray(s.dimensions)||s.dimensions.length!==3||s.dimensions.some(x=>!finite(x,0,1e6))||Math.max(...s.dimensions)<=0||!Number.isInteger(s.triangles)||s.triangles<1)throw Error('区域素材尺寸、版本或哈希无效');ids.add(s.id);}
 return sources;
}
export const radius=(source,scale)=>Math.max(.01,Math.hypot(source.dimensions[0],source.dimensions[2])/2)*scale;
export function validateRegion(patch){
 const r=recipe(patch.recipe);validateSources(patch.sources);
 const instances=patch.instances;if(!Array.isArray(instances)||instances.length>MAX_INSTANCES)throw Error('区域实例数量无效');
 const ids=new Set(),sources=new Map(patch.sources.map(s=>[s.id,s]));let triangles=0;
 for(const i of instances){const s=sources.get(i.assetId);if(!s||typeof i.id!=='string'||!i.id||i.id.length>120||ids.has(i.id)||i.version!==s.version||i.unitScale!==s.unitScale||typeof i.name!=='string'||i.name.length>180)throw Error('区域实例引用或 ID 无效');ids.add(i.id);triangles+=s.triangles;
  for(const key of ['position','rotation','scale'])if(!Array.isArray(i[key])||i[key].length!==3||i[key].some(v=>!finite(v,-1e6,1e6)))throw Error('区域变换无效');
  if(i.position[1]!==0||i.rotation[0]!==0||i.rotation[2]!==0||i.scale[0]<=0||i.scale.some(v=>v!==i.scale[0])||i.scale[0]<r.minScale||i.scale[0]>r.maxScale)throw Error('区域石块须落在地面并保持比例');
  const rad=radius(s,i.scale[0]);if(Math.abs(i.position[0])+rad>r.width/2+1e-6||Math.abs(i.position[2])+rad>r.depth/2+1e-6)throw Error('石块超出区域边界');
 }
 if(triangles>TRIANGLE_BUDGET)throw Error('模型总量超过 600 万三角面，请减少铺设数量');
 if(instances.length&&instances.length!==r.count)throw Error('实例数量与世界种子参数不一致');
 for(let a=0;a<instances.length;a++)for(let b=a+1;b<instances.length;b++){const x=instances[a],y=instances[b],distance=Math.hypot(x.position[0]-y.position[0],x.position[2]-y.position[2]);if(distance+1e-6<radius(sources.get(x.assetId),x.scale[0])+radius(sources.get(y.assetId),y.scale[0])+r.gap)throw Error('石块之间的间隔不足');}
 if(instances.length&&(!r.poolIds.length||r.poolIds.length!==sources.size||r.poolIds.some(id=>!sources.has(id))))throw Error('世界种子的素材池不一致');
 return {recipe:r,sources:patch.sources,instances,triangles};
}
export function generateRegion(config,sources){
 const r=recipe(config);validateSources(sources);if(!sources.length)throw Error('请先选好素材');
 const ordered=sources.slice().sort((a,b)=>a.sha<b.sha?-1:1),random=rng(r.seed+'/placement-v1'),items=[];
 // Guarantee every selected source appears, then repeat the pool in shuffled rounds.
 while(items.length<r.count){const round=ordered.slice();for(let j=round.length-1;j>0;j--){const k=Math.floor(random()*(j+1));[round[j],round[k]]=[round[k],round[j]];}for(const source of round){if(items.length===r.count)break;const scale=r.minScale+random()*(r.maxScale-r.minScale);items.push({source,scale,angle:random()*Math.PI*2,index:items.length,rad:radius(source,scale)});}}
 if(r.count<ordered.length)throw Error('铺设数量不能少于选中的素材种类数量');
 if(items.reduce((n,i)=>n+i.source.triangles,0)>TRIANGLE_BUDGET)throw Error('模型总量超过 600 万三角面，请减少铺设数量');
 const placed=[];
 for(const item of items.slice().sort((a,b)=>b.rad-a.rad||a.index-b.index)){
  const w=r.width/2-item.rad,d=r.depth/2-item.rad;if(w<0||d<0)throw Error('有石块大于区域，请增大区域或减小石块倍率');let found=false;
  for(let attempt=0;attempt<1200;attempt++){const x=(random()*2-1)*w,z=(random()*2-1)*d;if(placed.every(p=>Math.hypot(x-p.x,z-p.z)>=item.rad+p.rad+r.gap)){placed.push({...item,x,z});found=true;break;}}
  if(!found)throw Error('当前设置未找到完整布局（'+placed.length+'/'+r.count+'）。请增大区域、减少数量、减小石块或间隔；当前区域已保留。');
 }
 const instances=placed.sort((a,b)=>a.index-b.index).map(i=>({id:'region-'+hashSeed(r.seed).toString(16)+'-'+i.index,name:i.source.name+' '+(i.index+1),assetId:i.source.id,version:i.source.version,unitScale:i.source.unitScale,position:[i.x,0,i.z],rotation:[0,i.angle,0],scale:[i.scale,i.scale,i.scale],locked:true}));
 const result={recipe:{...r,poolIds:ordered.map(s=>s.id),selectionSeed:r.sourceMode==='random'?r.seed:null},sources:ordered,instances};validateRegion(result);return result;
}
