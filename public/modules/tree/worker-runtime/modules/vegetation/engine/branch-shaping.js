import { radiusFactorAt } from './branch-radius.js';
import { profileValue } from './generator-data.js';

const clamp = (value, min, max, fallback) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : fallback));
export function normalizeSections(raw) {
  if (!Array.isArray(raw)) return [];
  const points = new Map();
  raw.slice(0, 24).forEach((p) => {
    if (!p || typeof p !== 'object') return;
    const t = Math.round(clamp(p.t, 0, 1, 0) * 1000) / 1000;
    points.set(t, { t, radius: clamp(p.radius, 0.05, 4, 1), oval: clamp(p.oval, 0.25, 4, 1), roll: clamp(p.roll, -180, 180, 0) });
  });
  return [...points.values()].sort((a, b) => a.t - b.t);
}
export function sectionAt(sections, t) {
  if (!sections?.length) return { radius: 1, oval: 1, roll: 0 };
  const i = sections.findIndex((p) => p.t >= t);
  if (i === 0) return sections[0];
  if (i < 0) return sections.at(-1);
  const a = sections[i - 1], b = sections[i]; let w = (t - a.t) / Math.max(0.001, b.t - a.t); w = w * w * (3 - 2 * w);
  return Object.fromEntries(['radius', 'oval', 'roll'].map((key) => [key, a[key] + (b[key] - a[key]) * w]));
}
export function normalizeJunction(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return { enabled: raw.enabled !== false, length: clamp(raw.length, 0.01, 2, 0.18), flare: clamp(raw.flare, 0, 2, 0.25), align: clamp(raw.align, 0, 1, 0.5), match: raw.match !== false };
}
export function branchRadiusAt(branch, settings, t, includeSections = true, includeEdits = true) {
  return baseRadiusAt(branch,settings,t,includeSections) * (includeEdits ? radiusFactorAt(branch,t) : 1);
}
function baseRadiusAt(branch, settings, t, includeSections) {
  // Explicit skeleton configuration is the final along-axis radius. Original
  // taper, collars and section radius corrections must not multiply it again.
  if(branch.skeletonRadius)return branch.skeletonRadius.base*profileValue(branch.skeletonRadius.curve,t);
  const taper = Math.pow(1 - t, Math.max(0.08, Math.min(1.5, 0.72 + settings.radius_bias)));
  let radius = (branch.endRadius + (branch.startRadius - branch.endRadius) * taper) * profileValue(branch.radiusProfile, t);
  const junction = branch.junction;
  if (junction?.enabled && branch.parentId >= 0) {
    const span = Math.min(0.8, junction.length / Math.max(0.01, branch.length));
    const w = Math.pow(Math.max(0, 1 - t / span), 2);
    const base = branch.startRadius * profileValue(branch.radiusProfile, 0);
    const target = junction.match ? (branch.parentRadius || base) * 0.65 : base;
    radius *= 1 + ((target / Math.max(0.0001, base)) * (1 + junction.flare) - 1) * w;
  } else if (branch.order > 0) radius *= 1 + settings.junction_flare * Math.pow(Math.max(0, 1 - t / 0.16), 2);
  return radius * (includeSections ? sectionAt(branch.sections, t).radius : 1);
}

export function branchSampleTs(branch) {
  return [...new Set([...branch.points.map((_,i)=>i/(branch.points.length-1)),
    ...(branch.sections||[]).map(s=>s.t),...(branch.skeletonRadius?[0,.25,.5,.75,1]:[])])].sort((a,b)=>a-b);
}

// Extract configured bones into the existing shape format. There is no new PVE
// or shape field: cancel the legacy renderer's default root flare in the baked
// profile. Root extraction resets order to zero, so its profile needs no cancel.
export function captureSkeletonRadius(branch, isRoot) {
  if(!branch.skeletonRadius && !branch.radiusEdits?.length)return {};
  const settings=branch.radiusSettings;
  const junctionFlare=branch.skeletonRadius?.junctionFlare ?? settings?.junction_flare ?? 0;
  const actual=t=>branch.skeletonRadius
    ? branch.skeletonRadius.base*profileValue(branch.skeletonRadius.curve,t)*radiusFactorAt(branch,t)
    : branchRadiusAt(branch,settings,t);
  const radius=Math.max(1e-10,...Array.from({length:513},(_,i)=>actual(i/512)));
  const value=t=>actual(t)/radius/(isRoot?1:1+junctionFlare*Math.max(0,1-t/.16)**2);
  const points=[0,.25,.5,.75,1].map(t=>[t,value(t)]);
  const candidates=[.16,...Array.from({length:513},(_,i)=>i/512)];
  while(points.length<32){
    let best=null,error=0;
    for(const t of candidates){const i=points.findIndex(p=>p[0]>=t);if(i<=0||points[i][0]===t)continue;
      const a=points[i-1],b=points[i],v=value(t),delta=Math.abs(v-(a[1]+(b[1]-a[1])*(t-a[0])/(b[0]-a[0])))/Math.max(v,1e-10);
      if(delta>error){error=delta;best=[t,v];}}
    if(!best||error<.0001)break;points.push(best);points.sort((a,b)=>a[0]-b[0]);
  }
  const sections=branch.sections?.map(s=>({...s,radius:1}))||[];
  // Existing shape readers also sample section positions. Include curve knots
  // for a straight two-point extraction without introducing a new shape field.
  for(const t of [0,.25,.5,.75,1,.16,...points.map(p=>p[0])]){
    if(sections.length>=24)break;
    if(!sections.some(s=>Math.abs(s.t-t)<.0005))sections.push({t,...sectionAt(branch.sections,t),radius:1});
  }
  sections.sort((a,b)=>a.t-b.t);
  return {start_radius:radius,end_radius:radius,radius_profile:{points,interpolation:'LINEAR'},sections};
}
