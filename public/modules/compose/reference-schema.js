import {validRect} from './schema.js';
const vector=(v,n,min=-1e5,max=1e5)=>Array.isArray(v)&&v.length===n&&v.every(x=>Number.isFinite(x)&&x>=min&&x<=max);
export function validateAlignment(a,project){
 if(a==null)return null;
 if(a.version!==1||a.referenceSha!==project.reference?.sha||!a.camera||!vector(a.camera.position,3)||!vector(a.camera.target,3)||!vector(a.camera.up,3)||!Number.isFinite(a.camera.fov)||a.camera.fov<1||a.camera.fov>100||!Number.isFinite(a.camera.aspect)||a.camera.aspect<=0||a.camera.aspect>10)throw Error('参考对照相机无效');
 if(Math.hypot(...a.camera.position.map((v,k)=>v-a.camera.target[k]))<.1||Math.hypot(...a.camera.up)<.1)throw Error('参考相机方向无效');
 if(!Array.isArray(a.steps)||a.steps.length>40||!Array.isArray(a.details)||a.details.length>20)throw Error('参考对照步骤无效');
 const ids=new Set(project.instances.map(i=>i.id)),steps=new Set();
 for(const s of a.steps){if(typeof s.id!=='string'||!s.id||steps.has(s.id)||typeof s.label!=='string'||s.label.length>120||typeof s.note!=='string'||s.note.length>1000||!['placed','pending'].includes(s.status)||!validRect(s.rect)||s.instanceId!=null&&!ids.has(s.instanceId)||!Array.isArray(s.anchors)||s.anchors.length>8)throw Error('对照步骤或实例引用无效');steps.add(s.id);if(s.status==='placed'&&!s.instanceId)throw Error('已放置步骤缺少实例');for(const x of s.anchors)if(!vector(x.local,3)||!vector(x.pixel,2,0,1))throw Error('参考对照锚点无效');}
 for(const d of a.details)if(typeof d.label!=='string'||d.label.length>120||typeof d.note!=='string'||d.note.length>1000||!validRect(d.rect))throw Error('参考细节范围无效');
 return structuredClone(a);
}

export function releaseAlignmentInstances(alignment,ids){
 if(!alignment)return;
 for(const step of alignment.steps)if(ids.has(step.instanceId))Object.assign(step,{instanceId:null,status:'pending',anchors:[]});
}
