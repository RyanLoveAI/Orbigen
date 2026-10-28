import * as T from '../../vendor/three/three.module.js';

// Rotate only the camera around its existing target, independently of the
// canvas interaction mode (which can be reserved for lattice box selection).
export function rotateView(stage,dx,dy){
 if(![dx,dy].every(Number.isFinite))throw Error('视角位移无效');
 const {camera,orbit}=stage,damping=orbit.enableDamping,auto=orbit.autoRotate;
 orbit.enableDamping=false;orbit.autoRotate=false;orbit.update();
 try{
  const up=new T.Quaternion().setFromUnitVectors(camera.up.clone().normalize(),new T.Vector3(0,1,0));
  const offset=camera.position.clone().sub(orbit.target).applyQuaternion(up),spherical=new T.Spherical().setFromVector3(offset);
  spherical.theta=T.MathUtils.clamp(spherical.theta-dx*.012,orbit.minAzimuthAngle??-Infinity,orbit.maxAzimuthAngle??Infinity);
  spherical.phi=T.MathUtils.clamp(spherical.phi-dy*.012,Math.max(.0001,orbit.minPolarAngle??0),Math.min(Math.PI-.0001,orbit.maxPolarAngle??Math.PI));
  camera.position.copy(orbit.target).add(offset.setFromSpherical(spherical).applyQuaternion(up.invert()));
  camera.lookAt(orbit.target);orbit.update();stage.dirty=true;
 }finally{orbit.enableDamping=damping;orbit.autoRotate=auto;}
}

export class DirectionNavigation {
 constructor(stage,button){
  this.stage=stage;this.button=button;this.enabled=false;button.hidden=true;
  button.onpointerdown=e=>{
   if(e.button!==0||!this.enabled||this.blocked?.())return;
   e.preventDefault();e.stopPropagation();this.finish();
   this.drag={id:e.pointerId,last:[e.clientX,e.clientY],auto:stage.auto,damping:stage.orbit.enableDamping};
   stage.auto=false;stage.orbit.enableDamping=false;stage.orbit.update();
   button.setPointerCapture(e.pointerId);button.classList.add('dragging');
  };
  button.onpointermove=e=>{
   const d=this.drag;if(d?.id!==e.pointerId)return;e.preventDefault();e.stopPropagation();
   if(this.blocked?.()){this.finish();return;}
   rotateView(stage,e.clientX-d.last[0],e.clientY-d.last[1]);d.last=[e.clientX,e.clientY];
  };
  button.onpointerup=e=>{if(this.drag?.id!==e.pointerId)return;button.onpointermove(e);this.finish();e.preventDefault();e.stopPropagation();};
  button.onpointercancel=button.onlostpointercapture=()=>this.finish();
  button.onkeydown=e=>{
   const directions={ArrowLeft:[-8,0],ArrowRight:[8,0],ArrowUp:[0,-8],ArrowDown:[0,8]};
   if(!directions[e.key]||!this.enabled||this.blocked?.())return;
   e.preventDefault();e.stopPropagation();rotateView(stage,...directions[e.key]);
  };
 }
 setEnabled(enabled,blocked){this.finish();this.enabled=enabled;this.blocked=blocked;this.button.hidden=!enabled;}
 finish(){
  const d=this.drag;if(!d)return;this.drag=null;this.stage.auto=d.auto;this.stage.orbit.enableDamping=d.damping;this.stage.dirty=true;
  this.button.classList.remove('dragging');if(this.button.hasPointerCapture(d.id))this.button.releasePointerCapture(d.id);
 }
}
