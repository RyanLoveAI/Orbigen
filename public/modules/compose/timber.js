export const TIMBER_DEFAULTS={span:4.8,height:3.4,depth:2.2,slope:14,rafters:11,tileColumns:12,tileRows:4};
export function timberKind(part){const n=part.name||'';if(/椽.*阵列|eave.*assembly/i.test(n))return 'array';if(/立柱|木柱|column/i.test(n))return 'column';if(/檐枋|横梁|beam/i.test(n))return 'beam';if(/斜撑|托木|brace/i.test(n))return 'brace';if(/承托块|连接块/i.test(n))return 'block';if(/封檐|fascia/i.test(n))return 'fascia';if(/椽|rafter/i.test(n))return 'rafter';if(/瓦当/i.test(n))return 'end';if(/滴水/i.test(n))return 'drip';if(/宽翼|板瓦/i.test(n))return 'pan';if(/筒瓦|覆盖瓦/i.test(n))return 'cover';return null;}
export function timberAvailable(p){return ['column','beam'].every(k=>p.parts.some(part=>part.status==='confirmed'&&timberKind(part)===k));}
export function timberInstances(p){
 const cfg={...TIMBER_DEFAULTS,...p.config},included=p.parts.filter(p=>p.status==='confirmed'),parts=Object.fromEntries(included.map(p=>[timberKind(p),p]).filter(([k])=>k)),sources=new Map(p.sources.map(s=>[s.id,s])),out=[];
 if(!parts.column||!parts.beam)throw Error('木构入口须先确认立柱和檐枋');
 const W=cfg.span,H=cfg.height,D=cfg.depth,slope=cfg.slope*Math.PI/180,rise=D*Math.tan(slope),postH=H-rise-.42,diam=Math.min(.28,W*.055),beamH=.24,front=D/2,back=-D/2,colX=W/2-.45;
 if(postH<.8)throw Error('屋顶坡度过大或柱高不足，请调整组建尺寸');
 const roofY=z=>postH+beamH+.12+(front-z)*Math.tan(slope);
 function add(kind,label,size,rotation,center){const part=parts[kind];if(!part)return;const s=sources.get(part.assetId),scale=size.map((v,k)=>v/Math.max(s.dimensions[k],.00001));
  // Models are centered on X/Z and grounded on Y. Rotate their scaled half-height
  // so the actual geometry center meets the joint, rather than rotating about a foot.
  const [a,b,c]=rotation,local=[0,size[1]/2,0],cz=Math.cos(c),sz=Math.sin(c),cy=Math.cos(b),sy=Math.sin(b),cx=Math.cos(a),sx=Math.sin(a);
  const zrot=[-local[1]*sz,local[1]*cz,0],yrot=[zrot[0]*cy, zrot[1],-zrot[0]*sy],rotated=[yrot[0],yrot[1]*cx-yrot[2]*sx,yrot[1]*sx+yrot[2]*cx];
  const index=out.filter(i=>i.partId===part.id).length;
  out.push({id:part.id+'-timber-'+index,partId:part.id,name:label+' · '+s.name,assetId:s.id,version:s.version,unitScale:s.unitScale,position:center.map((v,k)=>v-rotated[k]+(k===1?part.elevation:k===2?part.depth:0)),rotation,scale,locked:false,...(s.geometry?{geometry:structuredClone(s.geometry)}:{})});
 }
 for(const [z,row] of [[front,'前'],[back,'后']])for(const [x,side] of [[-colX,'左'],[colX,'右']]){
  const h=postH+(front-z)*Math.tan(slope);add('column',row+side+'柱',[diam,h,diam],[0,0,0],[x,h/2,z]);add('block',row+side+'承托',[.34,.18,.48],[0,Math.PI/2,0],[x,h+.07,z]);
 }
 for(const [z,label] of [[front,'前檐横梁'],[back,'后承重横梁']]){const h=postH+(front-z)*Math.tan(slope);add('beam',label,[.26,beamH,W-.5],[0,Math.PI/2,0],[0,h+.12,z]);}
 for(const [x,label] of [[-colX,'左斜撑'],[colX,'右斜撑']])add('brace',label,[.17,.7,.72],[0,x<0?-Math.PI/2:Math.PI/2,0],[x+(x<0?.26:-.26),postH-.24,front]);
 if(parts.array){add('array','完整木构椽子阵列',[W,.3,D/Math.cos(slope)],[slope,0,0],[0,roofY(0)+.03,0]);}else{
  for(let n=0;n<cfg.rafters;n++)add('rafter','椽子 '+(n+1),[.13,.14,D/Math.cos(slope)+.48],[slope,0,0],[-W/2+.18+n*(W-.36)/(cfg.rafters-1),roofY(0),0]);
  add('fascia','前封檐板',[.075,.22,W+.18],[0,Math.PI/2,0],[0,roofY(front+.2),front+.2]);
 }
 const cols=cfg.tileColumns,rows=cfg.tileRows,pitch=W/cols,step=(D+.3)/rows;
 // Pan tiles fill each channel, cover tiles bridge the seams. Eave ends replace
 // the last row, never become giant independent panels.
 for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
  const z=back-.12+(r+.5)*step,x=-W/2+(c+.5)*pitch,end=r===rows-1;
  const pan=end&&parts.drip?'drip':parts.pan?'pan':'cover';add(pan,`${end?'檐口':'屋面'}底瓦 ${r+1}-${c+1}`,[pitch*1.06,.10,step/Math.cos(slope)*1.14],[slope,0,0],[x,roofY(z)+.14,z]);
  if(parts.cover&&parts.pan){const kind=end&&parts.end?'end':'cover';add(kind,`${end?'檐口瓦当':'盖瓦'} ${r+1}-${c+1}`,[pitch*.5,.075,step/Math.cos(slope)*1.12],[slope,0,0],[x-pitch/2,roofY(z)+.12,z]);}
 }
 return out;
}
