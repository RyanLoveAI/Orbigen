import * as THREE from 'three';
import { plantRandom } from './flowering-data.js';

const pointAt = (points, t) => {
  const lengths = [0]; for (let i = 1; i < points.length; i++) lengths.push(lengths.at(-1) + new THREE.Vector3(...points[i]).distanceTo(new THREE.Vector3(...points[i - 1])));
  const target = t * lengths.at(-1); let i = 1; while (i < lengths.length - 1 && lengths[i] < target) i++;
  return new THREE.Vector3(...points[i - 1]).lerp(new THREE.Vector3(...points[i]), (target - lengths[i - 1]) / Math.max(1e-8, lengths[i] - lengths[i - 1])).toArray();
};
export function createFloweringShape(v, seed, style) {
  const branches = [];
  function add(id, parent, attach, knots, radius, role) {
    const curve = new THREE.CatmullRomCurve3(knots.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
    const item = { id, parent, attach, knots, points: curve.getPoints(Math.max(16, Math.min(80, Math.ceil(curve.getLength() * 16)))).map((p) => p.toArray()), length: curve.getLength(), start_radius: radius, end_radius: Math.max(.0006, radius * .13), role };
    branches.push(item); return item;
  }
  const woody = Math.max(.009, v.stem * 2.4);
  // The wall is behind +Y. Arched shoots leave it towards -Y before
  // gravity bends the tips down; depth adds spread to that outward reach.
  const archReach = v.length * .45 + v.depth * 1.4;
  let root;
  if (style === 'BUSH') root = add('R1', '', 0, [[0, 0, 0], [.025, 0, v.length * .3], [-.04, .02, v.length * .6], [0, 0, v.length * .86]], woody * 2.8, 'RUNNER');
  else if (style === 'ARCH') root = add('R1', '', 0, [[0, 0, 0], [v.width * .3, -archReach * .52, v.length * .28], [v.width * .7, -archReach * .9, v.length * .16], [v.width, -archReach, -v.length * .38]], woody * 1.6, 'RUNNER');
  else root = add('R1', '', 0, [[0, 0, 0], [v.width * .33, 0, .03], [v.width * .66, 0, -.02], [v.width, 0, 0]], woody * 1.5, 'RUNNER');
  const count = Math.max(4, Math.min(70, Math.round(v.width * v.density)));
  for (let i = 0; i < count; i++) {
    const rng = plantRandom(seed, `flowering:${i}`), attach = .08 + .87 * (i + .2 + rng() * .6) / count, p = pointAt(root.points, attach);
    const angle = i * 2.39996, length = v.length * (1 - v.variation * (.15 + rng() * .65));
    const reach = style === 'ARCH' ? length * (.3 + rng() * .2) + v.depth * (.6 + rng() * .6) : 0;
    const knots = Array.from({ length: 8 }, (_, j) => {
      const t = j / 7, wiggle = Math.sin(t * 5 + i) * Math.sin(t * Math.PI) * v.natural * .1;
      if (style === 'BUSH') return [p[0] + Math.cos(angle) * v.width * .48 * t + wiggle, p[1] + Math.sin(angle) * Math.max(v.depth * 2, v.width * .32) * t, p[2] + length * (.75 * t - .6 * t * t)];
      if (style === 'ARCH') return [p[0] + Math.sin(angle) * length * .22 * t + wiggle, p[1] - reach * (2 * t - t * t), p[2] + length * (.32 * t - 1.32 * t * t)];
      return [p[0] + (rng() - .5) * v.natural * .08 * t + Math.sin(angle) * .2 * t + wiggle, p[1] - v.depth * Math.sin(t * 2) * (.5 + i % 3 * .18), p[2] + Math.sin(t * Math.PI) * length * .23 - length * t];
    });
    const stem = add(`R1.H${i + 1}`, 'R1', attach, knots, woody * .65, 'HANG');
    for (let j = 0; j < 3; j++) {
      const t = .2 + j * .23, start = pointAt(stem.points, t), side = (j % 2 ? -1 : 1) * (.18 + rng() * .22), fall = style === 'BUSH' ? .15 : -.3;
      if (style === 'ARCH') {
        const spread = Math.abs(side) * (.8 + rng() * .5) + v.depth * .35;
        add(`${stem.id}.S${j + 1}`, stem.id, t, [start, [start[0] + side * .5, start[1] - spread * .52, start[2] + .06], [start[0] + side, start[1] - spread * .9, start[2] - .06], [start[0] + side * 1.2, start[1] - spread, start[2] + fall]], woody * .3, 'SPRAY');
        continue;
      }
      add(`${stem.id}.S${j + 1}`, stem.id, t, [start, [start[0] + side * .45, start[1] - v.depth * .25, start[2] + .1], [start[0] + side, start[1] - v.depth * .5, start[2] + .07], [start[0] + side * 1.2, start[1] - v.depth * .6, start[2] + fall]], woody * .3, 'SPRAY');
    }
  }
  return { branches, connector: { position: [0, 0, 0], direction: style === 'BUSH' ? [0, 0, 1] : [1, 0, 0], locked: true } };
}
