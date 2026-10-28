export const CLIMB_DENSITY = [1, .9, .55, .2, .05];
export const UNIFORM_DENSITY = [1, 1, 1, 1, 1];
export function normalizeHeightDensity(value) {
  return UNIFORM_DENSITY.map((fallback,i)=>{
    const n=value?.[i];return typeof n==='number'&&Number.isFinite(n)?Math.max(0,Math.min(1,n)):fallback;
  });
}
export function heightDensity(z,r) {
  const curve=r.height_density||UNIFORM_DENSITY;
  const t=Math.max(0,Math.min(1,(z-r.bottom)/Math.max(.05,r.top-r.bottom)))*4;
  if(t===4)return curve[4];
  const i=Math.min(3,Math.floor(t)),f=t-i;
  return curve[i]+(curve[i+1]-curve[i])*f*f*(3-2*f);
}
