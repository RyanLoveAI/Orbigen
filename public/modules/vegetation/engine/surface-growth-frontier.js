const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{const t=clamp(x);return t*t*(3-2*t);};
function noise(x,y,seed){
 const ix=Math.floor(x),iy=Math.floor(y),u=smooth(x-ix),v=smooth(y-iy);
 const hash=(a,b)=>{let n=Math.imul(a,374761393)^Math.imul(b,668265263)^seed;n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;};
 return (hash(ix,iy)*(1-u)+hash(ix+1,iy)*u)*(1-v)+(hash(ix,iy+1)*(1-u)+hash(ix+1,iy+1)*u)*v;
}
export function frontierDepth(r,supportTop=Infinity){
 const amount=Math.min(r.canopy_ragged??.7,(r.top-r.bottom)*.35);
 return amount*smooth((supportTop-r.top)/Math.max(.15,amount));
}
// One continuous horizontal envelope for stems and foliage. No branch IDs, triangle
// IDs or current clipping height enter the noise: neighboring vines share a hill/valley.
export function growthFrontier(p,r,supportTop=Infinity){
 const amount=frontierDepth(r,supportTop);if(amount<=0)return r.top;
 const span=r.frontier_span??1.6,x=p.x/span,y=p.y/span;
 const broad=noise(x+7.3,y-3.1,r.seed),detail=noise(x*2.3-4,y*2.3+9,r.seed+317);
 const valley=smooth((broad*.88+detail*.12-.24)/.52);
 return r.top-amount*valley;
}
