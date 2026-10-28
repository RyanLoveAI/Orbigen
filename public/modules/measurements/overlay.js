import * as T from 'three';
import {measureObject,collectMeasurements,projectPoint,formatDimension} from './geometry.js';
import {DirectionNavigation} from './navigation.js';
const colors=['#d24c53','#229765','#446dda'],letters=['X','Y','Z'];
export class MeasurementOverlay {
 constructor(stage) {
  this.stage=stage;this.axes=true;this.dimensions=true;
  this.canvas=document.createElement('canvas');this.canvas.className='stage-measurements';this.canvas.setAttribute('aria-hidden','true');
  this.status=document.createElement('div');this.status.className='stage-measurement-text';this.status.setAttribute('aria-label','预览尺寸');
  this.controls=document.createElement('div');this.controls.className='stage-measurement-controls';
  this.controls.innerHTML='<button aria-label="XYZ 方向标注" aria-pressed="true">XYZ 方向</button><button aria-label="尺寸标注" aria-pressed="true">尺寸标注</button>';
  this.directionControl=document.createElement('button');this.directionControl.type='button';this.directionControl.className='stage-direction-control';this.directionControl.setAttribute('aria-label','拖动三维方向轴调整视角');this.directionControl.title='按住拖动旋转视角；方向键微调。保留点阵和选点。';
  this.navigation=new DirectionNavigation(stage,this.directionControl);
  [...this.controls.children].forEach((button,i)=>button.onclick=()=>{const key=i?'dimensions':'axes';this[key]=!this[key];button.setAttribute('aria-pressed',String(this[key]));this.directionControl.hidden=!this.axes||!this.navigation.enabled;stage.dirty=true;});
 }
 mount(host){host.append(this.canvas,this.status,this.controls,this.directionControl);this.lastText='';}
 setNavigation(enabled,blocked){this.navigation.setEnabled(enabled,blocked);this.directionControl.hidden=!this.axes||!enabled;this.stage.dirty=true;}
 resize(width,height) {
  this.width=Math.max(1,width);this.height=Math.max(1,height);this.ratio=Math.min(devicePixelRatio,2);
  this.canvas.width=Math.round(this.width*this.ratio);this.canvas.height=Math.round(this.height*this.ratio);
 }
 label(ctx,text,x,y,color='#465067',size=12) {
  ctx.font=`600 ${size}px -apple-system, BlinkMacSystemFont, sans-serif`;
  const w=ctx.measureText(text).width+12,h=size+10;
  x=Math.max(w/2+4,Math.min(this.width-w/2-4,x));y=Math.max(h/2+4,Math.min(this.height-h/2-4,y));
  ctx.save();
  ctx.fillStyle='rgba(255,255,255,.08)';ctx.fillRect(x-w/2,y-h/2,w,h);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.setLineDash([]);
  // A light outer halo and a thin dark edge keep each glyph readable on both
  // pale grids and textured models without an opaque label panel.
  ctx.strokeStyle='rgba(255,255,255,.95)';ctx.lineWidth=3;ctx.strokeText(text,x,y);
  ctx.strokeStyle='rgba(23,30,43,.55)';ctx.lineWidth=1;ctx.strokeText(text,x,y);
  ctx.globalAlpha=.94;ctx.fillStyle=color;ctx.fillText(text,x,y);
  ctx.restore();
 }
 line(ctx,start,end,color,text,shift=[0,0]) {
  const a=projectPoint(start,this.stage.camera,this.width,this.height),b=projectPoint(end,this.stage.camera,this.width,this.height);
  if(!a.visible||!b.visible)return;
  ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
  const length=Math.hypot(b.x-a.x,b.y-a.y),nx=length?(b.y-a.y)/length:1,ny=length?-(b.x-a.x)/length:0;
  for(const p of [a,b]){ctx.beginPath();ctx.moveTo(p.x-nx*5,p.y-ny*5);ctx.lineTo(p.x+nx*5,p.y+ny*5);ctx.stroke();}
  this.label(ctx,text,(a.x+b.x)/2+shift[0],(a.y+b.y)/2+shift[1],color);
 }
 drawAxes(ctx) {
  const cx=this.width-66,cy=68,q=this.stage.camera.getWorldQuaternion(new T.Quaternion()).invert();
  ctx.fillStyle='rgba(255,255,255,.86)';ctx.beginPath();ctx.arc(cx,cy,53,0,Math.PI*2);ctx.fill();
  const directions=[];
  for(let i=0;i<3;i++)for(const sign of [-1,1]){const v=new T.Vector3();v.setComponent(i,sign);v.applyQuaternion(q);directions.push({i,sign,v});}
  directions.sort((a,b)=>a.v.z-b.v.z);
  for(const {i,sign,v} of directions){const x=cx+v.x*34,y=cy-v.y*34;ctx.strokeStyle=colors[i];ctx.globalAlpha=sign<0?.48:1;ctx.lineWidth=sign<0?1:2;ctx.setLineDash(sign<0?[3,3]:[]);ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(x,y);ctx.stroke();
   ctx.fillStyle=sign>0?colors[i]:'#fff';ctx.beginPath();ctx.arc(x,y,10,0,Math.PI*2);ctx.fill();ctx.strokeStyle=colors[i];ctx.setLineDash([]);ctx.stroke();ctx.font='600 10px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=sign>0?'#fff':colors[i];ctx.fillText((sign>0?'+':'−')+letters[i],x,y);
  }
  ctx.globalAlpha=1;ctx.fillStyle='#68758a';ctx.font='10px -apple-system,sans-serif';ctx.textAlign='center';ctx.fillText(this.navigation.enabled?'拖动转向 · Y 向上':'世界方向 · Y 向上',cx,cy+64);
 }
 draw() {
  if(!this.width)return;
  const ctx=this.canvas.getContext('2d');ctx.setTransform(this.ratio,0,0,this.ratio,0,0);ctx.clearRect(0,0,this.width,this.height);
  if(this.axes)this.drawAxes(ctx);
  const stage=this.stage;
  const object=stage.selectable?stage.content.children.find(o=>o.userData.instanceId===stage.selected):stage.content.children.length===1?stage.content.children[0]:null;
  const m=object&&measureObject(object);
  if(!this.dimensions){this.status.hidden=true;return;}
  this.status.hidden=false;
  const summary=collectMeasurements(stage,{limit:0}),scene=summary.scene;
  const text=m?`${stage.selectable?'选中组件':'当前预览'}：${m.name}｜世界包围盒 X 宽 ${formatDimension(m.size[0])} / Y 高 ${formatDimension(m.size[1])} / Z 深 ${formatDimension(m.size[2])} m${m.calibrated?'':'（按当前换算，尺寸待校准）'}`:
   scene?`整体场景｜X 宽 ${formatDimension(scene.size[0])} / Y 高 ${formatDimension(scene.size[1])} / Z 深 ${formatDimension(scene.size[2])} m${summary.physicalUnitsVerified?'':'（按当前换算，尺寸待校准）'}；点击模型显示组件尺寸`:'点击模型查看 X 宽、Y 高、Z 深';
  if(text!==this.lastText){this.status.textContent=text;this.lastText=text;}
  const size=m?.size||scene?.size;if(!size)return;
  if(this.legend!==false){
  const legendWidth=Math.max(145,Math.min(292,this.width-132));
  ctx.save();ctx.fillStyle='rgba(255,255,255,.28)';ctx.fillRect(10,10,legendWidth,138);ctx.globalAlpha=.72;
  ctx.textAlign='left';ctx.textBaseline='middle';ctx.font='500 12px -apple-system,sans-serif';ctx.fillStyle='#4f5c70';
  const title=m?`${stage.selectable?'选中':'预览'} · ${m.name}`:'整体场景范围';ctx.save();ctx.beginPath();ctx.rect(18,12,legendWidth-16,22);ctx.clip();ctx.fillText(title,20,25);ctx.restore();
  ['宽 / 横向','高 / 竖直','深 / 纵向'].forEach((caption,i)=>{ctx.fillStyle=colors[i];ctx.fillText(`${letters[i]} ${caption}`,20,48+i*23);ctx.fillStyle='#354355';ctx.textAlign='right';ctx.fillText(formatDimension(size[i])+' m',legendWidth+1,48+i*23);ctx.textAlign='left';});
  ctx.fillStyle='#7c8699';ctx.font='10px -apple-system,sans-serif';ctx.fillText('世界包围盒 · '+((m?m.calibrated:summary.physicalUnitsVerified)?'已保存单位规格':'按当前换算 / 待校准'),20,119);
  ctx.fillText(stage.explode?'拆解观察中，尺寸以组件本体为准':'X / Z 平面 · Y 向上',20,135);
  ctx.restore();
  }
  const min=new T.Vector3(...(m?.min||scene.min)),max=new T.Vector3(...(m?.max||scene.max));
  const pad=Math.max(...size,.01)*.06;
  this.line(ctx,new T.Vector3(min.x,min.y-pad,max.z+pad),new T.Vector3(max.x,min.y-pad,max.z+pad),colors[0],`X 宽 ${formatDimension(size[0])} m`,[0,12]);
  this.line(ctx,new T.Vector3(min.x-pad,min.y,max.z+pad),new T.Vector3(min.x-pad,max.y,max.z+pad),colors[1],`Y 高 ${formatDimension(size[1])} m`,[-24,0]);
  this.line(ctx,new T.Vector3(max.x+pad,min.y-pad,min.z),new T.Vector3(max.x+pad,min.y-pad,max.z),colors[2],`Z 深 ${formatDimension(size[2])} m`,[20,-10]);
 }
 capture(){this.draw();const out=document.createElement('canvas');out.width=this.stage.renderer.domElement.width;out.height=this.stage.renderer.domElement.height;const ctx=out.getContext('2d');ctx.drawImage(this.stage.renderer.domElement,0,0);ctx.drawImage(this.canvas,0,0,out.width,out.height);return out.toDataURL('image/png');}
}
