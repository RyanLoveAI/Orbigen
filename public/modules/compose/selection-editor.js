import {polygonRect,validPolygon,tracePolygon} from './selection.js';
import {validRect} from './schema.js';

// This editor only owns a temporary selection. Cancel never mutates the project.
export function openSelectionEditor({image,rect,polygon,onApply,onError,title='放大圈选目标'}){
 const dialog=document.createElement('dialog');dialog.className='compose-selection-dialog';dialog.setAttribute('aria-label',title);
 dialog.innerHTML=`<header><h3>${title}</h3><button data-close aria-label="关闭圈选窗口">关闭</button></header><div class="compose-selection-tools"><button data-tool="lasso">自由画圈</button><button data-tool="rect">矩形框选</button><button data-tool="pan">平移图片</button><button data-zoom="out">−</button><input data-zoom-range aria-label="参考图缩放" type="range" min="1" max="8" step=".1" value="1"><button data-zoom="in">＋</button><output data-zoom-label>100%</output><button data-fit>适应窗口</button><button data-clear>重新选区</button></div><p>滚轮放大缩小；切换平移可拖动图片。画圈松手后自动闭合，圈外内容不参与识别。</p><div class="compose-selection-viewport"><canvas aria-label="放大参考图，自由画圈或拖动框选"></canvas></div><footer><span data-message>请画圈选择要识别的区域</span><button data-cancel>取消</button><button data-apply>应用选区</button><button data-recognize class="primary">应用并识别</button></footer>`;
 document.body.append(dialog);dialog.showModal();
 const q=s=>dialog.querySelector(s),viewport=q('.compose-selection-viewport'),canvas=q('canvas'),ctx=canvas.getContext('2d');
 canvas.width=image.naturalWidth||image.width;canvas.height=image.naturalHeight||image.height;
 let zoom=1,tool='lasso',selection={rect:rect.slice(),polygon:polygon?structuredClone(polygon):null},stroke=null,start=null,pan=null;
 const fit=()=>Math.min(viewport.clientWidth/canvas.width,viewport.clientHeight/canvas.height);
 const draw=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0);const points=stroke||selection.polygon,r=selection.rect;
  ctx.save();ctx.fillStyle='#ffcd6738';ctx.strokeStyle='#ffd168';ctx.lineWidth=2/(fit()*zoom);ctx.beginPath();if(points?.length){tracePolygon(ctx,points,canvas.width,canvas.height);}else ctx.rect(r[0]*canvas.width,r[1]*canvas.height,r[2]*canvas.width,r[3]*canvas.height);ctx.fill('evenodd');ctx.stroke();ctx.restore();
  q('[data-apply]').disabled=q('[data-recognize]').disabled=!validRect(r)||!!start||selection.polygon!=null&&!validPolygon(selection.polygon,r);
 };
 const resize=()=>{canvas.style.width=canvas.width*fit()*zoom+'px';canvas.style.height=canvas.height*fit()*zoom+'px';q('[data-zoom-label]').textContent=Math.round(zoom*100)+'%';q('[data-zoom-range]').value=zoom;draw();};
 const setZoom=(value,anchor=[viewport.clientWidth/2,viewport.clientHeight/2])=>{const old=zoom;zoom=Math.max(1,Math.min(8,value));const x=(viewport.scrollLeft+anchor[0])*zoom/old-anchor[0],y=(viewport.scrollTop+anchor[1])*zoom/old-anchor[1];resize();viewport.scrollLeft=x;viewport.scrollTop=y;};
 const setTool=value=>{tool=value;canvas.style.cursor=tool==='pan'?'grab':'crosshair';dialog.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));};
 const point=e=>{const b=canvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)),Math.max(0,Math.min(1,(e.clientY-b.top)/b.height))];};
 const rectangle=(a,b)=>[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1])];
 canvas.onpointerdown=e=>{if(e.button!==0)return;canvas.setPointerCapture(e.pointerId);if(tool==='pan'){pan=[e.clientX,e.clientY,viewport.scrollLeft,viewport.scrollTop];return;}start=point(e);if(tool==='lasso')stroke=[start];else selection={rect:rectangle(start,start),polygon:null};draw();};
 canvas.onpointermove=e=>{if(pan){viewport.scrollLeft=pan[2]+pan[0]-e.clientX;viewport.scrollTop=pan[3]+pan[1]-e.clientY;return;}if(!start)return;const p=point(e);if(stroke){const last=stroke.at(-1),b=canvas.getBoundingClientRect();if(Math.hypot((last[0]-p[0])*b.width,(last[1]-p[1])*b.height)>2){stroke.push(p);if(stroke.length>1024)stroke=stroke.filter((_,i)=>i%2===0);}}else selection.rect=rectangle(start,p);draw();};
 canvas.onpointerup=e=>{if(pan){pan=null;return;}if(!start)return;if(stroke){stroke.push(point(e));while(stroke.length>512)stroke=stroke.filter((_,i)=>i%2===0);selection={rect:polygonRect(stroke),polygon:stroke};stroke=null;}else selection.rect=rectangle(start,point(e));start=null;draw();q('[data-message]').textContent=q('[data-apply]').disabled?'选区太小，请重新画圈':'选区已闭合，可应用或识别';};
 canvas.onpointercancel=()=>{if(start)selection={rect:[0,0,0,0],polygon:null};stroke=start=pan=null;draw();};
 viewport.onwheel=e=>{e.preventDefault();if(start||pan)return;const b=viewport.getBoundingClientRect();setZoom(zoom*Math.exp(-e.deltaY*.002),[e.clientX-b.left,e.clientY-b.top]);};
 for(const b of dialog.querySelectorAll('[data-tool]'))b.onclick=()=>setTool(b.dataset.tool);
 q('[data-zoom="in"]').onclick=()=>setZoom(zoom*1.3);q('[data-zoom="out"]').onclick=()=>setZoom(zoom/1.3);q('[data-zoom-range]').oninput=e=>setZoom(Number(e.target.value));q('[data-fit]').onclick=()=>{zoom=1;resize();viewport.scrollLeft=viewport.scrollTop=0;};
 q('[data-clear]').onclick=()=>{selection={rect:[0,0,0,0],polygon:null};draw();q('[data-message]').textContent='请重新画圈';};
 const observer=new ResizeObserver(()=>resize());observer.observe(viewport);
 const close=()=>{observer.disconnect();dialog.close();dialog.remove();};dialog.oncancel=e=>{e.preventDefault();close();};q('[data-close]').onclick=q('[data-cancel]').onclick=close;
 for(const [selector,recognize] of [['[data-apply]',false],['[data-recognize]',true]])q(selector).onclick=()=>{if(q('[data-apply]').disabled)return;const result=structuredClone(selection);close();Promise.resolve().then(()=>onApply(result,recognize)).catch(onError);};
 setTool('lasso');resize();return {close};
}
