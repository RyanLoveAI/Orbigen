export function validateOperations(operations){
 if(!Array.isArray(operations)||!operations.length||operations.length>40)throw Error('每组搭建操作须为 1–40 项');
 const text=v=>typeof v==='string'&&v.length>0&&v.length<=120;
 const vector=(v,min=-10000)=>Array.isArray(v)&&v.length===3&&v.every(x=>Number.isFinite(x)&&x>=min&&x<=10000);
 for(const o of operations){if(!o||!['add','update','duplicate','remove','fit'].includes(o.kind)||!text(o.id))throw Error('搭建操作或实例 ID 无效');
 const allowed={add:['kind','id','assetId','name','position','rotation','scale'],update:['kind','id','name','position','rotation','scale'],duplicate:['kind','id','sourceId','name','position','rotation','scale'],remove:['kind','id'],fit:['kind','id','assetId','name','pixels','depth','thickness']}[o.kind];if(Object.keys(o).some(k=>!allowed.includes(k)))throw Error('搭建操作包含未知字段');
 if(o.name!=null&&!text(o.name)||o.assetId!=null&&!text(o.assetId)||o.sourceId!=null&&!text(o.sourceId))throw Error('素材或名称无效');
 for(const k of ['position','rotation','scale'])if(o[k]!=null&&!vector(o[k],k==='scale'?.00001:-10000))throw Error('搭建变换超出范围');
 if(o.kind==='add'&&(!text(o.assetId)||!vector(o.position)||!vector(o.rotation)||!vector(o.scale,.00001)))throw Error('新增组件需提供素材及完整变换');
 if(o.kind==='update'&&!['name','position','rotation','scale'].some(k=>o[k]!=null))throw Error('缺少组件调整');
 if(o.kind==='duplicate'&&!text(o.sourceId))throw Error('缺少复制来源');
 if(o.kind==='fit'&&(!text(o.assetId)||!Array.isArray(o.pixels)||o.pixels.length!==2||o.pixels.some(v=>!Array.isArray(v)||v.length!==2||v.some(x=>!Number.isFinite(x)||x<0||x>1))||!vector(o.thickness,.00001)||!Number.isFinite(o.depth)||Math.abs(o.depth)>500))throw Error('图像端点、厚度或深度无效');
 }
 return operations;
}
