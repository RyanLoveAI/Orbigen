const number = (v, lo, hi, fallback) => Math.max(lo, Math.min(hi, Number.isFinite(+v) ? +v : fallback));
const vector = (v, fallback = [0, 0, 0]) => fallback.map((f, i) => number(v?.[i], -1000, 1000, f));
export function normalizeShapeOperation(raw) {
  if (!raw || !['CAGE', 'GUIDE', 'SPACE', 'POSE', 'VOLUME', 'QUICK', 'MOUNT', 'ROOT_SCALE', 'POINT_ROTATE', 'POINT_SCALE', 'POINT_SLIDE', 'RADIUS'].includes(raw.type)) return null;
  const result = { type: raw.type, targets: [...new Set((Array.isArray(raw.targets) ? raw.targets : []).filter((v) => typeof v === 'string'))].slice(0, 2200),
    keepRoots: raw.keepRoots !== false, falloff: number(raw.falloff, 0.2, 3, 1), preserveLength: raw.preserveLength === true };
  if (raw.type === 'RADIUS') {
    result.factor=number(raw.factor,.05,20,1);
    result.point=Math.round(number(raw.point,0,63,0));
    result.excluded=[...new Set((Array.isArray(raw.excluded)?raw.excluded:[]).filter(v=>typeof v==='string'))].slice(0,2200);
  } else if (raw.type === 'POINT_SLIDE') {
    if (!raw.root) return null;
    Object.assign(result,{root:String(raw.root),point:Math.round(number(raw.point,1,63,1)),attach:number(raw.attach,0,1,.5)});
    result.targets=[result.root];result.keepRoots=true;
  } else if (raw.type === 'POINT_SCALE') {
    if (!raw.root) return null;
    Object.assign(result,{root:String(raw.root),point:Math.round(number(raw.point,1,63,1)),scale:[0,1,2].map(i=>number(raw.scale?.[i],.05,20,1))});
    result.targets=[result.root];result.keepRoots=true;
  } else if (raw.type === 'POINT_ROTATE') {
    if (!raw.root || !Array.isArray(raw.rotation) || raw.rotation.length !== 4 || !raw.rotation.every(Number.isFinite)) return null;
    const length = Math.hypot(...raw.rotation); if (length < 1e-10) return null;
    Object.assign(result, {root:String(raw.root), point:Math.round(number(raw.point,1,63,1)), rotation:raw.rotation.map(v=>v/length), preserveLength:true});
    result.targets = [result.root];
  } else if (raw.type === 'ROOT_SCALE') {
    result.scale = [0,1,2].map(i => number(raw.scale?.[i], .05, 20, 1));
    result.keepRoots = true;
  } else if (raw.type === 'MOUNT') {
    if (!raw.root || !raw.parent || !Array.isArray(raw.rotation) || raw.rotation.length !== 4) return null;
    Object.assign(result, {root: String(raw.root), parent: String(raw.parent), attach: number(raw.attach,0,1,.5),
      ...(raw.root_rotation === true ? {root_rotation:true} : {}),
      azimuth: number(raw.azimuth,-180,180,0), elevation: number(raw.elevation,-170,170,0),
      rotation: raw.rotation.map(v => number(v,-1,1,0)), parent_tangent: vector(raw.parent_tangent,[0,0,1]),
      source_attach:number(raw.source_attach,0,1,.5), reference_direction:vector(raw.reference_direction,[1,0,0]),
      base_azimuth:number(raw.base_azimuth,-180,180,0), base_elevation:number(raw.base_elevation,-170,170,0)});
  } else if (raw.type === 'QUICK') {
    // These multipliers are specific to QUICK; SPACE.radius remains a world
    // distance and the normalization of existing tools stays unchanged.
    for (const [key, lo, hi, fallback] of [['length',.25,3,1], ['width',.2,3,1],
      ['radius',.25,Infinity,1], ['tipRadius',.5,Infinity,1], ['droop',-1,1,0], ['bend',-1,1,0], ['flatness',.1,1,1]]) {
      result[key] = raw[key] == null || raw[key] === '' ? fallback : number(raw[key], lo, hi, fallback);
    }
    result.keepRoots = true; result.preserveLength = false;
  } else if (raw.type === 'POSE') {
    result.mode = ['HINGE', 'BEND', 'TWIST'].includes(raw.mode) ? raw.mode : 'BEND';
    result.pivot = number(raw.pivot, 0, 0.85, 0.4); result.lockMiddle = raw.lockMiddle === true;
    result.offset = vector(raw.offset); result.twist = number(raw.twist, -180, 180, 0);
    result.preserveLength = raw.preserveLength !== false;
  } else if (raw.type === 'VOLUME') {
    result.stamps = (Array.isArray(raw.stamps) ? raw.stamps : []).filter((s) => s && typeof s.branch === 'string').slice(0, 256).map((s) => ({
      branch: s.branch.slice(0, 128), t: number(s.t, 0, 1, 0.5), width: number(s.width, 0.01, 1, 0.15), amount: number(s.amount, 0, 1, 0.3),
      mode: ['INFLATE', 'DEFLATE', 'FLATTEN', 'SMOOTH'].includes(s.mode) ? s.mode : 'INFLATE',
    }));
  } else if (raw.type === 'CAGE') {
    if (!Array.isArray(raw.rest) || !Array.isArray(raw.nodes) || raw.rest.length !== 12 || raw.nodes.length !== 12) return null;
    result.rest = raw.rest.map((v) => vector(v)); result.nodes = raw.nodes.map((v) => vector(v)); result.axis = Math.round(number(raw.axis, 0, 2, 2));
  } else if (raw.type === 'GUIDE') {
    if (!Array.isArray(raw.guide) || raw.guide.length < 2) return null;
    result.guide = raw.guide.slice(0, 32).map((v) => vector(v)); result.anchor = vector(raw.anchor);
    result.strengths = [0, 0.65, 1].map((f, i) => number(raw.strengths?.[i], 0, 1, f));
    result.plane = ['VIEW', 'XZ', 'XY', 'YZ'].includes(raw.plane) ? raw.plane : 'VIEW';
  } else {
    result.center = vector(raw.center); result.radius = number(raw.radius, 0.02, 20, 0.4);
    result.clearance = number(raw.clearance, 0.005, 2, 0.1); result.amount = number(raw.amount, 0, 1, 0.7);
    result.minOrder = Math.round(number(raw.minOrder, 0, 3, 1)); result.voidEnabled = raw.voidEnabled !== false;
    result.spacingEnabled = raw.spacingEnabled !== false;
  }
  return result;
}

export function normalizeSymmetryGroups(raw) {
  const seen = new Set();
  return (Array.isArray(raw) ? raw : []).slice(0, 12).filter((g) => g && typeof g.source === 'string').map((g, i) => ({
    id: String(g.id || `SYM_${i}`).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48), source: g.source.slice(0, 128), name: String(g.name || '联动枝群').slice(0, 64), enabled: g.enabled !== false,
    type: g.type === 'RADIAL' ? 'RADIAL' : 'MIRROR', axis: ['X', 'Y', 'Z'].includes(g.axis) ? g.axis : 'Y',
    count: Math.round(number(g.count, 2, 8, 2)), angle: number(g.angle, -180, 180, 0), lengthVariation: number(g.lengthVariation, 0, 0.5, 0.08),
    bendVariation: number(g.bendVariation, 0, 0.5, 0.05), angleVariation: number(g.angleVariation, 0, 45, 5), seed: Math.round(number(g.seed, 1, 2147483646, 1)),
  })).filter((g) => { if (seen.has(g.id)) return false; seen.add(g.id); return true; });
}
