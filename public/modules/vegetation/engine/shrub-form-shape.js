import * as THREE from 'three';
import { branchRadiusAt } from './branch-shaping.js';
import { normalizeShrubForm } from './shrub-form-data.js';
export { normalizeShrubForm } from './shrub-form-data.js';

const clamp = (v, lo, hi, fallback) => Math.max(lo, Math.min(hi,
  v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : fallback));
const v = a => new THREE.Vector3(...a);
function sample(branch, t) {
  const x = t * (branch.points.length - 1), i = Math.min(branch.points.length - 2, Math.floor(x));
  return v(branch.points[i]).lerp(v(branch.points[i + 1]), x - i);
}
const radiusAt = (b, t) => branchRadiusAt({ startRadius: b.start_radius,
  endRadius: b.end_radius, radiusProfile: b.radius_profile, sections: b.sections,
  order: b.order }, { radius_bias: .18, junction_flare: .2 }, t);

// A pruned crown is grown toward its envelope. No finished branches or leaves
// are clipped, so all shoots retain a tapered, connected end inside the crown.
export function createShrubFormShape(id, style, spec, rng, options = {}) {
  if (style !== 'BALL' && style !== 'HEDGE') throw new Error('Unknown shrub form');
  const f = normalizeShrubForm(options), branches = [];
  const rand = (a, b) => a + (b - a) * rng();
  // Keep room for the leaf lamina beyond the woody endpoint.
  const leafMargin = Math.min(clamp(spec?.leaf, 0, .4, .06) * .5, f.width * .16, f.height * .14);
  const halfWidth = f.width * .5 - leafMargin, top = f.height - leafMargin;
  let hash = 0;
  for (const c of String(id)) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) >>> 0;
  const phase = (hash % 997) / 997 * Math.PI * 2 + rand(-.15, .15);

  function record(parent, attach, controls, radius, persistent = false) {
    const curve = new THREE.CubicBezierCurve3(...controls);
    const stored = Math.max(.0012, radius), scale = radius / stored;
    const b = { id: branches.length ? `B${branches.length}` : 'R1', parent: parent?.id || '',
      attach, order: parent ? parent.order + 1 : 0,
      points: curve.getPoints(20).map(p => p.toArray()), knots: controls.map(p => p.toArray()),
      length: curve.getLength(), start_radius: stored, end_radius: persistent ? stored : stored * .04,
      radius_profile: persistent ? [scale, scale, scale] : [scale, scale * .95, scale * .8], sections: [] };
    branches.push(b);
    return b;
  }
  function shoot(parent, attach, target, strength = .48, canopyTip = false) {
    const start = sample(parent, attach), delta = target.clone().sub(start);
    const bend = new THREE.Vector3(-delta.y, delta.x, 0).multiplyScalar(rand(-.09, .09));
    // Cubic controls stay near the growth chord, with a gentle upward entry.
    const a = start.clone().addScaledVector(delta, .28).addScaledVector(bend, .6);
    const b = start.clone().addScaledVector(delta, .70).add(bend);
    a.z += Math.min(delta.length() * .09, f.height * .025);
    // Terminal shoots approach the clipping envelope tangentially instead of
    // meeting it only at one point, giving leaves a continuous outer canopy.
    if (canopyTip) b.z = target.z;
    return record(parent, attach, [start, a, b, target], radiusAt(parent, attach) * strength);
  }

  if (style === 'BALL') {
    const h = f.height, center = h * .53, rz = h * .47 - leafMargin;
    const root = record(null, 0, [v([0, 0, 0]), v([.006, 0, h * .08]),
      v([-.008, .006, h * .21]), v([0, 0, h * .30])], Math.min(.027, f.width * .033));
    function crown(angle, z) {
      z = Math.max(-.91, Math.min(.9995, z));
      const edge = 1 - rand(0, f.roughness * .32), ring = Math.sqrt(1 - z * z);
      return v([Math.cos(angle) * halfWidth * ring * edge,
        Math.sin(angle) * halfWidth * ring * edge, center + rz * z * edge]);
    }
    // Distribute scaffold tips over the entire envelope. The old fixed fan
    // sent half its leaders into the cap, leaving a tall crown's middle bare.
    // Larger crowns gain more fans, within the persisted shape's record cap.
    const fanCount = Math.min(48, Math.max(32, Math.round(32 * Math.sqrt(f.width * h / (.9 * .8)))));
    const sideCount = fanCount - 8;
    for (let i = 0; i < fanCount; i++) {
      const angle = phase + i * 2.399963;
      // The cap needs its own near-vertical leaders. A fan terminating only
      // near the equator looks like a ring when viewed from above.
      const z = i < sideCount ? -.76 + 1.6 * (i + .5) / sideCount : .955;
      const main = shoot(root, .18 + .52 * (i / (fanCount - 1)), crown(angle, z).multiplyScalar(.90), .53);
      for (let j = 0; j < 3; j++) {
        const a = angle + (j - 1) * .40, elevation = z + (j - 1) * .15;
        const child = shoot(main, .58 + j * .13, crown(a, elevation), .48, true);
        for (const side of [-1, 1]) shoot(child, rand(.48, .68),
          crown(a + side * .20, elevation + side * .13), .43, true);
      }
    }
    return { branches, root, L: f.height };
  }

  // normalizeBranchShape accepts only one root. A buried woody runner models
  // a connected nursery row; above ground every stem has its own crown.
  // There are at most 493 records, with orders 0..3, below the 520-record cap.
  const edge = Math.min(f.width * .35, f.length * .2), run = f.length - edge * 2;
  const count = Math.max(2, Math.min(12, Math.ceil(run / f.spacing) + 1));
  const actualSpacing = run / (count - 1), burial = -.045;
  const root = record(null, 0, [v([-run / 2, 0, burial]), v([-run / 6, .025 * f.width, burial]),
    v([run / 6, -.025 * f.width, burial]), v([run / 2, 0, burial])], .045, true);
  const halfLength = f.length / 2 - Math.min(leafMargin, f.length * .12);
  for (let i = 0; i < count; i++) {
    const at = i / (count - 1), base = sample(root, at);
    const cy = (i % 2 ? 1 : -1) * f.width * .045;
    const stem = shoot(root, at, v([base.x + rand(-.015, .015), cy, f.height * .49]), .47);
    const reach = Math.max(actualSpacing * .86, halfWidth * .92);
    function crown(angle, z, inset = 1) {
      // A rounded rectangular cross section: even the corner shoots respect
      // the outer envelope. End plants finish at the requested row length.
      const co = Math.cos(angle), si = Math.sin(angle), edgeNoise = 1 - rand(0, f.roughness * .3);
      const x = base.x + Math.sign(co) * Math.sqrt(Math.abs(co)) * reach * edgeNoise * inset;
      const y = cy + Math.sign(si) * Math.sqrt(Math.abs(si)) * halfWidth * edgeNoise * inset;
      return v([Math.max(-halfLength, Math.min(halfLength, x)),
        Math.max(-halfWidth, Math.min(halfWidth, y)), Math.max(f.height * .14, Math.min(top, z))]);
    }
    for (let j = 0; j < 10; j++) {
      const angle = phase + j * Math.PI / 4 + (i % 2) * .19;
      const cap = j >= 8;
      const main = shoot(stem, cap ? .82 + (j - 8) * .07 : .22 + j * .072,
        crown(angle, top * (cap ? .98 : j % 2 ? .81 : .92), cap ? .36 : 1), .51, true);
      for (let k = 0; k < 3; k++) {
        const upper = cap || k === 2;
        const z = upper ? top * (1 - rand(0, f.roughness * .12)) : top * (.43 + k * .34);
        // Side fans turn back over the crown; the two central leaders send
        // short horizontal fans outward to join the neighboring shrubs.
        const inset = cap ? .76 : k === 2 ? .34 + (j % 3) * .18 : 1;
        shoot(main, .38 + k * .19, crown(angle + (k - 1) * (cap ? .85 : .34), z, inset), .46, upper);
      }
    }
  }
  return { branches, root, L: f.length };
}
