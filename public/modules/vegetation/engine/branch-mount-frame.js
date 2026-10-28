// A bent carrier has a different rigid frame at each segment. Keep roll as well
// as tangent direction when installing complete samples on the evaluated curve.
export function branchMountAt(branch, t) {
  const frames = branch?.mountFrames;
  return frames?.[Math.min(frames.length - 1, Math.floor(Math.max(0, Math.min(1, t)) * frames.length))] || branch?.mountMatrix;
}
