const text=v=>typeof v==='string'&&v.length>0&&v.length<=120;
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=10000);
export function validateBlenderOperations(operations){
 if(!Array.isArray(operations)||!operations.length||operations.length>40)throw Error('Blender 每组支持 1–40 项操作');
 for(const o of operations){
  const keys={add_asset:['kind','id','assetId','position','rotation','scale'],transform:['kind','id','position','rotation','scale'],duplicate:['kind','id','sourceId','offset'],remove:['kind','id'],array:['kind','id','sourceId','count','offset'],deform:['kind','id','mode','axis','amount'],bevel:['kind','id','width','segments'],mesh:['kind','id','vertices','faces','materialFrom']}[o?.kind];
  if(!keys||Object.keys(o).some(k=>!keys.includes(k))||!text(o.id))throw Error('Blender 操作无效');
  if(o.kind==='transform'){if(!['position','rotation','scale'].some(k=>o[k]!=null))throw Error('缺少变换');for(const k of ['position','rotation','scale'])if(o[k]!=null&&(!vector(o[k])||k==='scale'&&o[k].some(v=>v<=0)))throw Error('Blender 变换无效');}
  if(o.kind==='add_asset'&&(!text(o.assetId)||!vector(o.position)||!vector(o.rotation)||!vector(o.scale)||o.scale.some(v=>v<=0)))throw Error('Blender 素材添加参数无效');
  if(['duplicate','array'].includes(o.kind)&&(!text(o.sourceId)||!vector(o.offset)))throw Error('Blender 复制参数无效');
  if(o.kind==='array'&&(!Number.isInteger(o.count)||o.count<1||o.count>60))throw Error('排列数量须为 1–60');
  if(o.kind==='deform'&&(!['BEND','TWIST','TAPER','STRETCH'].includes(o.mode)||!['X','Y','Z'].includes(o.axis)||!Number.isFinite(o.amount)||Math.abs(o.amount)>6.28))throw Error('Blender 形变参数无效');
  if(o.kind==='bevel'&&(!Number.isFinite(o.width)||o.width<=0||o.width>2||!Number.isInteger(o.segments)||o.segments<1||o.segments>4))throw Error('倒角参数无效');
  if(o.kind==='mesh'&&(!Array.isArray(o.vertices)||o.vertices.length<3||o.vertices.length>2000||o.vertices.some(v=>!vector(v))||!Array.isArray(o.faces)||!o.faces.length||o.faces.length>2000||o.faces.some(f=>!Array.isArray(f)||f.length<3||f.length>8||f.some(i=>!Number.isInteger(i)||i<0||i>=o.vertices.length))||!text(o.materialFrom)))throw Error('新建网格参数无效');
 }
 return operations;
}
