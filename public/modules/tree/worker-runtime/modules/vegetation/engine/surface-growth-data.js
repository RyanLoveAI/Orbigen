import { normalizeGrowthRuler } from './surface-growth-ruler-data.js';
const n = (v, fallback, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(v)) ? Number(v) : fallback));
export const SURFACE_LIMIT = 100000;
export function normalizeSurfaceGrowth(raw) {
  if (!raw?.mesh) return null;
  const m = raw.mesh, p = m.position, ix = m.index;
  if (!Array.isArray(p) || p.length < 9 || p.length > SURFACE_LIMIT * 9 || p.length % 3 || !p.every(Number.isFinite)
    || !Array.isArray(ix) || ix.length < 3 || ix.length > SURFACE_LIMIT * 3 || ix.length % 3 || !ix.every(i => Number.isInteger(i) && i >= 0 && i < p.length / 3)) return null;
  const anchor = a => a && Number.isInteger(a.face) && a.face >= 0 && a.face < ix.length / 3 && Array.isArray(a.point) && a.point.length === 3 && a.point.every(Number.isFinite)
    ? { face: a.face, point: [...a.point] } : null;
  const ids = new Set();
  const guides = (Array.isArray(raw.guides) ? raw.guides : []).slice(0, 32).map((g, i) => {
    let id = String(g.id || `G${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || `G${i + 1}`;
    while (ids.has(id)) id += '_'; ids.add(id);
    return { id, name: String(g.name || `路线 ${i + 1}`).slice(0, 80), type: g.type === 'EAVE' ? 'EAVE' : 'SURFACE', locked: g.locked === true, trim: n(g.trim,1,.01,1), config: g.config ? { length:n(g.config.length,2,.1,15),spread:n(g.config.spread,.35,0,2),density:n(g.config.density,3,0,12),radius:n(g.config.radius,.004,.0005,.05),hang_length:n(g.config.hang_length,1.5,.1,10),hang_density:n(g.config.hang_density,4,1,12), offset:n(g.config.offset,raw.offset??.012,.003,.1), flip:g.config.flip??(raw.flip===true), auto_hang:g.config.auto_hang??(raw.auto_hang===true), hang_reach:n(g.config.hang_reach,raw.hang_reach??.25,.05,2), hang_variation:n(g.config.hang_variation,raw.hang_variation??.35,0,.8), ...(Number.isFinite(g.config.seed)?{seed:Math.round(g.config.seed)}:{}) } : null, anchors: (Array.isArray(g.anchors) ? g.anchors : []).slice(0, 512).map(anchor).filter(Boolean) };
  }).filter(g => g.anchors.length > 0);
  const faceList = a => [...new Set((Array.isArray(a) ? a : []).filter(i => Number.isInteger(i) && i >= 0 && i < ix.length / 3))].sort((a, b) => a - b).slice(0, SURFACE_LIMIT);
  function strokes(items) { return (Array.isArray(items)?items:[]).slice(0,4096).map((s,i)=>({id:String(s.id||'stroke'+i).slice(0,80),samples:(Array.isArray(s.samples)?s.samples:[]).slice(0,4096).filter(a=>anchor(a)).map(a=>({...anchor(a),faces:faceList(a.faces||[a.face]),radius:n(a.radius,.12,.01,2),strength:n(a.strength,1,.01,1),softness:n(a.softness,.3,0,1),erase:a.erase===true}))})).filter(s=>s.samples.length); }
  function regionData(region={}, id='legacy') { return {
    id, name:String(region.name||'生长区域').slice(0,80), enabled:region.enabled!==false, locked:region.locked===true,
    faces:faceList(region.faces), strokes:strokes(region.strokes), style:region.style==='MOUND'?'MOUND':'FLAT',
    growth:['CLIMB','HANG'].includes(region.growth)?region.growth:'COVER',
    coverage:n(region.coverage,.7,0,1),height:n(region.height,.08,0,.6),clump:n(region.clump,.65,.15,3),fade:n(region.fade,.2,0,1.5),hang:n(region.hang,.3,0,1),seed:Math.round(n(region.seed,31871,1,2147483000)),overlay:region.overlay!==false,
    budget:Math.round(n(region.budget,80,1,480)),length:n(region.length,2,.1,15),spread:n(region.spread,.35,0,2),density:n(region.density,3,0,12),up:n(region.up,.8,0,1),radius:n(region.radius,.004,.0005,.05)
  }; }
  const region = regionData(raw.region);
  const regionIds=new Set(['legacy']);const regions=(Array.isArray(raw.regions)?raw.regions:[]).slice(0,12).map((r,i)=>{let id=String(r.id||'zone'+i).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,64)||'zone'+i;while(regionIds.has(id))id+='_';regionIds.add(id);return regionData(r,id);});
  return { enabled: raw.enabled !== false, mesh: { id: String(m.id || 'surface').slice(0, 80), name: String(m.name || '承载模型').slice(0, 120), position: p, index: ix },
    guides, blocked: faceList(raw.blocked),
    region, regions, growth_ruler:normalizeGrowthRuler(raw.growth_ruler), block_strokes:strokes(raw.block_strokes),
    display:['SOLID','WIRE'].includes(raw.display)?raw.display:'TRANSPARENT',
    brush:{radius:n(raw.brush?.radius,.12,.01,2),strength:n(raw.brush?.strength,1,.01,1),softness:n(raw.brush?.softness,.3,0,1),corners:raw.brush?.corners===true},
    length: n(raw.length, 2, .1, 15), spread: n(raw.spread, .35, 0, 2), density: n(raw.density, 3, 0, 12), offset: n(raw.offset, .012, .003, .1),
    auto_hang: raw.auto_hang === true, hang_length: n(raw.hang_length, 1.5, .1, 10), hang_reach: n(raw.hang_reach, .25, .05, 2), hang_density: n(raw.hang_density, 4, 1, 12), hang_variation: n(raw.hang_variation, .35, 0, .8),
    visible: raw.visible !== false, opacity: n(raw.opacity, .65, .1, 1), flip: raw.flip === true };
}
