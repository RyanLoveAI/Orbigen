import { normalizeHeightDensity } from './surface-height-density.js';
// Persistent global height controller. It is absent in older projects.
const number=(v,f,min,max)=>Number.isFinite(Number(v))?Math.max(min,Math.min(max,Number(v))):f;
export function normalizeGrowthRuler(raw){
 if(!raw||typeof raw!=='object')return null;
 const bottom=number(raw.bottom,0,-100000,100000);
 return {recipe_version:raw.recipe_version===2?2:1,main_density:number(raw.main_density,number(raw.coverage,.9,0,1),0,1),side_density:number(raw.side_density,number(raw.coverage,.9,0,1),0,1),distribution:raw.distribution==='CLUMP'?'CLUMP':'UNIFORM',stem_seed:Math.round(number(raw.stem_seed,number(raw.seed,72193,1,2147483000),1,2147483000)),leaf_seed:Math.round(number(raw.leaf_seed,number(raw.seed,72193,1,2147483000),1,2147483000)),gap_seed:Math.round(number(raw.gap_seed,number(raw.seed,72193,1,2147483000),1,2147483000)),enabled:raw.enabled!==false,visible:raw.visible!==false,bottom,top:number(raw.top,bottom+3,bottom+.05,100001),coverage:number(raw.coverage,.9,0,1),budget:Math.round(number(raw.budget,1000,20,2400)),leaf_budget:Math.round(number(raw.leaf_budget,80000,0,160000)),height_density:normalizeHeightDensity(raw.height_density),stem_wander:number(raw.stem_wander,.28,0,.8),stem_span:number(raw.stem_span,1.6,.4,4),canopy_depth:number(raw.canopy_depth,.32,0,.8),canopy_clump:number(raw.canopy_clump,.85,.15,3),canopy_ragged:number(raw.canopy_ragged,.7,0,3),leaf_spacing:number(raw.leaf_spacing,.018,0,.5),leaf_gap_ratio:number(raw.leaf_gap_ratio,0,0,1),leaf_gap_size:number(raw.leaf_gap_size,.6,.1,5),frontier_span:number(raw.frontier_span,1.6,.3,10),seed:Math.round(number(raw.seed,72193,1,2147483000))};
}


