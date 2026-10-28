export function captureView(stage){
 const c=stage.camera;
 return {position:c.position.toArray(),target:stage.orbit.target.toArray(),up:c.up.toArray(),fov:c.fov,zoom:c.zoom};
}
export function restoreView(stage,view){
 // Flush the previous page's damping before applying this project's saved view.
 const orbit=stage.orbit,damping=orbit.enableDamping,auto=orbit.autoRotate;
 orbit.enableDamping=false;orbit.autoRotate=false;orbit.update();
 const c=stage.camera;c.position.fromArray(view.position);c.up.fromArray(view.up);c.fov=view.fov;c.zoom=view.zoom;
 orbit.target.fromArray(view.target);c.updateProjectionMatrix();orbit.update();
 orbit.enableDamping=damping;orbit.autoRotate=auto;stage.dirty=true;
}
export function sameTransform(instance,transform){
 return ['position','rotation','scale'].every(k=>Array.isArray(transform[k])&&transform[k].length===3&&transform[k].every((v,n)=>Number.isFinite(v)&&Math.abs(v-instance[k][n])<=1e-9*Math.max(1,Math.abs(instance[k][n]))));
}
