export const TREE_PRESETS = {
  OLD_PINE: '弯干层冠松', UPRIGHT_PINE: '直干松', WINDSWEPT_PINE: '迎风松', CAMPHOR: '香樟 / 圆冠阔叶',
  WILLOW: '垂柳', GINKGO: '银杏', MAPLE: '枫树', CUSTOM: '自定义树木',
};
export const QUALITY = {
  PREVIEW: { name: '快速预览', needles: 12, sides: 6, shoots: 2, fans: 5, density: .7, budget: 300000 },
  STANDARD: { name: '标准模型', needles: 20, sides: 8, shoots: 3, fans: 7, density: 1, budget: 900000 },
  FINE: { name: '精细源模型', needles: 28, sides: 12, shoots: 4, fans: 10, density: 1.2, budget: 2200000 },
};
export const LEAF_KINDS={NEEDLE:'实体针叶束',CAMPHOR:'香樟叶片与贴图',OVAL:'椭圆阔叶',LANCE:'柳叶 / 披针形',FAN:'银杏扇叶',LOBED:'掌状裂叶',CUSTOM:'导入 OBJ 叶片'};
export const CROWN_FORMS={LAYERED:'横展层冠',ROUND:'自然圆冠',WEEPING:'垂枝树冠',COLUMN:'塔形树冠',OPEN:'疏展树冠'};
export const TIER_LIMITS={height:[0,1],spread:[.05,.65],yaw:[-180,180],rise:[-.6,.35],radius:[.1,2]};
export const LIMITS = { height: [1,30], crown: [.3,1.5], radius: [.01,.12], density: [.05,3], leafSize: [.02,1.5], needleWidth: [.004,.025], roughness: [0,.06], seed: [1,2147483646] };
export function normalizeTreeRecipe(input){
  const r=structuredClone(input),pine=['OLD_PINE','UPRIGHT_PINE','WINDSWEPT_PINE'].includes(r.preset);
  r.leaf??={kind:pine?'NEEDLE':r.preset==='CAMPHOR'?'CAMPHOR':'OVAL',aspect:.46,bend:.12,curl:.08,petiole:.025,arrangement:pine?'WHORLED':'ALTERNATE',droop:.18,mesh:null};
  r.branch??={form:pine?'LAYERED':'ROUND',arms:pine?3:5,fans:5,shoots:2,twist:137.5,variation:.15,droop:0,leafStart:.24,roots:8};
  r.rootCount??=r.branch.roots??8;r.version=2;return r;
}
export function treeRecipe(preset='OLD_PINE') {
  if (!TREE_PRESETS[preset]) throw Error('未知树木样式');
  const straight=preset==='UPRIGHT_PINE'||preset==='GINKGO', wind=preset==='WINDSWEPT_PINE', broad=!preset.includes('PINE');
  const r={ version:2,preset,seed:202610085,height:11,crown: .9,radius:.035,density:1,leafSize:broad?.12:.48,needleWidth:.010,roughness:.025,barkColor:'#594638',leafColor:'#315139',
    trunk:[[0,0,0],[-.022,.10,0],[.01,.22,.008],[.05,.42,0],[.062,.64,.006],[wind?.27:.105,.83,0],[wind?.4:.16,1,0]].map(([x,y,z])=>[straight?x*.08:x,y,z]),
    tiers:Array.from({length:6},(_,i)=>({id:'tier-'+i,height:.30+i*.123,spread:broad?.26:.42-i*.044,yaw:i%2?12:-8,rise:.035+i*.005,radius:1-i*.11,enabled:true})) };
  const n=normalizeTreeRecipe(r);
  if(broad)n.branch.form=preset==='WILLOW'?'WEEPING':preset==='GINKGO'?'COLUMN':preset==='MAPLE'?'OPEN':'ROUND';
  if(preset==='WILLOW'){Object.assign(n.leaf,{kind:'LANCE',aspect:.13,droop:.65});n.branch.droop=.22;n.leafSize=.15;n.tiers.forEach(t=>{t.height=.45+(Number(t.id.slice(5)))*.085;t.rise=-.10;});}
  if(preset==='GINKGO'){Object.assign(n.leaf,{kind:'FAN',aspect:1,arrangement:'CLUSTERED'});n.branch.arms=4;n.leafSize=.14;}
  if(preset==='MAPLE'){Object.assign(n.leaf,{kind:'LOBED',aspect:.95,arrangement:'OPPOSITE'});n.leafSize=.16;n.tiers.forEach(t=>t.spread=.32);}
  return n;
}
export function validateTreeRecipe(r) {
  if(!r||![1,2].includes(r.version)||!TREE_PRESETS[r.preset])throw Error('树木配方版本或样式无效');
  for(const [key,[lo,hi]] of Object.entries(LIMITS))if(!Number.isFinite(r[key])||r[key]<lo||r[key]>hi||key==='seed'&&!Number.isInteger(r[key]))throw Error('树木参数无效：'+key);
  for(const key of ['barkColor','leafColor'])if(!/^#[\da-f]{6}$/i.test(r[key]))throw Error('颜色格式无效');
  if(!Array.isArray(r.trunk)||r.trunk.length<4||r.trunk.length>16)throw Error('树干需要 4–16 个控制点');
  r.trunk.forEach((p,i)=>{if(!Array.isArray(p)||p.length!==3||p.some(n=>!Number.isFinite(n))||Math.abs(p[0])>.8||Math.abs(p[2])>.8||p[1]<0||p[1]>1||i&&p[1]<=r.trunk[i-1][1])throw Error('树干控制点需从地面到顶部按高度递增');});
  if(r.trunk[0].some(n=>n!==0)||r.trunk.at(-1)[1]!==1)throw Error('树干根点固定为原点，顶点高度为 1');
  if(!Array.isArray(r.tiers)||r.tiers.length<1||r.tiers.length>10)throw Error('枝层数量须为 1–10');
  const ids=new Set();for(const t of r.tiers){if(typeof t.id!=='string'||t.id.length>60||ids.has(t.id)||typeof t.enabled!=='boolean')throw Error('枝层标识无效');ids.add(t.id);for(const [key,[lo,hi]] of Object.entries(TIER_LIMITS))if(!Number.isFinite(t[key])||t[key]<lo||t[key]>hi)throw Error(`枝层参数 ${key} 须在 ${lo}–${hi} 之间`);}
  const n=normalizeTreeRecipe(r),l=n.leaf,b=n.branch;
  if(!LEAF_KINDS[l.kind]||!['ALTERNATE','OPPOSITE','WHORLED','CLUSTERED'].includes(l.arrangement)||!CROWN_FORMS[b.form])throw Error('叶型、叶序或树冠规则无效');
  for(const [key,lo,hi] of [['aspect',.04,1.5],['bend',-.5,.5],['curl',0,.5],['petiole',0,.3],['droop',0,1]])if(!Number.isFinite(l[key])||l[key]<lo||l[key]>hi)throw Error('叶片参数无效：'+key);
  if(!Number.isInteger(n.rootCount)||n.rootCount<0||n.rootCount>12)throw Error('根盘数量须为 0–12');
  for(const [key,lo,hi] of [['arms',1,10],['fans',1,10],['shoots',1,5],['twist',0,180],['variation',0,.6],['droop',0,.5],['leafStart',0,.95],['roots',0,12]])if(!Number.isFinite(b[key])||b[key]<lo||b[key]>hi||['arms','fans','shoots','roots'].includes(key)&&!Number.isInteger(b[key]))throw Error('枝条参数无效：'+key);
  if(l.kind==='CUSTOM')validateLeafMesh(l.mesh);
  return r;
}
export function validateLeafMesh(m){
  if(!m||!Array.isArray(m.position)||m.position.length<9||m.position.length>30000||m.position.length%3||m.position.some(v=>!Number.isFinite(v)||Math.abs(v)>100))throw Error('叶片网格须为有限坐标，最多 10000 顶点');
  const count=m.position.length/3;
  if(!Array.isArray(m.index)||m.index.length<3||m.index.length>60000||m.index.length%3||m.index.some(v=>!Number.isInteger(v)||v<0||v>=count))throw Error('叶片网格三角面索引无效');
  if(!Array.isArray(m.uv)||m.uv.length!==count*2||m.uv.some(v=>!Number.isFinite(v)))throw Error('叶片网格 UV 无效');
  if(m.normal&&(!Array.isArray(m.normal)||m.normal.length!==m.position.length||m.normal.some(v=>!Number.isFinite(v))))throw Error('叶片网格法线无效');
  const y=m.position.filter((_,i)=>i%3===1);if(Math.max(...y)-Math.min(...y)<1e-6)throw Error('叶片生长轴须有长度，请选择正确的导入轴');
  return m;
}
export const COMPONENT_KEYS={LEAF:['leaf','leafSize','needleWidth','leafColor'],TRUNK:['trunk','height','radius','roughness','barkColor','rootCount'],BRANCH:['branch','tiers','crown','density']};
export function componentFromRecipe(recipe,kind,name){
  const r=normalizeTreeRecipe(recipe);validateTreeRecipe(r);if(!COMPONENT_KEYS[kind])throw Error('组件类型无效');
  return {format:'OrbigenTreeComponent',version:1,kind,name,recipe:Object.fromEntries(COMPONENT_KEYS[kind].map(k=>[k,r[k]]))};
}
export function applyTreeComponent(recipe,component){
  if(component?.format!=='OrbigenTreeComponent'||component.version!==1||!COMPONENT_KEYS[component.kind]||typeof component.name!=='string'||!component.name.trim()||component.name.length>120)throw Error('树木组件格式无效');
  const r=normalizeTreeRecipe(recipe);for(const key of COMPONENT_KEYS[component.kind]){if(component.recipe?.[key]===undefined)throw Error('组件缺少参数：'+key);r[key]=structuredClone(component.recipe[key]);}validateTreeRecipe(r);return r;
}
export function validateTreeProject(p) {
  validateTreeRecipe(p.recipe);
  if(typeof p.name!=='string'||!p.name.trim()||p.name.length>120)throw Error('树木工程名称无效');
  if(p.reference!==null){const x=p.reference;if(!x||!/^([a-f0-9]{64})$/.test(x.sha)||x.url!=='/references/'+x.sha+'.png'||typeof x.name!=='string'||x.name.length>120)throw Error('树木参考图无效');}
  if(typeof p.notes!=='string'||p.notes.length>4000)throw Error('参考特征记录最多 4000 字');
  return {recipe:structuredClone(p.recipe),reference:p.reference?{sha:p.reference.sha,url:p.reference.url,name:p.reference.name}:null,notes:p.notes};
}
