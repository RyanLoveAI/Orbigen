import * as THREE from '/vendor/three/three.module.js';
import { normalizeVine } from './vine-data.js';

function random(seed, key) {
  let h = seed >>> 0;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h += 0x6D2B79F5; let n = Math.imul(h ^ h >>> 15, h | 1); n ^= n + Math.imul(n ^ n >>> 7, n | 61); return ((n ^ n >>> 14) >>> 0) / 4294967296; };
}

// All vines are connected to a thin horizontal runner. IDs do not depend on leaf density.
export function createVineShape(raw, seed = 12037) {
  const v = normalizeVine(raw), records = [];
  const record = (id, parent, attach, knots, radius, role) => {
    const curve = new THREE.CatmullRomCurve3(knots.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
    const points = curve.getPoints(Math.max(12, Math.min(64, Math.ceil(curve.getLength() * 18)))).map((p) => p.toArray());
    const item = { id, parent, attach, knots, points, length: curve.getLength(), start_radius: radius, end_radius: Math.max(.00035, radius * .16), role };
    records.push(item); return item;
  };
  const hanging = (id, parent, attach, start, length, rng, role = 'HANG') => {
    const side = (rng() - .5) * v.natural * Math.min(.7, length * .28), phase = rng() * Math.PI * 2;
    const knots = Array.from({ length: 9 }, (_, i) => { const t = i / 8; return [start[0] + side * t + Math.sin(t * 5 + phase) * Math.sin(t * Math.PI) * v.natural * .075,
      start[1] - Math.sin(t * Math.PI * .7) * v.depth * (.35 + rng() * .15), start[2] - length * t]; });
    return record(id, parent, attach, knots, v.stem * (.7 + rng() * .5), role);
  };
  if (v.type === 'SINGLE') {
    hanging('R1', '', 0, [0, 0, 0], v.length, random(seed, 'single'));
  } else {
    const width = v.width;
    record('R1', '', 0, [[0, 0, 0], [width / 3, 0, 0], [width * 2 / 3, 0, 0], [width, 0, 0]], v.stem * 1.3, 'RUNNER');
    const count = Math.min(120, Math.max(2, Math.round(width * v.density)));
    for (let i = 0; i < count; i++) {
      const rng = random(seed, `bundle:${i}`), attach = (i + .2 + rng() * .6) / count;
      const x = width * attach;
      const long = rng() < .16;
      const length = v.length * (1 - v.variation * (long ? rng() * .16 : .2 + rng() * .65));
      const stem = hanging(`R1.H${i + 1}`, 'R1', attach, [x, 0, 0], length, rng);
      // Short lateral sprays create clumps, with intentional gaps between neighbouring clumps.
      const sprays = v.type === 'BUNDLE' ? 1 : 2;
      for (let j = 0; j < sprays; j++) {
        const t = .12 + j * .28 + rng() * .1;
        const p = new THREE.CatmullRomCurve3(stem.points.map((p) => new THREE.Vector3(...p))).getPointAt(t).toArray();
        const dx = (j % 2 ? -1 : 1) * (.08 + rng() * .16) * Math.min(1, width);
        record(`${stem.id}.S${j + 1}`, stem.id, t, [p, [p[0] + dx * .7, p[1] - v.depth * .45, p[2] - .08], [p[0] + dx, p[1] - v.depth * .65, p[2] - .23], [p[0] + dx * .8, p[1] - v.depth * .7, p[2] - .38 * length]], v.stem * .55, 'SPRAY');
      }
      if (v.type === 'EDGE' || v.type === 'WALL') {
        const reach = Math.min(.32, width / count * 1.5);
        record(`R1.C${i + 1}`, 'R1', attach, [[x, 0, 0], [x + reach * .3, -v.depth * .4, .08], [x + reach, -v.depth, .035], [x + reach * 1.2, -v.depth * 1.2, -.12]], v.stem * .6, 'COVER');
      }
    }
  }
  return { branches: records, connector: { position: [0, 0, 0], direction: v.type === 'SINGLE' ? [0, 0, -1] : [1, 0, 0], locked: true } };
}
