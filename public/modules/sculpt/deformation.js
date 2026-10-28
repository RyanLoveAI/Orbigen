import * as T from '../../vendor/three/three.module.js';

const smooth = t => { t=Math.max(0,Math.min(1,t));return t*t*(3-2*t); };
export class MeshDeformation {
  constructor(source,{historyLimit=20}={}) {
    source.updateMatrixWorld(true);
    this.root=new T.Group();this.root.name='加工模型';this.meshes=[];this.history=[];this.redo=[];this.revision=0;this.savedRevision=0;this.stateID=0;this.savedStateID=0;this.nextStateID=0;this.historyLimit=historyLimit;
    source.traverse(o=>{
      if(!o.isMesh)return;
      if(o.isSkinnedMesh||o.isInstancedMesh||Object.keys(o.geometry.morphAttributes||{}).length)throw Error('请先转换为普通静态网格再加工');
      const geometry=o.geometry.clone(),src=o.geometry.getAttribute('position');if(!src)throw Error('网格缺少顶点');
      const positions=new Float32Array(src.count*3);for(let i=0;i<src.count;i++)positions.set([src.getX(i),src.getY(i),src.getZ(i)],i*3);
      geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.applyMatrix4(o.matrixWorld);geometry.deleteAttribute('tangent');
      // A separate editable geometry for every occurrence also isolates shared source meshes.
      const p=geometry.getAttribute('position');if(!p)throw Error('网格缺少顶点');
      for(let i=0;i<p.count;i++)if(![p.getX(i),p.getY(i),p.getZ(i)].every(Number.isFinite))throw Error('模型含无效顶点');
      const mesh=new T.Mesh(geometry,o.userData.originalMaterial||o.material);mesh.name=o.name;mesh.visible=o.visible;
      this.root.add(mesh);this.meshes.push(mesh);
    });
    if(!this.meshes.length)throw Error('模型没有可加工的网格');
    this.original=this.snapshot();this.selection=null;
  }
  bounds(){return new T.Box3().setFromObject(this.root);}
  snapshot(){return this.meshes.map(m=>new Float32Array(m.geometry.getAttribute('position').array));}
  restore(snapshot){this.meshes.forEach((m,i)=>{m.geometry.getAttribute('position').array.set(snapshot[i]);this.refresh(m);});}
  refresh(mesh){const g=mesh.geometry;g.getAttribute('position').needsUpdate=true;g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();}
  select({kind='point',center,radius,fraction=.4}={}){
    if(this.transaction)throw Error('请先结束当前拖动');
    const box=this.bounds(),size=box.getSize(new T.Vector3());
    if(kind==='bottom')center=box.getCenter(new T.Vector3()).setY(box.min.y);
    else if(!(center instanceof T.Vector3)||!center.toArray().every(Number.isFinite))throw Error('请选择模型表面');
    if(!Number.isFinite(radius)||radius<=0)radius=Math.max(...size.toArray())*.35;
    fraction=Math.max(.05,Math.min(1,Number(fraction)||.4));
    const weights=this.meshes.map(mesh=>{
      const p=mesh.geometry.getAttribute('position'),w=new Float32Array(p.count);
      for(let i=0;i<p.count;i++){
        const distance=kind==='bottom'?(p.getY(i)-box.min.y)/Math.max(size.y*fraction,1e-8):Math.hypot(p.getX(i)-center.x,p.getY(i)-center.y,p.getZ(i)-center.z)/radius;
        w[i]=1-smooth(distance);
      }return w;
    });
    const count=weights.reduce((sum,w)=>sum+w.reduce((n,x)=>n+(x>0?1:0),0),0);
    if(!count)throw Error('影响范围内没有顶点，请增大范围');
    this.selection={kind,center:center.clone(),radius,fraction,weights,count};return this.selection;
  }
  begin(){if(!this.selection)throw Error('请先点选区域或选择底部');if(this.transaction)throw Error('拖动尚未结束');this.transaction={before:this.snapshot(),selection:this.selection,beforeState:this.stateID,changed:false};}
  apply({translation=[0,0,0],scale=[1,1,1]}={}){
    if(!this.transaction)throw Error('没有正在进行的加工');
    if(translation.length!==3||!translation.every(Number.isFinite)||scale.length!==3||scale.some(x=>!Number.isFinite(x)||x<.05||x>5))throw Error('拉伸比例须为 0.05–5，位移须有效');
    const {before,selection}=this.transaction,c=selection.center.toArray();
    this.meshes.forEach((mesh,n)=>{
      const p=mesh.geometry.getAttribute('position'),src=before[n],weights=selection.weights[n];
      for(let i=0;i<p.count;i++)for(let axis=0;axis<3;axis++){
        const v=src[i*3+axis],w=weights[i];p.array[i*3+axis]=v+w*((v-c[axis])*(scale[axis]-1)+translation[axis]);
      }
      this.refresh(mesh);
    });
    this.transaction.changed=translation.some(v=>v!==0)||scale.some(v=>v!==1);
  }
  commit(){if(!this.transaction)return false;const t=this.transaction;this.transaction=null;if(!t.changed)return false;this.stateID=++this.nextStateID;this.history.push({before:t.before,after:this.snapshot(),beforeState:t.beforeState,afterState:this.stateID});if(this.history.length>this.historyLimit)this.history.shift();this.redo=[];this.revision++;return true;}
  cancel(){if(this.transaction){const before=this.transaction.before;this.transaction=null;this.restore(before);}}
  undo(forward=false){this.cancel();const stack=forward?this.redo:this.history,item=stack.pop();if(!item)return false;(forward?this.history:this.redo).push(item);this.restore(forward?item.after:item.before);this.stateID=forward?item.afterState:item.beforeState;this.revision++;return true;}
  reset(){this.cancel();const before=this.snapshot(),beforeState=this.stateID;this.restore(this.original);this.stateID=0;this.history.push({before,after:this.snapshot(),beforeState,afterState:0});if(this.history.length>this.historyLimit)this.history.shift();this.redo=[];this.revision++;}
  changed(){return this.stateID!==this.savedStateID;}
  exportRoot(){const root=new T.Group();root.name=this.root.name;root.userData={...this.root.userData};for(const m of this.meshes){const mesh=new T.Mesh(m.geometry.clone(),m.userData.originalMaterial||m.material);mesh.name=m.name;mesh.visible=m.visible;root.add(mesh);}return root;}
  dispose(){this.meshes.forEach(m=>m.geometry.dispose());this.history=[];this.redo=[];}
}
