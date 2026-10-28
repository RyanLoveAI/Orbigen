import { normalizeFlowering } from './flowering-data.js';

export const TREE_ORGAN_MODES = { LEAVES:'纯叶枝', FLOWER:'开花 / 花苞', FRUIT:'结果枝', MIXED:'花果点缀' };
const value = (v,d,lo,hi) => Math.min(hi,Math.max(lo,Number.isFinite(Number(v))?Number(v):d));
export function normalizeTreeOrgans(raw = {}) {
  raw ||= {};
  const units = (Array.isArray(raw.units)?raw.units:[]).slice(0,24).flatMap((u,i)=>{
    const source=normalizeFlowering({source:u}).source;
    if(!source?.geometry.uv || !['FLOWER','BUD','FRUIT'].includes(u.role))return [];
    return [{...source,...(u.manual_only ? {manual_only:true} : {}),id:String(u.id||`ORGAN_${i}`),role:u.role,size:value(u.size,.06,.001,1),weight:value(u.weight,1,.01,10)}];
  });
  return {species:String(raw.species||''),mode:TREE_ORGAN_MODES[raw.mode]?raw.mode:'LEAVES',
    habit:['AXILLARY','PENDANT','TERMINAL'].includes(raw.habit)?raw.habit:'AXILLARY',
    amount:value(raw.amount,.65,0,1),scale:value(raw.scale,1,.1,4),
    order_min:Math.round(value(raw.order_min,1,0,3)),
    terminal_branches_only:raw.terminal_branches_only===true,
    max_count:Math.round(value(raw.max_count,200,1,10000)),
    color:/^#[0-9a-fA-F]{6}$/.test(raw.color||'')?raw.color:'',units};
}
