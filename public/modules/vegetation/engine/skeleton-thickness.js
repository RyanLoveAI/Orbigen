import { curvePoints, profileValue } from './generator-data.js';
import { branchRadiusAt } from './branch-shaping.js';

export const SKELETON_LEVELS = ['主干', '一级侧枝', '二级侧枝', '三级及以上侧枝'];
const bounded = (v, fallback=1) => Number.isFinite(Number(v)) ? Math.max(.1, Math.min(10, Number(v))) : fallback;
const clampNumber=(v,min,max,fallback)=>Number.isFinite(Number(v))&&v!==null&&v!==''?Math.max(min,Math.min(max,Number(v))):fallback;
const median=values=>{const sorted=[...values].sort((a,b)=>a-b);return sorted.length?sorted[Math.floor(sorted.length/2)]:1;};
export function normalizeSkeletonBase(raw){
  if(!raw||!['SOURCE','UNIFORM','LENGTH_GROUPS'].includes(raw.mode))return undefined;
  const size=r=>({diameter_cm:clampNumber(r?.diameter_cm,.01,1000,1),variation:clampNumber(r?.variation,0,.9,.15)});
  return {mode:raw.mode,...size(raw),split_length:clampNumber(raw.split_length,.01,100,2),short:size(raw.short),long:size(raw.long)};
}
export function skeletonThicknessState(workbench) {
  const levels=workbench?.skeleton_thickness?.levels;
  const legacy=r=>({scale:bounded(r?.scale),curve:Array.from({length:5},(_,n)=>bounded(r?.curve?.[n]))});
  return {levels:SKELETON_LEVELS.map((_,i)=>{
    const r=levels?.[i];
    const base=normalizeSkeletonBase(r?.base);
    return r?.mode==='RADIUS_CURVE'?{mode:'RADIUS_CURVE',scale:bounded(r.scale),curve:Array.from({length:5},(_,n)=>Math.max(.001,Math.min(10,Number(r.curve?.[n])||.001))),source:legacy(r.source),...(base?{base}:{})}:legacy(r);
  })};
}
export const neutralThickness = rule => rule.mode!=='RADIUS_CURVE' && rule.scale===1 && rule.curve.every(v=>v===1);

export function proposedSkeletonBase(branches,settings,workbench,level){
  const rule=skeletonThicknessState(workbench).levels[level];
  if(rule.base)return structuredClone(rule.base);
  const targets=skeletonBranches(branches).filter(b=>Math.min(3,b.order)===level);
  const split=Number(Math.max(.01,median(targets.map(b=>b.length))).toPrecision(4));
  const size=list=>({diameter_cm:Number(Math.max(.01,median(list.map(b=>branchRadiusAt(b,settings,0)*200/(rule.mode==='RADIUS_CURVE'?rule.curve[0]:1)))).toPrecision(4)),variation:.15});
  return {mode:'SOURCE',...size(targets),split_length:split,short:size(targets.filter(b=>b.length<split)),long:size(targets.filter(b=>b.length>=split))};
}

// Absolute base sizes never depend on a branch's inherited radius. Length only
// orders variation within an explicit band; it does not scale the diameter.
export function skeletonBaseRadii(branches,levels){
  const result=new Map();
  for(let level=0;level<4;level++){
    const base=levels[level]?.base;if(!base||base.mode==='SOURCE')continue;
    const targets=branches.filter(b=>Math.min(3,b.order)===level);
    const groups=base.mode==='LENGTH_GROUPS'?[[targets.filter(b=>b.length<base.split_length),base.short],[targets.filter(b=>b.length>=base.split_length),base.long]]:[[targets,base]];
    for(const [group,size] of groups){
      if(!group.length)continue;
      const lengths=group.map(b=>b.length||0),min=Math.min(...lengths),max=Math.max(...lengths);
      group.forEach((b,i)=>{const position=max-min<1e-9?0:2*(lengths[i]-min)/(max-min)-1;result.set(b,size.diameter_cm/200*(1+position*size.variation));});
    }
  }
  return result;
}

// Inspect the rendered legacy shape without migrating or changing the document.
// A level can contain different tapers: expose their envelope, not a false flat 1.
export function skeletonThicknessView(branches,settings,workbench,level){
  const rule=skeletonThicknessState(workbench).levels[level];
  const targets=skeletonBranches(branches).filter(b=>Math.min(3,b.order)===level);
  const roots=targets.map(b=>branchRadiusAt(b,settings,0));
  if(rule.mode==='RADIUS_CURVE')return {rule, inherited:false, mixed:false, envelope:[], roots};
  const envelope=Array.from({length:65},(_,n)=>{
    const values=targets.map((b,i)=>branchRadiusAt(b,settings,n/64)/Math.max(1e-10,roots[i])).sort((a,b)=>a-b);
    return {t:n/64,min:values[0]??1,max:values.at(-1)??1,value:values.length?values[Math.floor(values.length/2)]:1};
  });
  return {inherited:true,mixed:envelope.some(p=>p.max-p.min>.005),roots,envelope,
    rule:{mode:'RADIUS_CURVE',scale:1,curve:[0,16,32,48,64].map(i=>envelope[i].value),source:rule}};
}

// Ownership, not numerical order, defines the boundary. Manual descendants of
// installed units are also protected, including detached and nested units.
export function skeletonBranches(branches) {
  const byStable=new Map(branches.map(b=>[b.stableId,b]));
  const owned=new Set(branches.filter(b=>b.unitOwner||b.instanceId).map(b=>b.id));
  let changed=true;
  while(changed){changed=false;for(const b of branches)if(!owned.has(b.id)
    && (owned.has(b.parentId)||b.symmetrySource&&owned.has(byStable.get(b.symmetrySource)?.id))){owned.add(b.id);changed=true;}}
  return branches.filter(b=>!owned.has(b.id));
}

// Evaluate after spawning, sculpting and attachment so no instance transform or
// child layout depends on these radii. Old rules retain their multiplier math;
// new rules provide the final radius consumed by both rendering and PVE export.
export function applySkeletonThickness(branches, workbench, settings) {
  const {levels}=skeletonThicknessState(workbench);
  if(levels.every(neutralThickness))return;
  const bones=skeletonBranches(branches),bases=skeletonBaseRadii(bones,levels);
  for(const b of bones){
    const rule=levels[Math.min(3,b.order)];if(!rule||neutralThickness(rule))continue;
    if(rule.mode==='RADIUS_CURVE'){
      // Resolve an old multiplier configuration only as the immutable root-size
      // baseline. The new curve replaces all inherited along-axis taper terms.
      if(!bases.has(b)&&!neutralThickness(rule.source))applySkeletonThickness([b],{skeleton_thickness:{levels:levels.map((_,i)=>i===Math.min(3,b.order)?rule.source:{scale:1,curve:[1,1,1,1,1]})}},settings);
      const base=bases.has(b)?bases.get(b):branchRadiusAt(b,settings,0,true,false)*rule.scale;
      b.skeletonRadius={base,curve:rule.curve,junctionFlare:settings.junction_flare};
      // Established fields remain useful for bounds, UVs and downstream tools.
      const peak=Math.max(...rule.curve);b.startRadius=base*peak;b.endRadius=base*peak;
      b.radiusProfile={points:rule.curve.map((v,i)=>[i/4,v/peak]),interpolation:'LINEAR'};
      continue;
    }
    if(rule.curve.every(v=>v===rule.curve[0])){
      const factor=rule.scale*rule.curve[0];b.startRadius*=factor;b.endRadius*=factor;continue;
    }
    const source=b.radiusProfile||[1,1,1];
    const value=t=>profileValue(source,t)*profileValue(rule.curve,t);
    const knots=[...new Set([0,.25,.5,.75,1,...curvePoints(source).map(p=>p[0])])].sort((a,c)=>a-c);
    // Existing profiles can already contain 32 knots. Retain the endpoints and
    // choose samples by maximum interpolation error for both old and new curves.
    const points=[[0,value(0)],[1,value(1)]];
    const candidates=[...new Set([...knots,...Array.from({length:257},(_,n)=>n/256)])].sort((a,c)=>a-c);
    while(points.length<32){
      let best=null,error=0;
      for(const t of candidates){
        const i=points.findIndex(p=>p[0]>=t);if(i<=0||points[i][0]===t)continue;
        const a=points[i-1],c=points[i],v=value(t),delta=Math.abs(v-(a[1]+(c[1]-a[1])*(t-a[0])/(c[0]-a[0])));
        if(delta>error){error=delta;best=[t,v];}
      }
      if(!best||error<1e-7)break;
      points.push(best);points.sort((a,c)=>a[0]-c[0]);
    }
    const peak=Math.max(1,...points.map(p=>p[1]));
    b.startRadius*=rule.scale*peak;b.endRadius*=rule.scale*peak;
    b.radiusProfile={points:points.map(([t,v])=>[t,v/peak]),interpolation:'LINEAR'};
  }
}
