// Image coordinates are normalized with their origin at the top left.
export function polygonRect(points){const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys);return [x,y,Math.max(...xs)-x,Math.max(...ys)-y];}
export function validPolygon(points,rect){
 if(!Array.isArray(points)||points.length<3||points.length>512||points.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||n<0||n>1)))return false;
 const bounds=polygonRect(points);if(bounds[2]<.005||bounds[3]<.005)return false;
 const area=Math.abs(points.reduce((a,p,i)=>{const q=points[(i+1)%points.length];return a+p[0]*q[1]-q[0]*p[1];},0))/2;
 return area>=.000025&&(!rect||bounds.every((n,i)=>Math.abs(n-rect[i])<.000001));
}
export function tracePolygon(ctx,points,width,height){ctx.beginPath();points.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p[0]*width,p[1]*height));ctx.closePath();}
