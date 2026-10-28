import * as T from '../../vendor/three/three.module.js';
const rounded=v=>Number(v.toFixed(6));
const values=v=>v.toArray().map(rounded);
export function measureObject(object,{basePosition=false}={}) {
 object.updateWorldMatrix(true,true);
 const box=new T.Box3().setFromObject(object);
 if(box.isEmpty()||!box.min.toArray().concat(box.max.toArray()).every(Number.isFinite))return null;
 if(basePosition&&object.userData.basePosition&&object.parent) {
  const base=object.parent.localToWorld(new T.Vector3(...object.userData.basePosition));
  box.translate(base.sub(object.getWorldPosition(new T.Vector3())));
 }
 return {id:object.userData.instanceId||null,assetId:object.userData.assetId||null,name:object.name||'预览模型',
  min:values(box.min),max:values(box.max),center:values(box.getCenter(new T.Vector3())),size:values(box.getSize(new T.Vector3())),
  calibrated:object.userData.measurementCalibrated===true};
}
export function collectMeasurements(stage,{limit=64}={}) {
 const all=stage.content.children.map(object=>measureObject(object,{basePosition:stage.explode>0})).filter(Boolean);
 const combined=new T.Box3();for(const m of all)combined.union(new T.Box3(new T.Vector3(...m.min),new T.Vector3(...m.max)));
 const selected=stage.selectable?all.find(m=>m.id===stage.selected)||null:all.length===1?all[0]:null;
 const instances=all.slice(0,limit);if(limit>0&&selected&&!instances.includes(selected)){instances.pop();instances.push(selected);}
 return {unit:'当前工作台米制换算',physicalUnitsVerified:all.length>0&&all.every(m=>m.calibrated),
  axes:{x:'X 宽 / 横向；红色；+X 与 -X',y:'Y 高 / 竖直；绿色；+Y 向上',z:'Z 深 / 纵向；蓝色；+Z 与 -Z；物体正面需结合模型确认'},
  scene:combined.isEmpty()?null:{min:values(combined.min),max:values(combined.max),size:values(combined.getSize(new T.Vector3()))},
  selected,instances,totalInstances:all.length,truncated:all.length>limit,explodedView:stage.explode>0};
}
export function projectPoint(point,camera,width,height) {
 const p=point.clone().project(camera);
 return {x:(p.x+1)*width/2,y:(1-p.y)*height/2,visible:p.z>=-1&&p.z<=1&&Number.isFinite(p.x+p.y)};
}
export function formatDimension(value){return value.toFixed(Math.abs(value)>0&&Math.abs(value)<.01?4:3);}
