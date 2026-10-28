import * as T from '../../vendor/three/three.module.js';
function settle(stage){const d=stage.orbit.enableDamping;stage.orbit.enableDamping=false;stage.orbit.update();stage.orbit.enableDamping=d;}
export function moveView(stage,shift){
 if(!shift.toArray().every(Number.isFinite))throw Error('视图位移无效');
 // Consume old damping before changing the camera/target together.
 const orbit=stage.orbit,damping=orbit.enableDamping;orbit.enableDamping=false;orbit.update();
 stage.camera.position.add(shift);orbit.target.add(shift);orbit.update();orbit.enableDamping=damping;stage.dirty=true;
}
export function panView(stage,x,y,step){
 settle(stage);
 stage.camera.updateMatrixWorld();const right=new T.Vector3().setFromMatrixColumn(stage.camera.matrixWorld,0),up=new T.Vector3().setFromMatrixColumn(stage.camera.matrixWorld,1);
 moveView(stage,right.multiplyScalar(-x*step).addScaledVector(up,-y*step));
}
export function focusBottom(stage,box){
 if(box.isEmpty())return;settle(stage);const bottom=box.getCenter(new T.Vector3());bottom.y=box.min.y;
 stage.camera.updateMatrixWorld();const up=new T.Vector3().setFromMatrixColumn(stage.camera.matrixWorld,1),height=stage.camera.position.distanceTo(stage.orbit.target)*2*Math.tan(stage.camera.fov*Math.PI/360)/stage.camera.zoom;
 const target=bottom.addScaledVector(up,-height*.22);moveView(stage,target.sub(stage.orbit.target));
}
export function axisDisplacement(axis,pixels,step){
 if(!['X','Y','Z'].includes(axis)||!Number.isFinite(pixels)||!Number.isFinite(step)||step<=0)throw Error('操作轴或步长无效');
 return new T.Vector3().setComponent(['X','Y','Z'].indexOf(axis),pixels*step/32);
}
