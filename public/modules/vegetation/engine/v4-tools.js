const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function fingerprint(value) {
  let hash = 2166136261;
  for (const character of stableStringify(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function constrainPoint(origin, candidate, constraint = 'FREE', snap = 0) {
  const from = [0, 1, 2].map((index) => finite(origin?.[index]));
  const result = [0, 1, 2].map((index) => finite(candidate?.[index], from[index]));
  const allowed = {
    X: [0], Y: [1], Z: [2], XY: [0, 1], XZ: [0, 2], YZ: [1, 2], FREE: [0, 1, 2],
  }[constraint] || [0, 1, 2];
  for (let index = 0; index < 3; index += 1) if (!allowed.includes(index)) result[index] = from[index];
  const interval = Math.max(0, finite(snap));
  if (interval > 0) allowed.forEach((index) => { result[index] = Math.round(result[index] / interval) * interval; });
  return result;
}

export function tangentHandles(points, index, length = 0.12) {
  if (!Array.isArray(points) || !points[index]) return null;
  const pivot = points[index];
  const previous = points[Math.max(0, index - 1)] || pivot;
  const next = points[Math.min(points.length - 1, index + 1)] || pivot;
  const tangent = [next[0] - previous[0], next[1] - previous[1], next[2] - previous[2]];
  const magnitude = Math.hypot(...tangent) || 1;
  const scale = Math.max(0.001, finite(length, 0.12)) / magnitude;
  const direction = tangent.map((value) => value * scale);
  return {
    in: pivot.map((value, axis) => value - direction[axis]),
    out: pivot.map((value, axis) => value + direction[axis]),
  };
}

export function applyTangentHandle(points, index, side, target, mode = 'SMOOTH') {
  const result = points.map((point) => point.slice(0, 3).map((value) => finite(value)));
  if (!result[index] || ![-1, 1].includes(side)) return result;
  const neighborIndex = index + side;
  if (!result[neighborIndex]) return result;
  const pivot = result[index];
  const handle = target.slice(0, 3).map((value, axis) => finite(value, pivot[axis]));
  const neighborLength = Math.hypot(...result[neighborIndex].map((value, axis) => value - pivot[axis])) || 0.001;
  const handleDirection = handle.map((value, axis) => value - pivot[axis]);
  const handleMagnitude = Math.hypot(...handleDirection) || 1;
  result[neighborIndex] = pivot.map((value, axis) => value + handleDirection[axis] / handleMagnitude * neighborLength);
  if (mode === 'SMOOTH') {
    const oppositeIndex = index - side;
    if (result[oppositeIndex]) {
      const oppositeLength = Math.hypot(...result[oppositeIndex].map((value, axis) => value - pivot[axis])) || 0.001;
      const direction = pivot.map((value, axis) => value - handle[axis]);
      const directionMagnitude = Math.hypot(...direction) || 1;
      result[oppositeIndex] = pivot.map((value, axis) => value + direction[axis] / directionMagnitude * oppositeLength);
    }
  }
  return result;
}

const copyPoints = (points) => (points || []).map((point) => point.slice(0, 3).map((value) => finite(value)));
const subtract = (a, b) => a.map((value, axis) => value - b[axis]);
const addScaled = (a, b, scale) => a.map((value, axis) => value + b[axis] * scale);
const magnitude = (value) => Math.hypot(...value);
const distance = (a, b) => magnitude(subtract(a, b));
const normalize = (value) => {
  const length = magnitude(value) || 1;
  return value.map((component) => component / length);
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);

export function resamplePolyline(points, count = 7) {
  const source = copyPoints(points);
  const targetCount = Math.max(2, Math.round(finite(count, 7)));
  if (source.length <= 1) return source;
  const lengths = [0];
  for (let index = 1; index < source.length; index += 1) lengths.push(lengths.at(-1) + distance(source[index], source[index - 1]));
  const total = lengths.at(-1);
  if (total <= 1e-9) return Array.from({ length: targetCount }, () => source[0].slice());
  return Array.from({ length: targetCount }, (_, outputIndex) => {
    const cursor = total * outputIndex / (targetCount - 1);
    let right = lengths.findIndex((length) => length >= cursor);
    if (right < 0) return source.at(-1).slice();
    if (right === 0) return source[0].slice();
    const left = right - 1;
    const alpha = (cursor - lengths[left]) / Math.max(1e-9, lengths[right] - lengths[left]);
    return source[left].map((value, axis) => value + (source[right][axis] - value) * alpha);
  });
}

function pointSegmentDistance(point, start, end) {
  const segment = subtract(end, start);
  const lengthSquared = dot(segment, segment);
  if (lengthSquared <= 1e-12) return distance(point, start);
  const amount = clamp(dot(subtract(point, start), segment) / lengthSquared, 0, 1);
  return distance(point, addScaled(start, segment, amount));
}

function markSimplifiedSpan(points, start, end, tolerance, keep) {
  if (end <= start + 1) return;
  let furthestIndex = -1;
  let furthestDistance = -1;
  for (let index = start + 1; index < end; index += 1) {
    const deviation = pointSegmentDistance(points[index], points[start], points[end]);
    if (deviation > furthestDistance) {
      furthestDistance = deviation;
      furthestIndex = index;
    }
  }
  if (furthestDistance <= tolerance || furthestIndex < 0) return;
  keep.add(furthestIndex);
  markSimplifiedSpan(points, start, furthestIndex, tolerance, keep);
  markSimplifiedSpan(points, furthestIndex, end, tolerance, keep);
}

export function simplifyCurvePoints(points, tolerance = 0.02, requiredIndices = [], minimumCount = 4) {
  const source = copyPoints(points);
  if (source.length <= 2) return source;
  const required = new Set([0, source.length - 1, ...(requiredIndices || [])]
    .map((value) => Math.round(finite(value, -1)))
    .filter((index) => index >= 0 && index < source.length));
  const boundaries = [...required].sort((a, b) => a - b);
  const keep = new Set(boundaries);
  for (let index = 1; index < boundaries.length; index += 1) {
    markSimplifiedSpan(source, boundaries[index - 1], boundaries[index], Math.max(0, finite(tolerance, 0.02)), keep);
  }
  const targetMinimum = Math.min(source.length, Math.max(2, Math.round(finite(minimumCount, 4))));
  while (keep.size < targetMinimum) {
    const retained = [...keep].sort((a, b) => a - b);
    let candidate = -1;
    let candidateDeviation = -1;
    for (let span = 1; span < retained.length; span += 1) {
      const start = retained[span - 1];
      const end = retained[span];
      for (let index = start + 1; index < end; index += 1) {
        const deviation = pointSegmentDistance(source[index], source[start], source[end]);
        const score = deviation + Math.min(index - start, end - index) * 1e-9;
        if (score > candidateDeviation) { candidateDeviation = score; candidate = index; }
      }
    }
    if (candidate < 0) break;
    keep.add(candidate);
  }
  return [...keep].sort((a, b) => a - b).map((index) => source[index].slice());
}

export function subdivideCurvePoints(points, options = {}) {
  const source = copyPoints(points);
  const scope = options.scope || 'SEGMENT';
  const center = Math.round(finite(options.index, 0));
  const levels = Math.round(clamp(finite(options.levels, 1), 1, 3));
  const divisions = 2 ** levels;
  const selectedSegments = new Set();
  if (scope === 'ALL') {
    for (let index = 0; index < source.length - 1; index += 1) selectedSegments.add(index);
  } else if (scope === 'NEIGHBORHOOD') {
    if (center > 0) selectedSegments.add(center - 1);
    if (center < source.length - 1) selectedSegments.add(center);
  } else {
    selectedSegments.add(clamp(center, 0, Math.max(0, source.length - 2)));
  }
  const result = [];
  source.forEach((point, index) => {
    result.push(point.slice());
    if (!selectedSegments.has(index) || !source[index + 1]) return;
    for (let step = 1; step < divisions; step += 1) {
      const amount = step / divisions;
      result.push(point.map((value, axis) => value + (source[index + 1][axis] - value) * amount));
    }
  });
  return result;
}

export function trimCurvePoints(points, selectedIndex, keepSide = 'ROOT', minimumCount = 4) {
  const source = copyPoints(points);
  if (!source.length) return source;
  const index = Math.round(clamp(finite(selectedIndex), 0, source.length - 1));
  const result = keepSide === 'TIP' ? source.slice(index) : source.slice(0, index + 1);
  return result.length >= Math.max(2, Math.round(finite(minimumCount, 4))) ? result : source;
}

function closestPointOnSegment2d(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared <= 1e-9 ? 0 : clamp(((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared, 0, 1);
  const x = start[0] + dx * t;
  const y = start[1] + dy * t;
  return { t, point: [x, y], distance: Math.hypot(point[0] - x, point[1] - y) };
}

function segmentIntersection2d(a, b, c, d) {
  const branchX = b[0] - a[0];
  const branchY = b[1] - a[1];
  const strokeX = d[0] - c[0];
  const strokeY = d[1] - c[1];
  const denominator = branchX * strokeY - branchY * strokeX;
  if (Math.abs(denominator) <= 1e-9) return null;
  const offsetX = c[0] - a[0];
  const offsetY = c[1] - a[1];
  const branchT = (offsetX * strokeY - offsetY * strokeX) / denominator;
  const strokeT = (offsetX * branchY - offsetY * branchX) / denominator;
  if (branchT < 0 || branchT > 1 || strokeT < 0 || strokeT > 1) return null;
  return { branchT, strokeT, point: [a[0] + branchX * branchT, a[1] + branchY * branchT], distance: 0 };
}

export function closestPolylineStrokeHit(polyline, stroke, threshold = 10) {
  const curve = (polyline || []).map((point) => [finite(point?.[0]), finite(point?.[1])]);
  const gesture = (stroke || []).map((point) => [finite(point?.[0]), finite(point?.[1])]);
  if (curve.length < 2 || gesture.length < 2) return null;
  let best = null;
  const consider = (candidate, segmentIndex, branchT) => {
    if (candidate.distance > Math.max(0, finite(threshold, 10))) return;
    const curveT = (segmentIndex + branchT) / (curve.length - 1);
    if (!best || candidate.distance < best.distance - 1e-6 || (Math.abs(candidate.distance - best.distance) <= 1e-6 && curveT < best.curveT)) {
      best = { segmentIndex, segmentT: branchT, curveT, distance: candidate.distance, point: candidate.point.slice() };
    }
  };
  for (let branchIndex = 0; branchIndex < curve.length - 1; branchIndex += 1) {
    const a = curve[branchIndex];
    const b = curve[branchIndex + 1];
    for (let strokeIndex = 0; strokeIndex < gesture.length - 1; strokeIndex += 1) {
      const c = gesture[strokeIndex];
      const d = gesture[strokeIndex + 1];
      const intersection = segmentIntersection2d(a, b, c, d);
      if (intersection) { consider(intersection, branchIndex, intersection.branchT); continue; }
      const fromC = closestPointOnSegment2d(c, a, b);
      const fromD = closestPointOnSegment2d(d, a, b);
      const fromA = closestPointOnSegment2d(a, c, d);
      const fromB = closestPointOnSegment2d(b, c, d);
      consider(fromC, branchIndex, fromC.t);
      consider(fromD, branchIndex, fromD.t);
      consider({ distance: fromA.distance, point: a }, branchIndex, 0);
      consider({ distance: fromB.distance, point: b }, branchIndex, 1);
    }
  }
  return best;
}

export function curveShortcutAction(input = {}) {
  if (input.ctrlKey || input.altKey || input.metaKey) return null;
  const modes = {
    Digit1: 'MODE_DIRECT', Digit2: 'MODE_SOFT_MOVE', Digit3: 'MODE_BEND',
    Digit4: 'MODE_TIP_IK', Digit5: 'MODE_SEGMENT', Digit6: 'MODE_SMOOTH',
  };
  if (modes[input.code]) return modes[input.code];
  if (input.code === 'BracketLeft') return 'PREVIOUS_POINT';
  if (input.code === 'BracketRight') return 'NEXT_POINT';
  if (input.code === 'Home') return 'FIRST_POINT';
  if (input.code === 'End') return 'LAST_POINT';
  if (input.code === 'KeyI' || input.code === 'Insert') return input.shiftKey ? 'INSERT_BEFORE' : 'INSERT_AFTER';
  // Plain Delete belongs to whole-branch selection, not the active curve point.
  if (input.code === 'Delete') return input.shiftKey ? 'TOGGLE_PRUNE_BRUSH' : null;
  if (input.code === 'KeyD') return input.shiftKey ? 'SUBDIVIDE_ALL' : 'SUBDIVIDE_NEIGHBORHOOD';
  if (input.code === 'KeyT') return input.shiftKey ? 'TRIM_ROOT' : 'TRIM_TIP';
  if (input.code === 'KeyJ') return 'SIMPLIFY';
  if (input.code === 'KeyM') return 'MATCH_COUNT';
  if (input.code === 'KeyP') return 'TOGGLE_PIN';
  if (input.code === 'KeyS' && input.shiftKey) return 'SMOOTH';
  if (input.code === 'KeyQ') return 'TOOL_SELECT';
  return null;
}

export function curveFalloffWeight(distanceFromCenter, radius, profile = 'SMOOTH') {
  const normalized = clamp(1 - Math.max(0, finite(distanceFromCenter)) / Math.max(1e-6, finite(radius, 0.35)), 0, 1);
  if (profile === 'LINEAR') return normalized;
  if (profile === 'GAUSSIAN') return normalized <= 0 ? 0 : Math.exp(-4 * (1 - normalized) ** 2) * normalized;
  if (profile === 'SHARP') return normalized ** 4;
  return normalized * normalized * (3 - 2 * normalized);
}

function curveDistances(points, centerIndex) {
  const result = new Array(points.length).fill(0);
  for (let index = centerIndex - 1; index >= 0; index -= 1) result[index] = result[index + 1] + distance(points[index], points[index + 1]);
  for (let index = centerIndex + 1; index < points.length; index += 1) result[index] = result[index - 1] + distance(points[index], points[index - 1]);
  return result;
}

function deformationBounds(points, centerIndex, pinned, lockRoot) {
  const fixed = new Set((pinned || []).map((value) => Math.round(finite(value))));
  if (lockRoot && points.length) fixed.add(0);
  let start = 0;
  let end = points.length - 1;
  for (const index of fixed) {
    if (index < centerIndex) start = Math.max(start, index);
    if (index > centerIndex) end = Math.min(end, index);
  }
  return { fixed, start, end };
}

export function curveInfluenceWeights(points, centerIndex, options = {}) {
  const source = copyPoints(points);
  if (!source[centerIndex]) return source.map(() => 0);
  const mode = options.mode || 'SOFT_MOVE';
  const radius = Math.max(1e-4, finite(options.radius, 0.35));
  const { fixed, start, end } = deformationBounds(source, centerIndex, options.pinned, options.lockRoot !== false);
  const distances = curveDistances(source, centerIndex);
  return source.map((point, index) => {
    if (fixed.has(index) && index !== centerIndex) return 0;
    if (index < start || index > end) return 0;
    if (mode === 'DIRECT') return index === centerIndex ? 1 : 0;
    if (mode === 'SEGMENT') return index >= centerIndex ? 1 : 0;
    if (mode === 'TIP_IK') return index >= start && index <= centerIndex ? (index - start) / Math.max(1, centerIndex - start) : index > centerIndex ? 1 : 0;
    if (mode === 'BEND') return index <= start ? 0 : clamp((index - start) / Math.max(1, centerIndex - start), 0, 1);
    return curveFalloffWeight(distances[index], radius, options.profile);
  });
}

function rotateAroundAxis(value, axis, angle) {
  const direction = normalize(axis);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const crossed = cross(direction, value);
  const projected = dot(direction, value) * (1 - cosine);
  return value.map((component, index) => component * cosine + crossed[index] * sine + direction[index] * projected);
}

function preserveSegmentLengths(original, deformed, fixed, strength) {
  const amount = clamp(finite(strength), 0, 1);
  if (amount <= 0) return deformed;
  const result = copyPoints(deformed);
  const rest = original.slice(1).map((point, index) => distance(point, original[index]));
  for (let iteration = 0; iteration < 6; iteration += 1) {
    for (let index = 0; index < rest.length; index += 1) {
      const aFixed = fixed.has(index);
      const bFixed = fixed.has(index + 1);
      if (aFixed && bFixed) continue;
      const vector = subtract(result[index + 1], result[index]);
      const current = magnitude(vector);
      if (current <= 1e-9) continue;
      const correction = (current - rest[index]) / current * amount;
      if (aFixed) result[index + 1] = addScaled(result[index + 1], vector, -correction);
      else if (bFixed) result[index] = addScaled(result[index], vector, correction);
      else {
        result[index] = addScaled(result[index], vector, correction * 0.5);
        result[index + 1] = addScaled(result[index + 1], vector, -correction * 0.5);
      }
    }
  }
  return result;
}

function solveTipIk(points, startIndex, endIndex, target) {
  const result = copyPoints(points);
  const lengths = [];
  let totalLength = 0;
  for (let index = startIndex; index < endIndex; index += 1) {
    const length = Math.max(1e-6, distance(result[index], result[index + 1]));
    lengths.push(length);
    totalLength += length;
  }
  const root = result[startIndex].slice();
  if (distance(root, target) >= totalLength) {
    const direction = normalize(subtract(target, root));
    for (let index = startIndex + 1; index <= endIndex; index += 1) result[index] = addScaled(result[index - 1], direction, lengths[index - startIndex - 1]);
    return result;
  }
  for (let iteration = 0; iteration < 12; iteration += 1) {
    result[endIndex] = target.slice();
    for (let index = endIndex - 1; index >= startIndex; index -= 1) {
      result[index] = addScaled(result[index + 1], normalize(subtract(result[index], result[index + 1])), lengths[index - startIndex]);
    }
    result[startIndex] = root.slice();
    for (let index = startIndex + 1; index <= endIndex; index += 1) {
      result[index] = addScaled(result[index - 1], normalize(subtract(result[index], result[index - 1])), lengths[index - startIndex - 1]);
    }
    if (distance(result[endIndex], target) < 1e-5) break;
  }
  return result;
}

export function smoothCurvePoints(points, centerIndex, options = {}) {
  const source = copyPoints(points);
  if (!source[centerIndex] || source.length < 3) return source;
  const weights = curveInfluenceWeights(source, centerIndex, { ...options, mode: 'SOFT_MOVE' });
  const strength = clamp(finite(options.strength, 0.45), 0, 1);
  const { fixed } = deformationBounds(source, centerIndex, options.pinned, options.lockRoot !== false);
  return source.map((point, index) => {
    if (index === 0 || index === source.length - 1 || fixed.has(index) || weights[index] <= 0) return point.slice();
    const midpoint = source[index - 1].map((value, axis) => (value + source[index + 1][axis]) * 0.5);
    return point.map((value, axis) => value + (midpoint[axis] - value) * strength * weights[index]);
  });
}

export function deformCurvePoints(points, centerIndex, target, options = {}) {
  const source = copyPoints(points);
  if (!source[centerIndex]) return source;
  const candidate = target.slice(0, 3).map((value, axis) => finite(value, source[centerIndex][axis]));
  const mode = options.mode || 'SOFT_MOVE';
  const { fixed, start, end } = deformationBounds(source, centerIndex, options.pinned, options.lockRoot !== false);
  if (fixed.has(centerIndex)) return source;
  if (mode === 'SMOOTH') return smoothCurvePoints(source, centerIndex, options);
  const delta = subtract(candidate, source[centerIndex]);
  let result = copyPoints(source);
  if (mode === 'TIP_IK') {
    result = solveTipIk(source, start, centerIndex, candidate);
    const tipDelta = subtract(result[centerIndex], source[centerIndex]);
    for (let index = centerIndex + 1; index <= end; index += 1) if (!fixed.has(index)) result[index] = addScaled(source[index], tipDelta, 1);
  } else if (mode === 'BEND' && centerIndex > start) {
    const pivot = source[start];
    const before = subtract(source[centerIndex], pivot);
    const after = subtract(candidate, pivot);
    const axis = cross(before, after);
    const axisLength = magnitude(axis);
    const angle = axisLength <= 1e-9 ? 0 : Math.acos(clamp(dot(normalize(before), normalize(after)), -1, 1));
    for (let index = start + 1; index <= end; index += 1) {
      if (fixed.has(index)) continue;
      const weight = index >= centerIndex ? 1 : curveFalloffWeight(centerIndex - index, centerIndex - start, 'SMOOTH');
      result[index] = addScaled(pivot, rotateAroundAxis(subtract(source[index], pivot), axisLength <= 1e-9 ? [0, 0, 1] : axis, angle * weight), 1);
    }
    const residual = subtract(candidate, result[centerIndex]);
    for (let index = start + 1; index <= end; index += 1) {
      if (fixed.has(index)) continue;
      const weight = index >= centerIndex ? 1 : (index - start) / Math.max(1, centerIndex - start);
      result[index] = addScaled(result[index], residual, weight);
    }
  } else {
    const weights = curveInfluenceWeights(source, centerIndex, options);
    result = source.map((point, index) => addScaled(point, delta, weights[index]));
  }
  const preserve = ['SOFT_MOVE', 'SEGMENT'].includes(mode) ? options.preserveLength : 0;
  const anchors = new Set([...fixed, centerIndex]);
  return preserveSegmentLengths(source, result, anchors, preserve);
}

export function evaluateTimeline(keyframes, time) {
  const frames = [...(keyframes || [])].filter((frame) => Number.isFinite(Number(frame.time)))
    .sort((a, b) => Number(a.time) - Number(b.time));
  if (!frames.length) return {};
  const cursor = clamp(finite(time), 0, 1);
  const rightIndex = frames.findIndex((frame) => Number(frame.time) >= cursor);
  if (rightIndex <= 0) return { ...frames[0] };
  if (rightIndex < 0) return { ...frames.at(-1) };
  const left = frames[rightIndex - 1];
  const right = frames[rightIndex];
  const alpha = (cursor - Number(left.time)) / Math.max(1e-6, Number(right.time) - Number(left.time));
  const result = { ...left, time: cursor };
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    if (key === 'time' || key === 'id') continue;
    const a = Number(left[key]);
    const b = Number(right[key]);
    result[key] = Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * alpha : (alpha < 0.5 ? left[key] : right[key]);
  }
  return result;
}

export function attachmentLayerMatches(layer, branch, t, state = {}) {
  if (!layer?.enabled) return false;
  const order = Number(branch?.order) || 0;
  if (order < finite(layer.order_min, 0) || order > finite(layer.order_max, 3)) return false;
  if (t < finite(layer.start, 0) || t > finite(layer.end, 1)) return false;
  if (layer.season && layer.season !== 'ANY' && layer.season !== state.season) return false;
  if (finite(state.health, 1) < finite(layer.health_min, 0)) return false;
  return true;
}

export function expandVariantMatrix(matrix, limit = 64) {
  const axes = Object.entries(matrix || {}).filter(([, values]) => Array.isArray(values) && values.length);
  let variants = [{}];
  for (const [key, values] of axes) {
    variants = variants.flatMap((variant) => values.map((value) => ({ ...variant, [key]: value })))
      .slice(0, Math.max(1, limit));
  }
  return variants.slice(0, Math.max(1, limit));
}

export function compileGenerationPlan(previous, next) {
  const previousSettings = previous?.settings || {};
  const nextSettings = next?.settings || {};
  const previousAuthoring = previous?.authoring || {};
  const nextAuthoring = next?.authoring || {};
  const materialKeys = ['bark_color', 'leaf_color', 'autumn_color', 'bud_color', 'fruit_color', 'wind_strength'];
  const foliageKeys = ['leaf_density', 'leaf_scale', 'leaf_loss', 'foliage_mode', 'cluster_leaf_count', 'leaf_min_spacing'];
  const changedSettings = Object.keys({ ...previousSettings, ...nextSettings }).filter((key) => stableStringify(previousSettings[key]) !== stableStringify(nextSettings[key]));
  const foliageAuthoring = ['attachment_layers', 'leaf_edits', 'foliage_masks', 'foliage_range'];
  const interfaceAuthoring = ['selection_sets', 'active_sculpt_layer', 'recipe', 'quality', 'workbench'];
  const changedAuthoring = Object.keys({ ...previousAuthoring, ...nextAuthoring }).filter((key) => stableStringify(previousAuthoring[key]) !== stableStringify(nextAuthoring[key]));
  const topologyChanged = changedAuthoring.some((key) => !foliageAuthoring.includes(key) && !interfaceAuthoring.includes(key))
    || stableStringify(previousAuthoring.workbench?.skeleton_thickness) !== stableStringify(nextAuthoring.workbench?.skeleton_thickness)
    || stableStringify(previousAuthoring.workbench?.procedural_growth) !== stableStringify(nextAuthoring.workbench?.procedural_growth)
    || fingerprint(previousAuthoring.overrides || {}) !== fingerprint(nextAuthoring.overrides || {})
    || fingerprint(previousAuthoring.topology || {}) !== fingerprint(nextAuthoring.topology || {})
    || changedSettings.some((key) => !materialKeys.includes(key) && !foliageKeys.includes(key));
  const foliageChanged = stableStringify(previous?.leaf_sources) !== stableStringify(next?.leaf_sources)
    || changedAuthoring.some((key) => foliageAuthoring.includes(key))
    || fingerprint(previousAuthoring.attachment_layers || {}) !== fingerprint(nextAuthoring.attachment_layers || {})
    || fingerprint(previousAuthoring.leaf_edits || {}) !== fingerprint(nextAuthoring.leaf_edits || {})
    || fingerprint(previousAuthoring.foliage_masks || {}) !== fingerprint(nextAuthoring.foliage_masks || {})
    || changedSettings.some((key) => foliageKeys.includes(key));
  const scope = !previous ? 'FULL' : topologyChanged ? 'TOPOLOGY' : foliageChanged ? 'FOLIAGE' : changedSettings.length ? 'MATERIAL' : 'NONE';
  return { scope, key: fingerprint(next), changed_settings: changedSettings };
}
