export const REVIEW_COLORS=['#ef4444','#f59e0b','#22c55e','#3b82f6','#a855f7','#ffffff'];
export function validateReview(review){
 if(review==null)return null;
 if(!review||typeof review!=='object'||!Array.isArray(review.frames)||review.frames.length>12||review.sessionId!=null&&!/^[a-f0-9-]{36}$/.test(review.sessionId))throw Error('查验记录无效');
 const ids=new Set();let count=0;
 for(const f of review.frames){
  if(typeof f.id!=='string'||!f.id||ids.has(f.id)||!['model','reference'].includes(f.target)||!/^\/(?:previews\/stage_[a-f0-9]{16}|references\/[a-f0-9]{64})\.png$/.test(f.url)||!Array.isArray(f.strokes)||!Number.isInteger(f.width)||!Number.isInteger(f.height)||f.width<1||f.height<1||f.width>8192||f.height>8192)throw Error('查验截图无效');ids.add(f.id);
  if(f.camera!=null){for(const k of ['position','target','up'])if(!Array.isArray(f.camera[k])||f.camera[k].length!==3||f.camera[k].some(n=>!Number.isFinite(n)||Math.abs(n)>1e6))throw Error('查验相机无效');if(!Number.isFinite(f.camera.fov)||f.camera.fov<=0||f.camera.fov>=180||!Number.isFinite(f.camera.zoom)||f.camera.zoom<=0)throw Error('查验相机无效');}
  for(const s of f.strokes){if(++count>120||typeof s.id!=='string'||!s.id||ids.has(s.id)||!REVIEW_COLORS.includes(s.color)||typeof s.note!=='string'||s.note.length>1000||!['open','resolved'].includes(s.state)||!Array.isArray(s.points)||s.points.length<3||s.points.length>600||s.points.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||n<0||n>1)))throw Error('查验圈选无效');ids.add(s.id);}
 }
 return structuredClone(review);
}
