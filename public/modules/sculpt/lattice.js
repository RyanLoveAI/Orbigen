import * as T from '../../vendor/three/three.module.js';
import { MeshDeformation } from './deformation.js';
const smooth=t=>t*t*(3-2*t);
const copy=nodes=>nodes.map(p=>p.clone());
export class LatticeDeformation extends MeshDeformation {
  selectCage({center,radius,resolution=5,kind='point',fraction=.35}={}) {
    if(this.transaction)throw Error('请先结束拖动');
    if(![5,7,9].includes(resolution))throw Error('点阵密度无效');
    const bounds=this.bounds(),size=bounds.getSize(new T.Vector3()),max=Math.max(...size.toArray(),.001);
    let box;
    if(kind==='whole')box=bounds.clone().expandByVector(size.clone().multiplyScalar(.25));
    else if(kind==='bottom')box=new T.Box3(new T.Vector3(bounds.min.x-size.x*.08,bounds.min.y-size.y*.1,bounds.min.z-size.z*.08),new T.Vector3(bounds.max.x+size.x*.08,bounds.min.y+size.y*fraction,bounds.max.z+size.z*.08));
    else {if(!center?.toArray().every(Number.isFinite))throw Error('请点选模型表面');radius=Number(radius)||max*.22;box=new T.Box3(center.clone().addScalar(-radius),center.clone().addScalar(radius));}
    const span=box.getSize(new T.Vector3());for(let a=0;a<3;a++)if(span.getComponent(a)<max*.02){box.min.setComponent(a,box.min.getComponent(a)-max*.02);box.max.setComponent(a,box.max.getComponent(a)+max*.02);}
    const step=box.getSize(new T.Vector3()).divideScalar(resolution-1),rest=[],free=[];
    for(let z=0;z<resolution;z++)for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){rest.push(new T.Vector3(x,y,z).multiply(step).add(box.min));free.push(x>0&&y>0&&z>0&&x<resolution-1&&y<resolution-1&&z<resolution-1);}
    const meshRest=this.snapshot(),bindings=[];let count=0;
    for(const src of meshRest){const ids=new Uint16Array(src.length/3*8),weights=new Float32Array(ids.length);for(let i=0;i<src.length/3;i++){
      const uv=[0,1,2].map(a=>(src[i*3+a]-box.min.getComponent(a))/step.getComponent(a));
      if(uv.some(v=>v<0||v>resolution-1))continue;
      const base=uv.map(v=>Math.min(resolution-2,Math.floor(v))),blend=uv.map((v,a)=>smooth(v-base[a]));let slot=0;
      for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++){const id=base[0]+x+resolution*(base[1]+y+resolution*(base[2]+z));ids[i*8+slot]=id;weights[i*8+slot]=(x?blend[0]:1-blend[0])*(y?blend[1]:1-blend[1])*(z?blend[2]:1-blend[2]);slot++;}
      count++;
    }bindings.push({ids,weights});}
    if(!count)throw Error('点阵范围没有覆盖网格，请重新点选');
    this.selection={kind:'cage',regionKind:kind,center:box.getCenter(new T.Vector3()),count,cage:{box,step,resolution,rest,nodes:copy(rest),free,meshRest,bindings}};return this.selection;
  }
  begin(){super.begin();this.transaction.nodesBefore=copy(this.selection.cage.nodes);}
  evaluate(nodes){const cage=this.selection.cage,offsets=nodes.map((p,i)=>p.clone().sub(cage.rest[i]));return cage.meshRest.map((src,n)=>{const output=src.slice(),{ids,weights}=cage.bindings[n];for(let i=0;i<src.length/3;i++)for(let slot=0;slot<8;slot++){const w=weights[i*8+slot];if(!w)continue;const d=offsets[ids[i*8+slot]];output[i*3]+=d.x*w;output[i*3+1]+=d.y*w;output[i*3+2]+=d.z*w;}return output;});}
  quality(candidate){
    const baseline=this.transaction.before;let maxStretch=1,minStretch=1;
    for(let n=0;n<this.meshes.length;n++){
      const index=this.meshes[n].geometry.getIndex(),count=index?index.count:baseline[n].length/3,src=baseline[n],dst=candidate[n];
      for(let t=0;t<count;t+=3){const ia=(index?index.getX(t):t)*3,ib=(index?index.getX(t+1):t+1)*3,ic=(index?index.getX(t+2):t+2)*3;
        for(const [i,j] of [[ia,ib],[ib,ic],[ic,ia]]){const b0=src[i]-src[j],b1=src[i+1]-src[j+1],b2=src[i+2]-src[j+2],length=b0*b0+b1*b1+b2*b2;if(length<1e-14)continue;const d0=dst[i]-dst[j],d1=dst[i+1]-dst[j+1],d2=dst[i+2]-dst[j+2],ratio=Math.sqrt((d0*d0+d1*d1+d2*d2)/length);minStretch=Math.min(minStretch,ratio);maxStretch=Math.max(maxStretch,ratio);if(ratio<.65||ratio>1.5)return {valid:false,minStretch,maxStretch};}
        const bx=src[ib]-src[ia],by=src[ib+1]-src[ia+1],bz=src[ib+2]-src[ia+2],cx=src[ic]-src[ia],cy=src[ic+1]-src[ia+1],cz=src[ic+2]-src[ia+2],nx=by*cz-bz*cy,ny=bz*cx-bx*cz,nz=bx*cy-by*cx;
        const dx=dst[ib]-dst[ia],dy=dst[ib+1]-dst[ia+1],dz=dst[ib+2]-dst[ia+2],ex=dst[ic]-dst[ia],ey=dst[ic+1]-dst[ia+1],ez=dst[ic+2]-dst[ia+2],qx=dy*ez-dz*ey,qy=dz*ex-dx*ez,qz=dx*ey-dy*ex,area=nx*nx+ny*ny+nz*nz;
        if(area>1e-16&&(qx*qx+qy*qy+qz*qz<area*.3||nx*qx+ny*qy+nz*qz<=0))return {valid:false,minStretch,maxStretch};
      }
    }return {valid:true,minStretch,maxStretch};
  }
  applyNode(index,target){
    if(!this.transaction)throw Error('请先开始控制点拖动');
    if(!target?.toArray().every(Number.isFinite))throw Error('控制点位置无效');
    const start=this.transaction.nodesBefore[index];
    if(!start||!this.selection.cage.free[index])throw Error('外层点已固定，请选择蓝色控制点');
    this.applyNodes([index],target.clone().sub(start));
    return this.selection.cage.nodes[index].clone();
  }
  // One common displacement and protection fraction preserves the selected shape.
  applyNodes(indices,delta){
    if(!this.transaction)throw Error('请先开始控制点拖动');
    const cage=this.selection.cage,selected=new Set(indices);
    if(!selected.size)throw Error('请先选择蓝色控制点');
    if([...selected].some(i=>!Number.isInteger(i)||!cage.free[i]))throw Error('外层点已固定，请选择蓝色控制点');
    if(!delta?.toArray().every(Number.isFinite))throw Error('控制点位移无效');
    const before=this.transaction.nodesBefore,n=cage.resolution;let alpha=1;
    // Pulling the bottom outward must carry its lower boundary with it. Keeping
    // that boundary fixed compresses the last cell until every further Y− is zero.
    // A monotone axial falloff preserves the cross-section and anchors the top;
    // the ordinary neighbor and mesh checks still apply to all other edits.
    const lowerWhole=this.selection.regionKind==='whole'&&[...selected].every(i=>before[i].y<this.selection.center.y);
    const extendBottom=(this.selection.regionKind==='bottom'||lowerWhole)&&delta.y<0&&delta.x===0&&delta.z===0;
    const frontier=extendBottom?Math.max(...[...selected].map(i=>before[i].y)):0;
    const ceiling=extendBottom?Math.max(...before.map(p=>p.y)):0;
    const influence=extendBottom?before.map(p=>p.y<=frontier?1:1-smooth(Math.min(1,(p.y-frontier)/Math.max(ceiling-frontier,1e-12)))):null;
    if(!extendBottom)for(const i of selected)for(let a=0;a<3;a++){
      const d=delta.getComponent(a),offset=[1,n,n*n][a],gap=cage.step.getComponent(a)*.35;
      const neighbor=i+(d>0?offset:-offset);
      if(d&&!selected.has(neighbor)){
        const room=d>0?before[neighbor].getComponent(a)-before[i].getComponent(a)-gap:before[i].getComponent(a)-before[neighbor].getComponent(a)-gap;
        alpha=Math.min(alpha,Math.max(0,room/Math.abs(d)));
      }
    }
    let nodes,result,quality;
    for(let attempt=0;attempt<12;attempt++){
      nodes=copy(before);if(extendBottom)nodes.forEach((p,i)=>p.addScaledVector(delta,alpha*influence[i]));else for(const i of selected)nodes[i].addScaledVector(delta,alpha);
      result=this.evaluate(nodes);quality=this.quality(result);if(quality.valid)break;alpha*=.5;
    }
    if(!quality.valid){alpha=0;nodes=copy(before);result=this.transaction.before;quality=this.quality(result);}
    cage.nodes=nodes;this.restore(result);this.transaction.changed=nodes.some((p,i)=>p.distanceToSquared(before[i])>1e-16);
    this.lastConstraint={limited:alpha<1,appliedFraction:alpha,mode:extendBottom?'bottom-extension':'local',...quality};return delta.clone().multiplyScalar(alpha);
  }
  commit(){const transaction=this.transaction;if(!transaction)return false;const cage=this.selection,afterNodes=copy(cage.cage.nodes),changed=super.commit();if(changed)Object.assign(this.history.at(-1),{cage,nodesBefore:transaction.nodesBefore,nodesAfter:afterNodes});return changed;}
  cancel(){if(this.transaction?.nodesBefore)this.selection.cage.nodes=copy(this.transaction.nodesBefore);super.cancel();}
  randomShape({seed,strength=60}={}){
    if(this.transaction)throw Error('请先结束拖动');
    if(!Number.isInteger(seed)||seed<0||seed>0xffffffff||!Number.isFinite(strength)||strength<10||strength>300)throw Error('种子须为 0–4294967295 的整数，随机强度须为 10–300');
    const before=this.snapshot(),previous=this.selection,previousNodes=previous?copy(previous.cage.nodes):null;
    try{
      // Every variant starts from the loaded asset, avoiding accumulated distortion.
      this.restore(this.original);this.selectCage({kind:'whole',resolution:5});this.begin();
      const cage=this.selection.cage;let state=seed>>>0;
      const random=()=>{state=(state+0x6d2b79f5)>>>0;let v=state;v=Math.imul(v^(v>>>15),v|1);v^=v+Math.imul(v^(v>>>7),v|61);return ((v^(v>>>14))>>>0)/4294967296;};
      const waves=Array.from({length:3},()=>Array.from({length:3},()=>({phase:random()*Math.PI*2,frequency:[random()*2+1,random()*2+1,random()*2+1]})));
      const offsets=cage.rest.map((p,i)=>{if(!cage.free[i])return new T.Vector3();const q=[i%5/4,Math.floor(i/5)%5/4,Math.floor(i/25)/4];return new T.Vector3(...waves.map((axis,a)=>axis.reduce((sum,w)=>sum+Math.sin(w.phase+q.reduce((v,t,k)=>v+t*w.frequency[k],0)),0)/3*cage.step.getComponent(a)*.3*strength/100));});
      let alpha=1,nodes,result,quality;
      for(let attempt=0;attempt<12;attempt++){nodes=cage.rest.map((p,i)=>p.clone().addScaledVector(offsets[i],alpha));result=this.evaluate(nodes);quality=this.quality(result);if(quality.valid)break;alpha*=.5;}
      if(!quality.valid)throw Error('这个随机形状未通过网格保护检查，请换一个种子');
      // Above 100%, recover the safe amplitude between the accepted value and
      // the last rejected value instead of losing half the requested strength.
      // Keep existing 10–100% seeds byte-for-byte reproducible.
      if(strength>100&&alpha<1){let lower=alpha,upper=Math.min(1,alpha*2);for(let attempt=0;attempt<8;attempt++){
        const fraction=(lower+upper)/2,candidateNodes=cage.rest.map((p,i)=>p.clone().addScaledVector(offsets[i],fraction)),candidate=this.evaluate(candidateNodes),checked=this.quality(candidate);
        if(checked.valid){lower=fraction;alpha=fraction;nodes=candidateNodes;result=candidate;quality=checked;}else upper=fraction;
      }}
      cage.nodes=nodes;this.restore(result);this.lastConstraint={...quality,limited:alpha<1};
      this.selection.randomSettings={seed,strength,appliedFraction:alpha};
      this.transaction.before=before;this.transaction.changed=result.some((src,n)=>src.some((v,i)=>v!==before[n][i]));
      const changed=super.commit();
      if(changed)Object.assign(this.history.at(-1),{selectionBefore:previous,selectionAfter:this.selection,nodesBefore:previousNodes,nodesAfter:copy(nodes)});
      return {changed,...this.selection.randomSettings};
    }catch(e){this.cancel();this.restore(before);this.selection=previous;throw e;}
  }
  undo(forward=false){const item=(forward?this.redo:this.history).at(-1);const changed=super.undo(forward);if(changed){this.selection='selectionBefore' in item?(forward?item.selectionAfter:item.selectionBefore):item.cage||null;if(this.selection)this.selection.cage.nodes=copy(forward?item.nodesAfter:item.nodesBefore);}return changed;}
  reset(){super.reset();this.selection=null;}
}
